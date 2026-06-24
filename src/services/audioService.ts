// src/services/audioService.ts
import { useSettingsStore } from '../store/useSettingsStore';

export const VOICE_PRESETS = [
  { id: 'ja-JP-Neural2-B', name: 'Neural2 女性 (ハツラツ)' },
  { id: 'ja-JP-Neural2-C', name: 'Neural2 男性 (スマート)' },
  { id: 'ja-JP-Neural2-D', name: 'Neural2 男性 (低音・渋め)' },
  { id: 'ja-JP-Wavenet-A', name: 'Wavenet 女性 (落ち着き)' },
  { id: 'ja-JP-Wavenet-B', name: 'Wavenet 女性 (標準)' },
  { id: 'ja-JP-Wavenet-C', name: 'Wavenet 男性 (標準)' },
  { id: 'ja-JP-Wavenet-D', name: 'Wavenet 男性 (落ち着き)' },
  { id: 'ja-JP-Chirp3-HD-Aoede', name: 'Chirp3 HD 女性 (Aoede)' },
  { id: 'ja-JP-Chirp3-HD-Leda', name: 'Chirp3 HD 女性 (Leda)' },
  { id: 'ja-JP-Chirp3-HD-Callirrhoe', name: 'Chirp3 HD 女性 (Callirrhoe)' },
  { id: 'ja-JP-Chirp3-HD-Achernar', name: 'Chirp3 HD 女性 (Achernar)' },
  { id: 'ja-JP-Chirp3-HD-Charon', name: 'Chirp3 HD 男性 (Charon)' },
  { id: 'ja-JP-Chirp3-HD-Achird', name: 'Chirp3 HD 男性 (Achird)' },
  { id: 'ja-JP-Chirp3-HD-Algenib', name: 'Chirp3 HD 男性 (Algenib)' },
];

let globalAudio: HTMLAudioElement | null = null;
let currentPlaybackId = 0;

// 💡 NEW: 先読みした音声を溜めておくキュー（待ち行列）
let audioQueue: string[] = [];
let isPlaying = false;

const splitTextIntoChunks = (text: string, maxLength: number = 100): string[] => {
  const cleanText = text.replace(/[*#_`~【】「」]/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences = cleanText.match(/[^。！？\n]+[。！？\n]*/g) || [cleanText];
  
  const chunks: string[] = [];
  let currentChunk = '';

  const pushChunk = () => {
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
  };

  for (let sentence of sentences) {
    if (sentence.length > maxLength) {
      const subSentences = sentence.match(/[^、，]+[、，]*/g) || [sentence];
      for (let sub of subSentences) {
        if (sub.length > maxLength) {
          pushChunk();
          let temp = sub;
          while (temp.length > 0) {
            chunks.push(temp.substring(0, maxLength).trim());
            temp = temp.substring(maxLength);
          }
        } else {
          if (currentChunk.length + sub.length > maxLength) pushChunk();
          currentChunk += sub;
        }
      }
    } else {
      if (currentChunk.length + sentence.length > maxLength) pushChunk();
      currentChunk += sentence;
    }
  }
  pushChunk();
  return chunks;
};

const convertToSSML = (text: string, commaMs: number, periodMs: number): string => {
  let ssml = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  if (commaMs > 0) {
    ssml = ssml.replace(/、/g, `、<break time="${commaMs}ms"/>`);
  }
  if (periodMs > 0) {
    ssml = ssml.replace(/([。！？])/g, `$1<break time="${periodMs}ms"/>`);
  }

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
    
    // 💡 キューを空にしてメモリを解放
    audioQueue.forEach(url => URL.revokeObjectURL(url));
    audioQueue = [];
    isPlaying = false;

    if (globalAudio) {
      globalAudio.pause();
      globalAudio.currentTime = 0;
    }
  },

  play: async (text: string, gcloudApiKey: string): Promise<void> => {
    if (!gcloudApiKey || !globalAudio) return;
    
    const { voiceId, commaBreak, periodBreak, speakingRate } = useSettingsStore.getState();

    audioService.stop();
    const playbackId = currentPlaybackId; 
    const chunks = splitTextIntoChunks(text, 100);

    // 💡 キューから音声を順番に取り出して再生する関数
    const playNext = async () => {
      if (playbackId !== currentPlaybackId) return;
      
      if (audioQueue.length === 0) {
        isPlaying = false; // 再生するものがなくなったら待機
        return;
      }

      isPlaying = true;
      const url = audioQueue.shift()!; // キューの先頭を取り出す
      globalAudio!.src = url;

      globalAudio!.onended = () => {
        URL.revokeObjectURL(url); // 使い終わったメモリを解放
        playNext(); // 次を再生
      };
      globalAudio!.onerror = () => {
        URL.revokeObjectURL(url);
        playNext();
      };

      try {
        await globalAudio!.play();
      } catch (e) {
        console.error("音声再生エラー:", e);
        URL.revokeObjectURL(url);
        playNext();
      }
    };

    // 💡 裏側でひたすらAPIを叩き、取得できたものからキューに突っ込む（先読み）
    (async () => {
      for (const chunk of chunks) {
        if (playbackId !== currentPlaybackId) break;
        if (!chunk) continue;

        try {
          const isChirp3 = voiceId.includes('Chirp3-HD');
          let payloadInput = isChirp3 ? { text: chunk } : { ssml: convertToSSML(chunk, commaBreak, periodBreak) };

          const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${gcloudApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              input: payloadInput,
              voice: { languageCode: 'ja-JP', name: voiceId },
              audioConfig: { 
                audioEncoding: 'MP3', 
                speakingRate: speakingRate, 
                pitch: voiceId.includes('-B') ? 1.5 : 0.0 
              }
            })
          });

          if (!response.ok) {
            console.error("GCP TTS API Error:", await response.text());
            continue;
          }

          const data = await response.json();
          if (!data.audioContent) continue;

          const binaryString = window.atob(data.audioContent);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
          }

          const blob = new Blob([bytes], { type: 'audio/mp3' });
          const url = URL.createObjectURL(blob);

          // 取得した音声をキューに追加
          audioQueue.push(url);

          // 💡 もし今何も再生していなければ、すぐに再生をキックする！（これが爆速の理由）
          if (!isPlaying) {
            playNext();
          }

        } catch (err) { 
          console.error("音声フェッチエラー:", err);
        }
      }
    })();
  }
};