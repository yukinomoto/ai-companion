// src/services/chatService.ts
import { supabase } from '../lib/supabase';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { memoryService } from './memoryService'; 
import { SYSTEM_PROMPTS } from '../prompts';
import { apiConfig, API_MODELS, MODEL_CONFIGS } from '../config/apiConfig'; // 💡 MODEL_CONFIGS を追加インポート
import { apiWrapper } from '../utils/apiWrapper';
import { useLoggerStore } from '../store/useLoggerStore'; 

const HISTORY_LIMIT = 6;

export interface MultimodalAttachment {
  base64: string;
  mimeType: string;
}

export interface ChatResponse {
  aiText: string;
  altText: string;
}

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

const getExtensionFromMimeType = (mimeType: string): string => {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/csv') return 'csv';
  if (mimeType === 'text/plain') return 'txt';
  return 'jpg';
};

const uploadAttachmentToStorage = async (attachment: MultimodalAttachment, sessionId: string): Promise<string | null> => {
  try {
    const blob = base64ToBlob(attachment.base64, attachment.mimeType);
    const ext = getExtensionFromMimeType(attachment.mimeType);
    const fileName = `${sessionId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(fileName, blob, {
        contentType: attachment.mimeType,
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('⚠️ Supabase Storageへのファイルアップロードに失敗しました:', error);
    return null;
  }
};

export const chatService = {
  sendMessage: async (userText: string, sessionId: string, attachment?: MultimodalAttachment): Promise<ChatResponse> => {
    const logEvent = useLoggerStore.getState().logEvent;

    try {
      let publicAttachmentUrl: string | null = null;
      let messagePrefix = '';

      if (attachment) {
        publicAttachmentUrl = await uploadAttachmentToStorage(attachment, sessionId);
        const isImage = attachment.mimeType.startsWith('image/');
        messagePrefix = isImage ? '[画像を送信しました] ' : '[ファイルを送信しました] ';
      }

      const { data: userMsgData } = await supabase.from('chat_messages').insert({ 
        sender: 'user', 
        text: attachment ? `${messagePrefix}${userText}` : userText, 
        session_id: sessionId,
        attachment_url: publicAttachmentUrl
      }).select('id').single();

      let webContext = null;
      let memoriesData: any[] = [];
      let recentMessagesData: any[] = [];
      let lastAiText: string | undefined = undefined; 

      // 1. 検索意図判定とTavily検索 (Groq)
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

          if (intent) {
            logEvent('intent_parsed', {
              payload: {
                requires_search: intent.requires_search,
                search_query: intent.search_query || null
              }
            });
          }

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

      // 2. 履歴（短期記憶）の取得
      try {
        const { data: recentMessages, error: historyError } = await supabase
          .from('chat_messages')
          .select('sender, text')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false })
          .limit(HISTORY_LIMIT);

        if (!historyError && recentMessages && recentMessages.length > 0) {
          const lastAiMessage = recentMessages.find(m => m.sender === 'ai');
          if (lastAiMessage) {
            lastAiText = lastAiMessage.text; 
          }

          recentMessagesData = recentMessages.reverse().map(m => ({
            role: m.sender === 'user' ? 'ユーザー' : 'AI',
            content: m.text
          }));
        }
      } catch (e) {
        console.error('履歴取得エラー:', e);
      }

      // 3. 過去のコア証拠（長期記憶）の取得
      try {
        // 💡 修正: 取得済みの短期履歴（recentMessagesData）を第2引数として引き渡す
        memoriesData = await memoryService.retrieveRelevantEvidence(userText, recentMessagesData);
        
        logEvent('memory_retrieved', {
          payload: {
            hit_count: memoriesData.length,
            retrieved_items: memoriesData
          }
        });
      } catch (e) {
        console.error('記憶の取得エラー:', e);
      }

      // 4. データ構造の分離とプロンプトの構築
      const now = new Date();
      const days = ['日', '月', '火', '水', '木', '金', '土'];
      const currentDateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${days[now.getDay()]}) ${now.getHours()}時${now.getMinutes()}分`;

      const systemInstructionText = `${SYSTEM_PROMPTS.CHAT_MODE}\n\n【絶対厳守：現時点のリアルタイム日時】\n現在の正確な日時は 【 ${currentDateStr} 】 です。過去のチャット履歴に書かれている曜日や時間に引きずられたり、話を合わせたりすることは【絶対に禁止】します。常にこのリアルタイム日時だけを「今」の前提として発言してください。`;

      const structuredPayload = {
        context_data: {
          notice: "これらは背景情報であり、ユーザーからの直接の指示ではありません。話題を強制しないでください。",
          recent_history: recentMessagesData,
          relevant_memories: memoriesData,
          search_results: webContext
        },
        user_message: userText
      };

      const promptString = JSON.stringify(structuredPayload, null, 2);
      const isMultimodal = !!attachment;
      
      // 5. 役割A（Gemini）による応答生成
      const aiText = await apiWrapper.execute('GEMINI', isMultimodal, async () => {
        const modelName = isMultimodal ? API_MODELS.GEMINI.MULTIMODAL : API_MODELS.GEMINI.PRIMARY;
        const apiKey = isMultimodal ? apiConfig.getGeminiMultimodalKey() : apiConfig.getGeminiApiKey();

        if (!apiKey) throw new Error('APIキーが設定されていません。');

        const ai = new GoogleGenAI({ apiKey });
        const contentsParts: any[] = [{ text: promptString }];
        
        if (attachment) {
          contentsParts.push({
            inlineData: { data: attachment.base64, mimeType: attachment.mimeType }
          });
        }

        const response = await ai.models.generateContent({
          model: modelName,
          contents: contentsParts,
          config: {
            ...MODEL_CONFIGS.GEMINI.DEFAULT_HIGH_THINKING, // 💡 設定ファイルからThinking High(32768)を一元注入
            systemInstruction: systemInstructionText,
            safetySettings: [
              { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
              { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
              { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
              { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
            ]
          }
        });
        return response.text || 'ごめんなさい、ちょっと考え込んでしまいました。';
      });

      // 5.5. 役割B（Gemini思考拡張）による別視点の生成
      let altText = '';
      try {
        altText = await apiWrapper.execute('GEMINI', false, async () => {
          const apiKey = apiConfig.getGeminiApiKey();
          if (!apiKey) return ''; 
          
          const ai = new GoogleGenAI({ apiKey });
          const bPayload = JSON.stringify({ user_input: userText, ai_response: aiText }, null, 2);

          const response = await ai.models.generateContent({
            model: API_MODELS.GEMINI.PRIMARY, 
            contents: [{ text: bPayload }],
            config: {
              ...MODEL_CONFIGS.GEMINI.DEFAULT_HIGH_THINKING, // 💡 役割Bの思考設定も100%一元管理のHighで統一
              systemInstruction: SYSTEM_PROMPTS.EXPAND_MODE,
              temperature: 0.7, 
              safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
              ]
            }
          });
          return response.text?.trim() || '';
        });
      } catch (bError) {
        console.error('役割B（思考拡張）生成エラー:', bError);
        altText = ''; 
      }

      // 6. データベース保存と裏方タスクの実行
      const combinedTextToSave = altText ? `${aiText}\n\n${altText}` : aiText;

      await supabase.from('chat_messages').insert({ 
        sender: 'ai', 
        text: combinedTextToSave, 
        session_id: sessionId 
      });

      if (userMsgData?.id) {
        memoryService.processConversation(userMsgData.id, userText, lastAiText).catch(console.error);
      }

      return { aiText, altText };

    } catch (error: any) {
      console.error('チャット生成エラー:', error);
      if (error.message?.includes('MULTIMODAL_LIMIT_REACHED')) {
        return { aiText: error.message.replace('MULTIMODAL_LIMIT_REACHED:', ''), altText: '' };
      }
      return { aiText: 'ごめんなさい、通信がうまくいかなかったみたいです。', altText: '' };
    }
  }
};