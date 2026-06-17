// src/components/ChatInput.tsx
import { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSendMessage: (text: string, isVoice: boolean) => void;
  isLoading: boolean;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  unlockAudio: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading, unlockAudio }) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  const textRef = useRef(text);
  useEffect(() => { textRef.current = text; }, [text]);
  const onSendMessageRef = useRef(onSendMessage);
  useEffect(() => { onSendMessageRef.current = onSendMessage; }, [onSendMessage]);

  const isManualStopRef = useRef(false);
  const wasVoiceInputRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !recognitionRef.current) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'ja-JP';

        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            currentTranscript += event.results[i][0].transcript;
          }
          if (currentTranscript) { 
            setText((prev) => prev + currentTranscript); 
            wasVoiceInputRef.current = true;
          }
        };

        recognition.onerror = (event: any) => {
          console.error("音声認識エラー:", event.error);
          setIsRecording(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };
        recognitionRef.current = recognition;
      }
    }
    return () => {};
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    unlockAudio();
    if (!text.trim() || isLoading) return;

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      isManualStopRef.current = true; 
    }
    
    onSendMessage(text, wasVoiceInputRef.current);
    setText('');
    wasVoiceInputRef.current = false;
  };

  const toggleRecording = () => {
    unlockAudio();
    if (!recognitionRef.current || isLoading) return;

    if (isRecording) {
      isManualStopRef.current = true;
      recognitionRef.current.stop();
    } else {
      setText(''); 
      isManualStopRef.current = false;
      wasVoiceInputRef.current = true;
      try {
        // 💡 許可ダイアログ再発の原因になっていた abort() と setTimeout を撤去し、直接起動
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (e) {
        console.error("録音開始失敗:", e);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ 
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
      background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      padding: '10px 16px', borderRadius: '40px', border: '1px solid rgba(255,255,255,1)',
      boxShadow: '0 12px 32px rgba(0,0,0,0.08)' 
    }}>
      <button type="button" style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', display: 'flex' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
          <line x1="6" y1="8" x2="6.01" y2="8"></line><line x1="10" y1="8" x2="10.01" y2="8"></line><line x1="14" y1="8" x2="14.01" y2="8"></line><line x1="18" y1="8" x2="18.01" y2="8"></line>
          <line x1="6" y1="12" x2="6.01" y2="12"></line><line x1="10" y1="12" x2="10.01" y2="12"></line><line x1="14" y1="12" x2="14.01" y2="12"></line><line x1="18" y1="12" x2="18.01" y2="12"></line>
          <line x1="8" y1="16" x2="16" y2="16"></line>
        </svg>
      </button>

      <input 
        type="text" className="selectable-text" value={text} onChange={(e) => setText(e.target.value)} 
        placeholder={isRecording ? "聞き取り中..." : "話しかけてみる..."} disabled={isLoading} 
        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '15px', color: '#1e293b', fontWeight: 500, textAlign: 'center' }} 
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isRecording ? (
          <button type="button" disabled={isLoading} onClick={toggleRecording} style={{ background: '#ef4444', border: 'none', width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect></svg>
          </button>
        ) : text.trim() ? (
          <button type="submit" disabled={isLoading} style={{ background: 'linear-gradient(135deg, #6366f1, #3b82f6)', border: 'none', width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(59,130,246,0.3)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        ) : (
          <button type="button" disabled={isLoading} onClick={toggleRecording} style={{ background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', border: 'none', width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(59,130,246,0.35)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          </button>
        )}
      </div>

      <button type="button" onClick={() => alert("画像認識は開発中です")} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', display: 'flex' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      </button>
    </form>
  );
};