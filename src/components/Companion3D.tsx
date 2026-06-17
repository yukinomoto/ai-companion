// src/components/Companion3D.tsx
import { useRef, useEffect, useState } from "react";
import { Canvas, useFrame, createPortal } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export type Emotion = 'neutral' | 'happy' | 'sad' | 'surprised' | 'thinking' | 'sit_to_stand' | 'wave';

export interface FaceConfig {
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  width: number; height: number;
}

export const DEFAULT_FACE_CONFIG: FaceConfig = {
  x: 0,
  y: 0.12,
  z: 0.22,
  rx: 0,
  ry: 0, 
  rz: 0,
  width: 0.35,
  height: 0.12
};

interface Companion3DProps {
  isLoading?: boolean;
  emotion?: Emotion;
  faceConfig?: FaceConfig;
}

// ── 📺 顔スクリーンと目のコンポーネント ──
const FaceScreen = ({ emotion, headNode, config }: { emotion: Emotion, headNode: THREE.Object3D, config: FaceConfig }) => {
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);
  const blinkTimer = useRef(0);

  useFrame((state, delta) => {
    if (!leftEye.current || !rightEye.current) return;
    let targetScaleY = 1, targetScaleX = 1;
    switch (emotion) {
      case 'happy': targetScaleY = 0.2; break;
      case 'sad': targetScaleY = 0.6; break;
      case 'surprised': targetScaleY = 1.3; targetScaleX = 1.2; break;
      case 'thinking': targetScaleY = 0.8; break;
      case 'sit_to_stand': targetScaleY = 0.9; break;
      case 'wave': targetScaleY = 0.2; break;
      case 'neutral': default: targetScaleY = 1; break;
    }
    
    if (emotion === 'neutral' || emotion === 'thinking') {
      blinkTimer.current += delta;
      if (blinkTimer.current > 3) {
        if (blinkTimer.current < 3.1) targetScaleY = 0.05; 
        else if (blinkTimer.current > 3.2) blinkTimer.current = Math.random() * 1.5; 
      }
    }

    leftEye.current.scale.y += (targetScaleY - leftEye.current.scale.y) * 0.3;
    rightEye.current.scale.y += (targetScaleY - rightEye.current.scale.y) * 0.3;
    leftEye.current.scale.x += (targetScaleX - leftEye.current.scale.x) * 0.3;
    rightEye.current.scale.x += (targetScaleX - rightEye.current.scale.x) * 0.3;
  });

  const eyeRadius = config.height * 0.28; 
  const cylinderRadius = 0.3; 
  const thetaLength = config.width / cylinderRadius;

  return createPortal(
    <group position={[config.x, config.y, config.z]} rotation={[config.rx, config.ry, config.rz]}>
      <mesh position={[0, 0, -cylinderRadius]} frustumCulled={false}>
        <cylinderGeometry args={[cylinderRadius, cylinderRadius, config.height, 32, 1, true, -thetaLength / 2, thetaLength]} />
        <meshBasicMaterial color="#020202" polygonOffset={true} polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      <group position={[0, 0, -cylinderRadius]} rotation={[0, thetaLength * 0.22, 0]}>
        <mesh ref={leftEye} position={[0, 0, cylinderRadius + 0.005]} frustumCulled={false}>
          <circleGeometry args={[eyeRadius, 32]} />
          <meshBasicMaterial color="#e6b244" polygonOffset={true} polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      </group>
      <group position={[0, 0, -cylinderRadius]} rotation={[0, -thetaLength * 0.22, 0]}>
        <mesh ref={rightEye} position={[0, 0, cylinderRadius + 0.005]} frustumCulled={false}>
          <circleGeometry args={[eyeRadius, 32]} />
          <meshBasicMaterial color="#e6b244" polygonOffset={true} polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      </group>
    </group>,
    headNode
  );
};

