import { useState, useEffect, useRef } from 'react';
import { useCompanionChat } from './hooks/useCompanionChat';
import { ChatInput } from './components/ChatInput';
import { Companion3D } from './components/Companion3D';

function App() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isChatMode, setIsChatMode] = useState(false); // 通常ホーム画面（false） / テキストチャット表示（true）
  const [showHistorySessions, setShowHistorySessions] = useState(false); 
  
  const { messages, isLoading, sendMessage, isMuted, setIsMuted, unlockAudio, sessions, playVoice } = useCompanionChat(currentSessionId);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // AI回答時の音声自動再生と、チャットスクロールの連動
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatMode]);

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

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', height: '100dvh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #ffffff 0%, #f0f9ff 35%, #faf5ff 70%, #e0f2fe 100%)', position: 'relative', overflow: 'hidden', boxSizing: 'border-box' }}>
      
      {/* 🌟 1. 固定システムヘッダー */}
      <header style={{ height: '80px', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 200, boxSizing: 'border-box' }}>
        {/* 左: 過去の活動ログ一覧を開くボタン */}
        <button 
          onClick={() => setShowHistorySessions(true)}
          style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(10px)', border: 'none', width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>

        {/* 右: チャット表示の切り替えボタン */}
        <button 
          onClick={() => setIsChatMode(!isChatMode)} 
          style={{ background: isChatMode ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.85)', backdropFilter: 'blur(10px)', border: isChatMode ? '1px solid #3b82f6' : 'none', width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}
        >
          {isChatMode ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          )}
        </button>
      </header>

      {/* 🌟 2. メインコンテンツ領域（Flexボックスで領域を完全制御） */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        
        {/* ── 【パターン A: 通常ホーム画面（isChatMode === false）】 ── */}
        {!isChatMode && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '20px', boxSizing: 'border-box' }}>
            
            {/* 上部：3Dキャラクター専用の空間 */}
            <div style={{ width: '100%', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Companion3D isLoading={isLoading} />
            </div>
            
            {/* 下部：💡 修正箇所：固定の嘘テキストの条件分岐を完全削除。フック側から届いた本物のAIの第一声だけを映します */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '0 24px', boxSizing: 'border-box' }}>
              {messages.length > 0 && String(messages[messages.length - 1]?.sender).trim().toLowerCase() === 'ai' && (
                <div 
                  style={{ position: 'relative', background: '#ffffff', borderRadius: '24px', padding: '20px 24px', boxShadow: '0 10px 32px rgba(15,23,42,0.08)', border: '1px solid #e2e8f0', textAlign: 'center', width: '100%', maxWidth: '320px', boxSizing: 'border-box', cursor: 'pointer' }}
                  onClick={() => setIsChatMode(true)} // タップしたらそのままタイムラインモードへ切り替え
                >
                  <p style={{ margin: 0, fontSize: '14px', color: '#1e293b', fontWeight: 500, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                    {messages[messages.length - 1].text}
                  </p>
                  {messages[messages.length - 1].isQuickResponse && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#64748b' }}>思考中...</p>
                  )}
                  {/* 物理的な下しっぽ（三角形） */}
                  <div style={{ position: 'absolute', bottom: '-10px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderTop: '10px solid #ffffff', filter: 'drop-shadow(0 4px 2px rgba(0,0,0,0.03))' }} />
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── 【パターン B: テキストチャット表示画面（isChatMode === true）】 ── */}
        {isChatMode && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            
            {/* 上部：3Dキャラの部屋を小さく固定 */}
            <div style={{ width: '100%', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f1f5f9' }}>
              <Companion3D isLoading={isLoading} />
            </div>
            
            {/* 下部：スクロール可能な独立タイムライン（完全不透明。名前ラベル無し） */}
            <div className="hide-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#f8fafc' }}>
              {messages.map(msg => {
                const isAi = String(msg.sender).trim().toLowerCase() === 'ai';
                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isAi ? 'flex-start' : 'flex-end', maxWidth: '85%', alignSelf: isAi ? 'flex-start' : 'flex-end' }}>
                    
                    <div style={{ 
                      background: isAi ? '#ffffff' : '#1e293b', 
                      color: isAi ? '#1e293b' : '#ffffff',
                      padding: isAi ? '16px 20px' : '12px 18px',
                      borderRadius: isAi ? '24px 24px 24px 4px' : '24px 24px 4px 24px',
                      boxShadow: '0 4px 12px rgba(15,23,42,0.04)',
                      border: isAi ? '1px solid #e2e8f0' : 'none',
                      fontSize: '14px', lineHeight: '1.6', fontWeight: 500
                    }}>
                      <span className="selectable-text" style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                      
                      {/* 過去ログ用の聞き直しボタン */}
                      {isAi && !msg.isQuickResponse && (
                        <button 
                          onClick={() => playVoice(msg.text)}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', fontSize: '11px', padding: '4px 8px', borderRadius: '8px', marginTop: '8px', cursor: 'pointer', fontWeight: 600 }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                          声を聴く
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

          </div>
        )}
      </div>

      {/* 🌟 3. 活動ログ履歴 */}
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

      {/* 🌟 4. 下部固定入力バー */}
      <footer style={{ padding: '16px 24px 30px 24px', boxSizing: 'border-box', zIndex: 110 }}>
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} isMuted={isMuted} setIsMuted={setIsMuted} unlockAudio={unlockAudio} />
      </footer>

    </div>
  );
}

export default App;