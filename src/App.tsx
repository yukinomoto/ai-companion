import { useState, useEffect, useRef } from 'react';
import { 
  Menu, Settings2, X, Clock, Plus, Mic, Send, Activity, Square
} from 'lucide-react';
import { useLoggerStore, initLoggerObserver } from './store/useLoggerStore';
import { DebugPanel } from './components/DebugPanel';
import { AudioDiagnostic } from './components/AudioDiagnostic';
import { audioService } from './services/audioService'; // 💡 既存のサービスをインポート

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  time: string;
}

export default function App() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  
  const logEvent = useLoggerStore((state: any) => state.logEvent);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // 環境変数からGCPのAPIキーを取得
  const gcloudApiKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY;

  useEffect(() => {
    initLoggerObserver();

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.lang = 'ja-JP';
      rec.interimResults = false;
      rec.continuous = false;

      rec.onstart = () => {
        setIsRecording(true);
        logEvent('recording_started');
      };

      rec.onend = () => {
        setIsRecording(false);
        logEvent('recording_stopped');
      };

      rec.onresult = (event: any) => {
        const resultText = event.results[0][0].transcript;
        logEvent('stt_response_received', { payload: { text: resultText } });
        handleSend(resultText);
      };

      rec.onerror = (event: any) => {
        logEvent('audio_play_error', { error_message: 'Speech Recognition Error: ' + event.error });
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: 'おはようございます、ユウキさん。\n今日も良い一日にしましょう。', sender: 'ai', time: '09:00' },
  ]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 💡 あなたの audioService を使った GCP 音声再生処理
  const speakText = async (text: string) => {
    if (!gcloudApiKey) {
      logEvent('audio_play_error', { error_message: 'GCP API Key is missing' });
      return;
    }
    
    try {
      logEvent('tts_request_sent');
      // audioService.play は再生終了時に resolve される仕様
      logEvent('audio_play_start');
      await audioService.play(text, 'ja-JP-Neural2-B', gcloudApiKey); 
      logEvent('audio_play_end');
    } catch (error: any) {
      logEvent('audio_play_error', { error_message: 'GCP TTS Error: ' + error });
    }
  };

  const handleSend = (textToSend?: string) => {
    const targetText = textToSend || inputText;
    if (!targetText.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      text: targetText,
      sender: 'user',
      time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages(prev => [...prev, userMessage]);
    if (!textToSend) setInputText('');
    logEvent('diagnostic_run', { payload: { action: 'text_sent', textLength: targetText.length } });

    setTimeout(() => {
      const aiReplyText = `「${targetText}」についてですね。音声機能のテストとしてシステムが自動応答を生成しました。`;
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: aiReplyText,
        sender: 'ai',
        time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, aiMessage]);
      
      speakText(aiReplyText);
    }, 1000);
  };

  const handleMicClick = () => {
    // 💡 録音開始前にオーディオをUnlockする（iOS対策）
    audioService.unlock();

    if (!recognitionRef.current) {
      alert('お使いの環境はブラウザの音声認識機能に対応していません。');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      logEvent('mic_permission_requested');
      try {
        recognitionRef.current.start();
        logEvent('mic_permission_granted');
      } catch (e: any) {
        logEvent('audio_play_error', { error_message: 'Mic Start Failed: ' + e.message });
      }
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-800 overflow-hidden relative">
      {/* 以前と同じUI描画部分は省略（変更なし） */}
      {isSidebarOpen && (
        <div className="absolute inset-0 bg-slate-900/20 z-40 transition-opacity" onClick={() => setSidebarOpen(false)} />
      )}
      
      <div className={`absolute top-0 left-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center p-4 border-b border-slate-100">
          <button onClick={() => setSidebarOpen(false)} className="p-2 text-slate-400 hover:text-slate-600">
            <X size={24} strokeWidth={1.5} />
          </button>
          <span className="ml-4 font-medium text-slate-700">メニュー</span>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-slate-400 mb-3 px-3">会話履歴</h3>
            <ul className="space-y-1">
              {[{ icon: <Clock size={16} />, label: '今日の会話' }].map((item, i) => (
                <li key={i}>
                  <button className="w-full flex items-center px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
                    <span className="text-slate-400 mr-3">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-400 mb-3 px-3">設定とデバッグ</h3>
            <ul className="space-y-1">
              <li>
                <button 
                  onClick={() => { setSidebarOpen(false); setShowDiagnostic(!showDiagnostic); }}
                  className="w-full flex items-center px-3 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors font-medium"
                >
                  <span className="text-blue-500 mr-3"><Activity size={16} /></span>
                  <span className="truncate">音声診断モードを開く</span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full bg-slate-50">
        <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 z-10 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-slate-500 hover:text-slate-800 transition-colors">
            <Menu size={24} strokeWidth={1.5} />
          </button>
          <h1 className="text-base font-medium text-slate-800 tracking-wide">AIパートナー</h1>
          <button className="p-2 text-slate-500 hover:text-slate-800 transition-colors">
            <Settings2 size={24} strokeWidth={1.5} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 space-y-6">
          {showDiagnostic ? (
            <div className="max-w-2xl mx-auto mt-4">
              <button onClick={() => setShowDiagnostic(false)} className="text-sm text-slate-500 hover:text-slate-800 mb-4 flex items-center">
                <X size={16} className="mr-1" /> 診断モードを閉じる
              </button>
              <AudioDiagnostic />
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} w-full`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.sender === 'user' ? 'bg-blue-500 text-white rounded-tr-sm' : 'bg-white border border-slate-100 text-slate-700 rounded-tl-sm'
                  }`}>
                    {msg.text}
                  </div>
                  <span className={`text-[10px] text-slate-400 mt-1 ${msg.sender === 'user' ? 'mr-1' : 'ml-1'}`}>
                    {msg.time}
                  </span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </>
          )}
        </main>

        {!showDiagnostic && (
          <div className="w-full bg-white border-t border-slate-100 p-4 shrink-0">
            <div className="max-w-3xl mx-auto flex flex-col items-center gap-4">
              <div className="w-full relative flex items-center">
                <input 
                  type="text"
                  placeholder="メッセージを入力..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 pl-5 pr-12 text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
                />
                <button onClick={() => handleSend()} className="absolute right-2 p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors">
                  <Send size={16} strokeWidth={2} className="ml-0.5" />
                </button>
              </div>

              <div className="flex items-center justify-between w-full px-6">
                <button className="p-3 text-slate-400 hover:text-blue-500 transition-colors">
                  <Plus size={24} strokeWidth={1.5} />
                </button>
                <div className="flex flex-col items-center gap-2">
                  <button 
                    onClick={handleMicClick}
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-all ${
                      isRecording ? 'bg-red-500 shadow-red-500/30 scale-110 animate-pulse' : 'bg-blue-500 shadow-blue-500/30 hover:scale-105'
                    }`}
                  >
                    {isRecording ? <Square size={24} strokeWidth={2} /> : <Mic size={28} strokeWidth={1.5} />}
                  </button>
                  <span className={`text-[10px] font-medium tracking-wide ${isRecording ? 'text-red-500' : 'text-slate-400'}`}>
                    {isRecording ? '録音中...' : 'タップして話す'}
                  </span>
                </div>
                <button className="p-3 text-slate-400 hover:text-blue-500 transition-colors">
                  <Activity size={24} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <DebugPanel />
    </div>
  );
}