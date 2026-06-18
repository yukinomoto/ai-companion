import React, { useState } from 'react';
import { useLoggerStore } from '../store/useLoggerStore';

export const DebugPanel: React.FC = () => {
  const logs = useLoggerStore((state: any) => state.logs);
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyLogs = async () => {
    // ログを見やすいテキスト形式にフォーマット
    const logText = logs.map((log: any) => {
      const time = new Date(log.timestamp).toLocaleTimeString('ja-JP', { hour12: false });
      let line = `[${time}] ${log.event_type}`;
      if (log.duration_ms) line += ` (${log.duration_ms}ms)`;
      if (log.error_message) line += `\n  ERROR: ${log.error_message}`;
      if (log.payload) line += `\n  PAYLOAD: ${JSON.stringify(log.payload)}`;
      return line;
    }).join('\n\n');

    // クリップボードにコピー（iOS対応）
    try {
      await navigator.clipboard.writeText(logText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      alert('コピーに失敗しました。');
      console.error('Copy failed:', err);
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-slate-800 text-white p-2 rounded-full opacity-50 hover:opacity-100 z-50 text-xs"
      >
        ログ
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 h-96 bg-black/80 backdrop-blur-md text-green-400 p-4 rounded-xl z-50 overflow-hidden flex flex-col font-mono text-xs shadow-2xl">
      <div className="flex justify-between items-center mb-2 border-b border-green-800 pb-2 shrink-0">
        <span className="font-bold text-green-300">System Logs</span>
        <div className="flex gap-2">
          <button 
            onClick={handleCopyLogs} 
            className="text-white bg-blue-600/60 hover:bg-blue-500/80 px-2 py-1 rounded transition-colors"
          >
            {isCopied ? 'コピー完了' : 'コピー'}
          </button>
          <button 
            onClick={() => setIsOpen(false)} 
            className="text-white bg-red-500/50 hover:bg-red-400/80 px-2 py-1 rounded transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-2">
        {logs.map((log: any) => {
          const time = new Date(log.timestamp).toLocaleTimeString('ja-JP', { hour12: false });
          const isError = log.error_message || log.event_type.includes('error');
          return (
            <div key={log.id} className={`pb-1 border-b border-green-900/30 ${isError ? 'text-red-400' : 'text-green-400'}`}>
              <div>
                <span className="opacity-50 mr-2">[{time}]</span>
                {log.event_type}
                {log.duration_ms && <span className="text-yellow-400 ml-2">({log.duration_ms}ms)</span>}
              </div>
              {log.error_message && (
                <div className="pl-4 mt-1 text-red-300 break-words">
                  {log.error_message}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};