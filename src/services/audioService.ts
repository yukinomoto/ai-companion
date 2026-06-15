// 💡 声の種類のリストをここに追加（エクスポートする）
export const VOICE_PRESETS = [
    { id: 'ja-JP-Neural2-B', name: 'ハツラツ（女性）' },
    { id: 'ja-JP-Wavenet-A', name: '落ち着いた（女性）' },
    { id: 'ja-JP-Neural2-C', name: 'スマート（男性）' },
    { id: 'ja-JP-Neural2-D', name: '渋い・低音（男性）' },
  ];
  
  let globalAudio: HTMLAudioElement | null = null;
  if (typeof window !== 'undefined') {
    globalAudio = new Audio();
  }
  
  const SILENT_MP3 = "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
  
  export const audioService = {
    unlock: () => {
      if (globalAudio) {
        const isPlaying = globalAudio.currentTime > 0 && !globalAudio.paused && !globalAudio.ended;
        if (!isPlaying) {
          globalAudio.src = SILENT_MP3;
          globalAudio.play().catch(() => {});
        }
      }
    },
  
    stop: () => {
      if (globalAudio) {
        globalAudio.pause();
      }
    },
  
    play: async (text: string, voiceId: string, gcloudApiKey: string): Promise<void> => {
      if (!globalAudio || !gcloudApiKey) return;
      
      return new Promise(async (resolve) => {
        try {
          globalAudio!.pause();
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
          const blob = new Blob([bytes], { type: 'audio/mpeg' });
          const blobUrl = URL.createObjectURL(blob);
  
          globalAudio!.src = blobUrl;
          
          globalAudio!.onended = () => {
            URL.revokeObjectURL(blobUrl);
            resolve();
          };
          globalAudio!.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            resolve();
          };
  
          globalAudio!.play().catch((e) => {
            console.error("音声再生ブロック:", e);
            resolve();
          });
        } catch (err) { resolve(); }
      });
    }
  };