import { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSendMessage: (text: string, isVoice: boolean) => void;
  isLoading: boolean;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading, isMuted, setIsMuted }) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  // 💡 最新のテキスト状態を onend イベント内で参照するための Ref
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        
        // 💡 手動でストップを押すまで聞き続ける（continuous = true）
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'ja-JP';

        // 音声を認識するたびに、入力欄のテキストに追記していく
        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            currentTranscript += event.results[i][0].transcript;
          }
          if (currentTranscript) {
            setText((prev) => prev + currentTranscript);
          }
        };

        recognition.onerror = () => setIsRecording(false);

        // 💡 手動で停止（stop）した時に呼ばれ、テキストがあれば自動送信する
        recognition.onend = () => {
          setIsRecording(false);
          if (textRef.current.trim()) {
            onSendMessage(textRef.current, true);
            setText('');
          }
        };

        recognitionRef.current = recognition;
      }
    }
  }, [onSendMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isLoading) return;
    
    // もし録音中にエンターキー等で送信されたら録音を止める（onendが発火して送信される）
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
    } else {
      onSendMessage(text, false);
      setText('');
    }
  };

  const toggleRecording = () => {
    if (!recognitionRef.current || isLoading) return;

    if (isRecording) {
      // 💡 録音中なら停止（stopを呼ぶと onend が発火し、上で書いた送信処理が走る）
      recognitionRef.current.stop();
    } else {
      setText(''); // 新しく録音を始める時は入力欄を一旦クリア
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (error) {
        console.error("音声認識の開始に失敗しました", error);
      }
    }
  };

  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      
      {/* ミュート切り替えボタン */}
      <button 
        onClick={() => setIsMuted(!isMuted)} 
        style={{ 
          background: isMuted ? '#f1f5f9' : '#e0f2fe', 
          border: 'none', width: '44px', height: '44px', borderRadius: '50%', 
          cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isMuted ? '#94a3b8' : '#0ea5e9'
        }}
      >
        {isMuted ? '🔇' : '🔊'}
      </button>

      <form onSubmit={handleSubmit} style={{ 
        flex: 1, display: 'flex', gap: '8px', alignItems: 'center', 
        backgroundColor: '#f8fafc', borderRadius: '30px', padding: '6px 6px 6px 20px', 
        border: '1px solid #e2e8f0' 
      }}>
        <input 
          type="text" 
          value={text} 
          onChange={(e) => setText(e.target.value)} 
          placeholder={isRecording ? "音声を聞き取っています..." : "メッセージを入力..."} 
          disabled={isLoading}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '15px', color: '#1e293b' }}
        />
        
        {/* 💡 UIの出し分けロジック
          1. 録音中：必ず赤い停止（⏹️）ボタン
          2. テキスト入力あり（未録音）：黒い送信（➤）ボタン
          3. テキストなし（未録音）：青いマイク（🎙️）ボタン
        */}
        {isRecording ? (
          <button 
            type="button"
            disabled={isLoading} 
            onClick={toggleRecording}
            style={{ background: '#ef4444', color: '#fff', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.2s' }}
          >
            ⏹️
          </button>
        ) : text.trim() ? (
          <button 
            type="submit" 
            disabled={isLoading} 
            style={{ background: '#0f172a', color: '#fff', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ➤
          </button>
        ) : (
          <button 
            type="button"
            disabled={isLoading} 
            onClick={toggleRecording}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            🎙️
          </button>
        )}
      </form>
    </div>
  );
};