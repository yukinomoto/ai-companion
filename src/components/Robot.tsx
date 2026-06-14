import React from 'react';

export const Robot: React.FC<{ mood?: string }> = ({ mood = 'happy' }) => {
  return (
    <div className="robot-container" style={{
      width: '200px',
      height: '240px',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      animation: 'float 4s ease-in-out infinite'
    }}>
      {/* 浮遊影 */}
      <div style={{
        position: 'absolute',
        bottom: '-20px',
        width: '80px',
        height: '10px',
        background: 'rgba(0,0,0,0.1)',
        borderRadius: '50%',
        filter: 'blur(4px)',
        animation: 'shadow 4s ease-in-out infinite'
      }} />

      {/* ロボット本体 (SVG) */}
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* ボディ */}
        <circle cx="60" cy="60" r="50" fill="white" stroke="#E2E8F0" strokeWidth="2" />
        {/* ディスプレイ顔面 */}
        <rect x="30" y="40" width="60" height="40" rx="15" fill="#1E293B" />
        {/* 目 (ドット) */}
        <circle cx="45" cy="60" r="4" fill="#22D3EE">
          <animate attributeName="opacity" values="1;0.2;1" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="75" cy="60" r="4" fill="#22D3EE">
          <animate attributeName="opacity" values="1;0.2;1" dur="3s" repeatCount="indefinite" />
        </circle>
      </svg>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        @keyframes shadow {
          0%, 100% { transform: scale(1); opacity: 0.1; }
          50% { transform: scale(1.2); opacity: 0.05; }
        }
      `}</style>
    </div>
  );
};