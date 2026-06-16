// src/components/Companion3D.tsx
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export type Emotion = 'neutral' | 'happy' | 'sad' | 'surprised' | 'thinking';

interface Companion3DProps {
  isLoading?: boolean;
  emotion?: Emotion;
}

function RobotModel({ isLoading = false, emotion = 'neutral' }: Companion3DProps) {
  const { scene } = useGLTF("/cute%20robot%203d%20model.glb");
  const modelRef = useRef<THREE.Group>(null);

  // 影の設定を自動適用
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // アニメーション制御（暴走するジャンプを完全撤去！）
  useFrame(({ clock }) => {
    if (!modelRef.current) return;
    const t = clock.getElapsedTime();

    // 正面を向く正しい基準値
    const baseRotationY = -Math.PI / 2; 

    // 💡 吹き出しと被らない絶対安全な高さの基準
    const safeBaseY = 0.4;

    if (isLoading || emotion === 'thinking') {
      // 考え中（ Loading ）のときだけ、可愛く左右にフリフリ動かす
      modelRef.current.position.y = safeBaseY;
      modelRef.current.rotation.y = baseRotationY + Math.sin(t * 4.0) * 0.15;
    } else {
      // 💡 状態が 'happy' であろうが何であろうが、通常時は「完全静止」して位置を固定！
      modelRef.current.position.y = safeBaseY;
      modelRef.current.rotation.y = baseRotationY;
    }
  });

  // キャラクターの大きさをキープ
  return (
    <primitive 
      ref={modelRef} 
      object={scene} 
      scale={2.5} 
    />
  );
}

export function Companion3D({ isLoading = false, emotion = 'neutral' }: Companion3DProps) {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", background: "transparent", display: "flex", justifyContent: "center", alignItems: "center" }}>
      {/* 💡 カメラをさらに少し引いて [Z = 4.2]、注視点を [Y = 0.5] に上げることで、アンテナを絶対に見切れさせず、吹き出しの上の広い余白にキャラを綺麗に収めます */}
      <Canvas 
        shadows
        camera={{ position: [0, 0.6, 4.2], fov: 42 }} 
        style={{ background: "transparent" }}
      >
        {/* ライティング */}
        <ambientLight intensity={1.5} />
        <directionalLight 
          position={[5, 8, 5]} 
          intensity={2.0} 
          color="#ffffff" 
          castShadow 
        />
        <directionalLight position={[-5, 3, 2]} intensity={1.0} color="#bae6fd" />
        <directionalLight position={[0, -4, -1]} intensity={0.5} color="#d8b4fe" />
        <pointLight position={[0, 2, 2]} intensity={0.5} color="#ffffff" />
        
        <RobotModel isLoading={isLoading} emotion={emotion} />

        {/* カメラコントローラー */}
        <OrbitControls 
          enableZoom={false}       
          enablePan={false}        
          target={[0, 0.5, 0]} // カメラの回転中心もキャラの新しい高さに完全同調
          minPolarAngle={0.2}      
          maxPolarAngle={Math.PI - 0.2} 
          makeDefault 
        />
      </Canvas>
    </div>
  );
}

useGLTF.preload("/cute%20robot%203d%20model.glb");