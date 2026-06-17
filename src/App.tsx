// src/App.tsx
import { useState, useEffect, useRef } from 'react';
import { useCompanionChat, VOICE_PRESETS } from './hooks/useCompanionChat';
import { dbService } from './services/dbService';
import { Companion3D } from './components/Companion3D';
import { ChatInput } from './components/ChatInput';
import { MotionTest } from './components/MotionTest'; // 💡 追加：テスト用コンポーネント
import { Menu, MessageSquare, Plus, Volume2, VolumeX, History, Activity } from 'lucide-react'; // 💡 Activityアイコンを追加

export default function App() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChatMode, setIsChatMode] = useState(false);
  const [isMotionTestMode, setIsMotionTestMode] = useState(false); // 💡 追加：テストモードのON/OFF

  const { 
    messages, isLoading, sendMessage, selectedVoice, setSelectedVoice, 
    playVoice, isMuted, setIsMuted, sessions, unlockAudio, refreshSessions 
  } = useCompanionChat(currentSessionId);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleNewSession = () => {
    setCurrentSessionId(null);
    setIsSidebarOpen(false);
  };

  const handleSendText = async (text: string, isVoice: boolean) => {
    if (!text.trim()) return;
    unlockAudio();

    let targetSessionId = currentSessionId;
    if (!targetSessionId) {
      const title = text.substring(0, 15) + (text.length > 15 ? '...' : '');
      const newSession = await dbService.createSession(title);
      setCurrentSessionId(newSession.id);
      targetSessionId = newSession.id;
      await refreshSessions();
    }
    
    sendMessage(text, isVoice, targetSessionId);
  };

  const latestAiMessage = [...messages].reverse().find(m => m.sender === 'ai');
  const currentEmotion = (latestAiMessage?.emotion || 'neutral') as 'neutral' | 'happy' | 'sad' | 'surprised' | 'thinking';

  return (
    <div className="fixed inset-0 flex bg-gradient-to-b from-sky-50 via-white to-purple-50 text-slate-800 font-sans antialiased overflow-hidden select-none">
      
      {/* ── 左側：履歴ドロワー ── */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
          <div className="relative w-72 bg-white/90 backdrop-blur-md h-full shadow-2xl p-6 flex flex-col z-10 animate-in slide-in-from-left duration-200">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-6 text-slate-700">
              <History size={20} /> 過去の会話一覧
            </h2>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-1">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setCurrentSessionId(s.id); setIsSidebarOpen(false); }}
                  className={`w-full text-left p-3.5 rounded-2xl transition-all duration-150 flex items-center gap-3 ${
                    s.id === currentSessionId ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20 font-medium' : 'hover:bg-slate-100/80 text-slate-600'
                  }`}
                >
                  <MessageSquare size={18} className="shrink-0" />
                  <span className="truncate text-sm">{s.name}</span>
                </button>
              ))}
            </div>
            
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <label className="text-xs font-semibold text-slate-400 tracking-wider block">声のプリセット</label>
              <select 
                value={selectedVoice} 
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full p-3 text-sm rounded-xl bg-slate-50 border border-slate-200/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700"
              >
                {VOICE_PRESETS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── メイン画面 ── */}
      <div className="flex-1 flex flex-col h-full relative max-w-md mx-auto w-full border-x border-slate-100/50 shadow-sm bg-transparent">
        
        <header className="px-5 pt-4 pb-2 flex items-center justify-between z-10">
          <button onClick={() => setIsSidebarOpen(true)} className="w-11 h-11 rounded-full bg-white shadow-md shadow-slate-100 flex items-center justify-center text-slate-500 active:scale-95 transition-transform">
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-2">
            <button onClick={() => setIsMuted(!isMuted)} className={`w-11 h-11 rounded-full bg-white shadow-md shadow-slate-100 flex items-center justify-center active:scale-95 transition-all ${isMuted ? 'text-red-500 bg-red-50' : 'text-slate-500'}`}>
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>

            {/* 💡 追加：モーションテストモード切替ボタン */}
            <button onClick={() => setIsMotionTestMode(!isMotionTestMode)} className={`w-11 h-11 rounded-full bg-white shadow-md shadow-slate-100 flex items-center justify-center active:scale-95 transition-all ${isMotionTestMode ? 'text-amber-500 bg-amber-50' : 'text-slate-500'}`} title="モーションテスト">
              <Activity size={20} />
            </button>

            <button onClick={() => {setIsChatMode(!isChatMode); setIsMotionTestMode(false);}} className={`w-11 h-11 rounded-full bg-white shadow-md shadow-slate-100 flex items-center justify-center active:scale-95 transition-all ${isChatMode && !isMotionTestMode ? 'text-blue-500 bg-blue-50' : 'text-slate-500'}`} title="チャットモード切替">
              <MessageSquare size={20} />
            </button>

            <button onClick={handleNewSession} className="h-11 px-4 rounded-full bg-white shadow-md shadow-slate-100 flex items-center justify-center gap-1.5 text-blue-500 font-semibold text-sm active:scale-95 transition-transform border border-blue-50/50" title="新しい会話を始める">
              <Plus size={18} strokeWidth={2.5} />
              <span>新規</span>
            </button>
          </div>
        </header>

        {/* 💡 表示切り替えロジック：テストモードの場合は MotionTest を表示 */}
        {isMotionTestMode ? (
          <div className="flex-1 overflow-hidden relative">
            <MotionTest />
          </div>
        ) : isChatMode ? (
          /* ── テキストチャットモード画面 ── */
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-white border border-slate-100 text-slate-700 shadow-sm'}`}>
                  {msg.text}
                  {msg.sender === 'ai' && (
                    <div className="mt-2 text-right">
                      <button onClick={() => playVoice(msg.text)} className="text-blue-500 bg-blue-50 px-2 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1 ml-auto">
                        <Volume2 size={14} /> 再生
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          /* ── コンパニオン（3Dモデル）画面 ── */
          <div className="flex-1 flex flex-col items-center justify-center px-6 relative -mt-12">
            <div className="relative w-full h-80 flex items-center justify-center">
              <Companion3D isLoading={isLoading} emotion={currentEmotion} />
              <div className="absolute bottom-2 w-28 h-4 bg-slate-400/15 rounded-full blur-[8px]" />
            </div>

            {latestAiMessage && (
              <div className="w-full max-w-sm mt-8 relative animate-in fade-in zoom-in-95 duration-200 z-20">
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[10px] border-b-white drop-shadow-[0_-2px_2px_rgba(0,0,0,0.02)]" />
                <div className="bg-white rounded-[28px] px-6 py-4 shadow-[0_15px_35px_rgba(0,0,0,0.06)] border border-slate-100/80 text-center">
                  <p className="text-[16px] leading-relaxed font-medium text-slate-700 tracking-wide select-text">
                    {latestAiMessage.text}
                  </p>
                </div>
              </div>
            )}
            
            <div className="absolute opacity-0 pointer-events-none">
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* ── フッター：テストモード時は非表示にする ── */}
        {!isMotionTestMode && (
          <footer className="p-4 pb-6 bg-transparent z-20">
            <div className="max-w-sm mx-auto w-full">
              <ChatInput 
                onSendMessage={handleSendText} 
                isLoading={isLoading} 
                isMuted={isMuted} 
                setIsMuted={setIsMuted} 
                unlockAudio={unlockAudio} 
              />
            </div>
          </footer>
        )}

      </div>
    </div>
  );
}