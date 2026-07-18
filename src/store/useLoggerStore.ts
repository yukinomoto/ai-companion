// src/store/useLoggerStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';

// 💡 既存のイベント型に、記憶・意図追跡用の専用タグを追加
export type LogEvent = 
  | 'app_start' | 'mic_permission_requested' | 'mic_permission_granted' 
  | 'recording_started' | 'recording_stopped' | 'stt_request_sent' 
  | 'stt_response_received' | 'tts_request_sent' | 'tts_response_received' 
  | 'audio_play_start' | 'audio_play_end' | 'audio_play_error' | 'diagnostic_run'
  | 'WINDOW_ERROR' | 'UNHANDLED_PROMISE_REJECTION'
  | 'intent_parsed'      // 👈 追加: ユーザーの発言意図をどう解釈したか
  | 'memory_retrieved'   // 👈 追加: DBからどの記憶を引っ張ってきたか
  | 'phrase_extracted'   // 👈 追加: どんなフレーズを抽出したか
  | 'memory_added'       // 👈 追加: 新規で記憶を追加した時の記録
  | 'memory_updated';    // 👈 追加: 既存の記憶を上書き(編集)した時のBefore/After記録

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
  clearLogs: () => void; 
  copyLogsToClipboard: () => Promise<boolean>; 
}

const generateSessionId = () => Math.random().toString(36).substring(2, 15);

export const useLoggerStore = create<LoggerState>((set, get) => {
  // 環境情報の取得（既存のロジックを完全維持）
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

      // コンソールにも同時に出力
      console.log(`[LOG] ${event_type}`, newLog);

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
        // 失敗時は安全のためキューに戻す
        set((state) => ({ queue: [...queue, ...state.queue] }));
      }
    },

    clearLogs: () => set({ logs: [], queue: [] }),

    copyLogsToClipboard: async () => {
      const currentLogs = get().logs;
      if (currentLogs.length === 0) {
        alert('コピーするログがありません。');
        return false;
      }

      // 蓄積された最新50件のログを、スマホからペーストしやすいように綺麗なテキスト形式に整形
      const logText = [...currentLogs]
        .reverse() // 時系列順（古い順）に並び替えて読みやすくします
        .map((log) => {
          const time = new Date(log.timestamp).toLocaleTimeString('ja-JP', { hour12: false });
          const errorStr = log.error_message ? `\n   ❌ エラー: ${log.error_message}` : '';
          const payloadStr = log.payload ? `\n   データ: ${JSON.stringify(log.payload, null, 2)}` : '';
          return `[${time}] [${log.event_type}] (S: ${log.session_id})${errorStr}${payloadStr}`;
        })
        .join('\n----------------------------------------\n');

      try {
        await navigator.clipboard.writeText(logText);
        alert('最新50件のログをクリップボードにコピーしました！そのままチャットに貼り付けてください。');
        return true;
      } catch (err) {
        console.error('クリップボードへのコピーに失敗しました:', err);
        alert('コピーに失敗しました。');
        return false;
      }
    }
  };
});

// 監視・バッチ送信プロセスの初期化
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

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      log('WINDOW_ERROR', {
        error_message: event.message,
        payload: { filename: event.filename, lineno: event.lineno, colno: event.colno }
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      log('UNHANDLED_PROMISE_REJECTION', {
        error_message: event.reason?.toString() || 'Unknown Promise Rejection'
      });
    });
  }
};