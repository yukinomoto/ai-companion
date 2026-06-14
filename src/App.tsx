import { useState } from 'react';
import { useCompanionChat, VOICE_PRESETS } from './hooks/useCompanionChat';
import { ChatInput } from './components/ChatInput';
import { Home } from './components/Home';
import { Companion3D } from './components/Companion3D';

function App() {
  const [view, setView] = useState<'home' | 'consult' | 'chat'>('home');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const { 
    messages, isLoading, sendMessage, selectedVoice, setSelectedVoice, 
    playVoice, isMuted, setIsMuted, sessions, unlockAudio // 💡 追加
  } = useCompanionChat(currentSessionId);

  const startNewConsult = () => {
    setCurrentSessionId(crypto.randomUUID());
    setView('consult');
  };

  const resumeConsult = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setView('consult');
  };

  if (view === 'home') {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', height: '100vh', border: '1px solid #e2e8f0' }}>
        <Home 
          onStartConsult={startNewConsult}
          onStartChat={() => alert('雑談モードは現在開発中だよ！')}
          sessions={sessions}
          onSelectSession={resumeConsult}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
      <div style={{ padding: '16px', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0' }}>
        <button onClick={() => { setView('home'); setCurrentSessionId(null); }} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>←</button>
        <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b' }}>{messages.length > 0 ? 'チャット（相談モード）' : '新しい相談'}</span>
        <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)} style={{ padding: '6px 12px', borderRadius: '20px', border: 'none', fontSize: '12px', backgroundColor: '#f1f5f9', color: '#475569', cursor: 'pointer', outline: 'none' }}>
          {VOICE_PRESETS.map(preset => (<option key={preset.id} value={preset.id}>{preset.name}</option>))}
        </select>
      </div>

      <div style={{ padding: '16px 16px 0 16px' }}><Companion3D isLoading={isLoading} /></div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {messages.map((msg) => {
          const isAi = String(msg.sender).trim().toLowerCase() === 'ai';
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isAi ? 'flex-start' : 'flex-end', opacity: msg.isQuickResponse ? 0.7 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexDirection: isAi ? 'row' : 'row-reverse', maxWidth: '90%' }}>
                {isAi && <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '4px', fontSize: '18px' }}>🤖</div>}
                <div style={{ padding: '14px 18px', borderRadius: isAi ? '4px 20px 20px 20px' : '20px 4px 20px 20px', backgroundColor: isAi ? '#ffffff' : '#3b82f6', color: isAi ? '#1e293b' : '#ffffff', fontSize: '15px', whiteSpace: 'pre-wrap', boxShadow: isAi ? '0 4px 12px rgba(0,0,0,0.05)' : 'none', lineHeight: '1.5' }}>
                  {msg.text}
                  {msg.isQuickResponse && <div style={{ fontSize: '11px', marginTop: '6px', color: '#94a3b8' }}>思考中...</div>}
                </div>
                {isAi && !msg.isQuickResponse && <button onClick={() => playVoice(msg.text)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', padding: '8px 0', color: '#cbd5e1' }}>📢</button>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0', padding: '12px 16px' }}>
        <ChatInput onSendMessage={sendMessage} isLoading={isLoading} isMuted={isMuted} setIsMuted={setIsMuted} unlockAudio={unlockAudio} />
      </div>
    </div>
  );
}

export default App;