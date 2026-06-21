// src/components/ChatInput.tsx
import React, { useState, useRef, useEffect } from 'react';
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
  const textareaRef = useRef<HTMLTextAreaElement>(null); // 💡 追加：自動拡張の高さ計算用

  // 💡 既存の機能1：テキストの入力内容に合わせて最大4行（96px）まで高さを動的に自動拡張する
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto'; // 一度リセット
    const nextHeight = Math.min(textarea.scrollHeight, 96); // 最大4行相当(96px)に制限
    textarea.style.height = `${nextHeight}px`;
  }, [inputText]);

  // 💡 既存の機能2：画像をブラウザ側で綺麗にリサイズ・圧縮する処理（完全維持）
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 1024;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject('Canvas rendering failed');
          
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataUrl);
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedDataUrl = await compressImage(file);
      const base64 = compressedDataUrl.split(',')[1];
      
      setSelectedImage({
        base64,
        mimeType: 'image/jpeg',
      });
    } catch (error) {
      console.error('画像圧縮エラー:', error);
      alert('画像の処理に失敗しました。');
    }
    
    e.target.value = '';
  };

  // 💡 修正：テキストとプレビュー画像を同時に安全に送信するよう統合
  const handleSend = () => {
    onSend(inputText, false, selectedImage || undefined);
    setSelectedImage(null); // 送信後にプレビューをクリア
    setInputText('');       // 送信後に入力欄をクリア
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // PC環境でのEnterキー単体押下時のみ送信（Shift+Enterは改行を許可）
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
      e.preventDefault();
      if (!disabled && canSend) {
        handleSend();
      }
    }
  };

  const disabled = isRecording || isTranscribing || isThinking;
  const canSend = !!inputText.trim() || !!selectedImage;

  return (
    <div className="w-full relative flex flex-col gap-3">
      {/* 🖼️ 画像プレビュー領域（完全維持） */}
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

      {/* ⌨️ テキスト入力（textarea拡張）＆ボタン領域 */}
      <div className="w-full relative flex items-end group bg-slate-50 border border-slate-200 focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-500/5 rounded-2xl p-2 transition-all shadow-sm">
        <input 
          type="file" 
          accept="image/*" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
        />
        
        {/* 画像選択ボタン */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className={`p-2.5 transition-colors rounded-xl mb-0.5 shrink-0 ${
            selectedImage ? 'text-blue-500 bg-blue-50' : 'text-slate-400 hover:text-blue-500 hover:bg-slate-100'
          } disabled:opacity-50`}
        >
          <ImagePlus size={20} strokeWidth={2} />
        </button>

        {/* 💡 inputからtextareaへ安全に差し替え（最大4行自動拡張） */}
        <textarea 
          ref={textareaRef}
          rows={1}
          placeholder={
            isTranscribing ? "Transcribing voice..." :
            isThinking ? "Thinking..." :
            isRecording ? "Listening..." : "Message or upload image..."
          }
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={`flex-1 max-h-24 bg-transparent border-none outline-none resize-none text-[16px] text-slate-700 py-2.5 px-3 font-sans leading-normal hide-scrollbar selectable-text ${
            isTranscribing || isThinking ? 'text-blue-400 italic' : ''
          }`}
        />
        
        {/* 送信ボタン */}
        <button 
          onClick={handleSend}
          disabled={disabled || !canSend}
          className={`p-2.5 rounded-xl transition-all shadow-sm mb-0.5 shrink-0 ${
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