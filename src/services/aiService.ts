import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { SYSTEM_PROMPTS } from '../prompts';

const api1Schema: Schema = {
  type: Type.OBJECT,
  properties: {
    quick_response: { type: Type.STRING },
    user_display_text: { type: Type.STRING },
    corrected_query: { type: Type.STRING },
    requires_search: { type: Type.BOOLEAN }
  },
  required: ["quick_response", "user_display_text", "corrected_query", "requires_search"],
};

// 💡 interests を追加した最強のスキーマ
// 💡 拡張されたDBスキーマに対応した抽出スキーマ
const memorySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    memories: { 
      type: Type.ARRAY, 
      items: { 
        type: Type.OBJECT, 
        properties: { 
          content: { type: Type.STRING }, 
          category: { type: Type.STRING },
          importance: { type: Type.INTEGER }, // 追加
          memory_type: { type: Type.STRING }, // 追加
          allow_small_talk: { type: Type.BOOLEAN } // 追加
        } 
      } 
    },
    follow_ups: { 
      type: Type.ARRAY, 
      items: { 
        type: Type.OBJECT, 
        properties: { 
          topic: { type: Type.STRING }, 
          context: { type: Type.STRING }, 
          is_resolved: { type: Type.BOOLEAN },
          target_date: { type: Type.STRING } // 追加
        } 
      } 
    },
    user_dictionary: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { term: { type: Type.STRING }, meaning: { type: Type.STRING } } } },
    interests: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { topic: { type: Type.STRING } } } }
  }
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
    interests: string[], // 💡 引数追加
    onApi1Complete: (result: { quick_response: string; user_display_text: string; requires_search: boolean; corrected_query: string }) => void,
    onApi3Complete: (finalAnswer: string) => void,
    onMemoryExtracted: (extracted: any) => void
  ) => {
    
    const now = new Date();
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const currentDateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${days[now.getDay()]}) ${now.getHours()}時${now.getMinutes()}分`;

    const memoriesContext = longTermMemories.length > 0 ? longTermMemories.map(m => `- ${m}`).join('\n') : 'なし';
    const followUpsContext = followUps.length > 0 ? followUps.map(f => `- ${f}`).join('\n') : 'なし';
    const dictContext = dictionary.length > 0 ? dictionary.map(d => `- ${d}`).join('\n') : 'なし';
    const interestsContext = interests.length > 0 ? interests.map(i => `- ${i}`).join('\n') : 'なし'; // 💡 追加

    const api1Response = await ai.models.generateContent({
      model,
      contents: `【現在日時】\n${currentDateStr}\n\n【ユーザーに関する長期記憶】\n${memoriesContext}\n【未解決の話題】\n${followUpsContext}\n【ユーザー辞書】\n${dictContext}\n【ユーザーの興味・関心】\n${interestsContext}\n\n【会話履歴】\n${chatContextText}\n\n【入力】\n"${userText}"`,
      config: { systemInstruction: SYSTEM_PROMPTS.RECEIVER, responseMimeType: "application/json", responseSchema: api1Schema }
    });
    const api1Result = JSON.parse(api1Response.text || '{}');
    onApi1Complete(api1Result);

    let webContext = "（未実行）";
    if (api1Result.requires_search) {
      webContext = await aiService.searchWeb(api1Result.corrected_query, tavilyKey);
    }

    const api2Response = await ai.models.generateContent({
      model,
      contents: `【現在日時】\n${currentDateStr}\n\n【ユーザーに関する長期記憶】\n${memoriesContext}\n【未解決の話題】\n${followUpsContext}\n【ユーザー辞書】\n${dictContext}\n【ユーザーの興味・関心】\n${interestsContext}\n\n【会話文脈】\n${chatContextText}\n【検索結果】\n${webContext}\n\n【あなたが直前に返した相槌】\n"${api1Result.quick_response}"\n\n【ユーザーの入力】\n"${api1Result.corrected_query}"`,
      config: { systemInstruction: SYSTEM_PROMPTS.THINKER }
    });

    const api3Response = await ai.models.generateContent({
      model,
      contents: `【ドラフト】\n"${api2Response.text}"\n--- 前提データ ---\n【直前の相槌】\n"${api1Result.quick_response}"`,
      config: { systemInstruction: SYSTEM_PROMPTS.EDITOR }
    });
    const finalAnswer = api3Response.text || '言葉にまとめられなかった。';
    onApi3Complete(finalAnswer);

    try {
      const api4Response = await ai.models.generateContent({
        model,
        contents: `【現在日時】\n${currentDateStr}\n\n【これまでの会話文脈】\n${chatContextText}\n\n【今回のユーザーの実際の発言】\n"${userText}"\n\n【今回のAIの最終回答】\n"${finalAnswer}"`,
        config: { systemInstruction: SYSTEM_PROMPTS.EXTRACTOR, responseMimeType: "application/json", responseSchema: memorySchema }
      });
      const api4Result = JSON.parse(api4Response.text || '{}');
      console.log("🧠 記憶抽出AIの結果:", api4Result);
      onMemoryExtracted(api4Result);
    } catch (e) {
      console.error("記憶の抽出に失敗しました:", e);
    }
  }
};