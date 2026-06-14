import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import { supabase } from '../supabaseClient';
import { SYSTEM_PROMPTS } from '../prompts';

const PRIMARY_MODEL = 'gemini-3.1-flash-lite';
const BACKUP_MODEL = 'gemini-2.5-flash-lite';

export const VOICE_PRESETS = [
  { id: 'ja-JP-Neural2-B', name: 'A' },
  { id: 'ja-JP-Chirp3-HD-Leda', name: 'B' },
  { id: 'ja-JP-Chirp3-HD-Laomedeia', name: 'C' },
  { id: 'ja-JP-Chirp3-HD-Despina', name: 'D' },
  { id: 'ja-JP-Chirp3-HD-Callirrhoe', name: 'E' },
  { id: 'ja-JP-Chirp3-HD-Zephyr', name: 'F' },
];

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  isQuickResponse?: boolean;
}

export interface ChatSession {
  session_id: string;
  first_message: string;
  created_at: string;
}

const api1Schema: Schema = {
  type: Type.OBJECT,
  properties: {
    quick_response: { type: Type.STRING },
    user_display_text: { type: Type.STRING },
    corrected_query: { type: Type.STRING },
    requires_search: { type: Type.BOOLEAN }
  },
  required: ["quick_response", "user_display_text", "corrected_query", "requires_search"],
};

// ============================================================================
// 💡 iOS Safariブロック突破用の「グローバル音声要素（シングルトン）」
// Reactの再描画で消えないよう、外側に1つだけ作って使い回す
// ============================================================================
const SILENT_MP3 = "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
let globalAudio: HTMLAudioElement | null = null;
if (typeof window !== 'undefined') {
  globalAudio = new Audio();
}

