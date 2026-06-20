import { supabase } from '../lib/supabase';
import { GoogleGenAI } from '@google/genai';
import { memoryExtractor } from './memoryExtractor';
import { phraseExtractor } from './phraseExtractor';
import { SYSTEM_PROMPTS } from '../prompts';

const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
const tavilyApiKey = import.meta.env.VITE_TAVILY_API_KEY;
const ai = new GoogleGenAI({ apiKey: geminiApiKey || '' });

// ---------------------------------------------------------
// ⚙️ 定数定義
// ---------------------------------------------------------
const MATCH_THRESHOLD = 0.3; // 記憶検索の類似度閾値
const MATCH_COUNT = 5;       // 抽出する関連記憶の最大件数
const HISTORY_LIMIT = 6;     // 取得する直近の会話履歴の件数（3往復分）

export const chatService = {
  sendMessage: async (userText: string, sessionId: string): Promise<string> => {
    try {
      // 1. ユーザーのメッセージを現在のセッションに保存
      await supabase.from('chat_messages').insert({ sender: 'user', text: userText, session_id: sessionId });

      let webContext = '';
      let memoryContext = '';
      let chatHistoryStr = '';

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
              model: 'llama-3.1-8b-instant',
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

      // ==========================================
      // 3.2 💬 直近の会話履歴（短期記憶）の取得
      // ==========================================
      try {
        const { data: recentMessages, error: historyError } = await supabase
          .from('chat_messages')
          .select('sender, text')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false })
          .limit(HISTORY_LIMIT);

        if (!historyError && recentMessages && recentMessages.length > 0) {
          // 古い順に並べ直して会話テキストを作成
          chatHistoryStr = recentMessages.reverse().map(m => 
            `${m.sender === 'user' ? 'ユーザー' : 'AI'}: ${m.text}`
          ).join('\n');
          console.log('💬 短期記憶を読み込みました:\n', chatHistoryStr);
        }
      } catch (e) {
        console.error('履歴取得エラー:', e);
      }

      // ==========================================
      // 3.5 🧠 記憶の引き出し（ベクトル検索による長期記憶）
      // ==========================================
      try {
        if (geminiApiKey) {
          const embedResponse = await ai.models.embedContent({
            model: 'gemini-embedding-2',
            contents: userText,
            config: { outputDimensionality: 768 }
          });
          
          const userVector = embedResponse.embeddings?.[0]?.values;

          if (userVector) {
            const { data: memories, error } = await supabase.rpc('match_user_nodes', {
              query_embedding: userVector,
              match_threshold: MATCH_THRESHOLD,
              match_count: MATCH_COUNT
            });

            if (error) {
              console.error('🧠 記憶検索エラー:', error.message);
            } else if (memories && memories.length > 0) {
              memoryContext = memories.map((m: any) => `・${m.topic_name} (${m.category}): ${m.summary}`).join('\n');
              console.log('🧠 長期記憶を呼び起こしました:\n', memoryContext);
            } else {
              console.log('🧠 関連する長期記憶は見つかりませんでした。');
            }
          }
        }
      } catch (e) {
        console.error('記憶の取得エラー:', e);
      }

      // 現在日時の取得
      const now = new Date();
      const days = ['日', '月', '火', '水', '木', '金', '土'];
      const currentDateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${days[now.getDay()]}) ${now.getHours()}時${now.getMinutes()}分`;

      // 4. メイン脳（Gemini 3.1 Flash-Lite）で返答を生成
      const searchPrompt = webContext ? `\n\n【最新の検索結果（参考情報）】\n${webContext}` : '';
      const memoryPrompt = memoryContext ? `\n\n【あなたとユーザーの過去の記憶（長期記憶）】\n以下の情報は過去の対話から抽出された事実です。\n${memoryContext}` : '';
      
      // 💡 修正：履歴を渡す際、それが「過去のログ」であることを明記する
      const historyPrompt = chatHistoryStr ? `\n\n【過去のチャット履歴（短期記憶）】\n※注意：以下の履歴内の日時は「過去のもの」です。現在の時間ではありません。\n${chatHistoryStr}` : `\n\nユーザーの発言: ${userText}`;
      
      // 💡 決定版システムプロンプト：AIのタイムゾーンと絶対時間軸をここで完全固定する
      const systemPrompt = `${SYSTEM_PROMPTS.CHAT_MODE}${memoryPrompt}${searchPrompt}${historyPrompt}\n\n【絶対厳守：現時点のリアルタイム日時】\n現在の正確な日時は 【 ${currentDateStr} 】 です。過去のチャット履歴に書かれている曜日や時間に引きずられたり、話を合わせたりすることは【絶対に禁止】します。常にこのリアルタイム日時だけを「今」の前提として発言してください。`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: systemPrompt,
      });
      
      const aiText = response.text || 'ごめんなさい、ちょっと考え込んでしまいました。';

      // 5. AIのメッセージを保存
      const { error: insertError } = await supabase.from('chat_messages').insert({ sender: 'ai', text: aiText, session_id: sessionId });
      if (insertError) {
         console.error('⚠️ メッセージ保存エラー:', insertError.message);
      }

      // 6. 🕵️‍♂️ 裏側で記憶処理を非同期実行（AIの返答を待たせない）
      
      // L3: 従来の長期記憶抽出（Gemini）
      memoryExtractor.processConversation(userText, aiText).catch(err => {
        console.error('裏側でのL3記憶抽出に失敗しました:', err);
      });

      // 💡 NEW - L2: 共有フレーズ履歴の蓄積（Groq）
      phraseExtractor.processL2Phrases(userText, aiText, sessionId).catch(err => {
        console.error('裏側でのL2フレーズ蓄積に失敗しました:', err);
      });

      return aiText;

    } catch (error) {
      console.error('チャット生成エラー:', error);
      return 'ごめんなさい、通信がうまくいかなかったみたいです。';
    }
  }
};