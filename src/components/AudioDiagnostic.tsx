// src/components/AudioDiagnostic.tsx
import React, { useState } from 'react';
import { useLoggerStore } from '../store/useLoggerStore';
import { audioService } from '../services/audioService'; // 💡 追加

export const AudioDiagnostic: React.FC = () => {
  const logEvent = useLoggerStore((state: any) => state.logEvent);
  const [status, setStatus] = useState<string>('待機中...');

  const runDiagnostic = async () => {
    setStatus('診断開始...');
    logEvent('diagnostic_run', { payload: { step: 'start' } });

    // 1. AudioContext の Unlock テスト (既存のaudioServiceの機能を利用)
    try {
      audioService.unlock();
      logEvent('diagnostic_run', { payload: { step: 'audio_context_unlocked' } });
    } catch (e: any) {
      logEvent('audio_play_error', { error_message: 'AudioContext Unlock Failed: ' + e.message });
      setStatus('エラー: AudioContextの解除に失敗');
      return;
    }

    // 2. 実音声認識 API (STT) 稼働テスト
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      logEvent('audio_play_error', { error_message: 'SpeechRecognition API not supported' });
      setStatus('エラー: このブラウザは音声認識機能に対応していません');
      return;
    }

    let recognizedText = '';
    try {
      setStatus('マイクに向かって何か話してください（5秒以内）...');
      logEvent('mic_permission_requested');
      
      recognizedText = await new Promise((resolve, reject) => {
        const rec = new SpeechRecognition();
        rec.lang = 'ja-JP';
        rec.interimResults = false;
        
        const timeout = setTimeout(() => {
          rec.stop();
          reject(new Error('タイムアウト: 音声が検知されませんでした'));
        }, 5000);

        rec.onstart = () => {
          logEvent('mic_permission_granted');
          logEvent('recording_started');
        };

        rec.onresult = (event: any) => {
          clearTimeout(timeout);
          const text = event.results[0][0].transcript;
          resolve(text);
        };

        rec.onerror = (event: any) => {
          clearTimeout(timeout);
          reject(new Error(event.error));
        };

        rec.onend = () => {
          logEvent('recording_stopped');
        };

        rec.start();
      });

      logEvent('stt_response_received', { payload: { text: recognizedText } });
      setStatus(`認識成功: 「${recognizedText}」`);
    } catch (e: any) {
      logEvent('audio_play_error', { error_message: 'STT Diagnostic Failed: ' + e.message });
      setStatus(`エラー: 音声認識失敗 (${e.message})`);
      return;
    }

    // 3. 実音声合成 API (TTS) 発声テスト (GCP版)
    const gcloudApiKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY;
    if (!gcloudApiKey) {
      logEvent('audio_play_error', { error_message: 'GCP API Key not configured' });
      setStatus('エラー: GCP APIキーが設定されていません');
      return;
    }

    try {
      setStatus('GCP APIで音声を生成中...');
      logEvent('tts_request_sent');
      
      const textToSpeak = `診断システムによる復唱です。あなたが話した内容は、${recognizedText}、ですね。`;
      
      logEvent('tts_response_received');
      setStatus('認識したテキストをスピーカーから出力中...');
      
      logEvent('audio_play_start');
      // audioService.play を使用して再生
      await audioService.play(textToSpeak, 'ja-JP-Neural2-B', gcloudApiKey);
      logEvent('audio_play_end');

      setStatus('全音声診断クリア！');
    } catch (e: any) {
      logEvent('audio_play_error', { error_message: 'GCP TTS Diagnostic Failed: ' + e.message });
      setStatus(`エラー: 音声出力失敗 (${e.message})`);
    }
  };

  return (
    <div className="p-4 bg-slate-100 rounded-xl mt-4 border border-slate-300">
      <h3 className="font-bold text-slate-800 mb-2">音声・PWA環境 診断モード</h3>
      <p className="text-xs text-slate-500 mb-4">実際の音声認識とGCP音声合成を使用して、デバイスへの入出力をテストします。</p>
      
      <div className="flex items-center gap-4">
        <button 
          onClick={runDiagnostic}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 active:scale-95"
        >
          診断を実行
        </button>
        <span className="text-sm font-mono text-slate-700">{status}</span>
      </div>
    </div>
  );
};