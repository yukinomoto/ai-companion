// src/services/sttService.ts

export const sttService = {
  transcribe: async (audioBlob: Blob, apiKey: string): Promise<string> => {
    if (!apiKey) {
      throw new Error('Groq API Keyが設定されていません');
    }

    const formData = new FormData();
    // iOS Safariでも動くように拡張子を判定
    const extension = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
    formData.append('file', audioBlob, `audio.${extension}`);
    formData.append('model', 'whisper-large-v3'); // 最高精度のモデルを指定
    formData.append('language', 'ja');            // 処理速度向上のため日本語に固定
    formData.append('temperature', '0.0');        // 幻覚（ハルシネーション）を防ぐために0に設定

    try {
      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.text;
    } catch (error) {
      console.error('STT（音声認識）エラー:', error);
      throw error;
    }
  }
};