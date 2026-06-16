// src/services/dbService.ts
import { supabase } from '../supabaseClient';
import type { 
  ChatSession, Message, LongTermMemory, FollowUp, 
  Interest, UserDictionary, GreetingPoolItem 
} from '../types';

export const dbService = {
  // ==========================================
  // チャット履歴管理
  // ==========================================
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

  saveMessage: async (id: string, sessionId: string, sender: 'user' | 'ai', text: string) => {
    await supabase.from('chat_messages').insert([{ id, session_id: sessionId, sender, text }]);
  },

  // ==========================================
  // 記憶・コンテキストの取得
  // ==========================================
  getMemories: async (): Promise<LongTermMemory[]> => {
    const { data } = await supabase.from('long_term_memories').select('id, content, category, importance, memory_type, allow_small_talk');
    return data || [];
  },

  getFollowUps: async (): Promise<FollowUp[]> => {
    const { data } = await supabase.from('follow_ups').select('id, topic, context, is_resolved, target_date, created_at').eq('is_resolved', false);
    return data || [];
  },

  getDictionary: async (): Promise<UserDictionary[]> => {
    const { data } = await supabase.from('user_dictionary').select('id, term, meaning');
    return data || [];
  },

  getInterests: async (): Promise<Interest[]> => {
    const { data } = await supabase.from('interests').select('id, topic, interest_level').order('interest_level', { ascending: false }).limit(10);
    return data || [];
  },

  // ==========================================
  // 記憶・コンテキストの保存
  // ==========================================
  saveMemory: async (content: string, category: string, importance: number = 3, memory_type: string = 'fact', allow_small_talk: boolean = true) => {
    const { data } = await supabase.from('long_term_memories').select('id').eq('content', content).maybeSingle();
    if (data) return;
    await supabase.from('long_term_memories').insert([{ 
      content, category: category || 'トピック', importance, memory_type, allow_small_talk 
    }]);
  },

  saveFollowUp: async (topic: string, context: string, is_resolved: boolean, target_date?: string) => {
    if (!topic) return;
    const safeContext = context || '';
    const { data } = await supabase.from('follow_ups').select('id').eq('topic', topic).maybeSingle();
    
    if (data) {
      await supabase.from('follow_ups').update({ context: safeContext, is_resolved, target_date }).eq('id', data.id);
    } else {
      await supabase.from('follow_ups').insert([{ topic, context: safeContext, is_resolved, target_date }]);
    }
  },

  saveDictionary: async (term: string, meaning: string) => {
    if (!term || !meaning) return;
    const { data } = await supabase.from('user_dictionary').select('id').eq('term', term).maybeSingle();
    if (data) return;
    await supabase.from('user_dictionary').insert([{ term, meaning }]);
  },

  saveInterest: async (topic: string) => {
    if (!topic) return;
    const { data } = await supabase.from('interests').select('id, interest_level').eq('topic', topic).maybeSingle();
    if (data) {
      await supabase.from('interests').update({ interest_level: (data.interest_level || 1) + 1 }).eq('id', data.id);
    } else {
      await supabase.from('interests').insert([{ topic, interest_level: 1 }]);
    }
  },

  // ==========================================
  // 新規：スマートプール方式（挨拶キャッシュ）の管理
  // ==========================================
  getGreetingPool: async (): Promise<GreetingPoolItem[]> => {
    const { data } = await supabase.from('greeting_pool').select('*').order('created_at', { ascending: false });
    return data || [];
  },

  saveGreetingPool: async (greeting_text: string, context_type: string, source_memory_id?: string) => {
    await supabase.from('greeting_pool').insert([{ greeting_text, context_type, source_memory_id }]);
  },

  deleteGreeting: async (id: string) => {
    await supabase.from('greeting_pool').delete().eq('id', id);
  }
};