import { Suspense, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { Group, MathUtils } from 'three';
import { Rotate3D } from 'lucide-react';
import type { Product } from '../../../shared/types';
import { JerseyModel } from './JerseyModel';
import { SceneBoundary } from './SceneBoundary';
import { JerseyArtwork } from './ProductCard';

function RotatingJersey({ product, rotation }: { product: Product; rotation: number }) {
  const group = useRef<Group>(null);
  useFrame((_state, delta) => {
    if (group.current)
      group.current.rotation.y = MathUtils.damp(group.current.rotation.y, rotation, 6, delta);
  });
  return (
    <group ref={group} position={[0, 1.2, 0]} scale={3}>
      <JerseyModel product={product} />
    </group>
  );
}
export default function ProductViewer({ product }: { product: Product }) {
  const [rotation, setRotation] = useState(0);
  const [back, setBack] = useState(false);
  const fallback = (
    <div className="viewer-fallback">
      <JerseyArtwork product={product} back={back} />
      <button onClick={() => setBack(!back)}>View {back ? 'front' : 'back'}</button>
      <p>3D is unavailable on this device. You can still explore and shop this jersey.</p>
    </div>
  );
  return (
    <div className="viewer-container">
      <SceneBoundary fallback={fallback}>
        <Suspense fallback={<div className="scene-loading">Loading every detail…</div>}>
          <Canvas
            camera={{ position: [0, 0, 4.5], fov: 42 }}
            dpr={[1, 1.5]}
            shadows
            fallback={fallback}
          >
            <ambientLight intensity={1.6} />
            <directionalLight
              position={[3, 5, 5]}
              intensity={3}
              castShadow
              shadow-mapSize={[1024, 1024]}
            />
            <directionalLight position={[-3, 2, -4]} intensity={1.4} />
            <RotatingJersey product={product} rotation={rotation} />
            <ContactShadows position={[0, -1.4, 0]} opacity={0.25} scale={6} blur={2} far={3} />
            <OrbitControls
              enablePan={false}
              minDistance={2.8}
              maxDistance={6}
              minPolarAngle={0.5}
              maxPolarAngle={2.6}
            />
          </Canvas>
        </Suspense>
        <button
          className="turn-button"
          onClick={() => {
            setRotation((value) => value + Math.PI);
            console.log('[rotateJersey]', product.id);
          }}
        >
          <Rotate3D size={15} /> Turn jersey
        </button>
      </SceneBoundary>
    </div>
  );
}
