import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { audioService, VOICE_PRESETS } from '../services/audioService';
import { dbService } from '../services/dbService';
import { aiService } from '../services/aiService';

export { VOICE_PRESETS };

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

export const useCompanionChat = (sessionId: string | null) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  
  const [selectedVoice, setSelectedVoice] = useState('ja-JP-Neural2-B');
  const selectedVoiceRef = useRef(selectedVoice);
  useEffect(() => { selectedVoiceRef.current = selectedVoice; }, [selectedVoice]);

  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(isMuted);

  // 💡 4つのキャッシュ
  const [cachedMemories, setCachedMemories] = useState<{content: string, category: string}[]>([]);
  const [cachedFollowUps, setCachedFollowUps] = useState<{topic: string, context: string, is_resolved: boolean, created_at?: string}[]>([]);
  const [cachedDictionary, setCachedDictionary] = useState<{term: string, meaning: string}[]>([]);
  const [cachedInterests, setCachedInterests] = useState<{topic: string, interest_level: number}[]>([]);
  
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
        dbService.getInterests() // 💡 読み込み
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

  // 💡 追加：挨拶ストック（プール）機能付きの動的生成ロジック
  const generateDynamicGreeting = async () => {
    setIsLoading(true);
    try {
      // 1. まずローカルストレージに「未使用の挨拶ストック」があるか確認
      const storedPool = localStorage.getItem('ai_greeting_pool');
      let pool: string[] = storedPool ? JSON.parse(storedPool) : [];

      if (pool.length > 0) {
        // ストックがある場合：ランダムに1つ取り出して即座に表示（API消費ゼロ、待ち時間ゼロ）
        const randomIndex = Math.floor(Math.random() * pool.length);
        const chosenGreeting = pool[randomIndex];
        pool.splice(randomIndex, 1); // 使ったものをストックから捨てる
        localStorage.setItem('ai_greeting_pool', JSON.stringify(pool)); // 残りを再保存
        
        setMessages([{ id: crypto.randomUUID(), sender: 'ai', text: chosenGreeting }]);
        setIsLoading(false);
        return;
      }

      // 2. ストックが0件の時だけ、APIを1回だけ叩いて10個の挨拶を一気に生成する
      const memoryStrings = memoriesRef.current.map(m => m.content).join('、') || 'なし';
      const interestStrings = interestsRef.current.map(i => `${i.topic}(関心度:${i.interest_level})`).join('、') || 'なし';
      
      const prompt = `
      あなたはユーザーの専属AIコンパニオンです。新しい会話セッションを開始します。
      ユーザーが画面を開いた瞬間に表示する「最初の話しかけ（1〜2文程度）」の候補を10個作成し、JSONの配列形式で出力してください。

      【重要な判断ルール（匙加減）】
      以下のユーザーデータ（記憶と関心）の量と内容を分析し、10個の候補の内訳（過去の話題の続き、新しい関心事への提案、汎用的な挨拶）のバランスをあなた自身で判断して構成してください。
      ・データが少ない場合は、汎用的な挨拶や調子を伺う内容を多めにしてください。
      ・データが豊富な場合は、汎用的な挨拶は減らし、過去の文脈や関心事（直接話していなくても興味を持ちそうな事）に踏み込んだ話題を多めにしてください。

      [ユーザーデータ]
      ・記憶: ${memoryStrings}
      ・関心事: ${interestStrings}

      出力は必ず以下のJSON配列のみとしてください。
      ["候補1", "候補2", "候補3", "候補4", "候補5", "候補6", "候補7", "候補8", "候補9", "候補10"]
      `;

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      
      const text = result.text || '';
      const jsonMatch = text.match(/\[.*\]/s);
      
      if (jsonMatch) {
        const candidates = JSON.parse(jsonMatch[0]);
        if (Array.isArray(candidates) && candidates.length > 0) {
          // ランダムに1つ選んで表示する
          const randomIndex = Math.floor(Math.random() * candidates.length);
          const chosenGreeting = candidates[randomIndex];
          
          // 選ばれなかった残りの9個を、次回の起動用にストックとして保存
          candidates.splice(randomIndex, 1);
          localStorage.setItem('ai_greeting_pool', JSON.stringify(candidates));

          setMessages([{ id: crypto.randomUUID(), sender: 'ai', text: chosenGreeting }]);
        }
      }
    } catch (error) {
      console.error("Greeting generation failed", error);
      // セーフティネット
      setMessages([{ id: crypto.randomUUID(), sender: 'ai', text: "やあ！調子はどう？" }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId) { refreshSessions(); return; }
    const loadHistory = async () => {
      const history = await dbService.getChatHistory(sessionId);
      
      // 💡 修正：履歴がない（新規セッション）の時のみ、ストックから挨拶を引き出す
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

        const memoryStrings = memoriesRef.current.map(m => m.content);
        const followUpStrings = followUpsRef.current.map(f => {
          const dateStr = f.created_at ? new Date(f.created_at).toLocaleDateString('ja-JP') : '過去';
          return `[登録日: ${dateStr}] ${f.topic} - ${f.context}`;
        });
        const dictStrings = dictRef.current.map(d => `${d.term}: ${d.meaning}`);
        const interestStrings = interestsRef.current.map(i => `${i.topic} (関心度: ${i.interest_level})`); // 💡 パイプライン用文字列

        await aiService.runPipeline(
          currentModel,
          ai,
          userText,
          chatContextText,
          tavilyKey || '',
          memoryStrings,
          followUpStrings,
          dictStrings,
          interestStrings, // 💡 AIに渡す

          async (api1Result) => {
            setTimeout(async () => {
              setMessages((prev) => prev.map((msg) => msg.id === userMessageId ? { ...msg, text: api1Result.user_display_text } : msg));
              await dbService.saveMessage(userMessageId, sessionId, 'user', api1Result.user_display_text);
              
              setMessages((prev) => [...prev, { id: api1MessageId, sender: 'ai', text: api1Result.quick_response, isQuickResponse: true }]);
              await dbService.saveMessage(api1MessageId, sessionId, 'ai', api1Result.quick_response);

              if (isVoiceInput) playVoiceWrapper(api1Result.quick_response);
            }, 1000);
          },

          (finalAnswer) => {
            setTimeout(async () => {
              setMessages((prev) => prev.map((msg) => msg.id === api1MessageId ? { ...msg, isQuickResponse: false } : msg));
              setMessages((prev) => [...prev, { id: api2MessageId, sender: 'ai', text: finalAnswer, isQuickResponse: false }]);
              
              if (isVoiceInput) await playVoiceWrapper(finalAnswer);
              
              await dbService.saveMessage(api2MessageId, sessionId, 'ai', finalAnswer);
              setIsLoading(false);
            }, 1200);
          },

          async (extracted) => {
            if (extracted.memories) {
              for (const m of extracted.memories) await dbService.saveMemory(m.content, m.category);
            }
            if (extracted.follow_ups) {
              for (const f of extracted.follow_ups) await dbService.saveFollowUp(f.topic, f.context, f.is_resolved);
            }
            if (extracted.user_dictionary) {
              for (const d of extracted.user_dictionary) await dbService.saveDictionary(d.term, d.meaning);
            }
            // 💡 興味の保存
            if (extracted.interests) {
              for (const i of extracted.interests) await dbService.saveInterest(i.topic);
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