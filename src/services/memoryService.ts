// src/services/memoryService.ts
import { supabase } from '../lib/supabase';
import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { textNormalizer } from '../utils/textNormalizer';
import { apiConfig, API_MODELS, MODEL_PARAMS } from '../config/apiConfig'; // 💡 MODEL_PARAMS もインポート

export const memoryService = {
  /**
   * ユーザーの発話からフレーズを抽出し、DBの生ログ(chat_messages)とリンクさせる
   * @param aiContextSummary 対話当時のAI側の発言・文脈の要約（オプション）
   */
  processConversation: async (chatMessageId: string, userMessage: string, aiContextSummary?: string) => {
    const apiKey = apiConfig.getGeminiApiKey();
    if (!apiKey) return;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `以下のユーザーの発話から、記憶のインデックスとなる「重要な名詞」「固有名詞」「トピック」を抽出してください。\n\n発話: "${userMessage}"`;

      const responseSchema: Schema = {
        type: Type.ARRAY,
        description: "抽出されたフレーズのリスト",
        items: {
          type: Type.STRING,
        },
      };

      const response = await ai.models.generateContent({
        model: API_MODELS.GEMINI.PRIMARY,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          // 💡 一元管理ファイルから定数を安全に取得
          thinkingConfig: { thinkingBudget: MODEL_PARAMS.GEMINI.THINKING_BUDGET_HIGH }
        }
      });

      const extractedPhrases: string[] = JSON.parse(response.text || '[]');

      if (!Array.isArray(extractedPhrases) || extractedPhrases.length === 0) {
        console.log('📝 抽出するフレーズはありませんでした。');
        return;
      }

      for (const rawPhrase of extractedPhrases) {
        const normalized = textNormalizer.normalizePhrase(rawPhrase);
        if (!normalized) continue;

        const { data: phraseId, error: rpcError } = await supabase.rpc('upsert_phrase', {
          p_original: rawPhrase,
          p_normalized: normalized
        });

        if (rpcError || !phraseId) {
          console.error(`⚠️ フレーズ登録エラー (${rawPhrase}):`, rpcError?.message);
          continue;
        }

        const { error: linkError } = await supabase
          .from('chat_message_phrase_links')
          .upsert({
            chat_message_id: chatMessageId,
            phrase_id: phraseId,
            is_core: false,
            ai_context_summary: aiContextSummary || null
          }, { onConflict: 'chat_message_id, phrase_id' });

        if (linkError) {
          console.error(`⚠️ リンク作成エラー (${rawPhrase}):`, linkError.message);
          continue;
        }

        console.log(`🔗 記憶リンク作成: [${rawPhrase}] -> MsgID: ${chatMessageId}`);
        
        await memoryService.reevaluateCoreLogs(phraseId, normalized);
      }
    } catch (error) {
      console.error('記憶処理（抽出・保存）エラー:', error);
    }
  },

  /**
   * 特定のフレーズに紐づく生ログ群を見直し、300文字の仮要約から逆算して代表証拠（is_core）を選定し直す
   */
  reevaluateCoreLogs: async (phraseId: string, phraseName: string) => {
    const apiKey = apiConfig.getGeminiApiKey();
    if (!apiKey) return;

    try {
      const { data: links, error: fetchError } = await supabase
        .from('chat_message_phrase_links')
        .select(`
          chat_message_id,
          is_core,
          ai_context_summary,
          chat_messages ( text, sender, created_at )
        `)
        .eq('phrase_id', phraseId)
        .order('created_at', { ascending: true });

      if (fetchError || !links || links.length === 0) return;

      const logListForLLM = links.map(link => {
        const msg: any = Array.isArray(link.chat_messages) ? link.chat_messages[0] : link.chat_messages;
        return {
          id: link.chat_message_id,
          ai_context: link.ai_context_summary || "なし",
          user_text: msg?.text,
          date: msg?.created_at
        };
      });

      const prompt = `あなたは記憶の監査モジュールです。
トピック「${phraseName}」に関する、時系列の【生ログ＋当時のAI文脈】を読み込み、以下の2つのステップを厳格に実行してください。

【ステップ1：現時点の仮要約（最大300文字）】
時系列の最新情報を最優先し、現時点でこのトピックに関して確定しているユーザーの事実や価値観を、無駄を削ぎ落として【300文字以内】で要約してください。

【ステップ2：ログの格付け（Core / Keep / Drop）】
ステップ1の要約を基に、提示された各ログのID（chat_message_id）を以下の3つに格付けしてください。

1. "Core"（絶対不可欠）:
   この生ログが消えたら、ステップ1の300文字の要約が成立しなくなる、または事実に反することになる「絶対的な代表証拠」。
2. "Keep"（クッション・保留）:
   ステップ1の300文字の要約には直接現れていないが、「過去の重要な前提事実」や「まだ否定されていないユーザーの価値観」であり、念のため記憶に残しておくべきログ。
3. "Drop" \
_（除外）:
   今回の要約とは無関係な古い誤解、挨拶、相槌、または完全に内容が陳腐化したログ。

【対象ログ群】
${JSON.stringify(logListForLLM, null, 2)}`;

      const responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
          summary: { 
            type: Type.STRING, 
            description: "トピックに関する現時点の300文字以内の仮要約" 
          },
          evaluations: {
            type: Type.ARRAY,
            description: "各ログに対する格付けのリスト",
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: "対象のログID" },
                rating: { 
                  type: Type.STRING, 
                  enum: ["Core", "Keep", "Drop"],
                  description: "格付け判定結果"
                }
              },
              required: ["id", "rating"]
            }
          }
        },
        required: ["summary", "evaluations"]
      };

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: API_MODELS.GEMINI.PRIMARY,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          // 💡 一元管理ファイルから定数を安全に取得
          thinkingConfig: { thinkingBudget: MODEL_PARAMS.GEMINI.THINKING_BUDGET_HIGH }
        }
      });

      const result = JSON.parse(response.text || '{"summary":"","evaluations":[]}');
      const evaluations = result.evaluations || [];

      const evalMap = new Map<string, 'Core' | 'Keep' | 'Drop'>();
      evaluations.forEach((e: any) => {
        evalMap.set(String(e.id), e.rating);
      });

      let coreCount = 0;

      for (const link of links) {
        const rating = evalMap.get(String(link.chat_message_id));
        let nextIsCore = false;

        if (rating === 'Core') {
          nextIsCore = true;
        } else if (rating === 'Keep') {
          nextIsCore = link.is_core; 
        } else {
          nextIsCore = false;
        }

        if (nextIsCore) coreCount++;

        if (link.is_core !== nextIsCore) {
          await supabase
            .from('chat_message_phrase_links')
            .update({ is_core: nextIsCore })
            .match({ phrase_id: phraseId, chat_message_id: link.chat_message_id });
        }
      }

      console.log(`🎯 [${phraseName}] コア再選定完了: ${links.length}件中 -> ${coreCount}件がコアを維持（仮要約: ${result.summary}）`);

    } catch (error) {
      console.error(`コア再選定エラー (${phraseName}):`, error);
    }
  },

  /**
   * ユーザーの入力から関連するコア証拠（代表ログ）を検索・取得する
   */
  retrieveRelevantEvidence: async (userMessage: string): Promise<string[]> => {
    const apiKey = apiConfig.getGeminiApiKey();
    if (!apiKey) return [];

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `以下のユーザーの発話から、過去の記憶を検索するための「検索キーワード（名詞、固有名詞、トピック）」を最大3つ抽出してください。\n\n発話: "${userMessage}"`;

      const responseSchema: Schema = {
        type: Type.ARRAY,
        description: "検索キーワードのリスト",
        items: { type: Type.STRING },
      };

      const response = await ai.models.generateContent({
        model: API_MODELS.GEMINI.PRIMARY,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0.1
        }
      });

      const keywords: string[] = JSON.parse(response.text || '[]');
      if (keywords.length === 0) return [];

      const coreLogs = new Set<string>();

      for (const keyword of keywords) {
        const normalized = textNormalizer.normalizePhrase(keyword);
        if (!normalized) continue;

        const { data: phraseData } = await supabase
          .from('phrases')
          .select('id, normalized_phrase')
          .eq('normalized_phrase', normalized)
          .maybeSingle();

        if (!phraseData) continue;

        const { data: links } = await supabase
          .from('chat_message_phrase_links')
          .select(`
            ai_context_summary,
            chat_messages ( text, sender )
          `)
          .eq('phrase_id', phraseData.id)
          .eq('is_core', true)
          .limit(5);

        if (links) {
          links.forEach(link => {
            const msg: any = Array.isArray(link.chat_messages) ? link.chat_messages[0] : link.chat_messages;
            if (msg) {
              const role = msg.sender === 'user' ? 'ユーザー' : 'AI';
              const aiContextPrefix = link.ai_context_summary ? `[当時のAI文脈: ${link.ai_context_summary}] ` : '';
              coreLogs.add(`[関連トピック: ${phraseData.normalized_phrase}] ${aiContextPrefix}${role}の発言: "${msg.text}"`);
            }
          });
        }
      }

      return Array.from(coreLogs);
    } catch (error) {
      console.error('記憶の検索エラー:', error);
      return [];
    }
  }
};