// src/utils/apiWrapper.ts
import { apiConfig } from '../config/apiConfig';

export const apiWrapper = {
  /**
   * API呼び出しを安全に実行し、制限（429等）に達した場合は自動でバックアップキーに切り替えてリトライする
   * @param service サービス名 (GEMINI, GROQ, TAVILY)
   * @param isMultimodal マルチモーダル専用モードか否か
   * @param apiCall 実際にAPIを叩く処理（Promiseを返す関数）
   */
  execute: async <T>(
    service: 'GEMINI' | 'GROQ' | 'TAVILY',
    isMultimodal: boolean,
    apiCall: () => Promise<T>
  ): Promise<T> => {
    
    // 💡 1. マルチモーダル専用のガードレールチェック
    if (isMultimodal && service === 'GEMINI') {
      if (localStorage.getItem('GEMINI_MULTIMODAL_LOCKED') === 'true') {
        const lockUntil = localStorage.getItem('GEMINI_MULTIMODAL_LOCKED_UNTIL') || '未定';
        throw new Error(`MULTIMODAL_LIMIT_REACHED:利用上限に達したため、画像・音声の解析は ${lockUntil} までご利用いただけません。通常のテキスト会話をご利用ください。`);
      }
    }

    try {
      // API呼び出しを実行
      return await apiCall();
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || '';
      const status = error?.status || error?.response?.status;

      // 💡 2. レートリミット（429）または クレジット切れ（403, Tavily等）の検知
      const isRateLimited = 
        status === 429 || 
        status === 403 || 
        errorMessage.includes('429') || 
        errorMessage.includes('Too Many Requests') ||
        errorMessage.includes('quota');

      if (isRateLimited) {
        if (isMultimodal && service === 'GEMINI') {
          // 🛑 マルチモーダルの枯渇ロック処理
          const now = new Date();
          now.setMinutes(now.getMinutes() + 5); // 再開目安として5分後を設定
          const timeString = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
          
          localStorage.setItem('GEMINI_MULTIMODAL_LOCKED', 'true');
          localStorage.setItem('GEMINI_MULTIMODAL_LOCKED_UNTIL', timeString);
          
          throw new Error(`MULTIMODAL_LIMIT_REACHED:利用上限に達したため、画像・音声の解析は ${timeString} までご利用いただけません。`);
        }

        // 🛡️ 通常会話：シールド発動（キーを切り替えて1度だけリトライ）
        console.warn(`⚠️ ${service} で利用制限を検知。バックアップキーに切り替えてリトライします。`);
        apiConfig.markAsDepleted(service);

        try {
          // 切り替わった新しいキーの状態で、再度API処理を実行
          return await apiCall();
        } catch (retryError) {
          console.error(`❌ ${service} のバックアップキーでもエラーが発生しました。`, retryError);
          throw retryError;
        }
      }

      // 制限以外の一般的なエラー（ネットワークエラー等）はそのまま返す
      throw error;
    }
  }
};