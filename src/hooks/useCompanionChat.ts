import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import { supabase } from '../supabaseClient';

// 💡 yukinomotoさんの設計通り、最新の3.1-liteを最優先に、旧版の2.5-liteをバックアップに正しく設定
const PRIMARY_MODEL = 'gemini-3.1-flash-lite';
const BACKUP_MODEL = 'gemini-2.5-flash-lite';

export const VOICE_PRESETS = [
  { id: 'ja-JP-Neural2-B', name: 'ハツラツ（女性）' },
  { id: 'ja-JP-Wavenet-A', name: '落ち着いた（女性）' },
  { id: 'ja-JP-Neural2-C', name: 'スマート（男性）' },
  { id: 'ja-JP-Neural2-D', name: '渋い・低音（男性）' },
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

export const useCompanionChat = (sessionId: string | null) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  
  const [selectedVoice, setSelectedVoice] = useState(VOICE_PRESETS[0].id);
  const selectedVoiceRef = useRef(selectedVoice);
  useEffect(() => { selectedVoiceRef.current = selectedVoice; }, [selectedVoice]);

  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(isMuted);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
    if (isMuted && currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
  }, [isMuted]);

  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const tavilyKey = import.meta.env.VITE_TAVILY_API_KEY;
  const ai = new GoogleGenAI({ apiKey: geminiKey || '' });

  const loadSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('session_id, text, created_at, sender')
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (data) {
        const uniqueSessions: { [key: string]: ChatSession } = {};
        data.forEach(item => {
          if (item.session_id && !uniqueSessions[item.session_id] && item.sender === 'user') {
            uniqueSessions[item.session_id] = {
              session_id: item.session_id,
              first_message: item.text,
              created_at: item.created_at
            };
          }
        });
        const sortedSessions = Object.values(uniqueSessions).sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setSessions(sortedSessions);
      }
    } catch (err) {
      console.error("セッション一覧の取得に失敗:", err);
    }
  };

  useEffect(() => {
    if (!sessionId) {
      loadSessions();
      return;
    }

    const loadChatHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('id, sender, text')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true })
          .limit(50);

        if (error) throw error;
        if (data) {
          setMessages(data.map(item => ({
            id: item.id,
            sender: String(item.sender).trim().toLowerCase() as 'user' | 'ai',
            text: item.text,
            isQuickResponse: false
          })));
        } else {
          setMessages([]);
        }
      } catch (err) { console.error(err); }
    };
    loadChatHistory();
  }, [sessionId]);

  const playVoice = async (text: string): Promise<void> => {
    const gcloudApiKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY;
    if (!gcloudApiKey) return;
    return new Promise(async (resolve) => {
      try {
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
          currentAudioRef.current = null;
        }
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
        const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
        currentAudioRef.current = audio;
        audio.onended = () => { if (currentAudioRef.current === audio) currentAudioRef.current = null; resolve(); };
        audio.onpause = () => resolve();
        audio.onerror = () => { if (currentAudioRef.current === audio) currentAudioRef.current = null; resolve(); };
        audio.play().catch(() => { if (currentAudioRef.current === audio) currentAudioRef.current = null; resolve(); });
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

        // 👑【プロンプト復元】API①：音声エラー＆文脈補正モジュール
        const api1Response = await ai.models.generateContent({
          model: currentModel,
          contents: `【記憶】\n${chatContextText}\n【入力】\n"${userText}"`,
          config: { 
            systemInstruction: `あなたはAI補正モジュールです。指定のJSONスキーマで出力してください。
【厳格なルール】
1. quick_response: ユーザーの発話に対する「純粋な短い相槌（うん、なるほど等）」のみ。質問への回答や要求への応答は絶対に含めない。最大15文字以内の1文で、タメ口にすること。
2. user_display_text: 元のタメ口を維持し、音声誤変換のみを修正。
3. corrected_query: 後のAPIが推論・検索しやすいよう主語や目的語を補完。`, 
            responseMimeType: "application/json", 
            responseSchema: api1Schema 
          }
        });

        const api1Result = JSON.parse(api1Response.text || '{}');
        setMessages((prev) => prev.map((msg) => msg.id === userMessageId ? { ...msg, text: api1Result.user_display_text } : msg));
        
        await supabase.from('chat_messages').insert([{ id: userMessageId, session_id: sessionId, sender: 'user', text: api1Result.user_display_text }]);
        
        setMessages((prev) => [...prev, { id: api1MessageId, sender: 'ai', text: api1Result.quick_response, isQuickResponse: true }]);

        let quickSpeechPromise = Promise.resolve();
        if (isVoiceInput && !isMutedRef.current) quickSpeechPromise = playVoice(api1Result.quick_response);

        let webContext = "（未実行）";
        if (api1Result.requires_search) webContext = await fetchWebSearch(api1Result.corrected_query);

        // 👑【プロンプト復元】API②：メイン推論モジュール
        const api2Response = await ai.models.generateContent({
          model: currentModel,
          contents: `【記憶】\n${chatContextText}\n【検索結果】\n${webContext}\n【ユーザーの入力】\n"${api1Result.corrected_query}"`,
          config: { 
            systemInstruction: `あなたはユーザーの専属AIコンパニオンです。ユーザーの入力に対して、親しみやすいタメ口で、正確で誠実な回答の「原稿素材」を作成してください。
            あなた自身がAIであることは隠さず、ロボット型の相棒として振る舞ってください。小説や台本を書いたり、メタ的なコメントを書くことは絶対に禁止します。` 
          }
        });

        // 👑【プロンプト復元】API③：最終整形モジュール
        const api3Response = await ai.models.generateContent({
          model: currentModel,
          contents: `【ドラフト】\n"${api2Response.text}"\n--- 前提データ ---\n【直前の相槌】\n"${api1Result.quick_response}"`,
          config: { 
            systemInstruction: `あなたはAIのセリフを整える「最終整形モジュール」です。ユーザーに直接話しかける【セリフの本文のみ】を出力してください。あなた自身のレビュー、講評、アドバイスなどのコメントは絶対に書かないでください。
【ルール】
1. 直前の相槌との重複表現は削り、すぐ本題に入る。
2. 自然でフラットなタメ口に修正する。
3. ###や**などのマークダウン記号は【完全禁止】。プレーンテキストのみ出力。` 
          }
        });

        const finalAnswer = api3Response.text || '言葉にまとめられなかった。';

        setTimeout(async () => {
          setMessages((prev) => prev.map((msg) => msg.id === api1MessageId ? { ...msg, isQuickResponse: false } : msg));
          setMessages((prev) => [...prev, { id: api2MessageId, sender: 'ai', text: finalAnswer, isQuickResponse: false }]);

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
          console.warn(`[Fallback] ${PRIMARY_MODEL} でエラー発生。${BACKUP_MODEL} へ切り替えます。`);
          currentModel = BACKUP_MODEL;
          return await runPipeline();
        }
        return false;
      }
    };

    const success = await runPipeline();
    if (!success) { 
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), sender: 'ai', text: 'ごめん、いまGoogleのサーバーがパンクしてるみたい。ちょっとだけ時間をあけて話しかけてね。' }]);
      setIsLoading(false); 
    }
  };

  return { messages, isLoading, sendMessage, selectedVoice, setSelectedVoice, playVoice, isMuted, setIsMuted, sessions };
};