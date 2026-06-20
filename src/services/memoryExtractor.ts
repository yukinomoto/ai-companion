// src/services/memoryExtractor.ts
import { supabase } from '../lib/supabase';
import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { SYSTEM_PROMPTS } from '../prompts';

const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: geminiApiKey || '' });

export const memoryExtractor = {
  processConversation: async (userMessage: string, aiResponse: string) => {
    if (!geminiApiKey) {
      console.warn('Gemini API Keyがないため、記憶の抽出をスキップしました。');
      return;
    }

    try {
      const prompt = `${SYSTEM_PROMPTS.MEMORY_EXTRACTION}\n\n【会話ログ】\nユーザー: ${userMessage}\nAI: ${aiResponse}`;

      const responseSchema: Schema = {
        type: Type.ARRAY,
        description: "抽出された記憶のリスト",
        items: {
          type: Type.OBJECT,
          properties: {
            topic_name: { type: Type.STRING, description: "トピックの短い名前（例: 'React', 'モンステラ'）" },
            summary: { type: Type.STRING, description: "ユーザーがそれについてどう考えているかの詳細な要約" },
            category: { type: Type.STRING, description: "fact, interest, value のいずれか" }
          },
          required: ["topic_name", "summary", "category"],
        },
      };

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0.1, 
        }
      });

      const extractedData = JSON.parse(response.text || '[]');

      if (extractedData.length === 0) {
        console.log('📝 抽出する新しい記憶はありませんでした。');
        return;
      }

      for (const item of extractedData) {
        const embedText = `トピック: ${item.topic_name}\n内容: ${item.summary}`;
        
        // 💡 SDKのバグを回避するため、fetchで直接REST APIを叩く
        const embedResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=${geminiApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: {
              parts: [{ text: embedText }]
            }
          })
        });

        if (!embedResponse.ok) {
          console.warn(`⚠️ ベクトルの取得APIエラー: ${embedResponse.statusText}`);
          continue;
        }

        const embedData = await embedResponse.json();
        const embeddingVector = embedData.embedding?.values;

        if (!embeddingVector || embeddingVector.length === 0) {
          console.warn(`⚠️ ベクトルデータのフォーマット異常のためスキップします: ${item.topic_name}`);
          continue; 
        }

        const { data: existingNode } = await supabase
          .from('user_nodes')
          .select('id, strength_score, mention_count')
          .eq('topic_name', item.topic_name)
          .single();

        if (existingNode) {
          const newScore = Math.min(existingNode.strength_score + 10.0, 100.0);
          await supabase
            .from('user_nodes')
            .update({
              summary: item.summary,
              strength_score: newScore,
              mention_count: existingNode.mention_count + 1,
              last_observed_at: new Date().toISOString(),
              embedding: embeddingVector,
              category: newScore >= 80 ? 'value' : (newScore >= 50 ? 'interest' : item.category)
            })
            .eq('id', existingNode.id);
          console.log(`🧠 記憶を更新・強化しました: ${item.topic_name} (スコア: ${newScore})`);
        } else {
          await supabase
            .from('user_nodes')
            .insert({
              topic_name: item.topic_name,
              summary: item.summary,
              category: item.category,
              strength_score: 10.0,
              embedding: embeddingVector
            });
          console.log(`🌱 新しい記憶を記録しました: ${item.topic_name}`);
        }
      }
    } catch (error) {
      console.error('記憶抽出エラー:', error);
    }
  }
};