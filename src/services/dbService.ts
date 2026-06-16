// src/services/dbService.ts
import { createClient } from '@supabase/supabase-js';
import type { Message, ChatSession, LongTermMemory, FollowUp, UserDictionary, Interest, GreetingPool } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

  deleteGreeting: async (id: string): Promise<void> => {
    const { error } = await supabase.from('greeting_pool').delete().eq('id', id);
    if (error) console.error("挨拶削除失敗:", error);
  },

  getMemories: async (): Promise<LongTermMemory[]> => {
    const { data, error } = await supabase.from('long_term_memories').select('*');
    return data || [];
  },
  saveMemory: async (content: string, category: string, importance: number, memoryType: string, allowSmallTalk: boolean) => {
    await supabase.from('long_term_memories').insert([{ content, category, importance, memory_type: memoryType, allow_small_talk: allowSmallTalk }]);
  },

  getFollowUps: async (): Promise<FollowUp[]> => {
    const { data, error } = await supabase.from('follow_ups').select('*').eq('is_resolved', false);
    return data || [];
  },
  saveFollowUp: async (topic: string, context: string, isResolved: boolean, targetDate?: string) => {
    await supabase.from('follow_ups').insert([{ topic, context, is_resolved: isResolved, target_date: targetDate }]);
  },

  getDictionary: async (): Promise<UserDictionary[]> => {
    const { data, error } = await supabase.from('user_dictionary').select('*');
    return data || [];
  },
  saveDictionary: async (term: string, meaning: string) => {
    await supabase.from('user_dictionary').insert([{ term, meaning }]);
  },

  getInterests: async (): Promise<Interest[]> => {
    const { data, error } = await supabase.from('interests').select('*');
    return data || [];
  },
  saveInterest: async (topic: string) => {
    await supabase.from('interests').insert([{ topic }]);
  }
};