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

// 💡 記憶抽出用のJSONスキーマ
const memorySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    memories: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          content: { type: Type.STRING },
          category: { type: Type.STRING }
        },
        required: ["content", "category"]
      }
    }
  },
  required: ["memories"]
};

export const aiService = {
  // Tavilyによる外部Web検索
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

  // 💡 パイプラインの実行（超記憶の読み込み・書き込みを完全統合）
  runPipeline: async (
    model: string,
    ai: GoogleGenAI,
    userText: string,
    chatContextText: string,
    tavilyKey: string,
    longTermMemories: string[], // データベースから読み込んだ超記憶の配列
    onApi1Complete: (result: { quick_response: string; user_display_text: string; requires_search: boolean; corrected_query: string }) => void,
    onApi3Complete: (finalAnswer: string) => void,
    onMemoryExtracted: (extracted: { content: string; category: string }[]) => void // 記憶抽出時のコールバック
  ) => {
    // 1. API 1 (受付モジュール) の実行 ➔ 爆速で相槌を取得
    const api1Response = await ai.models.generateContent({
      model,
      contents: `【記憶】\n${chatContextText}\n【入力】\n"${userText}"`,
      config: { systemInstruction: SYSTEM_PROMPTS.RECEIVER, responseMimeType: "application/json", responseSchema: api1Schema }
    });
    const api1Result = JSON.parse(api1Response.text || '{}');
    onApi1Complete(api1Result); // ここで即座に相槌が画面に反映される

    // 2. 必要なら外部検索を実行
    let webContext = "（未実行）";
    if (api1Result.requires_search) {
      webContext = await aiService.searchWeb(api1Result.corrected_query, tavilyKey);
    }

    // 3. API 2 (推論モジュール) の実行 ➔ 脳内から【超記憶】のテキストデータをインプットに混ぜる！
    const memoriesContext = longTermMemories.length > 0 
      ? longTermMemories.map(m => `- ${m}`).join('\n') 
      : '（過去の記憶はまだありません）';

    const api2Response = await ai.models.generateContent({
      model,
      contents: `【長期記憶（重要ファクト）】\n${memoriesContext}\n\n【会話文脈】\n${chatContextText}\n\n【検索結果】\n${webContext}\n\n【ユーザーの入力】\n"${api1Result.corrected_query}"`,
      config: { systemInstruction: SYSTEM_PROMPTS.THINKER }
    });

    // 4. API 3 (編集長による最終監査) ➔ ハルシネーションやメタ発言を徹底排除
    const api3Response = await ai.models.generateContent({
      model,
      contents: `【ドラフト】\n"${api2Response.text}"\n--- 前提データ ---\n【直前の相槌】\n"${api1Result.quick_response}"`,
      config: { systemInstruction: SYSTEM_PROMPTS.EDITOR }
    });
    const finalAnswer = api3Response.text || '言葉にまとめられなかった。';
    onApi3Complete(finalAnswer); // メイン回答の確定・描画

    // 5. 💡 API 4 (超記憶の自動抽出) ➔ 今回の会話から残すべき記憶をバックグラウンドでパース
    try {
      const api4Response = await ai.models.generateContent({
        model,
        contents: `【今回の会話】\nUser: ${api1Result.user_display_text}\nAI: ${finalAnswer}`,
        config: { systemInstruction: SYSTEM_PROMPTS.EXTRACTOR, responseMimeType: "application/json", responseSchema: memorySchema }
      });
      const api4Result = JSON.parse(api4Response.text || '{}');
      if (api4Result.memories && api4Result.memories.length > 0) {
        onMemoryExtracted(api4Result.memories); // 抽出された記憶をデータベースに引き渡す
      }
    } catch (e) {
      console.error("記憶の抽出に失敗しました:", e);
    }
  }
};