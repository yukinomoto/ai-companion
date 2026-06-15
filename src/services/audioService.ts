export const VOICE_PRESETS = [
  { id: 'ja-JP-Neural2-B', name: 'ハツラツ（女性）' },
  { id: 'ja-JP-Wavenet-A', name: '落ち着いた（女性）' },
  { id: 'ja-JP-Neural2-C', name: 'スマート（男性）' },
  { id: 'ja-JP-Neural2-D', name: '渋い・低音（男性）' },
];

// 💡 `<audio>` タグを廃止し、システムレベルの音響エンジン「AudioContext」を使用する
let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

// AudioContextの初期化（ブラウザ互換性対応）
const initAudioContext = () => {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
};

export const audioService = {
  // 💡 マイク・送信ボタンをタップした瞬間に実行し、iOSのブロックを解除する
  unlock: () => {
    initAudioContext();
    if (audioCtx) {
      // 一時停止状態なら再開
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      // 無音のダミーバッファを一瞬だけ再生して、iOSに「再生権限」を完璧に記憶させる
      const buffer = audioCtx.createBuffer(1, 1, 22050);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start(0);
    }
  },

  // ミュート時の即時停止
  stop: () => {
    if (currentSource) {
      try { currentSource.stop(); } catch (e) {}
      currentSource = null;
    }
  },

  // 音声データの取得と再生
  play: async (text: string, voiceId: string, gcloudApiKey: string): Promise<void> => {
    if (!gcloudApiKey) return;
    initAudioContext();
    audioService.stop(); // 喋っている最中なら止める

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

        // 💡 Base64テキストをバイナリ配列に変換
        const binaryString = window.atob(data.audioContent);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        if (!audioCtx) { resolve(); return; }

        // 💡 iOSの通話モード（カープレイ）に負けない「メモリ上でのデコード＆再生」
        audioCtx.decodeAudioData(bytes.buffer, (buffer) => {
          const source = audioCtx!.createBufferSource();
          source.buffer = buffer;
          source.connect(audioCtx!.destination);
          source.onended = () => resolve();
          
          currentSource = source;

          // 万が一AudioContextが寝ていれば叩き起こしてから再生
          if (audioCtx!.state === 'suspended') {
            audioCtx!.resume().then(() => source.start(0));
          } else {
            source.start(0);
          }
        }, (e) => {
          console.error("音声デコードエラー:", e);
          resolve();
        });

      } catch (err) { 
        console.error("音声再生通信エラー:", err);
        resolve(); 
      }
    });
  }
};