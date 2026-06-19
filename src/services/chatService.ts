// src/services/chatService.ts
import { supabase } from '../lib/supabase';
import { GoogleGenAI } from '@google/genai';
import { memoryExtractor } from './memoryExtractor';

const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

export const chatService = {
  /**
   * ユーザーの発話を受け取り、指定されたセッションに保存してAIの返答を返す
   */
  sendMessage: async (userText: string, sessionId: string): Promise<string> => {
    try {
      // 1. ユーザーのメッセージを現在のセッションに保存
      await supabase.from('chat_messages').insert({ 
        sender: 'user', 
        text: userText,
        session_id: sessionId 
      });

      // 2. メイン脳（Gemini 3.1 Flash-Lite）で返答を生成
      const systemPrompt = `
      あなたはユーザーを深く理解する親身なパートナーAIです。
      車の中などでも聞き取りやすいよう、簡潔で親しみやすいトーン（親しい敬語、または自然なタメ口）で返答してください。
      
      ユーザーの発言: ${userText}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: systemPrompt,
      });
      
      const aiText = response.text || 'ごめんなさい、ちょっと考え込んでしまいました。';

      // 3. AIのメッセージを現在のセッションに保存
      await supabase.from('chat_messages').insert({ 
        sender: 'ai', 
        text: aiText,
        session_id: sessionId 
      });

      // 4. 🕵️‍♂️ 裏側で記憶抽出エンジンを非同期（awaitなし）で実行
      memoryExtractor.processConversation(userText, aiText).catch(err => {
        console.error('裏側での記憶抽出に失敗しました:', err);
      });

      return aiText;

    } catch (error) {
      console.error('チャット生成エラー:', error);
      return 'ごめんなさい、通信がうまくいかなかったみたいです。';
    }
  }
};