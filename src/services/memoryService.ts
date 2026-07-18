// src/services/memoryService.ts
import { supabase } from '../lib/supabase';
import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { textNormalizer } from '../utils/textNormalizer';
import { apiConfig, API_MODELS, MODEL_CONFIGS } from '../config/apiConfig'; // 💡 MODEL_CONFIGS をインポート

export const memoryService = {
  /**
   * ユーザーの発話からフレーズを抽出し、DBの生ログ(chat_messages)とリンクさせる
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
        items: { type: Type.STRING },
      };

      const response = await ai.models.generateContent({
        model: API_MODELS.GEMINI.PRIMARY,
        contents: prompt,
        config: {
          ...MODEL_CONFIGS.GEMINI.DEFAULT_HIGH_THINKING, // 💡 思考設定オブジェクトをそのまま注入（生書き完全排除）
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
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
   * 特定のフレーズに紐づく生ログ群を見直し、代表証拠（is_core）を選定し直す
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

      const prompt = `あなたは記憶の監査モジュールです。トピック「${phraseName}」に関する【生ログ＋当時のAI文脈】を読み込み、以下の2つのステップを実行してください。\n\n【ステップ1：現時点の仮要約（最大300文字）】\n最新情報を最優先し300文字以内で要約してください。\n\n【ステップ2：ログの格付け（Core / Keep / Drop）】\n要約の成立に絶対不可欠なログを"Core"、前提事実を"Keep"、陳腐化したものを"Drop"として格付けしてください。\n\n【対象ログ群】\n${JSON.stringify(logListForLLM, null, 2)}`;

      const responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: "300文字以内の仮要約" },
          evaluations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                rating: { type: Type.STRING, enum: ["Core", "Keep", "Drop"] }
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
          ...MODEL_CONFIGS.GEMINI.DEFAULT_HIGH_THINKING, // 💡 思考設定オブジェクトをそのまま注入（生書き完全排除）
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        }
      });

      const result = JSON.parse(response.text || '{"summary":"","evaluations":[]}');
      const evaluations = result.evaluations || [];

      const evalMap = new Map<string, 'Core' | 'Keep' | 'Drop'>();
      evaluations.forEach((e: any) => { evalMap.set(String(e.id), e.rating); });

      let coreCount = 0;
      for (const link of links) {
        const rating = evalMap.get(String(link.chat_message_id));
        let nextIsCore = false;

        if (rating === 'Core') nextIsCore = true;
        else if (rating === 'Keep') nextIsCore = link.is_core;

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
      const prompt = `以下のユーザーの発話から、記憶のインデックスとなる「重要な名詞」「固有名詞」「トピック」を抽出してください。\n\n発話: "${userMessage}"`;

      const responseSchema: Schema = {
        type: Type.ARRAY,
        description: "検索キーワードのリスト",
        items: { type: Type.STRING },
      };

      const response = await ai.models.generateContent({
        model: API_MODELS.GEMINI.PRIMARY,
        contents: prompt,
        config: {
          ...MODEL_CONFIGS.GEMINI.DEFAULT_HIGH_THINKING, // 💡 思考設定オブジェクトをそのまま注入（生書き完全排除）
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        }
      });

      const keywords: string[] = JSON.parse(response.text || '[]');
      console.log(`🔍 [記憶検索スタック] 抽出された検索キーワード:`, keywords);
      
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

        if (!phraseData) {
          console.log(`🔎 [記憶検索スタック] フレーズ未ヒット: [${normalized}]`);
          continue;
        }
        console.log(`🔎 [記憶検索スタック] フレーズがヒットしました: [${normalized}]`);

        const { data: links } = await supabase
          .from('chat_message_phrase_links')
          .select(`
            ai_context_summary,
            chat_messages ( text, sender )
          `)
          .eq('phrase_id', phraseData.id)
          .eq('is_core', true)
          .limit(5);

        console.log(`📜 [記憶検索スタック] [${normalized}] に紐づくコア証拠の取得数: ${links?.length || 0}件`);

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