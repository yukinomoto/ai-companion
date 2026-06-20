// src/hooks/useAudioPipeline.ts
import { useRef, useState, useCallback, useEffect } from 'react';

interface AudioPipelineOptions {
  onStop: (audioBlob: Blob) => void;
  minDecibels?: number;
}

export const useAudioPipeline = ({ onStop, minDecibels = -45 }: AudioPipelineOptions) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const startPipeline = async () => {
    try {
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

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.minDecibels = minDecibels;
      analyserRef.current = analyser;

      const destination = ctx.createMediaStreamDestination();

      sourceNode.connect(highpassFilter);
      highpassFilter.connect(vocalBoost);
      vocalBoost.connect(preGain);
      preGain.connect(compressor);
      compressor.connect(analyser);
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
        onStop(blob);
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
    
    // MediaRecorderの停止
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    // 💡 マイクのトラック（ハードウェアリソース）を完全に停止・解放
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        streamRef.current?.removeTrack(track);
      });
      streamRef.current = null;
    }

    // AudioContextのサスペンド（次回のエラー防止）
    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      audioCtxRef.current.suspend().catch(console.error);
    }

    setIsRecording(false);
    setIsSpeaking(false);
  }, []);

  const monitorVolume = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
    setIsSpeaking(average > 10);
    animationFrameRef.current = requestAnimationFrame(monitorVolume);
  };

  // コンポーネントのアンマウント時にも確実にクリーンアップ
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