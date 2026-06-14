import { useState } from 'react';
import { useCompanionChat, VOICE_PRESETS } from './hooks/useCompanionChat';
import { ChatInput } from './components/ChatInput';
import { Home } from './components/Home';

function App() {
  const [view, setView] = useState<'home' | 'consult' | 'chat'>('home');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  // フックから sessions を受け取る
  const { 
    messages, 
    isLoading, 
    sendMessage, 
    selectedVoice, 
    setSelectedVoice, 
    playVoice, 
    isMuted, 
    setIsMuted,
    sessions 
  } = useCompanionChat(currentSessionId);

  const startNewConsult = () => {
    setCurrentSessionId(crypto.randomUUID());
    setView('consult');
  };

  // 💡 過去のセッションを復帰させて部屋に入る関数
  const resumeConsult = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setView('consult');
  };

  if (view === 'home') {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', height: '100vh', border: '1px solid #eee' }}>
        <Home 
          onStartConsult={startNewConsult}
          onStartChat={() => alert('雑談モードは現在開発中だよ！')}
          sessions={sessions} // 💡 履歴リストを渡す
          onSelectSession={resumeConsult} // 💡 復帰関数を渡す
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', border: '1px solid #eee', backgroundColor: '#fff' }}>
      
      <div style={{ padding: '12px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button 
          onClick={() => { setView('home'); setCurrentSessionId(null); }} 
          style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}
        >
          ←
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#334155' }}>
            {messages.length > 0 ? '相談の続き' : '新しい相談'}
          </span>
          <select 
            value={selectedVoice} 
            onChange={(e) => setSelectedVoice(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px', marginLeft: 'auto' }}
          >
            {VOICE_PRESETS.map(preset => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.map((msg) => {
          const isAi = String(msg.sender).trim().toLowerCase() === 'ai';
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isAi ? 'flex-start' : 'flex-end', opacity: msg.isQuickResponse ? 0.7 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexDirection: isAi ? 'row' : 'row-reverse' }}>
                <div style={{ padding: '12px 16px', borderRadius: '18px', backgroundColor: isAi ? '#f1f0f0' : '#1890ff', color: isAi ? '#000' : '#fff', fontSize: '15px', whiteSpace: 'pre-wrap' }}>
                  {msg.text}
                  {msg.isQuickResponse && <div style={{ fontSize: '11px', marginTop: '4px', color: '#888' }}>🤖 思考中...</div>}
                </div>
                {isAi && !msg.isQuickResponse && (
                  <button onClick={() => playVoice(msg.text)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px' }}>📢</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ChatInput onSendMessage={sendMessage} isLoading={isLoading} isMuted={isMuted} setIsMuted={setIsMuted} />
    </div>
  );
}

export default App;