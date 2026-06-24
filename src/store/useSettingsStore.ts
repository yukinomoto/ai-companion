// src/store/useSettingsStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  voiceId: string;
  commaBreak: number;
  periodBreak: number;
  speakingRate: number;
  setVoiceId: (id: string) => void;
  setCommaBreak: (ms: number) => void;
  setPeriodBreak: (ms: number) => void;
  setSpeakingRate: (rate: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      voiceId: 'ja-JP-Neural2-B',
      commaBreak: 150, 
      periodBreak: 400,
      speakingRate: 1.0, 
      setVoiceId: (id) => set({ voiceId: id }),
      setCommaBreak: (ms) => set({ commaBreak: ms }),
      setPeriodBreak: (ms) => set({ periodBreak: ms }),
      setSpeakingRate: (rate) => set({ speakingRate: rate }),
    }),
    {
      name: 'mai-voice-settings',
    }
  )
);