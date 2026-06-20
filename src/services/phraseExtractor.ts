import { supabase } from '../lib/supabase';
import { SYSTEM_PROMPTS } from '../prompts';

const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;

export const phraseExtractor = {
  processL2Phrases: async (userText: string, aiText: string, sessionId: string) => {
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
            { role: 'system', content: SYSTEM_PROMPTS.L2_PHRASE_EXTRACTION },
            { role: 'user', content: conversationContext }
          ],
          response_format: { type: "json_object" },
          temperature: 0.1 
        })
      });

      if (!groqRes.ok) throw new Error('Groq API Error');

      const data = await groqRes.json();
      const result = JSON.parse(data.choices[0].message.content);
      const phrases: {phrase: string, source: string}[] = result.phrases || [];

      // 💡 抽出が空ならログを出して終了
      if (phrases.length === 0) {
        console.log('📌 L2共有フレーズ: 抽出されたキーワードはありませんでした。');
        return;
      }

      console.log('📌 L2共有フレーズ抽出成功:', phrases);

      for (const item of phrases) {
        // 💡 大文字小文字の揺らぎを吸収する安全策 (.toLowerCase() とトリム)
        const cleanSource = (item.source || '').trim().toLowerCase();
        const safeSource = cleanSource === 'ai' ? 'ai' : 'user'; 

        const { error } = await supabase.rpc('process_phrase', {
          p_phrase: item.phrase,
          p_owner_type: safeSource,
          p_session_id: sessionId
        });

        if (error) {
          console.error(`⚠️ フフレーズ保存エラー (${item.phrase} / ${safeSource}):`, error.message);
        }
      }

    } catch (error) {
      console.error('L2フレーズ抽出処理エラー:', error);
    }
  }
};