import React, { useState } from 'react';

interface ChatInputProps {
  onSendMessage: (text: string, isVoice: boolean) => void;
  isLoading: boolean;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading, isMuted, setIsMuted }) => {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isLoading) return;
    onSendMessage(text, false);
    setText('');
  };

  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      
      {/* ミュート切り替えボタン */}
      <button 
        onClick={() => setIsMuted(!isMuted)} 
        style={{ 
          background: isMuted ? '#f1f5f9' : '#e0f2fe', 
          border: 'none', width: '44px', height: '44px', borderRadius: '50%', 
          cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isMuted ? '#94a3b8' : '#0ea5e9'
        }}
      >
        {isMuted ? '🔇' : '🔊'}
      </button>

      {/* 💡 カプセル型の入力エリア */}
      <form onSubmit={handleSubmit} style={{ 
        flex: 1, display: 'flex', gap: '8px', alignItems: 'center', 
        backgroundColor: '#f8fafc', borderRadius: '30px', padding: '6px 6px 6px 20px', 
        border: '1px solid #e2e8f0' 
      }}>
        <input 
          type="text" 
          value={text} 
          onChange={(e) => setText(e.target.value)} 
          placeholder="メッセージを入力..." 
          disabled={isLoading}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '15px', color: '#1e293b' }}
        />
        
        {/* テキストがある時は黒い紙飛行機、無い時は青いマイク */}
        {text.trim() ? (
          <button 
            type="submit" 
            disabled={isLoading} 
            style={{ background: '#0f172a', color: '#fff', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ➤
          </button>
        ) : (
          <button 
            type="button"
            disabled={isLoading} 
            onClick={() => alert('音声入力は現在開発中です！')}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            🎙️
          </button>
        )}
      </form>
      
    </div>
  );
};