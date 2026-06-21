// src/utils/apiWrapper.ts
import { apiConfig } from '../config/apiConfig';

export const apiWrapper = {
  execute: async <T>(
    service: 'GEMINI' | 'GROQ' | 'TAVILY',
    isMultimodal: boolean,
    apiCall: () => Promise<T>
  ): Promise<T> => {
    
    // 💡 1. マルチモーダル専用のガードレールチェック（自動解除ロジック追加）
    if (isMultimodal && service === 'GEMINI') {
      const isLocked = localStorage.getItem('GEMINI_MULTIMODAL_LOCKED') === 'true';
      const lockTimestamp = localStorage.getItem('GEMINI_MULTIMODAL_LOCKED_TIMESTAMP');

      if (isLocked) {
        // 【救済措置】古いバグでタイムスタンプがない場合、または現在時刻が解除予定を過ぎている場合はロックを破棄
        if (!lockTimestamp || Date.now() > parseInt(lockTimestamp, 10)) {
          localStorage.removeItem('GEMINI_MULTIMODAL_LOCKED');
          localStorage.removeItem('GEMINI_MULTIMODAL_LOCKED_UNTIL');
          localStorage.removeItem('GEMINI_MULTIMODAL_LOCKED_TIMESTAMP');
          console.log('🔓 マルチモーダルの制限時間が経過したため、ロックを自動解除しました。');
        } else {
          // まだ制限時間内の場合はエラーを投げる
          const lockUntil = localStorage.getItem('GEMINI_MULTIMODAL_LOCKED_UNTIL') || '未定';
          throw new Error(`MULTIMODAL_LIMIT_REACHED:利用上限に達したため、画像・音声の解析は ${lockUntil} までご利用いただけません。通常のテキスト会話をご利用ください。`);
        }
      }
    }

    try {
      // API呼び出しを実行
      return await apiCall();
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || '';
      const status = error?.status || error?.response?.status;

      // 💡 2. レートリミット等の検知
      const isRateLimited = 
        status === 429 || 
        status === 403 || 
        errorMessage.includes('429') || 
        errorMessage.includes('Too Many Requests') ||
        errorMessage.includes('quota');

      if (isRateLimited) {
        if (isMultimodal && service === 'GEMINI') {
          // 🛑 マルチモーダルの枯渇ロック処理（時間判定用のタイムスタンプを一緒に保存）
          const now = new Date();
          now.setMinutes(now.getMinutes() + 5); // 再開目安として5分後を設定
          
          const timeString = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
          const timestampMs = now.getTime().toString(); // 💡 絶対時間のミリ秒
          
          localStorage.setItem('GEMINI_MULTIMODAL_LOCKED', 'true');
          localStorage.setItem('GEMINI_MULTIMODAL_LOCKED_UNTIL', timeString);
          localStorage.setItem('GEMINI_MULTIMODAL_LOCKED_TIMESTAMP', timestampMs);
          
          throw new Error(`MULTIMODAL_LIMIT_REACHED:利用上限に達したため、画像・音声の解析は ${timeString} までご利用いただけません。`);
        }

        // 🛡️ 通常会話：シールド発動
        console.warn(`⚠️ ${service} で利用制限を検知。バックアップキーに切り替えてリトライします。`);
        apiConfig.markAsDepleted(service);

        try {
          // 切り替わった新しいキーの状態で再度API処理を実行
          return await apiCall();
        } catch (retryError) {
          console.error(`❌ ${service} のバックアップキーでもエラーが発生しました。`, retryError);
          throw retryError;
        }
      }

      // 制限以外の一般的なエラーはそのまま返す
      throw error;
    }
  }
};