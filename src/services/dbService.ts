import { supabase } from '../supabaseClient';
import type { ChatSession, Message } from '../hooks/useCompanionChat';

export const dbService = {
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

  getMemories: async () => {
    const { data } = await supabase.from('long_term_memories').select('content, category');
    return data || [];
  },
  getFollowUps: async (): Promise<{topic: string; context: string; is_resolved: boolean; created_at?: string}[]> => {
    const { data } = await supabase.from('follow_ups').select('topic, context, is_resolved, created_at').eq('is_resolved', false);
    return data || [];
  },
  getDictionary: async () => {
    const { data } = await supabase.from('user_dictionary').select('term, meaning');
    return data || [];
  },
  // 💡 追加: 興味関心データの取得
  getInterests: async () => {
    const { data } = await supabase.from('interests').select('topic, interest_level').order('interest_level', { ascending: false }).limit(10);
    return data || [];
  },

  saveMemory: async (content: string, category: string) => {
    const { data } = await supabase.from('long_term_memories').select('id').eq('content', content).maybeSingle();
    if (data) return;
    await supabase.from('long_term_memories').insert([{ content, category: category || 'トピック' }]);
  },
  saveFollowUp: async (topic: string, context: string, is_resolved: boolean) => {
    if (!topic) return;
    const safeContext = context || '';
    const { data } = await supabase.from('follow_ups').select('id').eq('topic', topic).maybeSingle();
    if (data) {
      await supabase.from('follow_ups').update({ context: safeContext, is_resolved }).eq('id', data.id);
    } else {
      await supabase.from('follow_ups').insert([{ topic, context: safeContext, is_resolved }]);
    }
  },
  saveDictionary: async (term: string, meaning: string) => {
    if (!term || !meaning) return;
    const { data } = await supabase.from('user_dictionary').select('id').eq('term', term).maybeSingle();
    if (data) return;
    await supabase.from('user_dictionary').insert([{ term, meaning }]);
  },
  // 💡 追加: 興味関心データの保存（既存ならレベルUP）
  saveInterest: async (topic: string) => {
    if (!topic) return;
    const { data } = await supabase.from('interests').select('id, interest_level').eq('topic', topic).maybeSingle();
    if (data) {
      await supabase.from('interests').update({ interest_level: (data.interest_level || 1) + 1 }).eq('id', data.id);
    } else {
      await supabase.from('interests').insert([{ topic, interest_level: 1 }]);
    }
  }
};