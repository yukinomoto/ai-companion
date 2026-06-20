import { supabase } from '../lib/supabase';
import { SYSTEM_PROMPTS } from '../prompts';

const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;

export const titleGenerator = {
  generateAndSaveTitle: async (userText: string, aiText: string, sessionId: string) => {
    if (!groqApiKey) return;

    try {
      const conversationContext = `ユーザー: ${userText}\nAI: ${aiText}`;

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: SYSTEM_PROMPTS.GENERATE_TITLE },
            { role: 'user', content: conversationContext }
          ],
          response_format: { type: "json_object" },
          temperature: 0.4 // 少しだけクリエイティビティ（揺らぎ）を持たせる
        })
      });

      if (!groqRes.ok) throw new Error('Groq API Error');

      const data = await groqRes.json();
      const result = JSON.parse(data.choices[0].message.content);
      const newTitle = result.title;

      if (!newTitle) return;

      console.log('📝 自動タイトル生成:', newTitle);

      // Supabaseのchat_sessionsを新しいタイトルで上書き
      const { error } = await supabase
        .from('chat_sessions')
        .update({ title: newTitle })
        .eq('id', sessionId);

      if (error) {
        console.error('⚠️ タイトル更新エラー:', error.message);
      }

    } catch (error) {
      console.error('タイトル生成処理エラー:', error);
    }
  }
};