// src/services/phraseExtractor.ts
import { dbService } from './dbService';
import { SYSTEM_PROMPTS } from '../prompts';
import { useLoggerStore } from '../store/useLoggerStore';
import { supabase } from '../lib/supabase';

const LLAMA_MODEL = 'llama-3.1-8b-instant';
const TEMPERATURE = 0.1;

export const phraseExtractor = {
  processL2Phrases: async (userText: string, aiText: string, sessionId: string) => {
    const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
    if (!groqApiKey) return;
    const logEvent = useLoggerStore.getState().logEvent;

    try {
      // タイトル生成用の文脈（既存通り）
      const conversationContext = `ユーザー: ${userText}\nAI: ${aiText}`;

      // 🏎️ すべてのリクエストを完全並列で同時発射
      const [titleResponse, userGraphResponse, aiGraphResponse] = await Promise.all([
        // 🟦 タスク1: タイトル生成
        fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: LLAMA_MODEL,
            messages: [
              { role: 'system', content: SYSTEM_PROMPTS.L2_GENERATE_TITLE },
              { role: 'user', content: conversationContext }
            ],
            response_format: { type: "json_object" },
            temperature: 0.4
          })
        }),

        // 🟩 タスク2: ユーザー発言側からのグラフ抽出（💡 混じり気なしの生テキストのみを送信）
        fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: LLAMA_MODEL,
            messages: [
              { role: 'system', content: SYSTEM_PROMPTS.L2_GRAPH_EXTRACTION },
              { role: 'user', content: userText } // 👈 余計な指示文を排除し、純粋な発言のみに修正
            ],
            response_format: { type: "json_object" },
            temperature: TEMPERATURE
          })
        }),

        // 🟨 タスク3: AI発言側からのグラフ抽出（💡 混じり気なしの生テキストのみを送信）
        fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: LLAMA_MODEL,
            messages: [
              { role: 'system', content: SYSTEM_PROMPTS.L2_GRAPH_EXTRACTION },
              { role: 'user', content: aiText } // 👈 余計な指示文を排除し、純粋な発言のみに修正
            ],
            response_format: { type: "json_object" },
            temperature: TEMPERATURE
          })
        })
      ]);

      if (!titleResponse.ok || !userGraphResponse.ok || !aiGraphResponse.ok) {
        throw new Error(`Groq Parallel Fetch Error: [Title: ${titleResponse.status}] [User: ${userGraphResponse.status}] [AI: ${aiGraphResponse.status}]`);
      }

      // レスポンスの解析
      const [titleData, userData, aiData] = await Promise.all([
        titleResponse.json(),
        userGraphResponse.json(),
        aiGraphResponse.json()
      ]);

      const titleResult = JSON.parse(titleData.choices[0].message.content);
      const userGraphResult = JSON.parse(userData.choices[0].message.content);
      const aiGraphResult = JSON.parse(aiData.choices[0].message.content);

      // 1. タイトルの上書き
      if (titleResult.title && sessionId) {
        await dbService.updateSessionTitle(sessionId, titleResult.title);
      }

      // 2. データの統合と強制マッピング
      const finalNodes: any[] = [];
      const finalEdges: any[] = [];
      const nodeSeenPhrases = new Set<string>();

      // ユーザー側ノード
      if (userGraphResult.nodes) {
        userGraphResult.nodes.forEach((n: any) => {
          if (!n.phrase) return;
          const key = n.phrase.trim().toLowerCase();
          if (!nodeSeenPhrases.has(key)) {
            nodeSeenPhrases.add(key);
            finalNodes.push({ ...n, source: 'user' });
          }
        });
      }

      // AI側ノード
      if (aiGraphResult.nodes) {
        aiGraphResult.nodes.forEach((n: any) => {
          if (!n.phrase) return;
          const key = n.phrase.trim().toLowerCase();
          if (!nodeSeenPhrases.has(key)) {
            nodeSeenPhrases.add(key);
            finalNodes.push({ ...n, source: 'ai' });
          }
        });
      }

      // エッジの統合
      const edgeSeen = new Set<string>();
      const addEdges = (edgesArray: any[]) => {
        if (!edgesArray) return;
        edgesArray.forEach((e: any) => {
          if (!e.from || !e.to) return;
          const wordA = e.from.trim().toLowerCase();
          const wordB = e.to.trim().toLowerCase();
          const edgeKey = wordA < wordB ? `${wordA}->${wordB}` : `${wordB}->${wordA}`;
          if (!edgeSeen.has(edgeKey)) {
            edgeSeen.add(edgeKey);
            finalEdges.push(e);
          }
        });
      };

      addEdges(userGraphResult.edges);
      addEdges(aiGraphResult.edges);

      // 3. Supabaseへ安全に配送
      if (finalNodes.length > 0) {
        const { error } = await supabase.rpc('save_phrase_network_v3', {
          p_nodes: finalNodes,
          p_edges: finalEdges,
          p_session_id: sessionId
        });

        if (error) throw error;
        
        console.log(`========================================\n🕸️ [L2完全分離・並列非同期処理完了] 登録データ:\n----------------------------------------`);
        console.table(finalNodes.map((n: any) => ({ '単語 (phrase)': n.phrase, '役割 (type)': n.type, '発言元 (source)': n.source })));
        if (finalEdges.length > 0) {
          console.log(`🔗 構築されたエッジ:`);
          console.table(finalEdges.map((e: any) => ({ 'From': e.from, '↔': 'リンク', 'To': e.to })));
        }
        console.log(`========================================`);

        logEvent('diagnostic_run', { payload: { note: 'L2 Split Saved', title: titleResult.title, nodes_count: finalNodes.length } });
      }

    } catch (error: any) {
      logEvent('audio_play_error', { error_message: `L2 Split Extractor Failed: ${error.message}` });
    }
  }
};