// src/services/textFixerService.ts
import { dbService } from './dbService';
import { SYSTEM_PROMPTS } from '../prompts';
import { useLoggerStore } from '../store/useLoggerStore';
import { apiConfig, API_MODELS } from '../config/apiConfig';
import { apiWrapper } from '../utils/apiWrapper';

// ⚙️ 定数定義
const TEMPERATURE = 0.1;
const MAX_TOKENS = 1024;

// 💡 追加: Whisper特有の無音時幻聴パターン
const WHISPER_HALLUCINATIONS = [
  "ご視聴ありがとうございました",
  "ご視聴いただきありがとうございました",
  "チャンネル登録お願いします",
  "チャンネル登録と高評価",
  "サブスクリプション",
  "お疲れ様でした",
];

export const textFixerService = {
  async fixText(rawText: string): Promise<string> {
    const trimmedText = rawText.trim();
    if (!trimmedText) return '';

    const logEvent = useLoggerStore.getState().logEvent;

    // ==========================================
    // STEP 1: プログラム（コード）による事前処理
    // ==========================================
    // 1-1. 短すぎる発話（3文字以下）はAIを通さずそのまま返す
    if (trimmedText.length <= 3) return trimmedText;

    // 1-2. 幻聴フィルター（安全設計）
    if (trimmedText.length <= 30) {
      const cleanText = trimmedText.replace(/[。、.\s]/g, '');
      
      if (cleanText.startsWith('字幕') || cleanText.endsWith('字幕')) {
        console.log('🛡️ TextFixer: 字幕ノイズをブロックしました', trimmedText);
        return '';
      }

      const isHallucination = WHISPER_HALLUCINATIONS.some(pattern => 
        cleanText.includes(pattern)
      );

      if (isHallucination) {
        console.log('🛡️ TextFixer: Whisperの幻聴をブロックしました', trimmedText);
        return '';
      }
    }

    // ==========================================
    // STEP 2: 辞書の取得とAIによる補正
    // ==========================================
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

      // 💡 追加: ユーザー入力を明確にデータとして隔離
      const userMessageContent = `<input_text>\n${trimmedText}\n</input_text>`;

      // 🛡️ シールド発動：Groqの通信をラッパーで保護
      const rawContent = await apiWrapper.execute('GROQ', false, async () => {
        const currentGroqKey = apiConfig.getGroqApiKey();
        if (!currentGroqKey) throw new Error('Groq API Key is missing');

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentGroqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: API_MODELS.GROQ.TEXT_FIXER,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessageContent }],
            temperature: TEMPERATURE,
            max_tokens: MAX_TOKENS
          })
        });

        if (!response.ok) {
          throw Object.assign(new Error(`Groq Error: ${response.status}`), { status: response.status });
        }

        const resData = await response.json();
        return resData.choices?.[0]?.message?.content || "";
      });

      // 💡 正規表現で <fixed> タグの中身だけを抽出
      const match = rawContent.match(/<fixed>([\s\S]*?)<\/fixed>/);
      let fixedText = "";
      
      if (match && match[1]) {
        fixedText = match[1].trim();
      } else {
        // 万が一LLMがタグを忘れた場合のフォールバック
        fixedText = rawContent.replace(/<fixed>|<\/fixed>/g, '').trim();
      }

      // 💡 念のための長文暴走チェック（原文の1.5倍+10文字以上の長さになっていたら暴走とみなす）
      if (fixedText.length > trimmedText.length * 1.5 + 10) {
        console.warn("TEXT_FIXER 暴走検知: 長文が生成されたため原文を採用します", fixedText);
        fixedText = trimmedText; // 暴走時は安全のため原文にフォールバック
      }

      if (fixedText) {
        logEvent('diagnostic_run', { payload: { note: 'Text Fixed', original: trimmedText, fixed: fixedText } });
        return fixedText;
      }
      return trimmedText;
    } catch (error: any) {
      logEvent('audio_play_error', { error_message: `Text Fixer Failed: ${error.message}` });
      return trimmedText; 
    }
  }
};