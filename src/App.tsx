// src/App.tsx
import { useState, useEffect, useRef } from 'react';
import { 
  Menu, X, Mic, Square, Volume2, Loader2, PlusCircle, VolumeX, Copy, Check, Settings 
} from 'lucide-react';
import { useLoggerStore, initLoggerObserver } from './store/useLoggerStore';
import { AudioDiagnostic } from './components/AudioDiagnostic';
import { audioService, VOICE_PRESETS } from './services/audioService';
import { sttService } from './services/sttService';
import { useAudioPipeline } from './hooks/useAudioPipeline';
import { supabase } from './lib/supabase';
// 💡 修正: MultimodalImage を MultimodalAttachment に変更
import { chatService, type MultimodalAttachment } from './services/chatService';
import { textFixerService } from './services/textFixerService';
import { ChatInput } from './components/ChatInput';
import { useSettingsStore } from './store/useSettingsStore'; 

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  time: string;
  attachmentUrl?: string; // 💡 修正: imageUrl を attachmentUrl に変更
}

export default function App() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false); 
  
  const [currentSessionId, setCurrentSessionId] = useState<string>(crypto.randomUUID());
  const [sessionList, setSessionList] = useState<{sessionId: string, title: string}[]>([]);
  
  const logEvent = useLoggerStore((state: any) => state.logEvent);
  const copyLogsToClipboard = useLoggerStore((state: any) => state.copyLogsToClipboard);
  const clearLogs = useLoggerStore((state: any) => state.clearLogs);
  
  const settings = useSettingsStore();

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
        .select('id, text, sender, created_at, attachment_url') // 💡 修正: image_url を attachment_url に変更
        .eq('session_id', targetSessionId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      if (data) {
        setMessages(data.map(msg => ({
          id: msg.id,
          text: msg.text,
          sender: msg.sender as 'user' | 'ai',
          time: new Date(msg.created_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          attachmentUrl: msg.attachment_url || undefined // 💡 修正: msg.image_url を msg.attachment_url に変更
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

  const speakText = async (text: string, messageId: string) => {
    if (!gcloudApiKey) return;
    setPlayingMessageId(messageId); 
    try {
      logEvent('audio_play_start');
      await audioService.play(text, gcloudApiKey); 
      logEvent('audio_play_end');
    } catch (error: any) {
      logEvent('audio_play_error', { error_message: 'GCP TTS Error: ' + error });
    } finally {
      setPlayingMessageId(prev => prev === messageId ? null : prev);
    }
  };

  // 💡 修正: imageToSend を attachmentToSend に変更
  const handleSend = async (textToSend?: string, isVoice: boolean = false, attachmentToSend?: MultimodalAttachment) => {
    const targetText = textToSend || inputText;
    if (!targetText.trim() && !attachmentToSend) return; 
    
    const isActuallyVoice = isVoice || isVoiceMode;

    if (isActuallyVoice) {
      audioService.unlock();
    } else {
      audioService.stop(); 
    }

    if (messages.length === 0) {
      const titleSource = targetText.trim() ? targetText : 'File Upload';
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
      attachmentUrl: attachmentToSend ? `data:${attachmentToSend.mimeType};base64,${attachmentToSend.base64}` : undefined
    };
    setMessages(prev => [...prev, userMessage]);
    
    setInputText(''); 
    setIsThinking(true);
    setIsVoiceMode(false); 
    
    logEvent('diagnostic_run', { payload: { action: 'text_sent', hasAttachment: !!attachmentToSend } });
    try {
      const response = await chatService.sendMessage(targetText, currentSessionId, attachmentToSend) as any;
      
      const baseText = typeof response === 'string' ? response : response.aiText;
      const altText = typeof response === 'object' && response.altText ? response.altText : '';
      
      logEvent('diagnostic_run', { 
        payload: { 
          note: 'AI Response Split',
          role_A: baseText,
          role_B: altText || '[発動なし（空文字）]'
        } 
      });

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

      if (isActuallyVoice) {
        speakText(combinedText, aiMessage.id);
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
      await audioService.play(text, gcloudApiKey!);
    } catch (e) {
      setPlayingMessageId(null);
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

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8 flex flex-col">
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
            <div className="flex-1">
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
        
        {/* Verification Logs & Settings UI */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
          <button 
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center justify-center gap-2 py-2 mb-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-full transition-all text-xs font-bold active:scale-95"
          >
            <Settings size={14} />
            Voice Settings
          </button>
          
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

      {/* 💡 Voice Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-spring">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Settings size={18} className="text-slate-500" />
                Voice Settings
              </h2>
              <button onClick={() => setShowSettings(false)} className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-7">
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Voice Model</label>
                <select 
                  value={settings.voiceId}
                  onChange={(e) => settings.setVoiceId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                >
                  {VOICE_PRESETS.map(voice => (
                    <option key={voice.id} value={voice.id}>{voice.name}</option>
                  ))}
                </select>
                {settings.voiceId.includes('Chirp3') && (
                  <p className="text-[10px] text-blue-500">※Chirp3 HDモデルはSSMLをサポートしていないため、以下のタメ設定は無効になります。</p>
                )}
              </div>

              <div className={`space-y-3 ${settings.voiceId.includes('Chirp3') ? 'opacity-40 pointer-events-none' : ''}`}>
                <label className="flex justify-between items-center text-xs font-bold uppercase tracking-widest">
                  <span className="text-slate-400">読点（、）のタメ</span>
                  <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded-md">{settings.commaBreak} ms</span>
                </label>
                <input 
                  type="range" min="0" max="1000" step="50" 
                  value={settings.commaBreak} 
                  onChange={(e) => settings.setCommaBreak(Number(e.target.value))}
                  className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer" 
                />
              </div>

              <div className={`space-y-3 ${settings.voiceId.includes('Chirp3') ? 'opacity-40 pointer-events-none' : ''}`}>
                <label className="flex justify-between items-center text-xs font-bold uppercase tracking-widest">
                  <span className="text-slate-400">句点（。）のタメ</span>
                  <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded-md">{settings.periodBreak} ms</span>
                </label>
                <input 
                  type="range" min="0" max="2000" step="50" 
                  value={settings.periodBreak} 
                  onChange={(e) => settings.setPeriodBreak(Number(e.target.value))}
                  className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer" 
                />
              </div>

              <div className="space-y-3">
                <label className="flex justify-between items-center text-xs font-bold uppercase tracking-widest">
                  <span className="text-slate-400">話すスピード</span>
                  <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded-md">x {settings.speakingRate.toFixed(2)}</span>
                </label>
                <input 
                  type="range" min="0.5" max="2.0" step="0.05" 
                  value={settings.speakingRate} 
                  onChange={(e) => settings.setSpeakingRate(Number(e.target.value))}
                  className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer" 
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100">
              <button 
                onClick={() => setShowSettings(false)}
                className="w-full py-3 bg-blue-800 text-white font-bold rounded-xl hover:bg-blue-900 transition-colors shadow-md active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
                      {/* 💡 修正: 画像かファイルかで表示を出し分け */}
                      {msg.attachmentUrl && (
                        <div className="mb-2">
                          {msg.attachmentUrl.match(/\.(jpeg|jpg|gif|png)$/i) || msg.attachmentUrl.startsWith('data:image/') ? (
                            <img 
                              src={msg.attachmentUrl} 
                              alt="Uploaded" 
                              className="w-full max-w-[240px] rounded-xl object-cover border border-white/20 shadow-sm bg-slate-100" 
                            />
                          ) : (
                            <a 
                              href={msg.attachmentUrl} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className={`inline-flex items-center gap-2 text-xs font-bold underline px-3 py-2 rounded-lg border ${
                                msg.sender === 'user' ? 'text-white bg-blue-700/50 border-blue-400' : 'text-blue-600 bg-white/50 border-slate-200 hover:text-blue-800'
                              }`}
                            >
                              📎 添付ファイルを開く
                            </a>
                          )}
                        </div>
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