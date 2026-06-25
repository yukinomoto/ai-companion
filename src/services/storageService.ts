// src/services/storageService.ts
import { supabase } from '../lib/supabase';

export const storageService = {
  // ファイルをアップロードし、保存先のパスを返す
  async uploadFile(file: File, userId: string): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('attachments')
      .upload(fileName, file);

    if (error) {
      console.error('Storage Upload Error:', error);
      throw new Error('ファイルのアップロードに失敗しました');
    }

    return data.path;
  },

  // ユーザーがファイルを再度確認する際の一時的なダウンロードURLを取得
  async getSignedUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(path, 3600); // 1時間有効

    if (error || !data) {
      throw new Error('ファイルURLの取得に失敗しました');
    }

    return data.signedUrl;
  }
};