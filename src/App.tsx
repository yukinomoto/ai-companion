// src/App.tsx
import { useState, useEffect, useRef } from 'react';
import { 
  Menu, X, Mic, Square, Volume2, Loader2, PlusCircle, VolumeX, Copy, Check 
} from 'lucide-react';
import { useLoggerStore, initLoggerObserver } from './store/useLoggerStore';
import { AudioDiagnostic } from './components/AudioDiagnostic';
import { audioService } from './services/audioService';
import { sttService } from './services/sttService';
import { useAudioPipeline } from './hooks/useAudioPipeline';
import { supabase } from './lib/supabase';
import { chatService, type MultimodalImage } from './services/chatService';
import { textFixerService } from './services/textFixerService';
import { ChatInput } from './components/ChatInput';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  time: string;
  imageUrl?: string;
}

export default function App() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  
  // 💡 NEW: 音声で入力されたテキストかどうかを記憶するフラグ
  const [isVoiceMode, setIsVoiceMode] = useState(false); 
  
  const [currentSessionId, setCurrentSessionId] = useState<string>(crypto.randomUUID());
  const [sessionList, setSessionList] = useState<{sessionId: string, title: string}[]>([]);
  
  const logEvent = useLoggerStore((state: any) => state.logEvent);
  const copyLogsToClipboard = useLoggerStore((state: any) => state.copyLogsToClipboard);
  const clearLogs = useLoggerStore((state: any) => state.clearLogs);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const gcloudApiKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY;
  const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    initLoggerObserver();
    loadSessionList(); 
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
          title: s.title || 'New Session'
        })));
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  const loadSpecificSession = async (targetSessionId: string) => {
    try {
      audioService.stop();
      setCurrentSessionId(targetSessionId);
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, text, sender, created_at, image_url')
        .eq('session_id', targetSessionId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      if (data) {
        setMessages(data.map(msg => ({
          id: msg.id,
          text: msg.text,
          sender: msg.sender as 'user' | 'ai',
          time: new Date(msg.created_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          imageUrl: msg.image_url || undefined
        })));
      }
      setSidebarOpen(false);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const handleNewChat = () => {
    audioService.stop(); 
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

  const handleSend = async (textToSend?: string, isVoice: boolean = false, imageToSend?: MultimodalImage) => {
    const targetText = textToSend || inputText;
    if (!targetText.trim() && !imageToSend) return; 
    
    // 💡 直接の音声送信か、マイク経由で入力されたテキストなら「音声モード」とする
    const isActuallyVoice = isVoice || isVoiceMode;

    if (isActuallyVoice) {
      audioService.unlock();
    } else {
      audioService.stop(); 
    }

    if (messages.length === 0) {
      const titleSource = targetText.trim() ? targetText : 'Image Upload';
      const tempTitle = titleSource.length > 15 ? titleSource.slice(0, 15) + '...' : titleSource;
      
      const { error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({ 
          id: currentSessionId,
          title: tempTitle
        });
      if (sessionError && sessionError.code !== '23505') {
        console.error('⚠️ Session creation error:', sessionError.message);
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      text: targetText,
      sender: 'user',
      time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
      imageUrl: imageToSend ? `data:${imageToSend.mimeType};base64,${imageToSend.base64}` : undefined
    };
    setMessages(prev => [...prev, userMessage]);
    
    setInputText(''); 
    setIsThinking(true);
    // 💡 送信したら音声フラグをリセットする
    setIsVoiceMode(false); 
    
    logEvent('diagnostic_run', { payload: { action: 'text_sent', hasImage: !!imageToSend } });
    try {
      const response = await chatService.sendMessage(targetText, currentSessionId, imageToSend) as any;
      
      const baseText = typeof response === 'string' ? response : response.aiText;
      const altText = typeof response === 'object' && response.altText ? response.altText : '';
      
      // 💡 NEW: 開発・検証用に、ログパネルにだけAとBの内訳を独立して出力する
      logEvent('diagnostic_run', { 
        payload: { 
          note: 'AI Response Split',
          role_A: baseText,
          role_B: altText || '[発動なし（空文字）]'
        } 
      });

      // 区切り線なしで自然に繋げる
      const combinedText = altText 
        ? `${baseText}\n\n${altText}` 
        : baseText;

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: combinedText,
        sender: 'ai',
        time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, aiMessage]);

      // 💡 isVoice ではなく isActuallyVoice で判定して読み上げる
      if (isActuallyVoice) {
        speakText(combinedText); 
      }

      loadSessionList();

    } catch (error) {
      console.error('AI response error:', error);
    } finally {
      setIsThinking(false);
    }
  };

  const handleAudioStop = async (audioBlob: Blob, hasSpoken: boolean) => {
    logEvent('recording_stopped', { payload: { reason: 'manual' } });
    if (!hasSpoken) {
      console.log('Skipped transcription due to silence');
      return;
    }

    if (!groqApiKey) return;

    setIsTranscribing(true);
    try {
      const transcribedText = await sttService.transcribe(audioBlob);
      logEvent('stt_response_received', { payload: { text: transcribedText } });
      
      if (transcribedText) {
        const fixedText = await textFixerService.fixText(transcribedText);
        setInputText(prev => prev ? `${prev} ${fixedText}` : fixedText);
        
        // 💡 NEW: マイクからの入力であることを記憶させる
        setIsVoiceMode(true); 
      }
    } catch (error: any) {
      alert("Transcription failed: " + error.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const { startPipeline, stopPipeline, isRecording, isSpeaking, currentRms } = useAudioPipeline({
      onStop: handleAudioStop
  });

  const handleMicClick = () => {
    audioService.stop(); 
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

  const handleCopyText = async (messageId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="fixed inset-0 w-full flex bg-slate-50 font-sans text-slate-800 overflow-hidden overscroll-none portrait-lock">
      
      {isSidebarOpen && (
        <div className="absolute inset-0 bg-slate-900/20 z-40 transition-opacity" onClick={() => setSidebarOpen(false)} />
      )}
      
      {/* 🧭 Sidebar */}
      <div className={`absolute top-0 left-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <span className="font-bold text-slate-700 tracking-tight">MA-i</span>
          <button onClick={() => setSidebarOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-full bg-transparent">
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8">
          <div>
            <button 
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-800 text-white rounded-full hover:bg-blue-900 transition-all shadow-md active:scale-95 mb-8"
            >
              <PlusCircle size={18} />
              <span className="text-sm font-semibold">New Session</span>
            </button>
          </div>

          {sessionList.length > 0 && (
            <div>
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-1">Recent Sessions</h3>
              <ul className="space-y-2">
                {sessionList.map((session) => (
                  <li key={session.sessionId}>
                    <button 
                      onClick={() => loadSpecificSession(session.sessionId)}
                      className={`w-full flex items-center px-4 py-3 text-sm rounded-full transition-colors truncate ${
                        currentSessionId === session.sessionId 
                          ? 'bg-blue-50 text-blue-800 font-bold' 
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
        </div>
        
        {/* Verification Logs UI */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
          <div className="flex items-center gap-2">
            <button 
              onClick={copyLogsToClipboard}
              className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold rounded-full border border-blue-100 active:scale-95 transition-all text-center"
            >
              Copy Logs
            </button>
            <button 
              onClick={() => { if(confirm('Clear diagnostic logs?\n(*Chat history remains intact)')) clearLogs(); }}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-400 text-xs font-bold rounded-full border border-slate-200 active:scale-95 transition-all"
              title="Clear Logs"
            >
              Clear
            </button>
          </div>
          <p className="text-[10px] text-center text-slate-300">© 2026 MA-i Engine v2.5</p>
        </div>
      </div>

      {/* 💬 Main Chat Area */}
      <div className="flex-1 flex flex-col h-full bg-slate-50/50 max-w-4xl mx-auto w-full shadow-inner relative z-0 overflow-hidden">
        
        <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 bg-white/60 backdrop-blur-xl border-b border-white/80 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)] z-30">
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-slate-500 hover:text-blue-800 transition-colors rounded-full bg-transparent">
            <Menu size={22} strokeWidth={1.5} />
          </button>
          <h1 className="text-sm font-bold text-slate-800 tracking-tighter">MA-i</h1>
          <div className="w-[38px]" />
        </header>

        <main className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-none scroll-smooth z-10 pt-[72px] selectable-text hide-scrollbar">
          
          <div className="max-w-2xl mx-auto p-6 relative min-h-full flex flex-col w-full">
            
            {messages.length === 0 && !isThinking && !showDiagnostic && (
              <div className="flex-1 flex flex-col items-center justify-center opacity-30 select-none pointer-events-none pb-12">
                <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4 shadow-inner">
                  <Mic size={32} className="text-slate-400" />
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Waiting for your voice...</p>
              </div>
            )}

            {showDiagnostic ? (
              <div className="animate-spring relative z-10 w-full">
                <button onClick={() => setShowDiagnostic(false)} className="text-xs font-bold text-blue-500 hover:text-blue-700 mb-6 flex items-center bg-blue-50 px-3 py-2 rounded-full">
                  <X size={14} className="mr-1" /> Close Diagnostics
                </button>
                <AudioDiagnostic />
              </div>
            ) : (
              <div className="relative z-10 w-full">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex flex-col group ${msg.sender === 'user' ? 'items-end' : 'items-start'} w-full animate-spring mb-8`}>
                    
                    <div className={`max-w-[88%] p-4 rounded-3xl shadow-sm text-[15px] leading-relaxed relative flex flex-col ${
                      msg.sender === 'user' 
                        ? 'bg-blue-600/95 text-white rounded-tr-none border border-blue-500/50 shadow-blue-600/20' 
                        : 'bg-white/85 text-slate-700 rounded-tl-none border border-white/60 shadow-slate-200/50'
                    }`}>
                      {msg.imageUrl && (
                        <img 
                          src={msg.imageUrl} 
                          alt="Uploaded" 
                          className="w-full max-w-[240px] rounded-xl mb-2 object-cover border border-white/20 shadow-sm bg-slate-100" 
                        />
                      )}
                      
                      <div className="min-w-0 w-full break-all whitespace-pre-wrap">
                        {msg.text}
                      </div>

                    </div>
                
                    {/* アクションボタン群 */}
                    <div className={`flex items-center mt-2 ${msg.sender === 'user' ? 'mr-1 flex-row-reverse' : 'ml-1'}`}>
                      <span className="text-[10px] font-bold text-slate-300 tracking-tighter">
                        {msg.time}
                      </span>
                      
                      <button 
                        onClick={() => handleCopyText(msg.id, msg.text)}
                        className={`flex items-center justify-center ml-3 p-1.5 rounded-full transition-colors ${
                          copiedMessageId === msg.id 
                            ? 'text-green-500 bg-green-50' 
                            : 'text-slate-400 hover:text-blue-500 hover:bg-slate-100'
                        }`}
                        title="テキストをコピー"
                      >
                        {copiedMessageId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>

                      {msg.sender === 'ai' && (
                        <button
                          onClick={() => handleManualPlay(msg.id, msg.text)}
                          className={`flex items-center gap-1.5 ml-2 px-3 py-1 rounded-full transition-all border ${
                            playingMessageId === msg.id 
                              ? 'bg-blue-50 border-blue-100 text-blue-500' 
                              : 'bg-white border border-slate-100 text-slate-400 hover:text-blue-500 hover:border-blue-100'
                          }`}
                        >
                          {playingMessageId === msg.id ? (
                            <VolumeX size={12} className="animate-pulse" />
                          ) : (
                            <Volume2 size={12} />
                          )}
                          <span className="text-[9px] font-bold uppercase tracking-tighter">
                            {playingMessageId === msg.id ? 'Stop' : 'Listen'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                
                {isThinking && (
                  <div className="flex flex-col items-start w-full mt-2 animate-pulse mb-8">
                    <div className="bg-white/85 border border-white/60 text-slate-500 px-6 py-4 rounded-3xl rounded-tl-none shadow-sm flex items-center space-x-3 relative">
                      <Loader2 className="animate-spin" size={16} />
                      <span className="text-[11px] font-bold uppercase tracking-widest">Processing...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div ref={chatEndRef} className="h-[220px] shrink-0 pointer-events-none" />
            
          </div>
        </main>

        {!showDiagnostic && (
          <div className="absolute bottom-0 left-0 right-0 bg-white/60 backdrop-blur-xl border-t border-white/80 p-6 shadow-[0_-8px_32px_-10px_rgba(0,0,0,0.08)] z-30">
            <div className="max-w-2xl mx-auto flex flex-col items-center gap-6">
              
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
                    'bg-blue-800 shadow-blue-800/30 hover:bg-blue-900 hover:scale-105 active:scale-95 ring-4 ring-blue-50'
                  }`}
                  title="マイクで入力欄にテキストを追加"
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
                   isRecording ? (isSpeaking ? 'Voice Detected' : 'Tap to Stop') : 'Tap to Add Text'}
                </span>

                <div className="h-4 flex items-center justify-center">
                  <span className={`text-[9px] font-mono transition-opacity duration-300 ${
                    isRecording ? 'text-slate-400 opacity-60' : 'text-slate-300 opacity-0'
                  }`}>
                    RMS: {(currentRms || 0).toFixed(5)} (Target: 0.01000)
                  </span>
                </div>

              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}