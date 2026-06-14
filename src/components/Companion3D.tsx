import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
// 💡 drei から RoundedBox（角丸3Dボックス）をインポート
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";

interface Companion3DProps {
  isLoading?: boolean;
}

function Robot({ isLoading = false }: Companion3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();

    // ぷかぷか浮遊ロジック
    groupRef.current.position.y = Math.sin(t * 1.5) * 0.08;
    // ゆっくり左右を見る
    groupRef.current.rotation.y = Math.sin(t * 0.4) * 0.12;

    // 思考中のアニメーションと目の点滅
    if (isLoading) {
      groupRef.current.rotation.z = Math.sin(t * 2.5) * 0.05;
      const flash = (Math.sin(t * 15) + 1) / 2;
      if (leftEyeRef.current) (leftEyeRef.current.material as THREE.MeshBasicMaterial).opacity = flash;
      if (rightEyeRef.current) (rightEyeRef.current.material as THREE.MeshBasicMaterial).opacity = flash;
    } else {
      groupRef.current.rotation.z = 0;
      if (leftEyeRef.current) (leftEyeRef.current.material as THREE.MeshBasicMaterial).opacity = 1.0;
      if (rightEyeRef.current) (rightEyeRef.current.material as THREE.MeshBasicMaterial).opacity = 1.0;
    }
  });

  return (
    <group ref={groupRef}>
      {/* 1. 本体（💡 RoundedBoxを使って、全方位が滑らかに丸まった立体的な四角を作成） */}
      <RoundedBox args={[2.2, 1.4, 1.2]} radius={0.4} smoothness={4}>
        <meshStandardMaterial color="#ffffff" roughness={0.15} metalness={0.1} />
      </RoundedBox>

      {/* 2. 顔パネル（💡 白いボディの表面[Z: 0.62]に、少し小さい黒い角丸四角をはめ込む） */}
      <RoundedBox args={[1.8, 1.0, 0.1]} radius={0.25} smoothness={4} position={[0, 0, 0.62]}>
        <meshStandardMaterial color="#05070a" roughness={0.05} metalness={0.5} />
      </RoundedBox>

      {/* 3. 左耳（💡 ボディの横幅に合わせて外側に配置） */}
      <mesh position={[1.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.25, 0.25, 0.15, 32]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} emissive="#38bdf8" emissiveIntensity={0.2} />
      </mesh>

      {/* 4. 右耳 */}
      <mesh position={[-1.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.25, 0.25, 0.15, 32]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} emissive="#38bdf8" emissiveIntensity={0.2} />
      </mesh>

      {/* 5. 左目（💡 顔パネルのさらに手前[Z: 0.68]に配置して飲み込まれを完全防止） */}
      <mesh ref={leftEyeRef} position={[0.35, 0.1, 0.68]}>
        <sphereGeometry args={[0.09, 32, 32]} />
        <meshBasicMaterial color={isLoading ? "#ff3b30" : "#38bdf8"} transparent />
      </mesh>

      {/* 6. 右目 */}
      <mesh ref={rightEyeRef} position={[-0.35, 0.1, 0.68]}>
        <sphereGeometry args={[0.09, 32, 32]} />
        <meshBasicMaterial color={isLoading ? "#ff3b30" : "#38bdf8"} transparent />
      </mesh>

      {/* 7. 口 */}
      <mesh position={[0, -0.15, 0.68]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.08, 0.02, 16, 32, Math.PI]} />
        <meshBasicMaterial color={isLoading ? "#ff3b30" : "#38bdf8"} />
      </mesh>
    </group>
  );
}

export function Companion3D({ isLoading = false }: Companion3DProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "260px",
        borderRadius: "20px",
        overflow: "hidden",
        background: "radial-gradient(circle at center, #ffffff 0%, #e4ecf8 100%)",
      }}
    >
      <Canvas
        camera={{
          position: [0, 0, 4.2], // 立体感が見えるようにカメラを調整
          fov: 45,
        }}
      >
        <ambientLight intensity={1.2} />
        {/* 斜め上から光を当てて、角丸の立体的な「丸み」を綺麗に浮き上がらせる */}
        <directionalLight position={[4, 5, 6]} intensity={2.5} />
        <pointLight position={[0, -3, 2]} intensity={1.5} color="#e3efff" />
        <pointLight position={[0, 2, 4]} intensity={1.0} />

        <Robot isLoading={isLoading} />
      </Canvas>
    </div>
  );
}