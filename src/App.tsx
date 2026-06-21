// src/App.tsx
import { useState, useEffect, useRef } from 'react';
import { 
  Menu, X, Mic, Activity, Square, Volume2, Loader2, PlusCircle
} from 'lucide-react';
import { useLoggerStore, initLoggerObserver } from './store/useLoggerStore';
import { DebugPanel } from './components/DebugPanel';
import { AudioDiagnostic } from './components/AudioDiagnostic';
import { audioService } from './services/audioService';
import { sttService } from './services/sttService';
import { useAudioPipeline } from './hooks/useAudioPipeline';
import { supabase } from './lib/supabase';
import { chatService, type MultimodalImage } from './services/chatService'; // 💡 型をインポート
import { textFixerService } from './services/textFixerService';
import { ChatInput } from './components/ChatInput'; // 💡 コンポーネントをインポート

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  time: string;
  imageUrl?: string; // 💡 画面表示用の画像URLを追加
}

export default function App() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  
  const [currentSessionId, setCurrentSessionId] = useState<string>(crypto.randomUUID());
  const [sessionList, setSessionList] = useState<{sessionId: string, title: string}[]>([]);
  const logEvent = useLoggerStore((state: any) => state.logEvent);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const gcloudApiKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY;
  const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    initLoggerObserver();
    loadSessionList(); 
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const loadSessionList = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('id, title, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      
      if (data) {
        setSessionList(data.map(s => ({
          sessionId: s.id,
          title: s.title || '新しいチャット'
        })));
      }
    } catch (error) {
      console.error('セッション一覧の取得失敗:', error);
    }
  };

  const loadSpecificSession = async (targetSessionId: string) => {
    try {
      setCurrentSessionId(targetSessionId);
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', targetSessionId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      if (data) {
        setMessages(data.map(msg => ({
          id: msg.id,
          text: msg.text,
          sender: msg.sender as 'user' | 'ai',
          time: new Date(msg.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
        })));
      }
      setSidebarOpen(false);
    } catch (error) {
      console.error('履歴読み込み失敗:', error);
    }
  };

  const handleNewChat = () => {
    logEvent('diagnostic_run', { payload: { action: 'start_new_session' } });
    setCurrentSessionId(crypto.randomUUID());
    setMessages([]);
    setSidebarOpen(false);
  };

  const speakText = async (text: string) => {
    if (!gcloudApiKey) return;
    try {
      logEvent('audio_play_start');
      await audioService.play(text, 'ja-JP-Neural2-B', gcloudApiKey); 
      logEvent('audio_play_end');
    } catch (error: any) {
      logEvent('audio_play_error', { error_message: 'GCP TTS Error: ' + error });
    }
  };

  // 💡 引数に imageToSend を追加し、画像のみの送信も許可
  const handleSend = async (textToSend?: string, isVoice: boolean = false, imageToSend?: MultimodalImage) => {
    const targetText = textToSend || inputText;
    if (!targetText.trim() && !imageToSend) return; 
    
    if (isVoice) {
      audioService.unlock();
    }

    if (messages.length === 0) {
      const titleSource = targetText.trim() ? targetText : '画像アップロード';
      const tempTitle = titleSource.length > 15 ? titleSource.slice(0, 15) + '...' : titleSource;
      
      const { error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({ 
          id: currentSessionId,
          title: tempTitle
        });
      if (sessionError && sessionError.code !== '23505') {
        console.error('⚠️ セッション作成エラー:', sessionError.message);
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      text: targetText,
      sender: 'user',
      time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      imageUrl: imageToSend ? `data:${imageToSend.mimeType};base64,${imageToSend.base64}` : undefined // 💡 画面表示用のURL
    };
    setMessages(prev => [...prev, userMessage]);
    setInputText(''); 
    setIsThinking(true);
    
    logEvent('diagnostic_run', { payload: { action: 'text_sent', hasImage: !!imageToSend } });
    try {
      // 💡 chatService に画像を渡す
      const aiReplyText = await chatService.sendMessage(targetText, currentSessionId, imageToSend);
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: aiReplyText,
        sender: 'ai',
        time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, aiMessage]);

      if (isVoice) {
        speakText(aiReplyText);
      }

      loadSessionList();

    } catch (error) {
      console.error('AI応答エラー:', error);
    } finally {
      setIsThinking(false);
    }
  };

  const handleAudioStop = async (audioBlob: Blob, hasSpoken: boolean) => {
    logEvent('recording_stopped', { payload: { reason: 'manual' } });
    if (!hasSpoken) {
      console.log('無音のため文字起こしをスキップしました');
      return;
    }

    if (!groqApiKey) return;

    setIsTranscribing(true);
    try {
      const transcribedText = await sttService.transcribe(audioBlob, groqApiKey);
      logEvent('stt_response_received', { payload: { text: transcribedText } });
      
      if (transcribedText) {
        const fixedText = await textFixerService.fixText(transcribedText, groqApiKey);
        handleSend(fixedText, true);
      }
    } catch (error: any) {
      alert("文字起こしに失敗しました: " + error.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const { startPipeline, stopPipeline, isRecording, isSpeaking, currentRms } = useAudioPipeline({
      onStop: handleAudioStop
  });

  const handleMicClick = () => {
    if (isRecording) {
      stopPipeline();
    } else {
      startPipeline();
      logEvent('recording_started');
    }
  };

  const handleManualPlay = async (messageId: string, text: string) => {
    if (playingMessageId === messageId) {
      audioService.stop();
      setPlayingMessageId(null);
      return;
    }
    audioService.stop();
    audioService.unlock();
    setPlayingMessageId(messageId);
    try {
      await audioService.play(text, 'ja-JP-Neural2-B', gcloudApiKey!);
    } finally {
      setPlayingMessageId((prev) => (prev === messageId ? null : prev));
    }
  };

  return (
    <div className="fixed inset-0 w-full flex bg-slate-50 font-sans text-slate-800 overflow-hidden overscroll-none">
      
      {isSidebarOpen && (
        <div className="absolute inset-0 bg-slate-900/20 z-40 transition-opacity" onClick={() => setSidebarOpen(false)} />
      )}
      
      <div className={`absolute top-0 left-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <span className="font-bold text-slate-700 tracking-tight">AI PARTNER</span>
          <button onClick={() => setSidebarOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8">
          <div>
            <button 
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-md active:scale-95 mb-8"
            >
              <PlusCircle size={18} />
              <span className="text-sm font-semibold">新規チャットを始める</span>
            </button>
          </div>

          {sessionList.length > 0 && (
            <div>
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-1">過去の会話</h3>
              <ul className="space-y-2">
                {sessionList.map((session) => (
                  <li key={session.sessionId}>
                    <button 
                      onClick={() => loadSpecificSession(session.sessionId)}
                      className={`w-full flex items-center px-4 py-3 text-sm rounded-xl transition-colors truncate ${
                        currentSessionId === session.sessionId 
                          ? 'bg-blue-50 text-blue-600 font-bold' 
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{session.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-1">メンテナンス</h3>
            <ul className="space-y-2">
              <li>
                <button 
                  onClick={() => { setSidebarOpen(false); setShowDiagnostic(!showDiagnostic); }}
                  className="w-full flex items-center px-4 py-3 text-sm text-slate-600 hover:bg-slate-50 rounded-xl transition-colors group"
                >
                  <Activity size={18} className="text-slate-400 group-hover:text-blue-500 mr-3" />
                  <span>音声診断モード</span>
                </button>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="p-4 border-t border-slate-50">
          <p className="text-[10px] text-center text-slate-300">© 2026 AI Partner Engine v2.5</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full bg-slate-50 max-w-4xl mx-auto w-full shadow-inner">
        <header className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md border-b border-slate-100 z-10 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-slate-500 hover:text-slate-800 transition-colors bg-slate-50 rounded-lg">
            <Menu size={22} strokeWidth={1.5} />
          </button>
          
          <h1 className="text-sm font-bold text-slate-800 tracking-tighter">PARTNER AI</h1>
          
          <div className="w-[38px]" />
        </header>

        <main className="flex-1 overflow-y-auto overscroll-none p-6 space-y-8 scroll-smooth">
          {showDiagnostic ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <button onClick={() => setShowDiagnostic(false)} className="text-xs font-bold text-blue-500 hover:text-blue-700 mb-6 flex items-center bg-blue-50 px-3 py-2 rounded-lg">
                <X size={14} className="mr-1" /> 診断モードを閉じる
              </button>
              <AudioDiagnostic />
            </div>
          ) : (
            <>
              {messages.length === 0 && !isThinking && (
                <div className="flex flex-col items-center justify-center h-full opacity-30 select-none">
                  <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                    <Mic size={32} className="text-slate-400" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Waiting for your voice...</p>
                </div>
              )}
      
              {messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} w-full animate-in fade-in duration-500`}>
                  <div className={`max-w-[88%] p-4 rounded-3xl shadow-sm text-sm leading-relaxed whitespace-pre-wrap flex flex-col ${
                    msg.sender === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none'
                  }`}>
                    {/* 💡 画像があればテキストの上に描画 */}
                    {msg.imageUrl && (
                      <img 
                        src={msg.imageUrl} 
                        alt="Uploaded" 
                        className="w-full max-w-[240px] rounded-xl mb-2 object-cover border border-white/20 shadow-sm" 
                      />
                    )}
                    {msg.text}
                  </div>
              
                  <div className={`flex items-center mt-2 ${msg.sender === 'user' ? 'mr-1 flex-row-reverse' : 'ml-1'}`}>
                    <span className="text-[10px] font-bold text-slate-300 tracking-tighter">
                      {msg.time}
                    </span>
                    {msg.sender === 'ai' && (
                      <button
                        onClick={() => handleManualPlay(msg.id, msg.text)}
                        className={`flex items-center gap-1.5 ml-4 px-3 py-1 rounded-full transition-all border ${
                          playingMessageId === msg.id 
                            ? 'bg-blue-50 border-blue-100 text-blue-500' 
                            : 'bg-white border-slate-100 text-slate-400 hover:text-blue-500 hover:border-blue-100'
                        }`}
                      >
                        {playingMessageId === msg.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Volume2 size={12} />
                        )}
                        <span className="text-[9px] font-bold uppercase tracking-tighter">
                          {playingMessageId === msg.id ? 'Playing' : 'Listen'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              
              {isThinking && (
                <div className="flex flex-col items-start w-full mt-2 animate-pulse">
                  <div className="bg-white border border-slate-50 text-slate-300 p-4 rounded-3xl rounded-tl-none shadow-sm flex items-center space-x-3">
                    <Loader2 className="animate-spin" size={16} />
                    <span className="text-xs font-bold uppercase tracking-widest">Processing...</span>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} className="h-4" />
            </>
          )}
        </main>

        {!showDiagnostic && (
          <div className="w-full bg-white/80 backdrop-blur-lg border-t border-slate-100 p-6 shrink-0 shadow-2xl">
            <div className="max-w-2xl mx-auto flex flex-col items-center gap-6">
              
              {/* 💡 コンポーネント化した入力欄をここに配置 */}
              <ChatInput 
                inputText={inputText}
                setInputText={setInputText}
                isTranscribing={isTranscribing}
                isThinking={isThinking}
                isRecording={isRecording}
                onSend={handleSend}
              />

              <div className="flex flex-col items-center gap-3">
                <button 
                  onClick={handleMicClick}
                  disabled={isTranscribing || isThinking}
                  className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-2xl transition-all duration-300 group relative ${
                    isTranscribing || isThinking ? 'bg-slate-200 cursor-not-allowed' :
                    isRecording ? 'bg-red-500 scale-110 shadow-red-500/40 ring-4 ring-red-50' : 
                    'bg-slate-900 shadow-slate-900/20 hover:scale-105 active:scale-95 ring-4 ring-slate-50'
                  }`}
                >
                  {isTranscribing || isThinking ? <Loader2 size={28} className="animate-spin opacity-50" /> : 
                   isRecording ? <Square size={28} className="fill-white" /> : 
                   <Mic size={32} strokeWidth={1.5} />}
                  
                  {isRecording && !isSpeaking && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                    </div>
                  )}
                </button>
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${
                  isTranscribing || isThinking ? 'text-blue-400' :
                  isRecording ? 'text-red-500' : 'text-slate-300'
                }`}>
                  {isTranscribing ? 'Processing' :
                   isThinking ? 'Analyzing' :
                   isRecording ? (isSpeaking ? 'Voice Detected' : 'Tap to Stop') : 'Tap to Speak'}
                </span>

                {isRecording && (
                  <span className="text-[9px] font-mono text-slate-400 opacity-60">
                    RMS: {(currentRms || 0).toFixed(5)} (Target: 0.01000)
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <DebugPanel />
    </div>
  );
}