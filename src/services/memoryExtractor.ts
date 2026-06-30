// src/services/memoryExtractor.ts
import { supabase } from '../lib/supabase';
import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { SYSTEM_PROMPTS } from '../prompts';
import { useLoggerStore } from '../store/useLoggerStore'; // 💡 ログストアをインポート

const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: geminiApiKey || '' });

const SCORE_INCREMENT = 10.0;
const SCORE_MAX = 100.0;
const SCORE_INITIAL = 10.0;
const THRESHOLD_VALUE = 80.0;
const THRESHOLD_INTEREST = 50.0;

export const memoryExtractor = {
  processConversation: async (userMessage: string, aiResponse: string) => {
    // 💡 ログ関数の取得
    const logEvent = useLoggerStore.getState().logEvent;

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
            topic_name: { 
              type: Type.STRING, 
              description: "トピックの具体的で一意な名前。単なる「名前」「仕事」のような曖昧な単語は避け、「ユーザーの名前」「野元勇希」「Reactの開発」など、後から検索して他と混同しない固有の名称にすること" 
            },
            summary: { 
              type: Type.STRING, 
              description: "記憶の具体的な内容。観察記録のような客観的すぎる表現は避け、「ユーザーの名前は野元勇希である」「〜が好き」など、簡潔で自然な事実として記述すること" 
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
          temperature: 0.1, 
        }
      });

      const extractedData = JSON.parse(response.text || '[]');

      if (!Array.isArray(extractedData) || extractedData.length === 0) {
        console.log('📝 抽出する新しい記憶はありませんでした。');
        return;
      }

      for (const item of extractedData) {
        const embedText = `トピック: ${item.topic_name}\n内容: ${item.summary}`;
        
        let embeddingVector: number[] | undefined;
        
        try {
          const embedResponse = await ai.models.embedContent({
            model: 'gemini-embedding-2', 
            contents: embedText,
            config: { outputDimensionality: 768 }
          });
          embeddingVector = embedResponse.embeddings?.[0]?.values;
        } catch (embedError) {
          console.warn(`⚠️ ベクトルの取得APIエラー (${item.topic_name}):`, embedError);
          continue;
        }

        if (!embeddingVector || embeddingVector.length === 0) {
          console.warn(`⚠️ ベクトルデータが空のためスキップします: ${item.topic_name}`);
          continue; 
        }

        // 💡 既存ノード（Before状態）の取得
        const { data: existingNode, error: fetchError } = await supabase
          .from('user_nodes')
          .select('id, topic_name, summary, category, strength_score, mention_count') // 💡 summaryとcategoryもBefore記録のために取得
          .eq('topic_name', item.topic_name)
          .maybeSingle();

        if (fetchError) {
          console.error(`⚠️ DB検索エラー (${item.topic_name}):`, fetchError.message);
          continue;
        }

        if (existingNode) {
          const newScore = Math.min(existingNode.strength_score + SCORE_INCREMENT, SCORE_MAX);
          const newCategory = newScore >= THRESHOLD_VALUE ? 'value' 
                            : (newScore >= THRESHOLD_INTEREST ? 'interest' : item.category);

          const { error: updateError } = await supabase
            .from('user_nodes')
            .update({
              summary: item.summary,
              strength_score: newScore,
              mention_count: (existingNode.mention_count || 1) + 1,
              last_observed_at: new Date().toISOString(),
              embedding: embeddingVector,
              category: newCategory
            })
            .eq('id', existingNode.id);
            
          if (updateError) {
            console.error(`⚠️ DB更新エラー詳細 (${item.topic_name}):`, updateError.message, updateError.details);
            continue;
          }
            
          // 💡 更新（編集）された場合：Before と After を比較可能な形でログに流す
          logEvent('memory_updated', {
            payload: {
              topic: item.topic_name,
              before_state: {
                summary: existingNode.summary,
                category: existingNode.category,
                score: existingNode.strength_score
              },
              after_state: {
                summary: item.summary,
                category: newCategory,
                score: newScore
              }
            }
          });
          console.log(`🧠 記憶を更新・強化しました: ${item.topic_name} (スコア: ${newScore})`);

        } else {
          const { error: insertError } = await supabase
            .from('user_nodes')
            .insert({
              topic_name: item.topic_name,
              summary: item.summary,
              category: item.category,
              strength_score: SCORE_INITIAL,
              embedding: embeddingVector,
              mention_count: 1,
              first_observed_at: new Date().toISOString(),
              last_observed_at: new Date().toISOString()
            });
            
          if (insertError) {
            console.error(`⚠️ DB登録エラー詳細 (${item.topic_name}):`, insertError.message, insertError.details);
            continue;
          }
            
          // 💡 新規追加の場合：After のみをログに流す
          logEvent('memory_added', {
            payload: {
              topic: item.topic_name,
              after_state: {
                summary: item.summary,
                category: item.category,
                score: SCORE_INITIAL
              }
            }
          });
          console.log(`🌱 新しい記憶を記録しました: ${item.topic_name}`);
        }
      }
    } catch (error) {
      console.error('記憶抽出エラー:', error);
    }
  }
};