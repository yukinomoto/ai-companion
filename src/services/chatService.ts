// src/services/chatService.ts
import { supabase } from '../lib/supabase';
import { GoogleGenAI } from '@google/genai';
import { memoryExtractor } from './memoryExtractor';
import { SYSTEM_PROMPTS } from '../prompts';

const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
const tavilyApiKey = import.meta.env.VITE_TAVILY_API_KEY;
const ai = new GoogleGenAI({ apiKey: geminiApiKey || '' });

export const chatService = {
  sendMessage: async (userText: string, sessionId: string): Promise<string> => {
    try {
      // 1. ユーザーのメッセージを現在のセッションに保存
      await supabase.from('chat_messages').insert({ sender: 'user', text: userText, session_id: sessionId });

      let webContext = '';

      // 2. ⚡️ Groqによる超高速な意図判定 (Intent Routing)
      if (groqApiKey) {
        try {
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${groqApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instant', // 超高速モデル
              messages: [
                { role: 'system', content: SYSTEM_PROMPTS.INTENT_ROUTER },
                { role: 'user', content: userText }
              ],
              response_format: { type: "json_object" },
              temperature: 0.1
            })
          });

          if (groqRes.ok) {
            const groqData = await groqRes.json();
            const intent = JSON.parse(groqData.choices[0].message.content);
            console.log('⚡️ Groq 意図判定:', intent);

            // 3. 🔍 検索が必要ならTavilyで検索
            if (intent.requires_search && intent.search_query && tavilyApiKey) {
              console.log(`🔍 Tavily 検索実行: ${intent.search_query}`);
              const tavilyRes = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  api_key: tavilyApiKey,
                  query: intent.search_query,
                  search_depth: "basic",
                  include_answer: false
                })
              });

              if (tavilyRes.ok) {
                const tavilyData = await tavilyRes.json();
                webContext = tavilyData.results.map((r: any) => `[情報源: ${r.title}] ${r.content}`).join('\n\n');
              }
            }
          }
        } catch (e) {
          console.error('ルーティング/検索エラー:', e);
        }
      }

      // 現在日時の取得（天気などを聞かれた時のため）
      const now = new Date();
      const days = ['日', '月', '火', '水', '木', '金', '土'];
      const currentDateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${days[now.getDay()]}) ${now.getHours()}時${now.getMinutes()}分`;

      // 4. メイン脳（Gemini 3.1 Flash-Lite）で返答を生成
      const searchPrompt = webContext ? `\n\n【最新の検索結果（参考情報）】\n${webContext}` : '';
      const systemPrompt = `【現在日時】\n${currentDateStr}\n\n${SYSTEM_PROMPTS.CHAT_MODE}${searchPrompt}\n\nユーザーの発言: ${userText}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: systemPrompt,
      });
      
      const aiText = response.text || 'ごめんなさい、ちょっと考え込んでしまいました。';

      // 5. AIのメッセージを保存
      await supabase.from('chat_messages').insert({ sender: 'ai', text: aiText, session_id: sessionId });

      // 6. 🕵️‍♂️ 裏側で記憶抽出エンジンを非同期実行
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