// src/services/sttService.ts
export const sttService = {
  transcribe: async (audioBlob: Blob, apiKey: string): Promise<string> => {
    if (!apiKey) {
      throw new Error('Groq API Keyが設定されていません');
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
      const text = data.text.trim();

      // 💡 幻覚（Hallucination）ガード処理
      const hallucinationWords = [
        'ご視聴ありがとうございました', '字幕', 'サブタイトル', 'お疲れ様でした', '無音', 'MBC'
      ];
      
      if (text.length <= 1 || hallucinationWords.some(word => text.includes(word))) {
        console.warn('STT: 無音または幻覚を検知したためテキストを破棄しました。', text);
        return ''; 
      }

      return text;
    } catch (error) {
      console.error('STT（音声認識）エラー:', error);
      throw error;
    }
  }
};