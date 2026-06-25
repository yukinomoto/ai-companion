import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, FileText } from 'lucide-react';
import { type MultimodalAttachment } from '../services/chatService';

interface ChatInputProps {
  inputText: string;
  setInputText: (text: string) => void;
  isTranscribing: boolean;
  isThinking: boolean;
  isRecording: boolean;
  onSend: (text?: string, isVoice?: boolean, attachment?: MultimodalAttachment) => void;
}

interface AttachmentState extends MultimodalAttachment {
  name: string;
  isImage: boolean;
}

export function ChatInput({ 
  inputText, 
  setInputText, 
  isTranscribing, 
  isThinking, 
  isRecording, 
  onSend 
}: ChatInputProps) {
  const [selectedAttachment, setSelectedAttachment] = useState<AttachmentState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = `${nextHeight}px`;
  }, [inputText]);

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

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const isImage = file.type.startsWith('image/');
      let base64 = '';
      let mimeType = file.type;

      if (isImage) {
        const compressedDataUrl = await compressImage(file);
        base64 = compressedDataUrl.split(',')[1];
        mimeType = 'image/jpeg';
      } else {
        base64 = await readFileAsBase64(file);
      }
      
      setSelectedAttachment({
        base64,
        mimeType,
        name: file.name,
        isImage
      });
    } catch (error) {
      console.error('ファイル処理エラー:', error);
      alert('ファイルの処理に失敗しました。');
    }
    
    e.target.value = '';
  };

  const handleSend = () => {
    const sendData = selectedAttachment ? {
      base64: selectedAttachment.base64,
      mimeType: selectedAttachment.mimeType
    } : undefined;

    onSend(inputText, false, sendData);
    setSelectedAttachment(null);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
      e.preventDefault();
      if (!disabled && canSend) {
        handleSend();
      }
    }
  };

  const disabled = isRecording || isTranscribing || isThinking;
  const canSend = !!inputText.trim() || !!selectedAttachment;

  return (
    <div className="w-full relative flex flex-col gap-3">
      {selectedAttachment && (
        <div className="relative inline-block ml-4 animate-in fade-in slide-in-from-bottom-2">
          {selectedAttachment.isImage ? (
            <img 
              src={`data:${selectedAttachment.mimeType};base64,${selectedAttachment.base64}`} 
              alt="preview" 
              className="w-24 h-24 object-cover rounded-2xl border-2 border-slate-200 shadow-md bg-white" 
            />
          ) : (
            <div className="w-24 h-24 flex flex-col items-center justify-center bg-white rounded-2xl border-2 border-slate-200 shadow-md p-2 text-slate-600">
              <FileText size={28} className="mb-1 text-blue-500" />
              <span className="text-[10px] text-center break-all line-clamp-2 leading-tight font-medium">
                {selectedAttachment.name}
              </span>
            </div>
          )}
          <button 
            onClick={() => setSelectedAttachment(null)}
            className="absolute -top-2 -right-2 bg-slate-800 text-white p-1.5 rounded-full hover:bg-slate-700 transition-colors shadow-lg z-10"
          >
            <X size={12} strokeWidth={3} />
          </button>
        </div>
      )}

      <div className="w-full relative flex items-end group bg-slate-50 border border-slate-200 focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-500/5 rounded-3xl p-1 transition-all shadow-sm">
        <input 
          type="file" 
          accept="image/*,.pdf,.csv,.txt" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
        />
        
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className={`w-10 h-10 flex items-center justify-center transition-colors rounded-full shrink-0 ${
            selectedAttachment ? 'text-blue-500 bg-blue-50' : 
            'text-slate-400 hover:text-blue-500 hover:bg-slate-100'
          } disabled:opacity-50`}
        >
          <Paperclip size={20} strokeWidth={2} />
        </button>

        <textarea 
          ref={textareaRef}
          rows={1}
          placeholder={
            isTranscribing ? "Transcribing voice..." :
            isThinking ? "Thinking..." :
            isRecording ? "Listening..." : "Message or upload file..."
          }
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={`flex-1 max-h-28 bg-transparent border-none outline-none resize-none text-[16px] text-slate-700 py-2 px-2 font-sans leading-relaxed hide-scrollbar selectable-text ${
            isTranscribing || isThinking ? 'text-blue-400 italic' : ''
          }`}
        />
        
        <button 
          onClick={handleSend}
          disabled={disabled || !canSend}
          className={`w-10 h-10 rounded-full transition-all shadow-sm shrink-0 flex items-center justify-center ${
            disabled || !canSend
              ? 'bg-slate-100 text-slate-300' 
              : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
          }`}
        >
          <Send size={18} strokeWidth={2.5} className={canSend && !disabled ? "translate-x-[1px] translate-y-[1px]" : ""} />
        </button>
      </div>
    </div>
  );
}