// src/services/audioService.ts
export const VOICE_PRESETS = [
  { id: 'ja-JP-Neural2-B', name: 'ハツラツ（女性）' },
  { id: 'ja-JP-Wavenet-A', name: '落ち着いた（女性）' },
  { id: 'ja-JP-Neural2-C', name: 'スマート（男性）' },
  { id: 'ja-JP-Neural2-D', name: '渋い・低音（男性）' },
];

let globalAudio: HTMLAudioElement | null = null;
let currentBlobUrl: string | null = null;
let currentPlaybackId = 0;

// 長いテキストを句読点や改行で安全なサイズに分割する関数
const splitTextIntoChunks = (text: string, maxLength: number = 200): string[] => {
  const cleanText = text.replace(/[*#_`~]/g, '');
  const sentences = cleanText.match(/[^。！？\n]+[。！？\n]*/g) || [cleanText];
  
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
};

// テキストに「ため（ポーズ）」を挿入してSSML形式に変換する関数
const convertToSSML = (text: string): string => {
  let ssml = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 読点（、）には0.25秒の短いポーズ
  ssml = ssml.replace(/、/g, '、<break time="250ms"/>');
  // 句点（。）や感嘆符などには0.5秒のしっかりしたポーズ
  ssml = ssml.replace(/([。！？])/g, '$1<break time="500ms"/>');

  return `<speak>${ssml}</speak>`;
};

export const audioService = {
  unlock: () => {
    if (typeof window === 'undefined') return;
    if (!globalAudio) {
      globalAudio = new Audio();
    }
    globalAudio.play().then(() => {
      globalAudio?.pause();
    }).catch(() => {});
  },

  stop: () => {
    currentPlaybackId++; 
    if (globalAudio) {
      globalAudio.pause();
      globalAudio.currentTime = 0;
    }
  },

  play: async (text: string, voiceId: string, gcloudApiKey: string): Promise<void> => {
    if (!gcloudApiKey || !globalAudio) return;
    
    audioService.stop();
    const playbackId = currentPlaybackId; 

    const chunks = splitTextIntoChunks(text, 250);

    for (const chunk of chunks) {
      if (playbackId !== currentPlaybackId) break;
      if (!chunk) continue;

      await new Promise<void>(async (resolve) => {
        try {
          const ssmlChunk = convertToSSML(chunk);

          const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${gcloudApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              input: { ssml: ssmlChunk },
              voice: { languageCode: 'ja-JP', name: voiceId },
              // 💡 修正: speakingRate を 1.15 から 1.0 に変更（もっとゆっくりが良い場合は 0.9 にしてください）
              audioConfig: { audioEncoding: 'MP3', speakingRate: 1.05, pitch: voiceId.includes('-B') ? 1.5 : 0.0 }
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("GCP TTS API Error:", errorText);
            resolve();
            return;
          }

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
  }
};