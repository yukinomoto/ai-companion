// src/services/phraseExtractor.ts
import { dbService } from './dbService';
import { SYSTEM_PROMPTS } from '../prompts';
import { useLoggerStore } from '../store/useLoggerStore';
import { supabase } from '../lib/supabase';
import { apiConfig } from '../config/apiConfig';
import { apiWrapper } from '../utils/apiWrapper';

const LLAMA_MODEL = 'llama-3.1-8b-instant';
const TEMPERATURE = 0.1;

export const phraseExtractor = {
  processL2Phrases: async (userText: string, aiText: string, sessionId: string) => {
    const logEvent = useLoggerStore.getState().logEvent;

    try {
      const conversationContext = `ユーザー: ${userText}\nAI: ${aiText}`;

      await apiWrapper.execute('GROQ', false, async () => {
        const currentGroqKey = apiConfig.getGroqApiKey();
        if (!currentGroqKey) throw new Error('Groq API Key is missing');

        const { count } = await supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', sessionId);

        const isFirstTurn = (count || 0) <= 2;

        const fetchPromises = [
          fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentGroqKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: LLAMA_MODEL,
              messages: [
                { role: 'system', content: SYSTEM_PROMPTS.L2_GRAPH_EXTRACTION },
                { role: 'user', content: userText }
              ],
              response_format: { type: "json_object" },
              temperature: TEMPERATURE
            })
          }),
          fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentGroqKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: LLAMA_MODEL,
              messages: [
                { role: 'system', content: SYSTEM_PROMPTS.L2_GRAPH_EXTRACTION },
                { role: 'user', content: aiText }
              ],
              response_format: { type: "json_object" },
              temperature: TEMPERATURE
            })
          })
        ];

        if (isFirstTurn) {
          fetchPromises.push(
            fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${currentGroqKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: LLAMA_MODEL,
                messages: [
                  { role: 'system', content: SYSTEM_PROMPTS.L2_GENERATE_TITLE },
                  { role: 'user', content: conversationContext }
                ],
                response_format: { type: "json_object" },
                temperature: 0.4
              })
            })
          );
        }

        const responses = await Promise.all(fetchPromises);

        if (!responses[0].ok) throw Object.assign(new Error(`User Graph Error: ${responses[0].status}`), { status: responses[0].status });
        if (!responses[1].ok) throw Object.assign(new Error(`AI Graph Error: ${responses[1].status}`), { status: responses[1].status });
        if (isFirstTurn && !responses[2].ok) throw Object.assign(new Error(`Title Fetch Error: ${responses[2].status}`), { status: responses[2].status });

        const [userData, aiData, titleData] = await Promise.all([
          responses[0].json(),
          responses[1].json(),
          isFirstTurn ? responses[2].json() : Promise.resolve(null)
        ]);

        const userGraphResult = JSON.parse(userData.choices[0].message.content);
        const aiGraphResult = JSON.parse(aiData.choices[0].message.content);

        let finalTitle = 'Retained';
        if (isFirstTurn && titleData) {
          const titleResult = JSON.parse(titleData.choices[0].message.content);
          if (titleResult.title && sessionId) {
            await dbService.updateSessionTitle(sessionId, titleResult.title);
            finalTitle = titleResult.title;
          }
        }

        const finalNodes: any[] = [];
        const finalEdges: any[] = [];
        const nodeSeenPhrases = new Set<string>();

        const processNodes = (nodes: any[], source: string) => {
          if (!nodes) return;
          nodes.forEach((n: any) => {
            if (!n.phrase) return;
            const key = n.phrase.trim().toLowerCase();
            if (!nodeSeenPhrases.has(key)) {
              nodeSeenPhrases.add(key);
              finalNodes.push({ ...n, source });
            }
          });
        };

        processNodes(userGraphResult.nodes, 'user');
        processNodes(aiGraphResult.nodes, 'ai');

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

          // 💡 既存の `diagnostic_run` を、より意味のある専用タグ `phrase_extracted` に変更し、抽出結果を記録
          logEvent('phrase_extracted', { 
            payload: { 
              note: 'L2 Split Saved', 
              title: finalTitle, 
              nodes_count: finalNodes.length, 
              extracted_phrases: finalNodes.map(n => n.phrase) // 💡 どんなフレーズが抜かれたかを配列で保存
            } 
          });
        }
      });

    } catch (error: any) {
      logEvent('audio_play_error', { error_message: `L2 Split Extractor Failed: ${error.message}` });
    }
  }
};