// src/App.tsx
import { useState, useEffect, useRef } from 'react';
import { useCompanionChat } from './hooks/useCompanionChat';
import { ChatInput } from './components/ChatInput';
import { Companion3D } from './components/Companion3D';

function App() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isChatMode, setIsChatMode] = useState(false);
  const [showHistorySessions, setShowHistorySessions] = useState(false); 
  
  const { messages, isLoading, sendMessage, isMuted, setIsMuted, unlockAudio, sessions, playVoice } = useCompanionChat(currentSessionId);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 💡 チャットスクロールの連動のみ（音声はHook層のパイプライン内で制御するため二重発火しない）
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatMode]);

  // セッションIDの初期化
  useEffect(() => {
    if (!currentSessionId && messages.length === 0) {
      setCurrentSessionId(crypto.randomUUID());
    }
  }, [currentSessionId, messages.length]);

  const handleSendMessage = (text: string, isVoice: boolean) => {
    if (!currentSessionId) setCurrentSessionId(crypto.randomUUID());
    sendMessage(text, isVoice);
  };

  const selectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setShowHistorySessions(false);
  };

  // 💡 最新のAIのメッセージから感情を抽出（Companion3Dへ渡すため）
  const latestAiMessage = messages.slice().reverse().find(m => m.sender === 'ai');
  const currentEmotion = latestAiMessage?.emotion || 'neutral';

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', height: '100dvh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #ffffff 0%, #f0f9ff 35%, #faf5ff 70%, #e0f2fe 100%)', position: 'relative', overflow: 'hidden', boxSizing: 'border-box' }}>
      
      {/* 🌟 1. 固定システムヘッダー (最前面レイヤー) */}
      <header style={{ height: '80px', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 200, position: 'relative', boxSizing: 'border-box' }}>
        <button 
          onClick={() => setShowHistorySessions(true)}
          style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.5)', width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>

        <button 
          onClick={() => setIsChatMode(!isChatMode)} 
          style={{ background: isChatMode ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', border: isChatMode ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(255,255,255,0.5)', width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}
        >
          {isChatMode ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          )}
        </button>
      </header>

      {/* 🌟 2. メインコンテンツ領域（Z-Indexで階層化） */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        
        {/* 【レイヤー1: 背面】常に表示される3Dキャラクター */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* 💡 AIから抽出した最新の感情（emotion）を渡す */}
          <Companion3D isLoading={isLoading} emotion={currentEmotion as any} />
        </div>

        {/* 【レイヤー2: 前面】パターンA: ホーム画面（最新の吹き出しのみ表示） */}
        {!isChatMode && messages.length > 0 && String(messages[messages.length - 1]?.sender).trim().toLowerCase() === 'ai' && (
          <div style={{ position: 'absolute', bottom: '20px', left: '0', right: '0', zIndex: 20, display: 'flex', justifyContent: 'center', padding: '0 24px', boxSizing: 'border-box' }}>
            <div 
              className="animate-popup"
              style={{ position: 'relative', background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: '24px', padding: '20px 24px', boxShadow: '0 10px 32px rgba(15,23,42,0.08)', border: '1px solid rgba(255,255,255,0.6)', textAlign: 'center', width: '100%', maxWidth: '320px', cursor: 'pointer' }}
              onClick={() => setIsChatMode(true)}
            >
              <p style={{ margin: 0, fontSize: '15px', color: '#1e293b', fontWeight: 500, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                {messages[messages.length - 1].text}
              </p>
              {messages[messages.length - 1].isQuickResponse && (
                <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#64748b' }}>思考中...</p>
              )}
              {/* 吹き出しのしっぽ */}
              <div style={{ position: 'absolute', bottom: '-10px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderTop: '10px solid rgba(255, 255, 255, 0.85)', filter: 'drop-shadow(0 4px 2px rgba(0,0,0,0.03))' }} />
            </div>
          </div>
        )}

        {/* 【レイヤー3: 前面】パターンB: テキストチャット画面（すりガラスオーバーレイ） */}
        {isChatMode && (
          <div className="hide-scrollbar" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'rgba(255, 255, 255, 0.3)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
            {messages.map(msg => {
              const isAi = String(msg.sender).trim().toLowerCase() === 'ai';
              return (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isAi ? 'flex-start' : 'flex-end', maxWidth: '85%', alignSelf: isAi ? 'flex-start' : 'flex-end' }}>
                  
                  <div style={{ 
                    background: isAi ? 'rgba(255, 255, 255, 0.9)' : '#1e293b', 
                    color: isAi ? '#1e293b' : '#ffffff',
                    padding: isAi ? '16px 20px' : '12px 18px',
                    borderRadius: isAi ? '24px 24px 24px 4px' : '24px 24px 4px 24px',
                    boxShadow: '0 4px 16px rgba(15,23,42,0.06)',
                    border: isAi ? '1px solid rgba(255, 255, 255, 0.8)' : 'none',
                    fontSize: '14px', lineHeight: '1.6', fontWeight: 500
                  }}>
                    <span className="selectable-text" style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                    
                    {isAi && !msg.isQuickResponse && (
                      <button 
                        onClick={() => playVoice(msg.text)}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(187, 247, 208, 0.5)', background: 'rgba(240, 253, 244, 0.8)', color: '#16a34a', fontSize: '11px', padding: '4px 8px', borderRadius: '8px', marginTop: '8px', cursor: 'pointer', fontWeight: 600 }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                        声を聴く
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} style={{ height: '20px' }} />
          </div>
        )}
      </div>

      {/* 🌟 3. 活動ログ履歴 (最前面フルスクリーン) */}
      {showHistorySessions && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(15px)', zIndex: 300, display: 'flex', flexDirection: 'column' }}>
          <header style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
            <h2 style={{ margin: 0, fontSize: '17px', color: '#1e293b', fontWeight: 600 }}>会話の履歴</h2>
            <button onClick={() => setShowHistorySessions(false)} style={{ background: '#f1f5f9', border: 'none', width: '36px', height: '36px', borderRadius: '50%', fontSize: '16px', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </header>
          <div className="hide-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {sessions.map(session => (
              <button key={session.session_id} onClick={() => selectSession(session.session_id)} style={{ textAlign: 'left', padding: '16px', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', width: '100%', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>{new Date(session.created_at).toLocaleDateString('ja-JP')}</div>
                <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.first_message || "新しい会話"}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 🌟 4. 下部固定入力バー (最前面レイヤー) */}
      <footer style={{ padding: '16px 24px 30px 24px', boxSizing: 'border-box', zIndex: 200, position: 'relative' }}>
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} isMuted={isMuted} setIsMuted={setIsMuted} unlockAudio={unlockAudio} />
      </footer>

    </div>
  );
}

export default App;