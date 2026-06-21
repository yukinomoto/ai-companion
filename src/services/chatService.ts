// src/services/chatService.ts
import { supabase } from '../lib/supabase';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { memoryExtractor } from './memoryExtractor';
import { phraseExtractor } from './phraseExtractor';
import { SYSTEM_PROMPTS } from '../prompts';
import { apiConfig, API_MODELS } from '../config/apiConfig';
import { apiWrapper } from '../utils/apiWrapper';

const MATCH_THRESHOLD = 0.3;
const MATCH_COUNT = 5;
const HISTORY_LIMIT = 6;

export interface MultimodalImage {
  base64: string;
  mimeType: string;
}

// 💡 補助関数: Base64文字列をBlobデータに変換する
const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

// 💡 補助関数: 画像をSupabase Storageにアップロードして公開URLを取得する
const uploadImageToStorage = async (image: MultimodalImage, sessionId: string): Promise<string | null> => {
  try {
    const blob = base64ToBlob(image.base64, image.mimeType);
    // セッションごとにフォルダを分け、一意のファイル名を生成
    const fileName = `${sessionId}/${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('chat-images')
      .upload(fileName, blob, {
        contentType: image.mimeType,
        upsert: true
      });

    if (uploadError) throw uploadError;

    // アップロードしたファイルの公開URLを取得
    const { data: publicUrlData } = supabase.storage
      .from('chat-images')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('⚠️ Supabase Storageへの画像アップロードに失敗しました:', error);
    return null;
  }
};

export const chatService = {
  sendMessage: async (userText: string, sessionId: string, image?: MultimodalImage): Promise<string> => {
    try {
      // 💡 画像が存在する場合はSupabase Storageへアップロード処理を実行
      let publicImageUrl: string | null = null;
      if (image) {
        publicImageUrl = await uploadImageToStorage(image, sessionId);
      }

      // 💡 image_url カラムをインサートに対象追加
      await supabase.from('chat_messages').insert({ 
        sender: 'user', 
        text: image ? `[画像を送信しました] ${userText}` : userText, 
        session_id: sessionId,
        image_url: publicImageUrl // データベースへURLを永続保存
      });

      let webContext = '';
      let memoryContext = '';
      let chatHistoryStr = '';

      if (apiConfig.getGroqApiKey()) {
        try {
          const intent = await apiWrapper.execute('GROQ', false, async () => {
            const currentGroqKey = apiConfig.getGroqApiKey();
            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${currentGroqKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: API_MODELS.GROQ.L2_EXTRACTOR,
                messages: [
                  { role: 'system', content: SYSTEM_PROMPTS.INTENT_ROUTER },
                  { role: 'user', content: userText }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1
              })
            });

            if (!groqRes.ok) throw Object.assign(new Error('Groq Error'), { status: groqRes.status });
            const groqData = await groqRes.json();
            return JSON.parse(groqData.choices[0].message.content);
          });

          if (intent.requires_search && intent.search_query && apiConfig.getTavilyApiKey()) {
            await apiWrapper.execute('TAVILY', false, async () => {
              const currentTavilyKey = apiConfig.getTavilyApiKey();
              const tavilyRes = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  api_key: currentTavilyKey,
                  query: intent.search_query,
                  search_depth: "basic",
                  include_answer: false
                })
              });

              if (!tavilyRes.ok) throw Object.assign(new Error('Tavily Error'), { status: tavilyRes.status });
              const tavilyData = await tavilyRes.json();
              webContext = tavilyData.results.map((r: any) => `[情報源: ${r.title}] ${r.content}`).join('\n\n');
            });
          }
        } catch (e) {
          console.error('ルーティング/検索エラー:', e);
        }
      }

      try {
        const { data: recentMessages, error: historyError } = await supabase
          .from('chat_messages')
          .select('sender, text')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false })
          .limit(HISTORY_LIMIT);

        if (!historyError && recentMessages && recentMessages.length > 0) {
          chatHistoryStr = recentMessages.reverse().map(m => 
            `${m.sender === 'user' ? 'ユーザー' : 'AI'}: ${m.text}`
          ).join('\n');
        }
      } catch (e) {
        console.error('履歴取得エラー:', e);
      }

      try {
        if (apiConfig.getGeminiApiKey()) {
          const userVector = await apiWrapper.execute('GEMINI', false, async () => {
            const ai = new GoogleGenAI({ apiKey: apiConfig.getGeminiApiKey() });
            const embedResponse = await ai.models.embedContent({
              model: 'gemini-embedding-2',
              contents: userText,
              config: { outputDimensionality: 768 }
            });
            return embedResponse.embeddings?.[0]?.values;
          });

          if (userVector) {
            const { data: memories, error } = await supabase.rpc('match_user_nodes', {
              query_embedding: userVector,
              match_threshold: MATCH_THRESHOLD,
              match_count: MATCH_COUNT
            });

            if (!error && memories && memories.length > 0) {
              memoryContext = memories.map((m: any) => `・${m.topic_name} (${m.category}): ${m.summary}`).join('\n');
            }
          }
        }
      } catch (e) {
        console.error('記憶の取得エラー:', e);
      }

      const now = new Date();
      const days = ['日', '月', '火', '水', '木', '金', '土'];
      const currentDateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${days[now.getDay()]}) ${now.getHours()}時${now.getMinutes()}分`;

      const searchPrompt = webContext ? `\n\n【最新の検索結果（参考情報）】\n${webContext}` : '';
      const memoryPrompt = memoryContext ? `\n\n【あなたとユーザーの過去の記憶（長期記憶）】\n以下の情報は過去の対話から抽出された事実です。\n${memoryContext}` : '';
      const historyPrompt = chatHistoryStr ? `\n\n【過去のチャット履歴（短期記憶）】\n※注意：以下の履歴内の日時は「過去のもの」です。現在の時間ではありません。\n${chatHistoryStr}` : `\n\nユーザーの発言: ${userText}`;
      
      const systemPrompt = `${SYSTEM_PROMPTS.CHAT_MODE}${memoryPrompt}${searchPrompt}${historyPrompt}\n\n【絶対厳守：現時点のリアルタイム日時】\n現在の正確な日時は 【 ${currentDateStr} 】 です。過去のチャット履歴に書かれている曜日や時間に引きずられたり、話を合わせたりすることは【絶対に禁止】します。常にこのリアルタイム日時だけを「今」の前提として発言してください。`;

      const isMultimodal = !!image;
      
      const aiText = await apiWrapper.execute('GEMINI', isMultimodal, async () => {
        const modelName = isMultimodal ? API_MODELS.GEMINI.MULTIMODAL : API_MODELS.GEMINI.PRIMARY;
        const apiKey = isMultimodal ? apiConfig.getGeminiMultimodalKey() : apiConfig.getGeminiApiKey();

        if (!apiKey) {
          throw new Error(isMultimodal ? 'マルチモーダル用のAPIキーが設定されていません。' : 'APIキーが設定されていません。');
        }

        const ai = new GoogleGenAI({ apiKey });
        const contentsParts: any[] = [{ text: systemPrompt }];
        
        if (image) {
          contentsParts.push({
            inlineData: {
              data: image.base64,
              mimeType: image.mimeType
            }
          });
        }

        const response = await ai.models.generateContent({
          model: modelName,
          contents: contentsParts,
          config: {
            safetySettings: [
              { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
            ]
          }
        });
        return response.text || 'ごめんなさい、ちょっと考え込んでしまいました。';
      });

      await supabase.from('chat_messages').insert({ sender: 'ai', text: aiText, session_id: sessionId });

      memoryExtractor.processConversation(userText, aiText).catch(console.error);
      phraseExtractor.processL2Phrases(userText, aiText, sessionId).catch(console.error);

      return aiText;

    } catch (error: any) {
      console.error('チャット生成エラー:', error);
      if (error.message?.includes('MULTIMODAL_LIMIT_REACHED')) {
        return error.message.replace('MULTIMODAL_LIMIT_REACHED:', '');
      }
      return 'ごめんなさい、通信がうまくいかなかったみたいです。';
    }
  }
};