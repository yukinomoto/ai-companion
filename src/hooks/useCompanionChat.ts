// src/hooks/useCompanionChat.ts
import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { audioService, VOICE_PRESETS } from '../services/audioService';
import { dbService } from '../services/dbService';
import { aiService } from '../services/aiService';
import type { Message, ChatSession, LongTermMemory, FollowUp, UserDictionary, Interest } from '../types';

export { VOICE_PRESETS };
export type { Message, ChatSession };

// ========================================================
// 💡 時間コンテキスト取得ヘルパー
// 現在時刻から「朝」「夜」「金曜の夜」などの文脈タグを生成
// ========================================================
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

  return {
    timestamp: now,
    tag: contextTag,
  };
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

  // 💡 4つのキャッシュ（外部の型定義を使用して型エラーを解消）
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

  // ========================================================
  // 💡 スマートプール方式：挨拶の0秒出力（DB連携版）
  // ========================================================
  const generateDynamicGreeting = async () => {
    setIsLoading(true);
    try {
      // 1. LocalStorageではなく、DBからプールされている挨拶を取得
      const pool = await dbService.getGreetingPool();
      const { tag } = getTimeContext();

      if (pool.length > 0) {
        // コンテキストタグが一致するものを優先的に探し、なければランダム
        const matchedGreetings = pool.filter(p => p.context_type === tag);
        const candidates = matchedGreetings.length > 0 ? matchedGreetings : pool;
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];

        setMessages([{ id: crypto.randomUUID(), sender: 'ai', text: chosen.greeting_text }]);

        // 使用した挨拶をプールから削除
        if (chosen.id) await dbService.deleteGreeting(chosen.id);
        setIsLoading(false);
        return;
      }

      // 2. プールが空の場合は汎用的な挨拶を表示し、裏で生成をキックする
      setMessages([{ id: crypto.randomUUID(), sender: 'ai', text: "やあ！調子はどう？" }]);
      generateGreetingPoolInBackground();

    } catch (error) {
      console.error("Greeting retrieval failed", error);
      setMessages([{ id: crypto.randomUUID(), sender: 'ai', text: "やあ！調子はどう？" }]);
    } finally {
      setIsLoading(false);
    }
  };

  // 💡 会話終了後などにバックグラウンドで次回用の挨拶プールを生成しDBに保存
  const generateGreetingPoolInBackground = async () => {
    try {
      const { tag } = getTimeContext();
      
      // 雑談許可フラグがtrueの記憶のみを抽出
      const validMemories = memoriesRef.current.filter(m => m.allow_small_talk).map(m => m.content).join('、') || 'なし';
      const interestStrings = interestsRef.current.map(i => `${i.topic}(関心度:${i.interest_level})`).join('、') || 'なし';

      const prompt = `
      あなたはユーザーの専属AIコンパニオンです。次回ユーザーがアプリを開いた瞬間に表示する「最初の話しかけ（1〜2文程度）」の候補を5個作成し、JSONの配列形式で出力してください。

      [ユーザーデータ]
      ・雑談可能な記憶: ${validMemories}
      ・関心事: ${interestStrings}
      ・現在想定される時間コンテキスト: ${tag} （この時間帯に合った挨拶や気遣いを含めること）

      出力は必ず以下のJSON配列のみとしてください。
      ["候補1", "候補2", "候補3", "候補4", "候補5"]
      `;

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      const text = result.text || '';
      const jsonMatch = text.match(/\[.*\]/s);

      if (jsonMatch) {
        const candidates = JSON.parse(jsonMatch[0]);
        if (Array.isArray(candidates)) {
          for (const greetingText of candidates) {
            // 生成した候補をDBのgreeting_poolに保存
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

        // 💡 記憶のコンテキストに重要度を反映。雑談不可のものはあえて除外することも可能
        const memoryStrings = memoriesRef.current.map(m => `[重要度${m.importance}] ${m.content}`);
        const followUpStrings = followUpsRef.current.map(f => {
          const targetStr = f.target_date ? ` (対象日: ${f.target_date})` : '';
          return `${f.topic}${targetStr} - ${f.context}`;
        });

        const dictStrings = dictRef.current.map(d => `${d.term}: ${d.meaning}`);
        const interestStrings = interestsRef.current.map(i => `${i.topic} (関心度: ${i.interest_level})`);

        const startTime = Date.now();

        await aiService.runPipeline(
          currentModel,
          ai,
          userText,
          chatContextText,
          tavilyKey || '',
          memoryStrings,
          followUpStrings,
          dictStrings,
          interestStrings,

          // ── 1次回答（クイック・レスポンス）──
          async (api1Result) => {
            const elapsed = Date.now() - startTime;
            const delay = Math.max(0, 1000 - elapsed);

            setTimeout(() => {
              setMessages((prev) => prev.map((msg) => msg.id === userMessageId ? { ...msg, text: api1Result.user_display_text } : msg));
              setMessages((prev) => [...prev, { id: api1MessageId, sender: 'ai', text: api1Result.quick_response, isQuickResponse: true }]);

              if (isVoiceInput) playVoiceWrapper(api1Result.quick_response);

              dbService.saveMessage(userMessageId, sessionId, 'user', api1Result.user_display_text).catch(console.error);
              dbService.saveMessage(api1MessageId, sessionId, 'ai', api1Result.quick_response).catch(console.error);
            }, delay);
          },

          // ── 本回答（最終アンサー）──
          (finalAnswer) => {
            const elapsed = Date.now() - startTime;
            const delay = Math.max(0, 1500 - elapsed);

            setTimeout(() => {
              setMessages((prev) => prev.map((msg) => msg.id === api1MessageId ? { ...msg, isQuickResponse: false } : msg));
              setMessages((prev) => [...prev, { id: api2MessageId, sender: 'ai', text: finalAnswer, isQuickResponse: false }]);
              
              if (isVoiceInput) playVoiceWrapper(finalAnswer);
              
              dbService.saveMessage(api2MessageId, sessionId, 'ai', finalAnswer).catch(console.error);
              setIsLoading(false);

              // 💡 会話終了後にバックグラウンドで挨拶プールを補充する
              generateGreetingPoolInBackground();
            }, delay);
          },

          // ── 抽出情報の保存（EXTRACTOR）──
          (extracted: any) => {
            if (extracted.memories) {
              extracted.memories.forEach((m: { content: string, category: string, importance?: number, memory_type?: string, allow_small_talk?: boolean }) => 
                dbService.saveMemory(
                  m.content, 
                  m.category, 
                  m.importance ?? 3, 
                  m.memory_type ?? 'fact', 
                  m.allow_small_talk ?? true
                ).catch(console.error)
              );
            }
            if (extracted.follow_ups) {
              extracted.follow_ups.forEach((f: { topic: string, context: string, is_resolved: boolean, target_date?: string }) => 
                dbService.saveFollowUp(
                  f.topic, 
                  f.context, 
                  f.is_resolved,
                  f.target_date
                ).catch(console.error)
              );
            }
            if (extracted.user_dictionary) {
              extracted.user_dictionary.forEach((d: { term: string, meaning: string }) => 
                dbService.saveDictionary(d.term, d.meaning).catch(console.error)
              );
            }
            if (extracted.interests) {
              extracted.interests.forEach((i: { topic: string }) => 
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