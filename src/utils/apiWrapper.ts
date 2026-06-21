// src/utils/apiWrapper.ts
import { apiConfig } from '../config/apiConfig';

export const apiWrapper = {
  execute: async <T>(
    service: 'GEMINI' | 'GROQ' | 'TAVILY',
    isMultimodal: boolean,
    apiCall: () => Promise<T>
  ): Promise<T> => {
    
    // 💡 1. マルチモーダル専用のガードレールチェック
    if (isMultimodal && service === 'GEMINI') {
      const isLocked = localStorage.getItem('GEMINI_MULTIMODAL_LOCKED') === 'true';
      const lockTimestamp = localStorage.getItem('GEMINI_MULTIMODAL_LOCKED_TIMESTAMP');

      if (isLocked) {
        if (!lockTimestamp || Date.now() > parseInt(lockTimestamp, 10)) {
          localStorage.removeItem('GEMINI_MULTIMODAL_LOCKED');
          localStorage.removeItem('GEMINI_MULTIMODAL_LOCKED_UNTIL');
          localStorage.removeItem('GEMINI_MULTIMODAL_LOCKED_TIMESTAMP');
          console.log('🔓 マルチモーダルの制限時間が経過したため、ロックを自動解除しました。');
        } else {
          const lockUntil = localStorage.getItem('GEMINI_MULTIMODAL_LOCKED_UNTIL') || '未定';
          throw new Error(`MULTIMODAL_LIMIT_REACHED:通信が混み合っています。画像解析は ${lockUntil} までお待ちください。`);
        }
      }
    }

    try {
      return await apiCall();
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || '';
      const status = error?.status || error?.response?.status;

      // 💡 2. レートリミットの検知
      const isRateLimited = 
        status === 429 || 
        status === 403 || 
        errorMessage.includes('429') || 
        errorMessage.includes('Too Many Requests') ||
        errorMessage.includes('quota');

      if (isRateLimited) {
        if (isMultimodal && service === 'GEMINI') {
          console.error('🚨 Gemini API(画像解析)が 429 Too Many Requests を返しました。');
          
          const now = new Date();
          // 💡 ロック時間を5分から「1分」に短縮！
          now.setMinutes(now.getMinutes() + 1); 
          
          const timeString = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
          const timestampMs = now.getTime().toString();
          
          localStorage.setItem('GEMINI_MULTIMODAL_LOCKED', 'true');
          localStorage.setItem('GEMINI_MULTIMODAL_LOCKED_UNTIL', timeString);
          localStorage.setItem('GEMINI_MULTIMODAL_LOCKED_TIMESTAMP', timestampMs);
          
          throw new Error(`MULTIMODAL_LIMIT_REACHED:通信が混み合っています。画像解析は ${timeString} までお待ちください。`);
        }

        // 🛡️ 通常会話：シールド発動（バックアップキーへ切り替え）
        console.warn(`⚠️ ${service} で利用制限を検知。バックアップキーに切り替えてリトライします。`);
        apiConfig.markAsDepleted(service);

        try {
          return await apiCall();
        } catch (retryError) {
          console.error(`❌ ${service} のバックアップキーでもエラーが発生しました。`, retryError);
          throw retryError;
        }
      }

      throw error;
    }
  }
};