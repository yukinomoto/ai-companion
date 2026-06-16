// src/types.ts

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  isQuickResponse?: boolean;
  emotion?: 'neutral' | 'happy' | 'sad' | 'surprised';
}

export interface ChatSession {
  id: string;
  name: string;
  created_at?: string;
}

export interface LongTermMemory {
  id?: string;
  content: string;
  category: string;
  importance: number;
  memory_type: string;
  allow_small_talk: boolean;
  created_at?: string;
}

export interface FollowUp {
  id?: string;
  topic: string;
  context: string;
  is_resolved: boolean;
  target_date?: string;
  created_at?: string;
}

export interface UserDictionary {
  id?: string;
  term: string;
  meaning: string;
  created_at?: string;
}

export interface Interest {
  id?: string;
  topic: string;
  interest_level?: number;
  created_at?: string;
}

export interface GreetingPool {
  id?: string;
  greeting_text: string;
  context_type: string;
  created_at?: string;
}