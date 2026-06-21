// src/hooks/useAudioPipeline.ts
import { useRef, useState, useCallback, useEffect } from 'react';

interface AudioPipelineOptions {
  onStop: (audioBlob: Blob, hasSpoken: boolean) => void;
}

export const useAudioPipeline = ({ onStop }: AudioPipelineOptions) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // 💡 NEW: 現在の音圧を画面に渡すためのState
  const [currentRms, setCurrentRms] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const recordingFramesRef = useRef<number>(0); 
  const speechFramesRef = useRef<number>(0);    

  const startPipeline = async () => {
    try {
      recordingFramesRef.current = 0;
      speechFramesRef.current = 0;
      setCurrentRms(0); // リセット

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      streamRef.current = stream;

      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;

      const sourceNode = ctx.createMediaStreamSource(stream);
      
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      sourceNode.connect(analyser); 

      const highpassFilter = ctx.createBiquadFilter();
      highpassFilter.type = 'highpass';
      highpassFilter.frequency.value = 80;

      const vocalBoost = ctx.createBiquadFilter();
      vocalBoost.type = 'peaking';
      vocalBoost.frequency.value = 2500;
      vocalBoost.Q.value = 1.0;
      vocalBoost.gain.value = 10;

      const preGain = ctx.createGain();
      preGain.gain.value = 3.0;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -40;
      compressor.knee.value = 30;
      compressor.ratio.value = 15;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.25;

      const destination = ctx.createMediaStreamDestination();

      sourceNode.connect(highpassFilter);
      highpassFilter.connect(vocalBoost);
      vocalBoost.connect(preGain);
      preGain.connect(compressor);
      compressor.connect(destination);

      const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
      const mediaRecorder = new MediaRecorder(destination.stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        
        const hasSpoken = speechFramesRef.current >= 8;
        onStop(blob, hasSpoken);
      };

      // 💡 修正ポイント：1000ミリ秒（1秒）ごとにデータを強制的に吐き出させて、iOSのメモリバグを回避する
      mediaRecorder.start(1000);
      setIsRecording(true);
      
      monitorVolume(true);

    } catch (err) {
      console.error('マイクの初期化に失敗しました:', err);
    }
  };

  const stopPipeline = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        streamRef.current?.removeTrack(track);
      });
      streamRef.current = null;
    }

    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      audioCtxRef.current.suspend().catch(console.error);
    }

    setIsRecording(false);
    setIsSpeaking(false);
    setCurrentRms(0); // 停止時は0にする
  }, []);

  const monitorVolume = (active: boolean = isRecording) => {
    if (!analyserRef.current) return;
    if (!active) return;

    recordingFramesRef.current++;

    const dataArray = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(dataArray);
    
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);
    
    // 💡 NEW: リアルタイムにStateを更新して画面側に数値を伝える
    setCurrentRms(rms);

    const SPEAKING_THRESHOLD = 0.02; 

    if (recordingFramesRef.current > 15) {
      if (rms > SPEAKING_THRESHOLD) { 
        speechFramesRef.current++;
      }
    }
    
    setIsSpeaking(rms > SPEAKING_THRESHOLD);
    animationFrameRef.current = requestAnimationFrame(() => monitorVolume(active));
  };

  useEffect(() => {
    return () => {
      stopPipeline();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(console.error);
      }
    };
  }, [stopPipeline]);

  // 💡 NEW: currentRms も一緒に外に返すように変更
  return { startPipeline, stopPipeline, isRecording, isSpeaking, currentRms };
};