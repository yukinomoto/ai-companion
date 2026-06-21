// src/components/ChatInput.tsx
import React, { useState, useRef } from 'react';
import { Send, ImagePlus, X } from 'lucide-react';
import { type MultimodalImage } from '../services/chatService';

interface ChatInputProps {
  inputText: string;
  setInputText: (text: string) => void;
  isTranscribing: boolean;
  isThinking: boolean;
  isRecording: boolean;
  onSend: (text?: string, isVoice?: boolean, image?: MultimodalImage) => void;
}

export function ChatInput({ 
  inputText, 
  setInputText, 
  isTranscribing, 
  isThinking, 
  isRecording, 
  onSend 
}: ChatInputProps) {
  const [selectedImage, setSelectedImage] = useState<MultimodalImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 💡 制限: 5MB以下の画像のみ許可
    if (file.size > 5 * 1024 * 1024) {
      alert('画像サイズは5MB以下にしてください。');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target?.result as string;
      const base64 = base64Data.split(',')[1];
      setSelectedImage({
        base64,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // 連続で同じ画像を選べるようにリセット
  };

  const handleSend = () => {
    onSend(undefined, false, selectedImage || undefined);
    setSelectedImage(null); // 送信後にプレビューをクリア
  };

  const disabled = isRecording || isTranscribing || isThinking;
  const canSend = !!inputText.trim() || !!selectedImage;

  return (
    <div className="w-full relative flex flex-col gap-3">
      {/* 🖼️ 画像プレビュー領域 */}
      {selectedImage && (
        <div className="relative inline-block w-24 h-24 ml-2 animate-in fade-in slide-in-from-bottom-2">
          <img 
            src={`data:${selectedImage.mimeType};base64,${selectedImage.base64}`} 
            alt="preview" 
            className="w-full h-full object-cover rounded-xl border-2 border-slate-200 shadow-md bg-white" 
          />
          <button 
            onClick={() => setSelectedImage(null)}
            className="absolute -top-2 -right-2 bg-slate-800 text-white p-1.5 rounded-full hover:bg-slate-700 transition-colors shadow-lg z-10"
          >
            <X size={12} strokeWidth={3} />
          </button>
        </div>
      )}

      {/* ⌨️ テキスト入力＆ボタン領域 */}
      <div className="w-full relative flex items-center group">
        <input 
          type="file" 
          accept="image/jpeg, image/png, image/webp" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
        />
        
        {/* 画像選択（クリップ）ボタン */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className={`absolute left-2 p-2.5 transition-colors z-10 rounded-xl ${
            selectedImage ? 'text-blue-500 bg-blue-50' : 'text-slate-400 hover:text-blue-500 hover:bg-slate-100'
          } disabled:opacity-50`}
        >
          <ImagePlus size={20} strokeWidth={2} />
        </button>

        <input 
          type="text"
          placeholder={
            isTranscribing ? "Transcribing voice..." :
            isThinking ? "Thinking..." :
            isRecording ? "Listening..." : "Message or upload image..."
          }
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !disabled && canSend && handleSend()}
          disabled={disabled}
          className={`w-full bg-slate-50 border rounded-2xl py-4 pl-14 pr-14 text-[16px] text-slate-700 focus:outline-none transition-all shadow-sm ${
            isTranscribing || isThinking 
              ? 'border-blue-200 bg-blue-50/30 text-blue-400 italic' 
              : 'border-slate-200 focus:border-blue-300 focus:ring-4 focus:ring-blue-500/5'
          }`}
        />
        
        {/* 送信ボタン */}
        <button 
          onClick={handleSend}
          disabled={disabled || !canSend}
          className={`absolute right-2 p-2.5 rounded-xl transition-all shadow-sm ${
            disabled || !canSend
              ? 'bg-slate-100 text-slate-300' 
              : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
          }`}
        >
          <Send size={18} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}