export const useCompanionChat = (sessionId: string | null) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  
  const [selectedVoice, setSelectedVoice] = useState(VOICE_PRESETS[0].id);
  const selectedVoiceRef = useRef(selectedVoice);
  useEffect(() => { selectedVoiceRef.current = selectedVoice; }, [selectedVoice]);

  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
    if (isMuted && globalAudio) {
      globalAudio.pause();
    }
  }, [isMuted]);

  // 💡 マイクの停止ボタン等を押した【瞬間（同期処理中）】に呼ばれる関数。
  // 無音のMP3を再生することで、この globalAudio 要素がiOSから「再生許可」を得る
  const unlockAudio = () => {
    if (globalAudio) {
      // 既にAIが喋っている最中なら邪魔しない
      const isPlaying = globalAudio.currentTime > 0 && !globalAudio.paused && !globalAudio.ended;
      if (!isPlaying) {
        globalAudio.src = SILENT_MP3;
        globalAudio.play().catch(() => {});
      }
    }
  };

  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const tavilyKey = import.meta.env.VITE_TAVILY_API_KEY;
  const ai = new GoogleGenAI({ apiKey: geminiKey || '' });

  const loadSessions = async () => {
    try {
      const { data, error } = await supabase.from('chat_messages').select('session_id, text, created_at, sender').order('created_at', { ascending: true });
      if (error) throw error;
      if (data) {
        const uniqueSessions: { [key: string]: ChatSession } = {};
        data.forEach(item => {
          if (item.session_id && !uniqueSessions[item.session_id] && item.sender === 'user') {
            uniqueSessions[item.session_id] = { session_id: item.session_id, first_message: item.text, created_at: item.created_at };
          }
        });
        setSessions(Object.values(uniqueSessions).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      }
    } catch (err) {}
  };

  useEffect(() => {
    if (!sessionId) { loadSessions(); return; }
    const loadChatHistory = async () => {
      try {
        const { data, error } = await supabase.from('chat_messages').select('id, sender, text').eq('session_id', sessionId).order('created_at', { ascending: true }).limit(50);
        if (error) throw error;
        if (data) {
          setMessages(data.map(item => ({ id: item.id, sender: String(item.sender).trim().toLowerCase() as 'user' | 'ai', text: item.text, isQuickResponse: false })));
        } else { setMessages([]); }
      } catch (err) {}
    };
    loadChatHistory();
  }, [sessionId]);

  const playVoice = async (text: string): Promise<void> => {
    const gcloudApiKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY;
    if (!gcloudApiKey || !globalAudio) return;
    
    return new Promise(async (resolve) => {
      try {
        globalAudio!.pause();
        const voiceId = selectedVoiceRef.current;
        const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${gcloudApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text: text },
            voice: { languageCode: 'ja-JP', name: voiceId },
            audioConfig: { audioEncoding: 'MP3', speakingRate: 1.15, pitch: voiceId.includes('-B') ? 1.5 : 0.0 }
          })
        });
        const data = await response.json();
        if (!data.audioContent) { resolve(); return; }
        
        // 💡 すでに unlock されている要素の src を書き換えて再生するから、iOSでも100%鳴る
        globalAudio!.src = `data:audio/mp3;base64,${data.audioContent}`;
        globalAudio!.onended = () => resolve();
        globalAudio!.onerror = () => resolve();
        globalAudio!.play().catch((e) => {
          console.error("音声再生ブロック:", e);
          resolve();
        });
      } catch (err) { resolve(); }
    });
  };

  const fetchWebSearch = async (query: string): Promise<string> => {
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyKey, query, search_depth: "basic", include_answer: false })
      });
      const data = await response.json();
      return data.results.map((r: any) => `[情報源: ${r.title}] ${r.content}`).join('\n\n');
    } catch (err) { return "（検索失敗）"; }
  };

  const sendMessage = async (userText: string, isVoiceInput: boolean) => {
    if (!userText.trim() || isLoading || !sessionId) return;
    setIsLoading(true);
    const userMessageId = crypto.randomUUID();
    const api1MessageId = crypto.randomUUID();
    const api2MessageId = crypto.randomUUID();

    setMessages((prev) => [...prev, { id: userMessageId, sender: 'user', text: userText }]);
    let currentModel = PRIMARY_MODEL;

    const runPipeline = async (): Promise<boolean> => {
      try {
        const chatContextText = messages.slice(-10).map(msg => `${msg.sender === 'user' ? 'User' : 'AI'}: ${msg.text}`).join('\n');

        const api1Response = await ai.models.generateContent({
          model: currentModel,
          contents: `【記憶】\n${chatContextText}\n【入力】\n"${userText}"`,
          config: { 
            systemInstruction: SYSTEM_PROMPTS.RECEIVER, 
            responseMimeType: "application/json", 
            responseSchema: api1Schema 
          }
        });

        const api1Result = JSON.parse(api1Response.text || '{}');
        setMessages((prev) => prev.map((msg) => msg.id === userMessageId ? { ...msg, text: api1Result.user_display_text } : msg));
        await supabase.from('chat_messages').insert([{ id: userMessageId, session_id: sessionId, sender: 'user', text: api1Result.user_display_text }]);
        setMessages((prev) => [...prev, { id: api1MessageId, sender: 'ai', text: api1Result.quick_response, isQuickResponse: true }]);

        let quickSpeechPromise = Promise.resolve();
        // 💡 録音停止ボタンからの送信だった場合のみ、相槌を再生
        if (isVoiceInput && !isMutedRef.current) quickSpeechPromise = playVoice(api1Result.quick_response);

        let webContext = "（未実行）";
        if (api1Result.requires_search) webContext = await fetchWebSearch(api1Result.corrected_query);

        const api2Response = await ai.models.generateContent({
          model: currentModel,
          contents: `【記憶】\n${chatContextText}\n【検索結果】\n${webContext}\n【ユーザーの入力】\n"${api1Result.corrected_query}"`,
          config: { systemInstruction: SYSTEM_PROMPTS.THINKER }
        });

        const api3Response = await ai.models.generateContent({
          model: currentModel,
          contents: `【ドラフト】\n"${api2Response.text}"\n--- 前提データ ---\n【直前の相槌】\n"${api1Result.quick_response}"`,
          config: { systemInstruction: SYSTEM_PROMPTS.EDITOR }
        });

        const finalAnswer = api3Response.text || '言葉にまとめられなかった。';

        setTimeout(async () => {
          setMessages((prev) => prev.map((msg) => msg.id === api1MessageId ? { ...msg, isQuickResponse: false } : msg));
          setMessages((prev) => [...prev, { id: api2MessageId, sender: 'ai', text: finalAnswer, isQuickResponse: false }]);

          // 💡 メイン回答の音声再生
          if (isVoiceInput && !isMutedRef.current) {
            await Promise.race([quickSpeechPromise, new Promise(resolve => setTimeout(resolve, 3000))]);
            if (!isMutedRef.current) playVoice(finalAnswer);
          }

          await supabase.from('chat_messages').insert([{ id: api2MessageId, session_id: sessionId, sender: 'ai', text: finalAnswer }]);
          setIsLoading(false);
        }, 1500);

        return true;
      } catch (error) {
        if (currentModel === PRIMARY_MODEL) {
          currentModel = BACKUP_MODEL;
          return await runPipeline();
        }
        return false;
      }
    };

    const success = await runPipeline();
    if (!success) { setIsLoading(false); }
  };

  return { messages, isLoading, sendMessage, selectedVoice, setSelectedVoice, playVoice, isMuted, setIsMuted, sessions, unlockAudio };
};