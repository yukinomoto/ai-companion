// src/config/apiConfig.ts

// ==========================================
// 📦 1. モデル名・パラメータ定数の一元管理
// ==========================================
export const API_MODELS = {
  GEMINI: {
    PRIMARY: 'gemini-3.1-flash-lite',
    MULTIMODAL: 'gemini-3.5-flash',
  },
  GROQ: {
    L2_EXTRACTOR: 'llama-3.1-8b-instant',
    STT_WHISPER: 'whisper-large-v3',
    TEXT_FIXER: 'llama-3.1-8b-instant',
  },
  GOOGLE_TTS: {
    VOICE_NAME: 'ja-JP-Neural2-B',
  }
};

// ==========================================
// 🔑 2. メイン / バックアップキーの構造化
// ==========================================
const API_KEYS = {
  GEMINI: {
    PRIMARY: import.meta.env.VITE_GEMINI_API_KEY || '',
    SECONDARY: import.meta.env.VITE_GEMINI_API_KEY_SECONDARY || '',
  },
  GROQ: {
    PRIMARY: import.meta.env.VITE_GROQ_API_KEY || '',
    SECONDARY: import.meta.env.VITE_GROQ_API_KEY_SECONDARY || '',
  },
  TAVILY: {
    PRIMARY: import.meta.env.VITE_TAVILY_API_KEY || '',
    SECONDARY: import.meta.env.VITE_TAVILY_API_KEY_SECONDARY || '',
  },
  GOOGLE_TTS: import.meta.env.VITE_GOOGLE_CLOUD_API_KEY || '', // バックアップ不要のため単一化
};

// ==========================================
// 🔄 3. 枯渇状態の管理と動的取得システム
// ==========================================
const depletionFlags = {
  GEMINI: false,
  GROQ: false,
  TAVILY: false,
};

export const apiConfig = {
  // 通常チャット用（枯渇時にセカンダリへ自動切り替え）
  getGeminiApiKey: (): string => depletionFlags.GEMINI ? API_KEYS.GEMINI.SECONDARY : API_KEYS.GEMINI.PRIMARY,
  
  // マルチモーダル専用（常にセカンダリのみを使用）
  getGeminiMultimodalKey: (): string => API_KEYS.GEMINI.SECONDARY,
  
  getGroqApiKey: (): string => depletionFlags.GROQ ? API_KEYS.GROQ.SECONDARY : API_KEYS.GROQ.PRIMARY,
  getTavilyApiKey: (): string => depletionFlags.TAVILY ? API_KEYS.TAVILY.SECONDARY : API_KEYS.TAVILY.PRIMARY,
  getGoogleTtsApiKey: (): string => API_KEYS.GOOGLE_TTS,

  /**
   * エラー検知時にバックアップ系統へ切り替える
   */
  markAsDepleted: (service: 'GEMINI' | 'GROQ' | 'TAVILY') => {
    if (!depletionFlags[service]) {
      depletionFlags[service] = true;
      console.warn(`🚨 【APIシールド発動】${service} の制限を検知したため、バックアップキーへ自動切り替えしました。`);
    }
  },

  resetFlags: () => {
    depletionFlags.GEMINI = false;
    depletionFlags.GROQ = false;
    depletionFlags.TAVILY = false;
    console.log('🔄 API切り替えフラグをメインにリセットしました。');
  }
};