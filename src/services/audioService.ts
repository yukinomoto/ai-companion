// src/services/audioService.ts
export const VOICE_PRESETS = [
  { id: 'ja-JP-Neural2-B', name: 'ハツラツ（女性）' },
  { id: 'ja-JP-Wavenet-A', name: '落ち着いた（女性）' },
  { id: 'ja-JP-Neural2-C', name: 'スマート（男性）' },
  { id: 'ja-JP-Neural2-D', name: '渋い・低音（男性）' },
];

let globalAudio: HTMLAudioElement | null = null;
let currentBlobUrl: string | null = null;

export const audioService = {
  unlock: () => {
    if (typeof window === 'undefined') return;
    if (!globalAudio) {
      globalAudio = new Audio();
    }
    // ユーザーアクションの瞬間にダミー再生でiOSの制限を突破
    globalAudio.play().then(() => {
      globalAudio?.pause();
    }).catch(() => {});
  },

  stop: () => {
    if (globalAudio) {
      globalAudio.pause();
      globalAudio.currentTime = 0;
    }
  },

  play: async (text: string, voiceId: string, gcloudApiKey: string): Promise<void> => {
    if (!gcloudApiKey || !globalAudio) return;
    audioService.stop();

    return new Promise(async (resolve) => {
      try {
        const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${gcloudApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text: text },
            voice: { languageCode: 'ja-JP', name: voiceId },
            audioConfig: { audioEncoding: 'MP3', speakingRate: 1.15, pitch: voiceId.includes('-B') ? 1.5 : 0.0 }
          })
        });
        const data = await response.json();
        if (!data.audioContent) { resolve(); return; }

        const binaryString = window.atob(data.audioContent);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: 'audio/mp3' });
        if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = URL.createObjectURL(blob);

        globalAudio!.src = currentBlobUrl;
        globalAudio!.onended = () => resolve();
        globalAudio!.onerror = () => resolve();
        await globalAudio!.play();

      } catch (err) { 
        console.error("音声再生エラー:", err);
        resolve();
      }
    });
  }
};