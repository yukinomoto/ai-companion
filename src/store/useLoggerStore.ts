import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export type LogEvent = 
  | 'app_start' | 'mic_permission_requested' | 'mic_permission_granted' 
  | 'recording_started' | 'recording_stopped' | 'stt_request_sent' 
  | 'stt_response_received' | 'tts_request_sent' | 'tts_response_received' 
  | 'audio_play_start' | 'audio_play_end' | 'audio_play_error' | 'diagnostic_run';

interface LogEntry {
  id: string;
  session_id: string;
  event_type: LogEvent;
  timestamp: string;
  duration_ms?: number;
  error_message?: string;
  is_standalone: boolean;
  visibility_state: string;
  user_agent: string;
  payload?: any;
}

interface LoggerState {
  logs: LogEntry[]; // デバッグパネル表示用
  queue: LogEntry[]; // Supabase送信待ちキュー
  sessionId: string;
  logEvent: (event_type: LogEvent, data?: Partial<LogEntry>) => void;
  flushQueue: () => Promise<void>;
}

const generateSessionId = () => Math.random().toString(36).substring(2, 15);

export const useLoggerStore = create<LoggerState>((set, get) => {
  // 環境情報の取得
  const getEnvData = () => ({
    is_standalone: window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true,
    visibility_state: document.visibilityState,
    user_agent: navigator.userAgent,
  });

  return {
    logs: [],
    queue: [],
    sessionId: generateSessionId(),

    logEvent: (event_type, data = {}) => {
      const newLog: LogEntry = {
        id: crypto.randomUUID(),
        session_id: get().sessionId,
        event_type,
        timestamp: new Date().toISOString(),
        ...getEnvData(),
        ...data,
      };

      set((state) => ({
        logs: [newLog, ...state.logs].slice(0, 50), // パネル用には最新50件を保持
        queue: [...state.queue, newLog],
      }));
    },

    flushQueue: async () => {
      const { queue } = get();
      if (queue.length === 0) return;

      // 送信前にキューを空にする（重複送信防止）
      set({ queue: [] });

      try {
        const { error } = await supabase.from('audio_logs').insert(queue);
        if (error) console.error('Failed to flush logs', error);
      } catch (err) {
        console.error('Error in flushQueue', err);
        // 失敗時はキューに戻す処理などを入れるとより安全です
      }
    },
  };
});

// 💡 監視・バッチ送信プロセスの初期化（アプリのルート付近、またはApp.tsxなどで一度だけ実行）
export const initLoggerObserver = () => {
  const flush = useLoggerStore.getState().flushQueue;
  const log = useLoggerStore.getState().logEvent;

  log('app_start');

  // 3秒に1回バッチ送信
  setInterval(flush, 3000);

  // iOSでバックグラウンドに回った瞬間に確実に送信する
  document.addEventListener('visibilitychange', () => {
    log('diagnostic_run', { payload: { visibility: document.visibilityState } });
    if (document.visibilityState === 'hidden') {
      flush();
    }
  });

  // Bluetooth等のデバイス変更を検知
  navigator.mediaDevices?.addEventListener('devicechange', () => {
    log('diagnostic_run', { payload: { note: 'Device changed' } });
  });
};