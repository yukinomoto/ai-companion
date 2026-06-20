// src/services/sttService.ts

export const sttService = {
  transcribe: async (audioBlob: Blob, apiKey: string): Promise<string> => {
    if (!apiKey) {
      throw new Error('Groq API Keyが設定されていません');
    }

    // 💡 対策A: そもそもファイルサイズが小さすぎる（ノイズすらない）場合は即座に弾く
    if (audioBlob.size < 1000) { 
      console.warn('STT: 音声データが小さすぎるため送信をブロックしました。');
      return '';
    }

    const formData = new FormData();
    const extension = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
    formData.append('file', audioBlob, `audio.${extension}`);
    formData.append('model', 'whisper-large-v3'); 
    formData.append('language', 'ja');
    formData.append('temperature', '0.0'); 

    try {
      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const text = data.text.trim();

      // 💡 対策B: 無音時の定番「幻覚単体」ブラックリスト（完全一致で弾く）
      // ユーザーが本気で「こんにちは」と言った時は2文字以上（「こんにちは！」や前後の文脈）になることが多いため、
      // 記号を取り除いた純粋な文字列がこれら「1単語のみ」の場合は無音の幻覚とみなします。
      const cleanText = text.replace(/[、。！？.!?. ]/g, '');
      const singleWordHallucinations = [
        'こんにちは', 'はい', 'はじめまして', 'ありがとうございます', 'お疲れ様でした'
      ];

      // 定番のシステム幻覚ワード
      const hallucinationWords = [
        'ご視聴ありがとうございました', '字幕', 'サブタイトル', '無音', 'MBC'
      ];
      
      const hasWhisperLoop = /(.{3,})\1{1,}/.test(text);

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
      throw error;
    }
  }
};