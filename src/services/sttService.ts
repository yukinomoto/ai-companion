// src/services/sttService.ts
import { apiConfig, API_MODELS } from '../config/apiConfig';
import { apiWrapper } from '../utils/apiWrapper';

export const sttService = {
  transcribe: async (audioBlob: Blob): Promise<string> => {
    // 💡 対策A: そもそもファイルサイズが小さすぎる（ノイズすらない）場合は即座に弾く
    if (audioBlob.size < 1000) { 
      console.warn('STT: 音声データが小さすぎるため送信をブロックしました。');
      return '';
    }

    const formData = new FormData();
    const extension = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
    formData.append('file', audioBlob, `audio.${extension}`);
    formData.append('model', API_MODELS.GROQ.STT_WHISPER);
    formData.append('language', 'ja');
    formData.append('temperature', '0.0'); 

    try {
      // 🛡️ シールド発動：Groqの通信をラッパーで保護
      const text = await apiWrapper.execute('GROQ', false, async () => {
        const currentGroqKey = apiConfig.getGroqApiKey();
        if (!currentGroqKey) {
          throw new Error('Groq API Keyが設定されていません');
        }

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentGroqKey}` },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          // 429エラー等をラッパーに検知させるためにステータスを付与してthrow
          throw Object.assign(new Error(`Groq API Error (${response.status}): ${errorText}`), { status: response.status });
        }

        const data = await response.json();
        return data.text.trim();
      });

      // 💡 対策B: 無音時の定番「幻覚単体」ブラックリスト（完全一致で弾く）
      const cleanText = text.replace(/[、。！？.!?. ]/g, '');
      const singleWordHallucinations = [
        'こんにちは', 'はい', 'はじめまして', 'ありがとうございます', 'お疲れ様でした'
      ];

      // 定番のシステム幻覚ワード
      const hallucinationWords = [
        'ご視聴ありがとうございました', '字幕', 'サブタイトル', '無音', 'MBC'
      ];
      
      // 💡 修正: トータルの文字数と「占有率」を組み合わせた、賢いループ検知
      const loopMatch = text.match(/(.{3,})\1{1,}/);
      let hasWhisperLoop = false;

      if (loopMatch) {
        const loopLength = loopMatch[0].length; // 繰り返された部分の合計文字数
        const totalLength = text.length;        // トータルの文字数

        // 【条件】以下のどちらかを満たした場合のみ、Whisperの無限ループバグとみなす
        // 1. トータルの文字数が極端に短い（30文字未満）のにループしている
        // 2. 長文であっても、ループ部分が全体の「40%以上」を占めている
        if (totalLength < 30 || (loopLength / totalLength) > 0.4) {
          hasWhisperLoop = true;
        }
      }

      if (
        text.length <= 1 || 
        hallucinationWords.some(word => text.includes(word)) || 
        singleWordHallucinations.includes(cleanText) || // 💡 単体挨拶のブロック
        hasWhisperLoop
      ) {
        console.warn('STT: 幻覚・自動生成された挨拶を検知したため破棄しました。:', text);
        return ''; 
      }

      return text;
    } catch (error) {
      console.error('STT（音声認識）エラー:', error);
      throw error; // ここで投げられたエラーは呼び出し元で処理される
    }
  }
};