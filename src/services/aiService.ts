// src/services/aiService.ts
import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { SYSTEM_PROMPTS } from '../prompts';

const api1Schema: Schema = {
  type: Type.OBJECT,
  properties: {
    thought_process: { type: Type.STRING },
    is_completed: { type: Type.BOOLEAN },
    emotion: { type: Type.STRING },
    user_display_text: { type: Type.STRING },
    corrected_query: { type: Type.STRING },
    requires_search: { type: Type.BOOLEAN },
    quick_response: { type: Type.STRING }
  },
  required: ["thought_process", "is_completed", "emotion", "user_display_text", "corrected_query", "requires_search", "quick_response"],
};

const api3Schema: Schema = {
  type: Type.OBJECT,
  properties: {
    final_answer: { type: Type.STRING },
    emotion: { type: Type.STRING },
    memories: { 
      type: Type.ARRAY, 
      items: { type: Type.OBJECT, properties: { content: { type: Type.STRING }, category: { type: Type.STRING }, importance: { type: Type.INTEGER }, memory_type: { type: Type.STRING }, allow_small_talk: { type: Type.BOOLEAN } } } 
    },
    follow_ups: { 
      type: Type.ARRAY, 
      items: { type: Type.OBJECT, properties: { topic: { type: Type.STRING }, context: { type: Type.STRING }, is_resolved: { type: Type.BOOLEAN }, target_date: { type: Type.STRING } } } 
    },
    user_dictionary: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { term: { type: Type.STRING }, meaning: { type: Type.STRING } } } },
    interests: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { topic: { type: Type.STRING } } } }
  },
  required: ["final_answer", "emotion"]
};

export const aiService = {
  searchWeb: async (query: string, apiKey: string): Promise<string> => {
    if (!apiKey) return "（検索APIキー未設定）";
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, query, search_depth: "basic", include_answer: false })
      });
      const data = await response.json();
      return data.results.map((r: any) => `[情報源: ${r.title}] ${r.content}`).join('\n\n');
    } catch (err) { return "（検索失敗）"; }
  },

  runPipeline: async (
    model: string,
    ai: GoogleGenAI,
    userText: string,
    chatContextText: string,
    tavilyKey: string,
    longTermMemories: string[],
    followUps: string[],
    dictionary: string[],
    interests: string[],
    onApi1Complete: (result: { quick_response: string; emotion?: string; is_completed: boolean; user_display_text: string; requires_search: boolean; corrected_query: string }) => void,
    onFinalComplete: (result: any, isCompleted: boolean) => void
  ) => {
    const now = new Date();
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const currentDateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${days[now.getDay()]}) ${now.getHours()}時${now.getMinutes()}分`;

    const memoriesContext = longTermMemories.length > 0 ? longTermMemories.map(m => `- ${m}`).join('\n') : 'なし';
    const followUpsContext = followUps.length > 0 ? followUps.map(f => `- ${f}`).join('\n') : 'なし';
    const dictContext = dictionary.length > 0 ? dictionary.map(d => `- ${d}`).join('\n') : 'なし';
    const interestsContext = interests.length > 0 ? interests.map(i => `- ${i}`).join('\n') : 'なし';

    // ── STEP 1: フロント対応 (RECEIVER) ──
    const api1Response = await ai.models.generateContent({
      model,
      contents: `【現在日時】\n${currentDateStr}\n\n【ユーザーに関する長期記憶】\n${memoriesContext}\n【未解決の話題】\n${followUpsContext}\n【ユーザー辞書】\n${dictContext}\n【ユーザーの興味・関心】\n${interestsContext}\n\n【会話履歴】\n${chatContextText}\n\n【入力】\n"${userText}"`,
      config: { systemInstruction: SYSTEM_PROMPTS.RECEIVER, responseMimeType: "application/json", responseSchema: api1Schema }
    });
    const api1Result = JSON.parse(api1Response.text || '{}');
    console.log("🤔 思考プロセス:", api1Result.thought_process);
    
    onApi1Complete(api1Result);

    // ── STEP 2: 本回答の原稿作成 (THINKER) ※未完結時のみ ──
    let draftText = api1Result.quick_response;
    if (!api1Result.is_completed) {
      let webContext = "（未実行）";
      if (api1Result.requires_search) {
        webContext = await aiService.searchWeb(api1Result.corrected_query, tavilyKey);
      }
      const api2Response = await ai.models.generateContent({
        model,
        contents: `【現在日時】\n${currentDateStr}\n\n【ユーザーに関する長期記憶】\n${memoriesContext}\n【未解決の話題】\n${followUpsContext}\n【ユーザー辞書】\n${dictContext}\n【ユーザーの興味・関心】\n${interestsContext}\n\n【会話文脈】\n${chatContextText}\n【検索結果】\n${webContext}\n\n【直前の相槌】\n"${api1Result.quick_response}"\n\n【ユーザーの入力】\n"${api1Result.corrected_query}"`,
        config: { systemInstruction: SYSTEM_PROMPTS.THINKER }
      });
      draftText = api2Response.text || '';
    }

    // ── STEP 3: 最終監査 ＆ 記憶抽出 (EDITOR_AND_EXTRACTOR) ※必ず実行 ──
    try {
      const api3Response = await ai.models.generateContent({
        model,
        // 💡 記憶の重複を防ぐため、ここで【現在の長期記憶】をカンペとして渡す
        contents: `【現在日時】\n${currentDateStr}\n\n【現在の長期記憶】\n${memoriesContext}\n\n【これまでの会話文脈】\n${chatContextText}\n\n【ユーザーの発言】\n"${userText}"\n\n【直前の相槌】\n"${api1Result.quick_response}"\n\n【監査対象の回答原稿】\n"${draftText}"`,
        config: { systemInstruction: SYSTEM_PROMPTS.EDITOR_AND_EXTRACTOR, responseMimeType: "application/json", responseSchema: api3Schema }
      });
      const api3Result = JSON.parse(api3Response.text || '{}');
      console.log("🧠 監査＆記憶抽出:", api3Result);
      
      onFinalComplete(api3Result, api1Result.is_completed);
    } catch (e) {
      console.error("監査・抽出パイプラインでエラーが発生:", e);
    }
  }
};