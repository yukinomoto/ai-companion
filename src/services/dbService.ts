// src/services/dbService.ts
import { supabase } from '../lib/supabase';
import type { Message, ChatSession, LongTermMemory, FollowUp, UserDictionary, Interest, GreetingPool } from '../types';

export const dbService = {
  getSessions: async (): Promise<ChatSession[]> => {
    const { data, error } = await supabase.from('chat_sessions').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return data || [];
  },

  createSession: async (name: string): Promise<ChatSession> => {
    const { data, error } = await supabase.from('chat_sessions').insert([{ name }]).select().single();
    if (error) { throw error; }
    return data;
  },

  getChatHistory: async (sessionId: string): Promise<Message[]> => {
    const { data, error } = await supabase.from('chat_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true });
    if (error) { console.error(error); return []; }
    return (data || []).map(m => ({ id: m.id, sender: m.sender, text: m.text, emotion: m.emotion, isQuickResponse: false }));
  },

  saveMessage: async (id: string, sessionId: string, sender: 'user' | 'ai', text: string, emotion?: string): Promise<void> => {
    const { error } = await supabase.from('chat_messages').insert([{ id, session_id: sessionId, sender, text, emotion: emotion || 'neutral' }]);
    if (error) console.error("メッセージ保存失敗:", error);
  },

  getGreetingPool: async (): Promise<GreetingPool[]> => {
    const { data, error } = await supabase.from('greeting_pool').select('*');
    if (error) { console.error(error); return []; }
    return data || [];
  },

  saveGreetingPool: async (greetingText: string, contextType: string): Promise<void> => {
    const { error } = await supabase.from('greeting_pool').insert([{ greeting_text: greetingText, context_type: contextType }]);
    if (error) console.error("挨拶プール保存失敗:", error);
  },

  onDeleteGreeting: async (id: string): Promise<void> => { // ※ deleteGreetingから型定義に合わせて適宜変更があれば
    const { error } = await supabase.from('greeting_pool').delete().eq('id', id);
    if (error) console.error("挨拶削除失敗:", error);
  },

  deleteGreeting: async (id: string): Promise<void> => {
    const { error } = await supabase.from('greeting_pool').delete().eq('id', id);
    if (error) console.error("挨拶削除失敗:", error);
  },

  getMemories: async (): Promise<LongTermMemory[]> => {
    const { data, error } = await supabase.from('long_term_memories').select('*');
    if (error) { console.error("記憶取得失敗:", error); return []; } // 💡 修正：errorを読み込む処理を追加
    return data || [];
  },
  
  saveMemory: async (content: string, category: string, importance: number, memoryType: string, allowSmallTalk: boolean) => {
    await supabase.from('long_term_memories').insert([{ content, category, importance, memory_type: memoryType, allow_small_talk: allowSmallTalk }]);
  },

  getFollowUps: async (): Promise<FollowUp[]> => {
    const { data, error } = await supabase.from('follow_ups').select('*').eq('is_resolved', false);
    if (error) { console.error("追跡タスク取得失敗:", error); return []; } // 💡 修正：errorを読み込む処理を追加
    return data || [];
  },
  
  saveFollowUp: async (topic: string, context: string, isResolved: boolean, targetDate?: string) => {
    await supabase.from('follow_ups').insert([{ topic, context, is_resolved: isResolved, target_date: targetDate }]);
  },

  getDictionary: async (): Promise<UserDictionary[]> => {
    const { data, error } = await supabase.from('user_dictionary').select('*');
    if (error) { console.error("辞書取得失敗:", error); return []; } // 💡 修正：errorを読み込む処理を追加
    return data || [];
  },
  
  saveDictionary: async (term: string, meaning: string) => {
    await supabase.from('user_dictionary').insert([{ term, meaning }]);
  },

  getInterests: async (): Promise<Interest[]> => {
    const { data, error } = await supabase.from('interests').select('*');
    if (error) { console.error("興味関心取得失敗:", error); return []; } // 💡 修正：errorを読み込む処理を追加
    return data || [];
  },
  
  saveInterest: async (topic: string) => {
    await supabase.from('interests').insert([{ topic }]);
  },
  
  // 🕸️ ナレッジグラフ関連のDB操作
  getPhraseCorrections: async (): Promise<{ pairs: {alias_phrase: string, canonical_phrase: string}[], hints: string[] }> => {
    // 💡 既存のビュー（ペア）と、単体ワード（ヒント）を同時に取得
    const [pairsResult, hintsResult] = await Promise.all([
      supabase.from('v_phrase_corrections').select('alias_phrase, canonical_phrase'),
      supabase.from('phrase_nodes').select('phrase').in('type', ['canonical', 'concept']).order('mention_count', { ascending: false })
    ]);

    if (pairsResult.error) console.error("置換辞書取得失敗:", pairsResult.error);
    if (hintsResult.error) console.error("単体ヒント取得失敗:", hintsResult.error);

    return {
      pairs: pairsResult.data || [],
      hints: (hintsResult.data || []).map(row => row.phrase)
    };
  },

  getKnowledgeNetwork: async (): Promise<{word_a: string, word_b: string}[]> => {
    const { data, error } = await supabase.from('v_phrase_knowledge_network').select('word_a, word_b');
    if (error) { console.error("知識ネットワーク取得失敗:", error); return []; }
    return data || [];
  },

  savePhraseNetwork: async (nodes: any[], edges: any[]): Promise<void> => {
    // 💡 修正: 復元した安全な v3 の関数を呼び出すように変更
    const { error } = await supabase.rpc('save_phrase_network_v3', { p_nodes: nodes, p_edges: edges });
    if (error) console.error("ナレッジグラフ保存失敗:", error);
  },

  updateSessionTitle: async (sessionId: string, title: string): Promise<void> => {
    const { error } = await supabase.from('chat_sessions').update({ title }).eq('id', sessionId);
    if (error) console.error("タイトル更新失敗:", error);
  },
};