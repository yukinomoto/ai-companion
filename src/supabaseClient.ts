import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("【警告】Supabaseの環境変数が設定されていません。.env.local を確認してください。");
}

// Reactアプリ全体で共有するSupabaseクライアントのインスタンスをエクスポート
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');