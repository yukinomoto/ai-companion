// src/components/MotionTest.tsx
import React, { useState } from 'react';
import { Companion3D, type Emotion, DEFAULT_FACE_CONFIG, type FaceConfig } from './Companion3D';

export const MotionTest: React.FC = () => {
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [isLoading, setIsLoading] = useState(false);
  
  const [faceConfig, setFaceConfig] = useState<FaceConfig>(DEFAULT_FACE_CONFIG);

  // 💡 追加した新しいモーションをテスト画面のボタンリストに登録！
  const emotions: Emotion[] = ['neutral', 'happy', 'sad', 'surprised', 'thinking', 'sit_to_stand', 'wave'];

  const handleConfigChange = (key: keyof FaceConfig, value: number) => {
    setFaceConfig(prev => ({ ...prev, [key]: value }));
  };

  const copyConfigToClipboard = () => {
    const configString = JSON.stringify(faceConfig, null, 2);
    navigator.clipboard.writeText(configString);
    alert("設定をコピーしました！\nCompanion3D.tsx の DEFAULT_FACE_CONFIG に貼り付けてください。");
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50/50 relative">
      <div className="p-4 bg-white/80 backdrop-blur-md border-b border-slate-100 z-10 flex flex-col shadow-sm">
        <h2 className="text-lg font-bold text-slate-700">🤖 モーション＆顔調整テスト</h2>
      </div>

      <div className="flex-1 relative flex items-center justify-center -mt-8">
        <div className="w-full h-80 relative">
          <Companion3D isLoading={isLoading} emotion={emotion} faceConfig={faceConfig} />
        </div>
      </div>

      <div className="bg-white p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.08)] z-10 rounded-t-[32px] flex flex-col gap-4 overflow-y-auto max-h-[55vh]">
        
        {/* 💡 ボタンのグリッドを少し広げて見やすくしました */}
        <div className="grid grid-cols-4 gap-2">
          {emotions.map(e => (
            <button
              key={e}
              onClick={() => { setEmotion(e); setIsLoading(false); }}
              className={`py-2 rounded-xl text-[10px] font-bold transition-all active:scale-95 ${
                !isLoading && emotion === e ? 'bg-blue-500 text-white shadow-md' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {e}
            </button>
          ))}
          <button
            onClick={() => setIsLoading(true)}
            className={`py-2 rounded-xl text-[10px] font-bold transition-all active:scale-95 ${
              isLoading ? 'bg-purple-500 text-white shadow-md' : 'bg-slate-100 text-slate-600'
            }`}
          >
            isLoading
          </button>
        </div>

        <div className="text-xs space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <h3 className="font-bold mb-1 text-slate-700">⚙️ 顔スクリーンの位置調整</h3>
          <p className="text-[10px] text-slate-500 mb-2">黒い板が元の目を隠すように調整してください。</p>
          
          {Object.entries(faceConfig).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-10 font-mono text-slate-500">{key}</span>
              <input 
                type="range" 
                min={key.startsWith('r') ? -Math.PI : (key === 'width' || key === 'height' ? 0.01 : -1)} 
                max={key.startsWith('r') ? Math.PI : (key === 'width' || key === 'height' ? 1 : 1)} 
                step={0.01} 
                value={val} 
                onChange={(e) => handleConfigChange(key as keyof FaceConfig, parseFloat(e.target.value))}
                className="flex-1 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
              <span className="w-10 text-right font-mono text-slate-600">{val.toFixed(2)}</span>
            </div>
          ))}
          
          <button 
            onClick={copyConfigToClipboard}
            className="mt-3 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-colors"
          >
            📋 調整した数値をコピーする
          </button>
        </div>
      </div>
    </div>
  );
};