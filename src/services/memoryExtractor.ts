import { supabase } from '../lib/supabase';
import { GoogleGenAI, Type, type Schema } from '@google/genai';

const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;

// 新しいGoogle GenAI SDKの初期化
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

export const memoryExtractor = {
  /**
   * 会話ログから記憶（点・線・面）を抽出し、ベクトル化してDBに保存する
   */
  processConversation: async (userMessage: string, aiResponse: string) => {
    if (!geminiApiKey) {
      console.warn('Gemini API Keyがないため、記憶の抽出をスキップしました。');
      return;
    }

    try {
      // 1. Gemini 3.1 Flash-Lite に記憶を抽出させる（JSONフォーマット指定）
      const prompt = `
      以下のユーザーとAIの会話から、ユーザーに関する「事実(fact)」「興味(interest)」「価値観(value)」を抽出してください。
      抽出するべき新しい情報がない場合は、空の配列を返してください。
      
      【会話ログ】
      ユーザー: ${userMessage}
      AI: ${aiResponse}
      `;

      // 構造化出力（JSON Schema）の定義
      const responseSchema: Schema = {
        type: Type.ARRAY,
        description: "抽出された記憶のリスト",
        items: {
          type: Type.OBJECT,
          properties: {
            topic_name: { 
              type: Type.STRING, 
              description: "トピックの短い名前（例: 'React', 'モンステラ', '早起き'）" 
            },
            summary: { 
              type: Type.STRING, 
              description: "ユーザーがそれについてどう考えているか、どんな状態かの詳細な要約" 
            },
            category: { 
              type: Type.STRING, 
              description: "fact, interest, value のいずれか" 
            }
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
          temperature: 0.1, // 幻覚を防ぐため低めに設定
        }
      });

      const extractedData = JSON.parse(response.text || '[]');

      if (extractedData.length === 0) {
        console.log('📝 抽出する新しい記憶はありませんでした。');
        return;
      }

      // 2. 抽出された記憶を順番に処理（ベクトル化とDB保存）
      for (const item of extractedData) {
        // ベクトル化（Embedding）の実行
        const embedText = `トピック: ${item.topic_name}\n内容: ${item.summary}`;
        const embedResponse = await ai.models.embedContent({
          model: 'text-embedding-004',
          contents: embedText,
        });
        
        // 💡 TSエラー回避：undefined や 空配列のチェックを追加
        const embeddings = embedResponse.embeddings;
        if (!embeddings || embeddings.length === 0 || !embeddings[0].values) {
          console.warn(`⚠️ ベクトルの取得に失敗したためスキップします: ${item.topic_name}`);
          continue; // 次のアイテムへ進む
        }
        
        const embeddingVector = embeddings[0].values;

        // DBに同じトピック名が存在するかチェック
        const { data: existingNode } = await supabase
          .from('user_nodes')
          .select('id, strength_score, mention_count')
          .eq('topic_name', item.topic_name)
          .single();

        if (existingNode) {
          // 【更新】既に知っている話題ならスコアと回数を加算し、日時を更新
          const newScore = Math.min(existingNode.strength_score + 10.0, 100.0);
          await supabase
            .from('user_nodes')
            .update({
              summary: item.summary, // 最新の文脈で上書き
              strength_score: newScore,
              mention_count: existingNode.mention_count + 1,
              last_observed_at: new Date().toISOString(),
              embedding: embeddingVector,
              // スコアが50を超えたら「興味(interest)」、80を超えたら「価値観(value)」に自動昇格
              category: newScore >= 80 ? 'value' : (newScore >= 50 ? 'interest' : item.category)
            })
            .eq('id', existingNode.id);
            
          console.log(`🧠 記憶を更新・強化しました: ${item.topic_name} (スコア: ${newScore})`);
        } else {
          // 【新規登録】初めての話題
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