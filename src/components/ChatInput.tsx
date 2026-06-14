import { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSendMessage: (text: string, isVoice: boolean) => void;
  isLoading: boolean;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  unlockAudio: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading, isMuted, setIsMuted, unlockAudio }) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  const textRef = useRef(text);
  useEffect(() => { textRef.current = text; }, [text]);
  
  const onSendMessageRef = useRef(onSendMessage);
  useEffect(() => { onSendMessageRef.current = onSendMessage; }, [onSendMessage]);

  const isManualStopRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
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
          if (currentTranscript) { setText((prev) => prev + currentTranscript); }
        };

        recognition.onerror = () => setIsRecording(false);

        recognition.onend = () => {
          setIsRecording(false);
          if (isManualStopRef.current) {
            if (textRef.current.trim()) {
              onSendMessageRef.current(textRef.current, true);
              setText('');
            }
            isManualStopRef.current = false;
          }
        };
        recognitionRef.current = recognition;
      }
    }
    return () => { if (recognitionRef.current) { recognitionRef.current.abort(); } };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    unlockAudio(); // 💡 送信ボタンを押した瞬間にアンロック（同期処理）
    if (!text.trim() || isLoading) return;
    if (isRecording && recognitionRef.current) {
      isManualStopRef.current = true;
      recognitionRef.current.stop();
    } else {
      onSendMessage(text, false);
      setText('');
    }
  };

  const toggleRecording = () => {
    unlockAudio(); // 💡 マイク/停止ボタンを押した瞬間にアンロック（同期処理）
    if (!recognitionRef.current || isLoading) return;
    if (isRecording) {
      isManualStopRef.current = true;
      recognitionRef.current.stop();
    } else {
      setText(''); 
      isManualStopRef.current = false;
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (error) {}
    }
  };

  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      <button onClick={() => { unlockAudio(); setIsMuted(!isMuted); }} style={{ background: isMuted ? '#f1f5f9' : '#e0f2fe', border: 'none', width: '44px', height: '44px', borderRadius: '50%', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isMuted ? '#94a3b8' : '#0ea5e9' }}>
        {isMuted ? '🔇' : '🔊'}
      </button>

      <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: '30px', padding: '6px 6px 6px 20px', border: '1px solid #e2e8f0' }}>
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={isRecording ? "音声を認識中..." : "メッセージを入力..."} disabled={isLoading} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '15px', color: '#1e293b' }} />
        {isRecording ? (
          <button type="button" disabled={isLoading} onClick={toggleRecording} style={{ background: '#ef4444', color: '#fff', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.2s' }}>⏹️</button>
        ) : text.trim() ? (
          <button type="submit" disabled={isLoading} style={{ background: '#0f172a', color: '#fff', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>➤</button>
        ) : (
          <button type="button" disabled={isLoading} onClick={toggleRecording} style={{ background: '#3b82f6', color: '#fff', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎙️</button>
        )}
      </form>
    </div>
  );
};