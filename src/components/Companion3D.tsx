// src/components/Companion3D.tsx
import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Extrude } from "@react-three/drei";
import * as THREE from "three";

export type Emotion = 'neutral' | 'happy' | 'sad' | 'surprised' | 'thinking';

interface Companion3DProps {
  isLoading?: boolean;
  emotion?: Emotion;
}

function Robot({ isLoading = false, emotion = 'neutral' }: Companion3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftWingRef = useRef<THREE.Group>(null);
  const rightWingRef = useRef<THREE.Group>(null);
  const faceGroupRef = useRef<THREE.Group>(null);

  // 現在のステータス（ローディング中は強制的にthinking）
  const currentEmotion = isLoading ? 'thinking' : emotion;

  // 1. ボディの形状（しずく型）
  const bodyGeometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(1, 64, 64);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const factor = (y + 1) / 2;
      const taper = 0.45 + 0.55 * Math.sin(factor * Math.PI / 2);
      pos.setX(i, x * taper);
      pos.setZ(i, z * taper);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // 2. フェイスパネル
  const faceGeometrySettings = useMemo(() => {
    const shape = new THREE.Shape();
    const width = 1.3, height = 0.7, radius = 0.3;
    shape.moveTo(-width / 2 + radius, height / 2);
    shape.lineTo(width / 2 - radius, height / 2);
    shape.quadraticCurveTo(width / 2, height / 2, width / 2, height / 2 - radius);
    shape.lineTo(width / 2, -height / 2 + radius);
    shape.quadraticCurveTo(width / 2, -height / 2, width / 2 - radius, -height / 2);
    shape.lineTo(-width / 2 + radius, -height / 2);
    shape.quadraticCurveTo(-width / 2, -height / 2, -width / 2, -height / 2 + radius);
    shape.lineTo(-width / 2, height / 2 - radius);
    shape.quadraticCurveTo(-width / 2, height / 2, -width / 2 + radius, height / 2);

    return { shape, settings: { depth: 0.05, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.02, bevelThickness: 0.02 } };
  }, []);

  // 3. 羽
  const wingGeometrySettings = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.35, 0.2);
    shape.lineTo(0.35, -0.2);
    shape.closePath();
    return { shape, settings: { depth: 0.04, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.02, bevelThickness: 0.02 } };
  }, []);

  // 💡 アニメーション制御（感情によるモーション変化）
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current || !leftWingRef.current || !rightWingRef.current || !faceGroupRef.current) return;

    // 感情ごとの目標位置（体）
    let targetBodyY = 0;
    let targetWingSpread = 1.35;
    
    if (currentEmotion === 'happy' || currentEmotion === 'surprised') {
      targetBodyY = 0.1; // 弾むように少し上がる
      targetWingSpread = 1.45; // 羽が広がる
    } else if (currentEmotion === 'sad') {
      targetBodyY = -0.15; // しょんぼり下がる
      targetWingSpread = 1.25; // 羽が閉じる
    }

    // 体全体の浮遊（感情のベース位置 + サイン波の揺れ）
    groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetBodyY + Math.sin(t * 1.5) * 0.06, 0.1);

    // 羽の位置と回転
    leftWingRef.current.position.x = THREE.MathUtils.lerp(leftWingRef.current.position.x, -targetWingSpread, 0.1);
    rightWingRef.current.position.x = THREE.MathUtils.lerp(rightWingRef.current.position.x, targetWingSpread, 0.1);

    if (currentEmotion === 'thinking') {
      faceGroupRef.current.rotation.z = Math.sin(t * 2.0) * 0.06; 
      leftWingRef.current.position.y = Math.sin(t * 1.5) * 0.05;
      rightWingRef.current.position.y = Math.cos(t * 1.5) * 0.05;
    } else if (currentEmotion === 'sad') {
      faceGroupRef.current.rotation.z = 0;
      leftWingRef.current.position.y = -0.1 + Math.sin(t * 1.0) * 0.02; // 羽が下がる
      rightWingRef.current.position.y = -0.1 + Math.cos(t * 1.0) * 0.02;
      leftWingRef.current.rotation.z = -0.2; // 羽が垂れる
      rightWingRef.current.rotation.z = 0.2;
    } else {
      faceGroupRef.current.rotation.z = 0;
      leftWingRef.current.position.y = Math.sin(t * 2.0) * 0.04;
      leftWingRef.current.rotation.z = Math.sin(t * 1.5) * 0.04;
      rightWingRef.current.position.y = Math.cos(t * 2.0) * 0.04;
      rightWingRef.current.rotation.z = -Math.sin(t * 1.5) * 0.04;
    }
  });

  // 💡 目と口のコンポーネント（感情で分岐）
  const renderEyes = () => {
    const eyeMaterial = <meshBasicMaterial color="#00e5ff" />;
    
    if (currentEmotion === 'happy') {
      // 笑顔の目（^ ^）
      return (
        <>
          <mesh position={[-0.28, 0.08, 0.06]} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.06, 0.02, 16, 32, Math.PI]} />
            {eyeMaterial}
          </mesh>
          <mesh position={[0.28, 0.08, 0.06]} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.06, 0.02, 16, 32, Math.PI]} />
            {eyeMaterial}
          </mesh>
        </>
      );
    } else if (currentEmotion === 'sad') {
      // 困り目（> <）
      return (
        <>
          <group position={[-0.28, 0.08, 0.06]} rotation={[0, 0, 0.4]}>
            <mesh><boxGeometry args={[0.12, 0.02, 0.02]} />{eyeMaterial}</mesh>
          </group>
          <group position={[0.28, 0.08, 0.06]} rotation={[0, 0, -0.4]}>
            <mesh><boxGeometry args={[0.12, 0.02, 0.02]} />{eyeMaterial}</mesh>
          </group>
        </>
      );
    } else if (currentEmotion === 'surprised') {
      // 驚き（丸目）
      return (
        <>
          <mesh position={[-0.28, 0.1, 0.06]}><sphereGeometry args={[0.08, 32, 32]} />{eyeMaterial}</mesh>
          <mesh position={[0.28, 0.1, 0.06]}><sphereGeometry args={[0.08, 32, 32]} />{eyeMaterial}</mesh>
        </>
      );
    }
    
    // 通常・思考中
    return (
      <>
        <mesh position={[-0.28, 0.08, 0.06]}><sphereGeometry args={[0.07, 32, 32]} />{eyeMaterial}</mesh>
        <mesh position={[0.28, 0.08, 0.06]}><sphereGeometry args={[0.07, 32, 32]} />{eyeMaterial}</mesh>
      </>
    );
  };

  const renderMouth = () => {
    const mouthMaterial = <meshBasicMaterial color="#00e5ff" />;
    
    if (currentEmotion === 'sad') {
      return (
        <mesh position={[0, -0.15, 0.06]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.06, 0.015, 16, 32, Math.PI]} />
          {mouthMaterial}
        </mesh>
      );
    } else if (currentEmotion === 'surprised') {
      return (
        <mesh position={[0, -0.15, 0.06]}>
          <sphereGeometry args={[0.04, 32, 32]} />
          {mouthMaterial}
        </mesh>
      );
    } else if (currentEmotion === 'thinking') {
      return (
        <mesh position={[0, -0.12, 0.06]}>
          <boxGeometry args={[0.1, 0.02, 0.02]} />
          {mouthMaterial}
        </mesh>
      );
    }
    
    // 通常・笑顔
    return (
      <mesh position={[0, -0.12, 0.06]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.08, 0.015, 16, 32, Math.PI]} />
        {mouthMaterial}
      </mesh>
    );
  };

  return (
    <group ref={groupRef} position={[0, -0.2, 0]}>
      {/* 1. ボディ */}
      <mesh geometry={bodyGeometry} scale={[1.2, 1.4, 1.1]}>
        <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.1} />
      </mesh>

      {/* 2. 顔パーツ */}
      <group ref={faceGroupRef} position={[0, 0.2, 0.9]}>
        <Extrude args={[faceGeometrySettings.shape, faceGeometrySettings.settings]} position={[0, 0, 0]}>
          <meshStandardMaterial color="#0b1320" roughness={0.1} metalness={0.6} />
        </Extrude>
        {renderEyes()}
        {renderMouth()}
      </group>

      {/* 3. 左の羽 */}
      <group ref={leftWingRef} position={[-1.35, -0.2, 0.2]}>
        <Extrude args={[wingGeometrySettings.shape, wingGeometrySettings.settings]} rotation={[0, Math.PI, 0]}>
          <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.1} />
        </Extrude>
      </group>

      {/* 4. 右の羽 */}
      <group ref={rightWingRef} position={[1.35, -0.2, 0.2]}>
        <Extrude args={[wingGeometrySettings.shape, wingGeometrySettings.settings]} rotation={[0, 0, 0]}>
          <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.1} />
        </Extrude>
      </group>
    </group>
  );
}

export function Companion3D({ isLoading = false, emotion = 'neutral' }: Companion3DProps) {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", background: "transparent", display: "flex", justifyContent: "center", alignItems: "center" }}>
      <Canvas camera={{ position: [0, 0, 4.5], fov: 45 }} style={{ background: "transparent" }}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 6, 6]} intensity={2.0} color="#ffffff" />
        <directionalLight position={[-5, 3, -2]} intensity={0.8} color="#e0f2fe" />
        <pointLight position={[0, -2, 3]} intensity={1.0} color="#f0f9ff" />
        <Robot isLoading={isLoading} emotion={emotion} />
      </Canvas>
    </div>
  );
}