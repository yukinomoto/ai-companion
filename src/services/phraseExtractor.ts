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
      const conversationContext = `ユーザー: ${userText}\nAI: ${aiText}`;

      // 🏎️ 【超高速化】Promise.all を使い、タイトル生成とグラフ抽出を「同時に並列発射」する！
      // これにより、通信を待つ時間が2倍から「1回分」に半減します。
      const [titleResponse, graphResponse] = await Promise.all([
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
        // 🟨 タスク2: グラフ抽出（独立させたので、プロンプトに集中して爆速処理されます）
        fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: LLAMA_MODEL,
            messages: [
              { role: 'system', content: SYSTEM_PROMPTS.L2_GRAPH_EXTRACTION },
              { role: 'user', content: conversationContext }
            ],
            response_format: { type: "json_object" },
            temperature: TEMPERATURE
          })
        })
      ]);

      if (!titleResponse.ok || !graphResponse.ok) throw new Error('Groq Parallel Fetch Error');

      // 2つのレスポンス解析も同時に走らせる
      const [titleData, graphData] = await Promise.all([
        titleResponse.json(),
        graphResponse.json()
      ]);

      const titleResult = JSON.parse(titleData.choices[0].message.content);
      const graphResult = JSON.parse(graphData.choices[0].message.content);

      // 1. タイトルの上書き
      if (titleResult.title && sessionId) {
        await dbService.updateSessionTitle(sessionId, titleResult.title);
      }

      // 2. ナレッジグラフ＆統計履歴の更新
      const nodes = graphResult.nodes || [];
      const edges = graphResult.edges || [];

      if (nodes.length > 0) {
        // エッジの重複排除シールド
        const edgeSeen = new Set<string>();
        const uniqueEdges = edges.filter((e: any) => {
          if (!e.from || !e.to) return false;
          const wordA = e.from.trim().toLowerCase();
          const wordB = e.to.trim().toLowerCase();
          const edgeKey = wordA < wordB ? `${wordA}->${wordB}` : `${wordB}->${wordA}`;
          if (edgeSeen.has(edgeKey)) return false;
          edgeSeen.add(edgeKey);
          return true;
        });

        // Supabaseへの保存
        const { error } = await supabase.rpc('save_phrase_network_v3', {
          p_nodes: nodes,
          p_edges: uniqueEdges,
          p_session_id: sessionId
        });

        if (error) throw error;
        
        // 観測ログの出力
        console.log(`========================================\n🕸️ [L2完全並列非同期処理完了] 登録データ:\n----------------------------------------`);
        console.table(nodes.map((n: any) => ({ '単語 (phrase)': n.phrase, '役割 (type)': n.type, '発言元 (source)': n.source })));
        if (uniqueEdges.length > 0) {
          console.log(`🔗 構築されたエッジ:`);
          console.table(uniqueEdges.map((e: any) => ({ 'From': e.from, '↔': 'リンク', 'To': e.to })));
        }
        console.log(`========================================`);

        logEvent('diagnostic_run', { payload: { note: 'L2 Parallel Saved', title: titleResult.title, nodes_count: nodes.length } });
      }

    } catch (error: any) {
      logEvent('audio_play_error', { error_message: `L2 Parallel Extractor Failed: ${error.message}` });
    }
  }
};