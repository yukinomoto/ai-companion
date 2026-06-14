import React from 'react';
import type { ChatSession } from '../hooks/useCompanionChat';
import { Companion3D } from './Companion3D';

interface HomeProps {
  onStartConsult: () => void;
  onStartChat: () => void;
  sessions: ChatSession[];
  onSelectSession: (sessionId: string) => void;
}

export const Home: React.FC<HomeProps> = ({ onStartConsult, onStartChat, sessions, onSelectSession }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f0f4f8', fontFamily: 'sans-serif' }}>
      
      {/* 挨拶エリア */}
      <div style={{ padding: '24px 20px 12px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 6px 0' }}>おはよう、ユウキ！</h1>
        <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>今日も一緒に、いい一日にしようね。</p>
      </div>

      {/* 3Dキャラクター（ホーム画面用） */}
      <div style={{ padding: '0 16px' }}>
        {/* ホーム画面では isLoading=false 固定でぷかぷかさせておきます */}
        <Companion3D isLoading={false} />
      </div>

      {/* メインアクションボタン */}
      <div style={{ display: 'flex', gap: '12px', padding: '16px' }}>
        <button
          onClick={onStartConsult}
          style={{
            flex: 1, backgroundColor: '#ffffff', borderRadius: '20px', padding: '16px', border: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: '12px', cursor: 'pointer', transition: 'transform 0.1s'
          }}
        >
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#e0e7ff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '24px' }}>
            🎙️
          </div>
          <div style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '14px', textAlign: 'center' }}>
            チャット <br/><span style={{fontSize:'11px', color:'#64748b', fontWeight:'normal'}}>相談・質問する</span>
          </div>
        </button>
        
        <button
          onClick={onStartChat}
          style={{
            flex: 1, backgroundColor: '#ffffff', borderRadius: '20px', padding: '16px', border: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: '12px', cursor: 'pointer', transition: 'transform 0.1s'
          }}
        >
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '24px' }}>
            💬
          </div>
          <div style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '14px', textAlign: 'center' }}>
            雑談 <br/><span style={{fontSize:'11px', color:'#64748b', fontWeight:'normal'}}>自由におしゃべり</span>
          </div>
        </button>
      </div>

      {/* 活動ログ（履歴）エリア */}
      <div style={{ flex: 1, backgroundColor: '#ffffff', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '20px 16px', overflowY: 'auto', boxShadow: '0 -4px 12px rgba(0,0,0,0.02)' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#334155', margin: '0 0 16px 0' }}>活動ログ</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sessions.length === 0 ? (
            <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', marginTop: '20px' }}>まだ会話履歴がありません</p>
          ) : (
            sessions.map(session => (
              <button
                key={session.session_id}
                onClick={() => onSelectSession(session.session_id)}
                style={{
                  textAlign: 'left', padding: '16px', borderRadius: '16px', backgroundColor: '#f8fafc',
                  border: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px'
                }}
              >
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  {new Date(session.created_at).toLocaleDateString('ja-JP')} {new Date(session.created_at).toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'})}
                </div>
                <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {session.first_message}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
      
    </div>
  );
};