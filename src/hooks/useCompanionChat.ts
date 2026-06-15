import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { audioService } from '../services/audioService';
import { dbService } from '../services/dbService';
import { aiService } from '../services/aiService';
import { VOICE_PRESETS } from '../services/audioService'; // audioService側でexportしているpreset

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

  useEffect(() => {
    if (!sessionId) { refreshSessions(); return; }
    const loadHistory = async () => {
      const history = await dbService.getChatHistory(sessionId);
      setMessages(history);
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

    // 先にユーザーの発話をローカル表示
    setMessages((prev) => [...prev, { id: userMessageId, sender: 'user', text: userText }]);
    let currentModel = 'gemini-3.1-flash-lite';

    const executePipeline = async (): Promise<boolean> => {
      try {
        const chatContextText = messages.slice(-10).map(msg => `${msg.sender === 'user' ? 'User' : 'AI'}: ${msg.text}`).join('\n');

        // 💡 データベースから過去の「すべての超記憶」を事前にロードする
        const activeMemories = await dbService.getMemories();
        const memoryStrings = activeMemories.map(m => m.content);

        // 分離したAIパイプラインを実行
        await aiService.runPipeline(
          currentModel,
          ai,
          userText,
          chatContextText,
          tavilyKey || '',
          memoryStrings, // ➔ これをGeminiの脳(Thinker)に流し込む

          // コールバック①: 1次回答（相槌）が完成した時
          async (api1Result) => {
            setMessages((prev) => prev.map((msg) => msg.id === userMessageId ? { ...msg, text: api1Result.user_display_text } : msg));
            await dbService.saveMessage(userMessageId, sessionId, 'user', api1Result.user_display_text);
            
            setMessages((prev) => [...prev, { id: api1MessageId, sender: 'ai', text: api1Result.quick_response, isQuickResponse: true }]);
            await dbService.saveMessage(api1MessageId, sessionId, 'ai', api1Result.quick_response);

            if (isVoiceInput) playVoiceWrapper(api1Result.quick_response);
          },

          // コールバック②: 編集長による本回答が完成した時
          (finalAnswer) => {
            setTimeout(async () => {
              setMessages((prev) => prev.map((msg) => msg.id === api1MessageId ? { ...msg, isQuickResponse: false } : msg));
              setMessages((prev) => [...prev, { id: api2MessageId, sender: 'ai', text: finalAnswer, isQuickResponse: false }]);
              
              if (isVoiceInput) await playVoiceWrapper(finalAnswer);
              
              await dbService.saveMessage(api2MessageId, sessionId, 'ai', finalAnswer);
              setIsLoading(false);
            }, 1200);
          },

          // コールバック③: 会話から「超記憶」が新しく抽出された時
          async (extractedMemories) => {
            // バックグラウンドで自動的にSupabaseへ新規保存
            for (const memory of extractedMemories) {
              await dbService.saveMemory(memory.content, memory.category);
            }
          }
        );

        return true;
      } catch (error) {
        if (currentModel === 'gemini-3.1-flash-lite') {
          currentModel = 'gemini-2.5-flash-lite'; // バックアップへ切り替え
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