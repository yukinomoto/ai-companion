// src/services/textFixerService.ts
import { dbService } from './dbService';
import { SYSTEM_PROMPTS } from '../prompts';
import { useLoggerStore } from '../store/useLoggerStore';

// ⚙️ 定数定義
const LLAMA_MODEL = 'llama-3.1-8b-instant';
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

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LLAMA_MODEL,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: rawText }],
          temperature: TEMPERATURE,
          max_tokens: MAX_TOKENS
        })
      });

      if (!response.ok) throw new Error(`Groq Error: ${response.status}`);

      const resData = await response.json();
      const fixedText = resData.choices?.[0]?.message?.content?.trim();

      if (fixedText) {
        logEvent('diagnostic_run', { payload: { note: 'Text Fixed', original: rawText, fixed: fixedText } });
        return fixedText;
      }
      return rawText;
    } catch (error: any) {
      logEvent('audio_play_error', { error_message: `Text Fixer Failed: ${error.message}` });
      return rawText;
    }
  }
};