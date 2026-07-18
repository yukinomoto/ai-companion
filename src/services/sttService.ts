// src/services/sttService.ts
import { apiConfig, API_MODELS } from '../config/apiConfig';
import { apiWrapper } from '../utils/apiWrapper';

export const sttService = {
  // 💡 修正: 第2引数に文脈キーワード（単語帳）を受け取れるように追加
  transcribe: async (audioBlob: Blob, contextKeywords: string[] = []): Promise<string> => {
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

    // 💡 追加: Whisperに渡す「カンペ（単語帳）」を作成して prompt にセット
    const defaultKeywords = ['MA-i', 'AppSheet', 'Gemini', 'ユウキ', 'Supabase'];
    const mergedKeywords = [...new Set([...defaultKeywords, ...contextKeywords])];
    formData.append('prompt', mergedKeywords.join(', ')); 

    try {
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
          throw Object.assign(new Error(`Groq API Error (${response.status}): ${errorText}`), { status: response.status });
        }

        const data = await response.json();
        return data.text.trim();
      });

      const cleanText = text.replace(/[、。！？.!?. ]/g, '');
      const singleWordHallucinations = [
        'こんにちは', 'はい', 'はじめまして', 'ありがとうございます', 'お疲れ様でした'
      ];
      const hallucinationWords = [
        'ご視聴ありがとうございました', '字幕', 'サブタイトル', '無音', 'MBC'
      ];
      
      const loopMatch = text.match(/(.{3,})\1{1,}/);
      let hasWhisperLoop = false;
      if (loopMatch) {
        const loopLength = loopMatch[0].length; 
        const totalLength = text.length;        
        if (totalLength < 30 || (loopLength / totalLength) > 0.4) {
          hasWhisperLoop = true;
        }
      }

      if (
        text.length <= 1 || 
        hallucinationWords.some(word => text.includes(word)) || 
        singleWordHallucinations.includes(cleanText) || 
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