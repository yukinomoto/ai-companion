import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Extrude } from "@react-three/drei";
import * as THREE from "three";

interface Companion3DProps {
  isLoading?: boolean;
}

function Robot({ isLoading = false }: Companion3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftWingRef = useRef<THREE.Group>(null);
  const rightWingRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const faceGroupRef = useRef<THREE.Group>(null); // 顔全体を動かすためのグループ

  // 💡 1. ボディの形状（よりふっくらとした、可愛らしいしずく型に）
  const bodyGeometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(1, 64, 64);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      // 下半分をすぼませるが、極端に細くしすぎない
      const factor = (y + 1) / 2;
      const taper = 0.45 + 0.55 * Math.sin(factor * Math.PI / 2);

      pos.setX(i, x * taper);
      pos.setZ(i, z * taper);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // 💡 2. フェイスパネル（横長の角丸長方形）
  const faceGeometrySettings = useMemo(() => {
    const shape = new THREE.Shape();
    const width = 1.3;  // 横幅を広めに
    const height = 0.7; // 縦幅を狭めに
    const radius = 0.3; // 角を丸く

    shape.moveTo(-width / 2 + radius, height / 2);
    shape.lineTo(width / 2 - radius, height / 2);
    shape.quadraticCurveTo(width / 2, height / 2, width / 2, height / 2 - radius);
    shape.lineTo(width / 2, -height / 2 + radius);
    shape.quadraticCurveTo(width / 2, -height / 2, width / 2 - radius, -height / 2);
    shape.lineTo(-width / 2 + radius, -height / 2);
    shape.quadraticCurveTo(-width / 2, -height / 2, -width / 2, -height / 2 + radius);
    shape.lineTo(-width / 2, height / 2 - radius);
    shape.quadraticCurveTo(-width / 2, height / 2, -width / 2 + radius, height / 2);

    return {
      shape,
      settings: { depth: 0.05, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.02, bevelThickness: 0.02 }
    };
  }, []);

  // 💡 3. 三角形の羽
  const wingGeometrySettings = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.35, 0.2);
    shape.lineTo(0.35, -0.2);
    shape.closePath();

    return { shape, settings: { depth: 0.04, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.02, bevelThickness: 0.02 } };
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current || !leftWingRef.current || !rightWingRef.current || !faceGroupRef.current) return;

    // 全体のゆっくりした浮遊
    groupRef.current.position.y = Math.sin(t * 1.5) * 0.06;

    if (isLoading) {
      // 🤔 【思考中】顔だけ少し傾げ、羽が不規則に揺れる
      faceGroupRef.current.rotation.z = Math.sin(t * 2.0) * 0.06; 
      leftWingRef.current.position.y = Math.sin(t * 1.5) * 0.05;
      rightWingRef.current.position.y = Math.cos(t * 1.5) * 0.05;

      // 目をなめらかに点滅
      const flash = (Math.sin(t * 8) + 1) / 2 * 0.5 + 0.5;
      if (leftEyeRef.current) (leftEyeRef.current.material as THREE.MeshBasicMaterial).opacity = flash;
      if (rightEyeRef.current) (rightEyeRef.current.material as THREE.MeshBasicMaterial).opacity = flash;
    } else {
      // 😌 【通常時】
      faceGroupRef.current.rotation.z = 0;
      
      // 羽の独立浮遊（本体とは少しずらす）
      leftWingRef.current.position.y = Math.sin(t * 2.0) * 0.04;
      leftWingRef.current.rotation.z = Math.sin(t * 1.5) * 0.04;
      rightWingRef.current.position.y = Math.cos(t * 2.0) * 0.04;
      rightWingRef.current.rotation.z = -Math.sin(t * 1.5) * 0.04;

      if (leftEyeRef.current) (leftEyeRef.current.material as THREE.MeshBasicMaterial).opacity = 1.0;
      if (rightEyeRef.current) (rightEyeRef.current.material as THREE.MeshBasicMaterial).opacity = 1.0;
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.2, 0]}>
      {/* 1. しずく型メインボディ */}
      <mesh geometry={bodyGeometry} scale={[1.2, 1.4, 1.1]}>
        <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.1} />
      </mesh>

      {/* 顔パーツ全体をグループ化して一緒に動かす */}
      <group ref={faceGroupRef} position={[0, 0.2, 0.9]}>
        {/* 2. 黒いフェイスパネル（ボディより少し前に出して立体感を出す） */}
        <Extrude args={[faceGeometrySettings.shape, faceGeometrySettings.settings]} position={[0, 0, 0]}>
          <meshStandardMaterial color="#0b1320" roughness={0.1} metalness={0.6} />
        </Extrude>

        {/* 3. 目（シアンネオンブルー、少し離れ目に） */}
        <mesh ref={leftEyeRef} position={[-0.28, 0.08, 0.06]}>
          <sphereGeometry args={[0.07, 32, 32]} />
          <meshBasicMaterial color="#00e5ff" transparent />
        </mesh>
        <mesh ref={rightEyeRef} position={[0.28, 0.08, 0.06]}>
          <sphereGeometry args={[0.07, 32, 32]} />
          <meshBasicMaterial color="#00e5ff" transparent />
        </mesh>

        {/* 4. 口（小さく控えめな笑顔） */}
        {!isLoading ? (
          <mesh position={[0, -0.12, 0.06]} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.08, 0.015, 16, 32, Math.PI]} />
            <meshBasicMaterial color="#00e5ff" />
          </mesh>
        ) : (
          <mesh position={[0, -0.12, 0.06]}>
            <boxGeometry args={[0.1, 0.02, 0.02]} />
            <meshBasicMaterial color="#00e5ff" />
          </mesh>
        )}
      </group>

      {/* 5. 左の羽 */}
      <group ref={leftWingRef} position={[-1.35, -0.2, 0.2]}>
        <Extrude args={[wingGeometrySettings.shape, wingGeometrySettings.settings]} rotation={[0, Math.PI, 0]}>
          <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.1} />
        </Extrude>
      </group>

      {/* 6. 右の羽 */}
      <group ref={rightWingRef} position={[1.35, -0.2, 0.2]}>
        <Extrude args={[wingGeometrySettings.shape, wingGeometrySettings.settings]} rotation={[0, 0, 0]}>
          <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.1} />
        </Extrude>
      </group>
    </group>
  );
}

export function Companion3D({ isLoading = false }: Companion3DProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%", // 親要素の高さいっぱいに広げる
        overflow: "hidden",
        background: "transparent",
        display: "flex",
        justifyContent: "center",
        alignItems: "center"
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 45 }} // カメラを少し引いて全体を映す
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 6, 6]} intensity={2.0} color="#ffffff" />
        <directionalLight position={[-5, 3, -2]} intensity={0.8} color="#e0f2fe" />
        <pointLight position={[0, -2, 3]} intensity={1.0} color="#f0f9ff" />

        <Robot isLoading={isLoading} />
      </Canvas>
    </div>
  );
}