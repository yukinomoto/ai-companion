import React from 'react';
import type { Message } from '../hooks/useCompanionChat';

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.sender === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-5`}>
      <div
        className={`max-w-[75%] p-3.5 rounded-2xl shadow-sm border transition-all duration-300 ${
          isUser
            ? 'bg-blue-600 border-blue-600 text-white rounded-tr-none font-medium'
            : message.isQuickResponse
            ? 'bg-gray-50 border-dashed border-gray-300 text-gray-400 rounded-tl-none animate-pulse' // 思考中の相槌スタイル
            : 'bg-white border-gray-100 text-gray-800 rounded-tl-none' // 本回答スタイル
        }`}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.text}
        </p>
        
        {/* API①が返した相槌状態のときだけ「思考中」のインジケータを出す */}
        {message.isQuickResponse && (
          <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-gray-400 font-normal">
            <span>🤖 思考中</span>
            <span className="flex h-1 w-1 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1 w-1 bg-blue-500"></span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};