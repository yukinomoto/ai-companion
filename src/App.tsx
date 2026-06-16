// src/App.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useCompanionChat, VOICE_PRESETS } from './hooks/useCompanionChat';
import { dbService } from './services/dbService';
import { Companion3D } from './components/Companion3D'; // 💡 3Dコンポーネントをインポート
import { 
  Menu, 
  MessageSquare, 
  Plus, 
  Image as ImageIcon, 
  Volume2, 
  VolumeX, 
  History,
  Mic,
  Send
} from 'lucide-react';

export default function App() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isChatMode, setIsChatMode] = useState(false);
  
  const { 
    messages, 
    isLoading, 
    sendMessage, 
    selectedVoice, 
    setSelectedVoice, 
    isMuted, 
    setIsMuted, 
    sessions,
    unlockAudio 
  } = useCompanionChat(currentSessionId);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const initSession = async () => {
      const list = await dbService.getSessions();
      if (list.length > 0) {
        setCurrentSessionId(list[0].id);
      } else {
        handleNewSession();
      }
    };
    initSession();
  }, []);

  const handleNewSession = async () => {
    const name = `会話 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const newSession = await dbService.createSession(name);
    setCurrentSessionId(newSession.id);
    setIsSidebarOpen(false);
  };

  const handleSendText = () => {
    if (!textInput.trim()) return;
    unlockAudio();
    sendMessage(textInput, false);
    setTextInput('');
  };

  const latestAiMessage = [...messages].reverse().find(m => m.sender === 'ai');
  
  // Companion3Dの型に合わせるための感情マッピング
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
                    s.id === currentSessionId 
                      ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20 font-medium' 
                      : 'hover:bg-slate-100/80 text-slate-600'
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
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="w-11 h-11 rounded-full bg-white shadow-md shadow-slate-100 flex items-center justify-center text-slate-500 active:scale-95 transition-transform"
          >
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className={`w-11 h-11 rounded-full bg-white shadow-md shadow-slate-100 flex items-center justify-center active:scale-95 transition-all ${isMuted ? 'text-red-500 bg-red-50' : 'text-slate-500'}`}
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>

            <button 
              onClick={() => setIsChatMode(!isChatMode)}
              className={`w-11 h-11 rounded-full bg-white shadow-md shadow-slate-100 flex items-center justify-center active:scale-95 transition-all ${isChatMode ? 'text-blue-500 bg-blue-50' : 'text-slate-500'}`}
              title="チャットモード切替"
            >
              <MessageSquare size={20} />
            </button>

            <button 
              onClick={handleNewSession}
              title="新しい会話を始める"
              className="h-11 px-4 rounded-full bg-white shadow-md shadow-slate-100 flex items-center justify-center gap-1.5 text-blue-500 font-semibold text-sm active:scale-95 transition-transform border border-blue-50/50"
            >
              <Plus size={18} strokeWidth={2.5} />
              <span>新規</span>
            </button>
          </div>
        </header>

        {isChatMode ? (
          /* ── テキストチャットモード画面 ── */
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-white border border-slate-100 text-slate-700 shadow-sm'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          /* ── コンパニオン（3Dモデル）画面 ── */
          <div className="flex-1 flex flex-col items-center justify-center px-6 relative -mt-12">
            
            {/* 💡 3Dキャラの表示エリア（高さを少し確保） */}
            <div className="relative w-full h-80 flex items-center justify-center">
              <Companion3D isLoading={isLoading} emotion={currentEmotion} />
              
              {/* 地面の落ち影 */}
              <div className="absolute bottom-2 w-28 h-4 bg-slate-400/15 rounded-full blur-[8px]" />
            </div>

            {/* 💡 吹き出しのコンテナ：mt-2 から mt-8 に変更して位置を下に下げました */}
            {latestAiMessage && (
              <div className="w-full max-w-sm mt-8 relative animate-in fade-in zoom-in-95 duration-200 z-20">
                {/* 吹き出しの上の尖り（尻尾） */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[10px] border-b-white drop-shadow-[0_-2px_2px_rgba(0,0,0,0.02)]" />
                
                {/* 吹き出し本体 */}
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

        {/* ── フッター：独立した特大マイクボタン ── */}
        <footer className="p-4 pb-6 bg-transparent z-20">
          <div className="flex items-end gap-3 max-w-sm mx-auto">
            
            <div className="flex-1 bg-white rounded-[28px] shadow-[0_10px_25px_rgba(0,0,0,0.05)] border border-slate-100 flex items-center pl-5 pr-2 h-14 relative">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                placeholder="メッセージを入力..."
                className="flex-1 bg-transparent text-[15px] focus:outline-none text-slate-700 font-medium h-full"
              />
              <button 
                onClick={() => alert("画像認識機能は準備中です！")}
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 active:bg-slate-50 transition-colors"
                title="画像を送る"
              >
                <ImageIcon size={20} />
              </button>
            </div>

            <button 
              onClick={() => {
                if (textInput.trim()) {
                  handleSendText();
                } else {
                  unlockAudio();
                  sendMessage("音声認識のテスト発言です", true);
                }
              }}
              disabled={isLoading}
              className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-xl shrink-0 active:scale-95 transition-all duration-200 ${
                isLoading 
                  ? 'bg-slate-300 shadow-none' 
                  : textInput.trim() 
                    ? 'bg-blue-500 shadow-blue-500/30' 
                    : 'bg-gradient-to-tr from-blue-500 to-indigo-500 shadow-blue-500/40'
              }`}
            >
              {textInput.trim() ? (
                <Send size={24} className="ml-1" />
              ) : (
                <Mic size={28} strokeWidth={2.5} />
              )}
            </button>
            
          </div>
        </footer>

      </div>
    </div>
  );
}