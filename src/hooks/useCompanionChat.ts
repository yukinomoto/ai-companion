// src/hooks/useCompanionChat.ts
import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { audioService, VOICE_PRESETS } from '../services/audioService';
import { dbService } from '../services/dbService';
import { aiService } from '../services/aiService';
import type { Message, ChatSession, LongTermMemory, FollowUp, UserDictionary, Interest } from '../types';

export { VOICE_PRESETS };
export type { Message, ChatSession };

const getTimeContext = () => {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  const isFridayNight = day === 5 && hour >= 18;

  let contextTag = 'daytime';
  if (hour >= 5 && hour < 11) contextTag = 'morning';
  else if (hour >= 11 && hour < 17) contextTag = 'afternoon';
  else if (hour >= 17 && hour < 23) contextTag = 'evening';
  else contextTag = 'night';

  if (isFridayNight) contextTag = 'friday_night';
  else if (isWeekend && contextTag === 'morning') contextTag = 'weekend_morning';
  else if (isWeekend) contextTag = 'weekend';

  return { timestamp: now, tag: contextTag };
};

export const useCompanionChat = (sessionId: string | null) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  
  const [selectedVoice, setSelectedVoice] = useState('ja-JP-Neural2-B');
  const selectedVoiceRef = useRef(selectedVoice);
  useEffect(() => { selectedVoiceRef.current = selectedVoice; }, [selectedVoice]);

  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(isMuted);

  const [cachedMemories, setCachedMemories] = useState<LongTermMemory[]>([]);
  const [cachedFollowUps, setCachedFollowUps] = useState<FollowUp[]>([]);
  const [cachedDictionary, setCachedDictionary] = useState<UserDictionary[]>([]);
  const [cachedInterests, setCachedInterests] = useState<Interest[]>([]);
  
  const memoriesRef = useRef(cachedMemories);
  const followUpsRef = useRef(cachedFollowUps);
  const dictRef = useRef(cachedDictionary);
  const interestsRef = useRef(cachedInterests);
  
  useEffect(() => { memoriesRef.current = cachedMemories; }, [cachedMemories]);
  useEffect(() => { followUpsRef.current = cachedFollowUps; }, [cachedFollowUps]);
  useEffect(() => { dictRef.current = cachedDictionary; }, [cachedDictionary]);
  useEffect(() => { interestsRef.current = cachedInterests; }, [cachedInterests]);

  useEffect(() => {
    const preloadAllData = async () => {
      const [memories, followUps, dictionary, interests] = await Promise.all([
        dbService.getMemories(),
        dbService.getFollowUps(),
        dbService.getDictionary(),
        dbService.getInterests()
      ]);
      setCachedMemories(memories);
      setCachedFollowUps(followUps);
      setCachedDictionary(dictionary);
      setCachedInterests(interests);
    };
    preloadAllData();
  }, []);

  useEffect(() => {
    isMutedRef.current = isMuted;
    if (isMuted) audioService.stop();
  }, [isMuted]);

  const unlockAudio = () => audioService.unlock();

  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const tavilyKey = import.meta.env.VITE_TAVILY_API_KEY;
  const gcloudApiKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY;

  const ai = new GoogleGenAI({ apiKey: geminiKey || '' });

  const refreshSessions = async () => {
    const list = await dbService.getSessions();
    setSessions(list);
  };

  const generateDynamicGreeting = async () => {
    setIsLoading(true);
    try {
      const pool = await dbService.getGreetingPool();
      const { tag } = getTimeContext();

      if (pool.length > 0) {
        const matchedGreetings = pool.filter(p => p.context_type === tag);
        const candidates = matchedGreetings.length > 0 ? matchedGreetings : pool;
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];

        setMessages([{ id: crypto.randomUUID(), sender: 'ai', text: chosen.greeting_text, emotion: 'happy' }]);
        if (chosen.id) await dbService.deleteGreeting(chosen.id);
        setIsLoading(false);
        return;
      }
      setMessages([{ id: crypto.randomUUID(), sender: 'ai', text: "やあ！調子はどう？", emotion: 'neutral' }]);
      generateGreetingPoolInBackground();
    } catch (error) {
      console.error("Greeting retrieval failed", error);
      setMessages([{ id: crypto.randomUUID(), sender: 'ai', text: "やあ！調子はどう？", emotion: 'neutral' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateGreetingPoolInBackground = async () => {
    try {
      const { tag } = getTimeContext();
      const validMemories = memoriesRef.current.filter(m => m.allow_small_talk).map(m => m.content).join('、') || 'なし';
      const interestStrings = interestsRef.current.map(i => `${i.topic}(関心度:${i.interest_level})`).join('、') || 'なし';

      const prompt = `あなたはユーザーの専属AIコンパニオンです。次回アプリ起動時に表示する「最初の話しかけ（1〜2文）」の候補を5個、JSON配列で出力してください。\n[データ]\n雑談可能な記憶: ${validMemories}\n関心事: ${interestStrings}\n時間コンテキスト: ${tag}\n出力は ["候補1", "候補2"...] のみ。`;

      const result = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const jsonMatch = (result.text || '').match(/\[.*\]/s);

      if (jsonMatch) {
        const candidates = JSON.parse(jsonMatch[0]);
        if (Array.isArray(candidates)) {
          for (const greetingText of candidates) {
            await dbService.saveGreetingPool(greetingText, tag);
          }
        }
      }
    } catch (error) {
      console.error("Background pool generation failed", error);
    }
  };

  useEffect(() => {
    if (!sessionId) { refreshSessions(); return; }
    const loadHistory = async () => {
      const history = await dbService.getChatHistory(sessionId);
      if (history.length === 0) {
        generateDynamicGreeting();
      } else {
        setMessages(history);
      }
    };
    loadHistory();
  }, [sessionId]);

  const playVoiceWrapper = async (text: string) => {
    if (isMutedRef.current || !gcloudApiKey) return;
    await audioService.play(text, selectedVoiceRef.current, gcloudApiKey);
  };

  const sendMessage = async (userText: string, isVoiceInput: boolean) => {
    if (!userText.trim() || isLoading || !sessionId) return;
    setIsLoading(true);

    const userMessageId = crypto.randomUUID();
    const api1MessageId = crypto.randomUUID();
    const api2MessageId = crypto.randomUUID();

    setMessages((prev) => [...prev, { id: userMessageId, sender: 'user', text: userText }]);
    let currentModel = 'gemini-3.1-flash-lite';

    const executePipeline = async (): Promise<boolean> => {
      try {
        const chatContextText = messages.slice(-10).map(msg => `${msg.sender === 'user' ? 'User' : 'AI'}: ${msg.text}`).join('\n');
        const memoryStrings = memoriesRef.current.map(m => `[重要度${m.importance}] ${m.content}`);
        const followUpStrings = followUpsRef.current.map(f => {
          const targetStr = f.target_date ? ` (対象日: ${f.target_date})` : '';
          return `${f.topic}${targetStr} - ${f.context}`;
        });
        const dictStrings = dictRef.current.map(d => `${d.term}: ${d.meaning}`);
        const interestStrings = interestsRef.current.map(i => `${i.topic} (関心度: ${i.interest_level})`);

        const startTime = Date.now();

        await aiService.runPipeline(
          currentModel, ai, userText, chatContextText, tavilyKey || '', memoryStrings, followUpStrings, dictStrings, interestStrings,

          // ── STEP 1: フロント対応 ──
          async (api1Result) => {
            const delay = Math.max(0, 500 - (Date.now() - startTime));
            const quickEmotion = (api1Result.emotion as any) || 'neutral';
            const isCompleted = api1Result.is_completed;

            setTimeout(() => {
              setMessages((prev) => prev.map((msg) => msg.id === userMessageId ? { ...msg, text: api1Result.user_display_text } : msg));
              
              setMessages((prev) => [...prev, { id: api1MessageId, sender: 'ai', text: api1Result.quick_response, isQuickResponse: !isCompleted, emotion: quickEmotion }]);
              if (isVoiceInput) playVoiceWrapper(api1Result.quick_response);

              dbService.saveMessage(userMessageId, sessionId, 'user', api1Result.user_display_text).catch(console.error);
              dbService.saveMessage(api1MessageId, sessionId, 'ai', api1Result.quick_response).catch(console.error);

              // 💡 完結時はここでローディングを解除。バックグラウンドでSTEP 3（記憶抽出）が走る
              if (isCompleted) {
                setIsLoading(false);
                generateGreetingPoolInBackground();
              }
            }, delay);
          },

          // ── STEP 3: 最終監査 ＆ 記憶抽出 ──
          (api3Result, isCompleted) => {
            // STEP 1で完結しなかった場合のみ、新しい吹き出しとして本回答を表示
            if (!isCompleted) {
              const delay = Math.max(0, 1500 - (Date.now() - startTime));
              setTimeout(() => {
                setMessages((prev) => prev.map((msg) => msg.id === api1MessageId ? { ...msg, isQuickResponse: false } : msg));
                setMessages((prev) => [...prev, { id: api2MessageId, sender: 'ai', text: api3Result.final_answer, isQuickResponse: false, emotion: api3Result.emotion || 'neutral' }]);
                
                if (isVoiceInput) playVoiceWrapper(api3Result.final_answer);
                dbService.saveMessage(api2MessageId, sessionId, 'ai', api3Result.final_answer).catch(console.error);
                
                setIsLoading(false);
                generateGreetingPoolInBackground();
              }, delay);
            }

            // ── 抽出された記憶の保存処理（完結の有無に関わらず必ず実行） ──
            if (api3Result.memories) {
              api3Result.memories.forEach((m: any) => 
                dbService.saveMemory(m.content, m.category, m.importance ?? 3, m.memory_type ?? 'fact', m.allow_small_talk ?? true).catch(console.error)
              );
            }
            if (api3Result.follow_ups) {
              api3Result.follow_ups.forEach((f: any) => 
                dbService.saveFollowUp(f.topic, f.context, f.is_resolved, f.target_date).catch(console.error)
              );
            }
            if (api3Result.user_dictionary) {
              api3Result.user_dictionary.forEach((d: any) => 
                dbService.saveDictionary(d.term, d.meaning).catch(console.error)
              );
            }
            if (api3Result.interests) {
              api3Result.interests.forEach((i: any) => 
                dbService.saveInterest(i.topic).catch(console.error)
              );
            }
          }
        );

        return true;
      } catch (error) {
        if (currentModel === 'gemini-3.1-flash-lite') {
          currentModel = 'gemini-2.5-flash-lite';
          return await executePipeline();
        }
        return false;
      }
    };

    const success = await executePipeline();
    if (!success) setIsLoading(false);
  };

  return { messages, isLoading, sendMessage, selectedVoice, setSelectedVoice, playVoice: playVoiceWrapper, isMuted, setIsMuted, sessions, unlockAudio };
};