// src/types/index.ts

// ==========================================
// チャットUI関連の型
// ==========================================
export interface Message {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    isQuickResponse?: boolean;
    emotion?: 'neutral' | 'happy' | 'sad' | 'surprised' | 'thinking'; // 💡 追加
  }
  
  export interface ChatSession {
    session_id: string;
    first_message: string;
    created_at: string;
  }
  
  // ==========================================
  // データベース関連の型（AIコンパニオンの記憶・コンテキスト）
  // ==========================================
  export interface LongTermMemory {
    id?: string;
    content: string;
    category?: string;
    importance: number; // 1〜5
    memory_type?: string;
    allow_small_talk: boolean;
    created_at?: string;
  }
  
  export interface FollowUp {
    id?: string;
    topic: string;
    context: string;
    is_resolved: boolean;
    target_date?: string; // 誕生日や締切など
    created_at?: string;
  }
  
  export interface Interest {
    id?: string;
    topic: string;
    interest_level: number;
    created_at?: string;
    updated_at?: string;
  }
  
  export interface UserDictionary {
    id?: string;
    term: string;
    meaning: string;
    created_at?: string;
  }
  
  export interface GreetingPoolItem {
    id?: string;
    greeting_text: string;
    context_type: string;
    source_memory_id?: string;
    created_at?: string;
  }
  
  export interface TalkTopic {
    id?: string;
    topic: string;
    priority: number;
    proposal_count: number;
    last_proposed_at?: string;
    created_at?: string;
  }
  
  export interface EventItem {
    id?: string;
    title: string;
    event_date: string;
    event_type?: string;
    created_at?: string;
  }