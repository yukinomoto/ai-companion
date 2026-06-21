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

  // 💡 追加：画像をブラウザ側で綺麗にリサイズ・圧縮する処理
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          // Geminiが十分に認識できて、かつ容量が軽いベストなサイズ（最大1024px）
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
          // 画質を80%にして軽量なJPEGに変換（これで数MBの画像が数百KBになります）
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
      // 💡 圧縮処理を実行
      const compressedDataUrl = await compressImage(file);
      const base64 = compressedDataUrl.split(',')[1];
      
      setSelectedImage({
        base64,
        mimeType: 'image/jpeg', // 圧縮時にJPEGに統一
      });
    } catch (error) {
      console.error('画像圧縮エラー:', error);
      alert('画像の処理に失敗しました。');
    }
    
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
          accept="image/*" // iPhoneからHEICなども選べるように拡張
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
        />
        
        {/* 画像選択ボタン */}
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