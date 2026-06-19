// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("【警告】Supabaseの環境変数が設定されていません。.env を確認してください。");
}

// インスタンスをエクスポート
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');