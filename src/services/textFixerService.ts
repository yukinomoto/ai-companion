// src/services/textFixerService.ts
import { dbService } from './dbService';
import { SYSTEM_PROMPTS } from '../prompts';
import { useLoggerStore } from '../store/useLoggerStore';
import { apiConfig, API_MODELS } from '../config/apiConfig';
import { apiWrapper } from '../utils/apiWrapper';

// ⚙️ 定数定義
const TEMPERATURE = 0.1;
const MAX_TOKENS = 1024;

export const textFixerService = {
  async fixText(rawText: string, groqApiKey: string): Promise<string> {
    if (!rawText.trim()) return rawText;
    const logEvent = useLoggerStore.getState().logEvent;

    let correctionPairs: string[] = [];

    // 1. dbService経由で辞書取得
    const data = await dbService.getPhraseCorrections();
    correctionPairs = data.map(item => `・「${item.alias_phrase}」と聞こえたら「${item.canonical_phrase}」に強制置換する`);

    // 2. Groq API で補正
    try {
      const dictionaryString = correctionPairs.length > 0 
        ? `\n【強制置換辞書】\n${correctionPairs.join('\n')}` 
        : '';
      const systemPrompt = `${SYSTEM_PROMPTS.TEXT_FIXER}${dictionaryString}`;

      // 🛡️ シールド発動：Groqの通信をラッパーで保護
      const fixedText = await apiWrapper.execute('GROQ', false, async () => {
        // 💡 引数の apiKey ではなく、リトライ時に自動で切り替わる apiConfig の最新キーを使用する
        const currentGroqKey = apiConfig.getGroqApiKey();
        if (!currentGroqKey) throw new Error('Groq API Key is missing');

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentGroqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: API_MODELS.GROQ.TEXT_FIXER, // 💡 定数を利用
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: rawText }],
            temperature: TEMPERATURE,
            max_tokens: MAX_TOKENS
          })
        });

        if (!response.ok) {
          // 429エラー等をラッパーに検知させるためにステータスを付与してthrow
          throw Object.assign(new Error(`Groq Error: ${response.status}`), { status: response.status });
        }

        const resData = await response.json();
        return resData.choices?.[0]?.message?.content?.trim();
      });

      if (fixedText) {
        logEvent('diagnostic_run', { payload: { note: 'Text Fixed', original: rawText, fixed: fixedText } });
        return fixedText;
      }
      return rawText;
    } catch (error: any) {
      logEvent('audio_play_error', { error_message: `Text Fixer Failed: ${error.message}` });
      return rawText; // エラー時（セカンダリキーも枯渇等）は元のテキストをそのまま返す（フェイルセーフ）
    }
  }
};