// ── 🤖 ロボットモデル本体 ──
function RobotModel({ isLoading = false, emotion = 'neutral', faceConfig = DEFAULT_FACE_CONFIG }: Companion3DProps) {
  const { scene } = useGLTF("/robot.glb");
  const modelRef = useRef<THREE.Group>(null);
  const [headNode, setHeadNode] = useState<THREE.Object3D | null>(null);

  const nodes = useRef<Record<string, THREE.Object3D | null>>({});
  const prevEmotion = useRef(emotion);
  const [emotionStartTime, setEmotionStartTime] = useState(0);

  const findNode = (root: THREE.Object3D, keywords: string[], fallbackName: string) => {
    let found: THREE.Object3D | null = null;
    root.traverse((child) => {
      if (child.type === 'Bone') {
        const name = child.name.toLowerCase();
        if (keywords.some(k => name.includes(k)) && !found) found = child;
      }
    });
    if (!found) found = root.getObjectByName(fallbackName) || null;
    return found;
  };

  useEffect(() => {
    scene.traverse((child) => {
      child.frustumCulled = false;
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const head = findNode(scene, ['head', 'neck'], 'tripo_part_0');
    const spine = findNode(scene, ['spine2', 'chest', 'spine1', 'spine', 'body'], 'tripo_part_1'); 
    const armL = findNode(scene, ['leftupperarm', 'leftarm', 'arm.l', 'arm_l'], 'tripo_part_4');
    const armR = findNode(scene, ['rightupperarm', 'rightarm', 'arm.r', 'arm_r'], 'tripo_part_2');

    nodes.current = { head, spine, armL, armR };

    if (head) setHeadNode(head);
    else setHeadNode(scene);
  }, [scene]);

  useFrame(({ clock }) => {
    if (!modelRef.current) return;
    const t = clock.getElapsedTime();
    
    if (prevEmotion.current !== emotion) {
      setEmotionStartTime(t);
      prevEmotion.current = emotion;
    }
    const localTime = t - emotionStartTime;

    modelRef.current.rotation.y = 0;

    const n = nodes.current;

    const BASE_HEAD_X = 0.25;

    let targetModelY = -1.0; 
    let spineX = 0, spineY = 0, spineZ = 0;
    
    let headX = BASE_HEAD_X, headY = 0, headZ = 0;
    let armLX = 0, armLY = 0, armLZ = 0;
    let armRX = 0, armRY = 0, armRZ = 0;

    if (isLoading) {
      headZ = Math.sin(t * 10) * 0.12;
      headY = Math.cos(t * 15) * 0.08;
      armLZ = 0.1; armRZ = -0.1;
    } 
    else if (emotion === 'happy') {
      // 💡 激しいジャンプをやめ、腕を上げて嬉しそうに穏やかに揺れるモーションに変更
      targetModelY = -1.0; // 足をちゃんと地面につける
      spineX = Math.sin(t * 2) * 0.02; // 体をほんの少し前後に揺らす
      spineZ = Math.cos(t * 2) * 0.04; // 体をほんの少し左右に揺らす
      
      // 腕を上げて「わーい」というポーズ
      armLX = -0.2; 
      armRX = -0.2;
      armLZ = 0.8 + Math.sin(t * 4) * 0.05; // 腕の先だけ少しパタパタ
      armRZ = -0.8 - Math.sin(t * 4) * 0.05;
      
      headZ = Math.sin(t * 2) * 0.05; // 嬉しそうに首を少し横に揺らす
    } 
    else if (emotion === 'sad') {
      const sigh = Math.sin(t * 1.5);
      spineX = 0.22 + sigh * 0.03; 
      headX = BASE_HEAD_X + 0.15 + sigh * 0.02; 
      armLX = 0.1; armLZ = -0.05;  
      armRX = 0.1; armRZ = 0.05;
    } 
    else if (emotion === 'surprised') {
      const shudder = Math.sin(t * 50) * 0.008; 
      spineX = -0.22 + shudder; 
      headX = BASE_HEAD_X - 0.2 + shudder; 
      armLX = -0.1; armLZ = 0.65; 
      armRX = -0.1; armRZ = -0.65;
    } 
    else if (emotion === 'thinking') {
      headZ = Math.sin(t * 1.2) * 0.05; 
      headY = 0.15; 
      spineX = Math.cos(t * 0.8) * 0.03;
      armLX = -0.55 + Math.sin(t * 2) * 0.04; 
      armLZ = 0.42;
      armLY = 0.35; 
      armRX = 0.1; armRZ = -0.1; 
    } 
    else if (emotion === 'wave') {
      spineZ = Math.sin(t * 4) * 0.05; 
      armLX = 0.1; armLZ = -0.05; 
      armRZ = -1.5; 
      armRX = Math.sin(t * 15) * 0.4 - 0.2; 
      armRY = Math.sin(t * 15) * 0.5;
      headZ = Math.sin(t * 15) * 0.05; 
    }
    else if (emotion === 'sit_to_stand') {
      const sitDuration = 1.5; 
      const standDuration = 1.0; 
      const progress = Math.min(1, Math.max(0, localTime - sitDuration) / standDuration);
      const sitWeight = 1 - progress;
      
      targetModelY = -1.0 - (0.8 * sitWeight); 
      spineX = 0.6 * sitWeight; 
      headX = BASE_HEAD_X - 0.4 * sitWeight; 
      armLX = 0.4 * sitWeight; 
      armRX = 0.4 * sitWeight;
      armLZ = 0.1 * sitWeight;
      armRZ = -0.1 * sitWeight;
    }
    else {
      const breath = Math.sin(t * 2.5);
      targetModelY = -1.0 + breath * 0.015; 
      spineX = breath * 0.02;              
      
      const idleCycle = t % 6;
      if (idleCycle > 4.2) {
        headY = Math.sin(t * 2.5) * 0.2;
      } else {
        headY = 0; headZ = 0;
      }
      
      armLX = Math.sin(t * 2.5) * 0.05;
      armRX = Math.sin(t * 2.5 + Math.PI) * 0.05;
      armLZ = 0.02; armRZ = -0.02;
    }

    const applySmoothRot = (node: THREE.Object3D | null, x: number, y: number, z: number) => {
      if (!node) return;
      const targetEuler = new THREE.Euler(x, y, z, 'XYZ');
      const targetQuat = new THREE.Quaternion().setFromEuler(targetEuler);
      node.quaternion.slerp(targetQuat, 0.15); 
    };

    modelRef.current.position.y += (targetModelY - modelRef.current.position.y) * 0.15;

    applySmoothRot(n.spine, spineX, spineY, spineZ);
    applySmoothRot(n.head, headX, headY, headZ);
    applySmoothRot(n.armL, armLX, armLY, armLZ);
    applySmoothRot(n.armR, armRX, armRY, armRZ);
  });

  return (
    <>
      <primitive ref={modelRef} object={scene} scale={2.5} position={[0, -1, 0]} />
      {headNode && <FaceScreen emotion={emotion} headNode={headNode} config={faceConfig} />}
    </>
  );
}

export function Companion3D({ isLoading = false, emotion = 'neutral', faceConfig = DEFAULT_FACE_CONFIG }: Companion3DProps) {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", background: "transparent", display: "flex", justifyContent: "center", alignItems: "center" }}>
      <Canvas shadows camera={{ position: [0, 0.6, 4.2], fov: 42 }} style={{ background: "transparent" }}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 8, 5]} intensity={2.0} color="#ffffff" castShadow />
        <directionalLight position={[-5, 3, 2]} intensity={1.0} color="#bae6fd" />
        <directionalLight position={[0, -4, -1]} intensity={0.5} color="#d8b4fe" />
        <pointLight position={[0, 2, 2]} intensity={0.5} color="#ffffff" />
        <RobotModel isLoading={isLoading} emotion={emotion} faceConfig={faceConfig} />
        <OrbitControls enableZoom={false} enablePan={false} target={[0, 0.5, 0]} minPolarAngle={0.2} maxPolarAngle={Math.PI - 0.2} makeDefault />
      </Canvas>
    </div>
  );
}

useGLTF.preload("/robot.glb");