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
  async fixText(rawText: string): Promise<string> {
    if (!rawText.trim()) return rawText;
    const logEvent = useLoggerStore.getState().logEvent;

    // 1. dbService経由で辞書取得（ペアと単体ヒントの両方を受け取る）
    const { pairs, hints } = await dbService.getPhraseCorrections();
    
    // 2. Groq API で補正
    try {
      // 💡 ペアによる絶対ルールと、単独ワードによる推測ヒントの2段構えで辞書テキストを構築
      const pairStrings = pairs.map(p => `・「${p.alias_phrase}」と聞こえたら「${p.canonical_phrase}」に強制置換する`);
      const rulesText = pairStrings.length > 0 ? `\n【強制置換ルール】\n${pairStrings.join('\n')}` : '';
      const hintsText = hints.length > 0 ? `\n【頻出ワード（この表記・漢字を優先的に当てはめてください）】\n${hints.join(', ')}` : '';
      
      const dictionaryString = rulesText + hintsText;
      const systemPrompt = `${SYSTEM_PROMPTS.TEXT_FIXER}${dictionaryString}`;

      // 🛡️ シールド発動：Groqの通信をラッパーで保護
      const fixedText = await apiWrapper.execute('GROQ', false, async () => {
        const currentGroqKey = apiConfig.getGroqApiKey();
        if (!currentGroqKey) throw new Error('Groq API Key is missing');

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentGroqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: API_MODELS.GROQ.TEXT_FIXER,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: rawText }],
            temperature: TEMPERATURE,
            max_tokens: MAX_TOKENS
          })
        });

        if (!response.ok) {
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
      return rawText; 
    }
  }
};