// src/hooks/useAudioPipeline.ts
import { useRef, useState, useCallback, useEffect } from 'react';

interface AudioPipelineOptions {
  onStop: (audioBlob: Blob, hasSpoken: boolean) => void;
}

export const useAudioPipeline = ({ onStop }: AudioPipelineOptions) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

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
      
      // 💡 修正：解像度（fftSize）を上げて波形を正確に捉える
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;
      sourceNode.connect(analyser); // 加工前の生の音を計測

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
        
        // 💡 約130ms以上の明確な音圧があれば「発話あり」とする
        const hasSpoken = speechFramesRef.current >= 8;
        
        onStop(blob, hasSpoken);
      };

      mediaRecorder.start();
      setIsRecording(true);
      monitorVolume();

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
  }, []);

  const monitorVolume = () => {
    if (!analyserRef.current) return;
    
    // 💡 録音停止ボタンが押された瞬間にループが残っていたら即終了させる
    if (!isRecording && recordingFramesRef.current > 0) return;

    recordingFramesRef.current++;

    const dataArray = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(dataArray);
    
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);
    
    // 💡 閾値を現実的な 0.03 に設定（0.9は高すぎたため戻します）
    const SPEAKING_THRESHOLD = 0.1; 

    // 💡 録音開始直後（15f）と、終了時のノイズを避けるため、通常フレームのみカウント
    if (recordingFramesRef.current > 15) {
      if (rms > SPEAKING_THRESHOLD) { 
        speechFramesRef.current++;
      }
    }
    
    setIsSpeaking(rms > SPEAKING_THRESHOLD);
    animationFrameRef.current = requestAnimationFrame(monitorVolume);
  };

  useEffect(() => {
    return () => {
      stopPipeline();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(console.error);
      }
    };
  }, [stopPipeline]);

  return { startPipeline, stopPipeline, isRecording, isSpeaking };
};