import { useRef, useState, useCallback } from 'react';

interface AudioPipelineOptions {
  onStop: (audioBlob: Blob) => void; // 録音停止時にBlobを返す
  minDecibels?: number;              // 音声として検知する最小音量（デフォルト: -45dB）
}

export const useAudioPipeline = ({ onStop, minDecibels = -45 }: AudioPipelineOptions) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // UI表示用（声が出ているか）

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  const animationFrameRef = useRef<number | null>(null);

  const startPipeline = async () => {
    try {
      // 1. ハードウェア補正を強制してマイクを取得
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      streamRef.current = stream;

      // 2. Web Audio APIのコンテキスト作成
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;

      const sourceNode = ctx.createMediaStreamSource(stream);

      // 3. ハイパスフィルター（80Hz以下のロードノイズ等をごっそりカット）
      const highpassFilter = ctx.createBiquadFilter();
      highpassFilter.type = 'highpass';
      highpassFilter.frequency.value = 80;

      // 💡追加4: ボーカルブースト（2.5kHz付近を+10dB持ち上げ、ボソボソ声の滑舌を明瞭にする）
      const vocalBoost = ctx.createBiquadFilter();
      vocalBoost.type = 'peaking';
      vocalBoost.frequency.value = 2500;
      vocalBoost.Q.value = 1.0;
      vocalBoost.gain.value = 10;

      // 💡追加5: プレゲイン（全体の音量を3倍に増幅）
      const preGain = ctx.createGain();
      preGain.gain.value = 3.0;

      // 6. コンプレッサー（増幅しすぎて音割れしないように、大きい音だけを潰す）
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -40; // -40dBから圧縮開始（少し早めに効かせる）
      compressor.knee.value = 30;
      compressor.ratio.value = 15;      // 圧縮比率を強めに（15:1）
      compressor.attack.value = 0.005;
      compressor.release.value = 0.25;

      // 7. アナライザー（音量監視・UIフィードバック用）
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.minDecibels = minDecibels;
      analyserRef.current = analyser;

      // 8. 出力先（MediaRecorderへ渡すためのノード）
      const destination = ctx.createMediaStreamDestination();

      // 💡 ノードの接続をアップデート
      // マイク -> ハイパス -> ボーカルブースト -> ゲイン増幅 -> コンプレッサー -> (アナライザー & 録音先)
      sourceNode.connect(highpassFilter);
      highpassFilter.connect(vocalBoost);
      vocalBoost.connect(preGain);
      preGain.connect(compressor);
      compressor.connect(analyser);
      compressor.connect(destination);

      // 7. MediaRecorderのセットアップ（iOS Safari対応のためaudio/mp4を優先）
      const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
      const mediaRecorder = new MediaRecorder(destination.stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        onStop(blob); // 🛑 手動停止時に、補正済みの音声Blobを呼び出し元へ渡す
      };

      // 録音と音量監視の開始
      mediaRecorder.start();
      setIsRecording(true);
      monitorVolume();

    } catch (err) {
      console.error('マイクの初期化に失敗しました:', err);
    }
  };

  const stopPipeline = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioCtxRef.current?.state !== 'closed') {
      audioCtxRef.current?.close();
    }
    setIsRecording(false);
    setIsSpeaking(false);
  }, []);

  // 音量監視ループ（UI用・自動停止はしない）
  const monitorVolume = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
    setIsSpeaking(average > 10); // 声を検知しているかどうかのステータス更新のみ

    animationFrameRef.current = requestAnimationFrame(monitorVolume);
  };

  return { startPipeline, stopPipeline, isRecording, isSpeaking };
};