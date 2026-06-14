import React, { useState, useEffect, useRef } from 'react';

interface ChatInputProps {
  onSendMessage: (text: string, isVoiceInput: boolean) => void;
  isLoading: boolean;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading, isMuted, setIsMuted }) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const transcriptBufferRef = useRef<string>('');

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ja-JP';
      recognition.continuous = true; 
      recognition.interimResults = true; 
      recognition.maxAlternatives = 1;

      recognition.onstart = () => { setIsListening(true); transcriptBufferRef.current = ''; };
      recognition.onend = () => { setIsListening(false); };
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript) transcriptBufferRef.current += finalTranscript;
      };
      recognitionRef.current = recognition;
    }
  }, []);

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    onSendMessage(inputText, false);
    setInputText('');
  };

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setTimeout(() => {
        const finalSpeechText = transcriptBufferRef.current.trim();
        if (finalSpeechText) onSendMessage(finalSpeechText, true);
      }, 300);
    } else {
      recognitionRef.current.start();
    }
  };

  return (
    <div style={{ padding: '16px', borderTop: '1px solid #eee', backgroundColor: '#fff' }}>
      <form onSubmit={handleSendText} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        
        <button
          type="button"
          onClick={() => {
            const nextMuted = !isMuted;
            setIsMuted(nextMuted);
            // 💡 ミュートがON（true）になった瞬間に、鳴っている音声を強制的に止める！
            if (nextMuted) {
              const existingAudio = document.getElementById('companion-voice') as HTMLAudioElement;
              if (existingAudio) {
                existingAudio.pause();
                existingAudio.currentTime = 0;
              }
            }
          }}
          style={{
            padding: '12px', borderRadius: '50%', border: '1px solid #eee',
            backgroundColor: isMuted ? '#f5f5f5' : '#e6f7ff', color: '#fff',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px',
            fontSize: '18px'
          }}
          title={isMuted ? "自動音声をONにする" : "自動音声をOFF（ミュート）にする"}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>

        <button
          type="button"
          onClick={toggleVoiceInput}
          disabled={isLoading}
          style={{
            padding: '12px', borderRadius: '50%', border: 'none',
            backgroundColor: isListening ? '#ff4d4f' : '#1890ff', color: '#fff',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px'
          }}
        >
          {isListening ? '⏹️' : '🎙️'}
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isListening ? '🔴 話し終わったら四角ボタンを押してね...' : 'メッセージを入力...'}
          disabled={isLoading || isListening}
          style={{ flex: 1, padding: '12px', borderRadius: '24px', border: '1px solid #ccc', fontSize: '16px' }}
        />
        
        <button type="submit" disabled={isLoading || !inputText.trim() || isListening} style={{ padding: '0 20px', borderRadius: '24px', border: 'none', backgroundColor: '#000', color: '#fff', fontSize: '16px', height: '44px' }}>
          送信
        </button>
      </form>
    </div>
  );
};