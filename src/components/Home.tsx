import React from 'react';
import { Robot } from './Robot';
import type { ChatSession } from '../hooks/useCompanionChat';

interface HomeProps {
  onStartConsult: () => void;
  onStartChat: () => void;
  sessions: ChatSession[]; // 💡 過去の部屋リストを受け取る
  onSelectSession: (id: string) => void; // 💡 部屋が選ばれた時の関数を受け取る
}

export const Home: React.FC<HomeProps> = ({ onStartConsult, onStartChat, sessions, onSelectSession }) => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'おはよう、ユウキ！\n今日はどんな一日にする？';
    if (hour >= 12 && hour < 18) return 'こんにちは！\n調子はどうかな？';
    return 'おかえり、ユウキ。\n今日もお疲れ様。';
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      padding: '40px 24px 24px 24px',
      background: '#FFF9F1',
      boxSizing: 'border-box'
    }}>
      {/* 上部：ロボットと挨拶 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '20px' }}>
        <Robot />
        <h1 style={{ 
          fontSize: '22px', 
          fontWeight: '500', 
          color: '#334155', 
          whiteSpace: 'pre-wrap',
          lineHeight: '1.4',
          margin: 0,
          textAlign: 'center'
        }}>
          {getGreeting()}
        </h1>
      </div>

      {/* 💡【新設】中央：過去の相談履歴リストエリア */}
      <div style={{ 
        flex: 1, 
        width: '100%', 
        overflowY: 'auto', 
        margin: '24px 0', 
        padding: '8px',
        backgroundColor: 'rgba(255,255,255,0.4)',
        borderRadius: '20px',
        boxSizing: 'border-box',
        border: '1px dashed #E2E8F0'
      }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748B', padding: '0 8px 8px 8px', textAlign: 'left' }}>
          🕒 過去の相談から再開
        </div>
        
        {sessions.length === 0 ? (
          <div style={{ padding: '24px', fontSize: '14px', color: '#94A3B8', textAlign: 'center' }}>
            まだ過去の相談履歴はありません。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sessions.map((session) => (
              <div
                key={session.session_id}
                onClick={() => onSelectSession(session.session_id)}
                style={{
                  padding: '12px 16px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1px solid #E2E8F0',
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: '14px',
                  color: '#334155',
                  fontWeight: '500'
                }}
              >
                {session.first_message}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 下部：2つのアクションボタン */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          onClick={onStartConsult}
          style={{
            padding: '16px 20px',
            borderRadius: '20px',
            border: '1px solid #E2E8F0',
            backgroundColor: '#FFFFFF',
            boxShadow: '0 4px 6px rgba(0,0,0,0.03)',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
        >
          <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#1E293B' }}>✨ 新しく相談する</span>
          <span style={{ fontSize: '12px', color: '#64748B' }}>新しくスレッドを立てて質問や調査を開始します。</span>
        </button>

        <button
          onClick={onStartChat}
          style={{
            padding: '16px 20px',
            borderRadius: '20px',
            border: 'none',
            backgroundColor: '#1E293B',
            color: '#FFFFFF',
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
        >
          <span style={{ fontSize: '16px', fontWeight: 'bold' }}>💬 雑談する</span>
          <span style={{ fontSize: '12px', color: '#94A3B8' }}>AIから話題を振ってほしい時に。</span>
        </button>
      </div>
    </div>
  );
};