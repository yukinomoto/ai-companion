// src/utils/textNormalizer.ts

export const textNormalizer = {
  /**
   * 表記揺れを機械的に吸収し、比較用の正規化文字列を生成する
   */
  normalizePhrase: (phrase: string): string => {
    if (!phrase) return '';
    
    return phrase
      .trim()
      .toLowerCase() // 大文字を小文字に (GEMINI -> gemini)
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => 
        String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
      ) // 全角英数字を半角に (ＡＩ -> AI)
      .replace(/[\s ]+/g, '') // 全角・半角スペースを完全に除去
      .replace(/[〜～]/g, 'ー') // 波線を長音記号に統一
      .replace(/[・点]/g, ''); // 中黒などのノイズ記号を除去 (MA・i -> MAi)
  }
};