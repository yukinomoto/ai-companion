import { supabase } from '../supabaseClient';
import type { ChatSession, Message } from '../hooks/useCompanionChat';

export const dbService = {
  // セッション一覧の読み込み
  getSessions: async (): Promise<ChatSession[]> => {
    const { data, error } = await supabase.from('chat_messages').select('session_id, text, created_at, sender').order('created_at', { ascending: true });
    if (error || !data) return [];
    
    const uniqueSessions: { [key: string]: ChatSession } = {};
    data.forEach(item => {
      if (item.session_id && !uniqueSessions[item.session_id] && item.sender === 'user') {
        uniqueSessions[item.session_id] = { session_id: item.session_id, first_message: item.text, created_at: item.created_at };
      }
    });
    return Object.values(uniqueSessions).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  // 特定セッションの会話履歴読み込み
  getChatHistory: async (sessionId: string): Promise<Message[]> => {
    const { data, error } = await supabase.from('chat_messages').select('id, sender, text').eq('session_id', sessionId).order('created_at', { ascending: true }).limit(50);
    if (error || !data) return [];
    return data.map(item => ({
      id: item.id,
      sender: String(item.sender).trim().toLowerCase() as 'user' | 'ai',
      text: item.text,
      isQuickResponse: false
    }));
  },

  // メッセージの保存
  saveMessage: async (id: string, sessionId: string, sender: 'user' | 'ai', text: string) => {
    await supabase.from('chat_messages').insert([{ id, session_id: sessionId, sender, text }]);
  },

  // 💡 既存の `long_term_memories` テーブルから記憶を読み込む
  getMemories: async (): Promise<{ content: string; category: string }[]> => {
    const { data, error } = await supabase.from('long_term_memories').select('content, category');
    if (error || !data) return [];
    return data;
  },

  // 💡 既存の `long_term_memories` テーブルに新しい記憶を保存する
  saveMemory: async (content: string, category: string) => {
    // 同じ記憶の重複保存を防ぐチェック
    const { data } = await supabase.from('long_term_memories').select('id').eq('content', content);
    if (data && data.length > 0) return; // 既に同じ記憶があればスキップ

    await supabase.from('long_term_memories').insert([{ content, category }]);
  }
};