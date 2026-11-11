import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Environment, Html, useProgress } from '@react-three/drei';
import { Group, MathUtils, PerspectiveCamera } from 'three';
import type { Product } from '../../../shared/types';
import { referencePlayers } from '../../../shared/referencePlayers';
import { JerseyModel, assetUrl } from './JerseyModel';
import { SceneBoundary } from './SceneBoundary';
import { JerseyArtwork } from './ProductCard';
import { openJerseyGap, pushJerseys, type RailBounds } from './railPhysics';
import { createClothMotion, createClothUniforms, updateClothMotion } from './clothMotion';

export const positions = ['GK', 'DEF', 'MID', 'FWD'] as const;
export const positionNames = {
  GK: 'Goalkeepers',
  DEF: 'Defenders',
  MID: 'Midfielders',
  FWD: 'Forwards',
};
type SceneProps = {
  products: Product[];
  filter: string;
  selected: Product | null;
  hovered: Product | null;
  onSelect: (product: Product | null) => void;
  onHover: (product: Product | null) => void;
  rotation: number;
  reset: number;
  onReady: () => void;
  onProgress: (progress: number) => void;
};

function ReferenceCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const perspective = camera as PerspectiveCamera;
    const aspect = 3440 / 1440;
    const fullWidth = Math.max(size.width, size.height * aspect);
    const fullHeight = fullWidth / aspect;
    perspective.position.set(0, 1.5, 5.6);
    perspective.fov = 19.5;
    perspective.aspect = aspect;
    perspective.setViewOffset(
      fullWidth,
      fullHeight,
      (fullWidth - size.width) / 2,
      (fullHeight - size.height) / 2,
      size.width,
      size.height,
    );
    perspective.lookAt(0, 1.44, 0);
    perspective.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

function LoadingProgress({ onProgress }: { onProgress: (progress: number) => void }) {
  const { progress } = useProgress();
  useEffect(() => onProgress(progress), [progress, onProgress]);
  return null;
}

type HangingJerseyProps = {
  product: Product;
  x: number;
  selected: boolean;
  hovered: boolean;
  dragging: boolean;
  railVelocity: { current: number };
  waveIndex: number;
  clearance: number;
  rotation: number;
  onSelect: (product: Product) => void;
  onHover: (product: Product | null) => void;
  onDragStart: (id: string) => void;
  onDrag: (id: string, delta: number) => void;
  onDragEnd: () => void;
};

function HangingJersey({
  product,
  x,
  selected,
  hovered,
  dragging,
  railVelocity,
  waveIndex,
  clearance,
  rotation,
  onSelect,
  onHover,
  onDragStart,
  onDrag,
  onDragEnd,
}: HangingJerseyProps) {
  const group = useRef<Group>(null);
  const initialPosition = useRef<[number, number, number]>([x, 1.95, 0]);
  const cloth = useRef<Group>(null);
  const { gl, size } = useThree();
  const angle = useRef(0);
  const motion = useRef(createClothMotion());
  const clothUniforms = useMemo(createClothUniforms, []);
  const reducedMotion = useRef(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      reducedMotion.current = preference.matches;
    };
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const press = useRef<{ x: number; angle: number; moved: boolean } | null>(null);
  useEffect(() => {
    angle.current = 0;
  }, [selected]);
  useFrame((_state, delta) => {
    if (!group.current || !cloth.current) return;
    const model = group.current;
    const previousX = model.position.x;
    model.position.x = MathUtils.damp(
      model.position.x,
      selected ? (size.width > 900 ? -0.53 : 0) : x,
      14,
      delta,
    );
    model.position.y = MathUtils.damp(model.position.y, selected ? 1.86 : 1.95, 8, delta);
    model.position.z = MathUtils.damp(model.position.z, selected ? 2.55 : 0, 8, delta);
    // The hanger never receives this rotation. Only the cloth turns around its neck.
    cloth.current.rotation.y = MathUtils.damp(
      cloth.current.rotation.y,
      selected
        ? Math.PI + rotation + angle.current
        : dragging
          ? Math.PI * 0.66
          : hovered
            ? Math.PI
            : Math.PI / 2,
      7,
      delta,
    );
    // Drive the fabric from actual movement, including neighbors being pushed along the rail.
    const velocity = (model.position.x - previousX) / Math.max(delta, 0.001) + railVelocity.current;
    updateClothMotion(motion.current, selected || reducedMotion.current ? 0 : velocity, delta);
    const width =
      Math.abs(Math.cos(cloth.current.rotation.y)) * 0.296 +
      Math.abs(Math.sin(cloth.current.rotation.y)) * 0.059;
    clothUniforms.uClothBend.value = reducedMotion.current ? 0 : motion.current.bend;
    clothUniforms.uClothRipple.value = reducedMotion.current ? 0 : motion.current.ripple;
    clothUniforms.uClothEnergy.value = reducedMotion.current ? 0 : motion.current.energy;
    clothUniforms.uClothTime.value = motion.current.phase + waveIndex * 0.24;
    clothUniforms.uClothYaw.value = cloth.current.rotation.y;
    clothUniforms.uClothClearance.value = Math.max(0, clearance - width - 0.02);
    const scale = selected ? (size.width < 760 ? 0.68 : 1) : 1;
    model.scale.setScalar(MathUtils.damp(model.scale.x, scale, 8, delta));
  });
  function pointerDown(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    press.current = { x: event.clientX, angle: angle.current, moved: false };
    if (!selected) onDragStart(product.id);
    (event.target as Element).setPointerCapture(event.pointerId);
    gl.domElement.style.cursor = 'grabbing';
  }
  function pointerMove(event: ThreeEvent<PointerEvent>) {
    if (!press.current) return;
    event.stopPropagation();
    const delta = event.clientX - press.current.x;
    if (Math.abs(delta) > 4) press.current.moved = true;
    if (!press.current.moved) return;
    if (selected) angle.current = press.current.angle + delta * 0.012;
    else {
      const visibleWorldWidth =
        (2 * Math.tan(((19.5 / 2) * Math.PI) / 180) * 5.6 * size.width) / size.height;
      onDrag(product.id, (delta / size.width) * visibleWorldWidth);
    }
  }
  function finishDrag() {
    press.current = null;
    onDragEnd();
    gl.domElement.style.cursor = 'grab';
  }
  function pointerUp(event: ThreeEvent<PointerEvent>) {
    if (!press.current) return;
    event.stopPropagation();
    const moved = press.current.moved;
    (event.target as Element).releasePointerCapture(event.pointerId);
    finishDrag();
    if (!moved) {
      if (selected) angle.current += Math.PI;
      else onSelect(product);
    }
    console.log(
      selected ? '[rotateJersey]' : moved ? '[slideJerseys]' : '[selectJersey]',
      product.id,
    );
  }
  return (
    <group
      name={`rail-${product.id}`}
      ref={group}
      position={initialPosition.current}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={finishDrag}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover(product);
        if (!press.current) gl.domElement.style.cursor = 'grab';
      }}
      onPointerOut={() => {
        if (!press.current) {
          onHover(null);
          gl.domElement.style.cursor = 'auto';
        }
      }}
    >
      <JerseyModel product={product} clothRef={cloth} clothUniforms={clothUniforms} />
      {hovered && !selected && (
        <Html
          position={[0, -1.12, 0]}
          center
          style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
        >
          <div className="ref-hover-card">
            <p>
              <b>{product.number}</b> {referencePlayers[product.number]?.name || product.player}
            </p>
            <span>
              {positionNames[product.position].replace(/s$/, '')} ·{' '}
              {referencePlayers[product.number]?.club || 'Indonesia'}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

function getInterGroupGap(posA: string, posB: string, isMobile: boolean): number {
  if (posA === posB) return 0;
  // Center gap between DEF and MID is the widest, leaving space around the center pillar
  if ((posA === 'DEF' && posB === 'MID') || (posA === 'MID' && posB === 'DEF')) {
    return isMobile ? 0.36 : 0.28;
  }
  return isMobile ? 0.24 : 0.16;
}

function Scene({
  products,
  filter,
  selected,
  onSelect,
  onHover,
  rotation,
  reset,
  onReady,
  hovered,
}: SceneProps) {
  const { size } = useThree();
  const sorted = useMemo(
    () =>
      [...products]
        .filter((product) => filter === 'ALL' || product.position === filter)
        .sort(
          (a, b) =>
            positions.indexOf(a.position) - positions.indexOf(b.position) ||
            Number(a.number) - Number(b.number),
        ),
    [products, filter],
  );
  const visibleIds = sorted.map((product) => product.id).join(',');
  const worldWidth = (2 * Math.tan(((19.5 / 2) * Math.PI) / 180) * 5.6 * size.width) / size.height;
  const isMobile = size.width < 760;
  const mobileSpacing = (worldWidth + 0.6) / 3 + 0.02;
  const groupCount = new Set(sorted.map((product) => product.position)).size;
  const halfWidth = isMobile
    ? Math.max(
        1.75,
        ((sorted.length - 1) * mobileSpacing + Math.max(0, groupCount - 1) * 0.28) / 2 + 0.2,
      )
    : Math.min(1.7, worldWidth / 2 - 0.14);
  const bounds: RailBounds = {
    min: -halfWidth,
    max: halfWidth,
    gap: Math.min(0.065, (halfWidth * 2 - 0.78) / Math.max(1, sorted.length - 3)),
  };
  const initialPositions = useMemo(() => {
    if (!sorted.length) return [];
    if (groupCount <= 1) {
      const spacing = isMobile
        ? mobileSpacing
        : Math.min(0.14, 2.2 / Math.max(1, sorted.length - 1));
      const totalWidth = (sorted.length - 1) * spacing;
      return sorted.map((_, i) => i * spacing - totalWidth / 2);
    }

    const spacing = isMobile ? 0.15 : 0.088;
    const result: number[] = [];
    let cursor = 0;
    sorted.forEach((product, index) => {
      if (index > 0) {
        const prev = sorted[index - 1];
        if (prev.position !== product.position) {
          cursor += getInterGroupGap(prev.position, product.position, isMobile);
        } else {
          cursor += spacing;
        }
      }
      result.push(cursor);
    });

    let defLastIndex = -1;
    let midFirstIndex = -1;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].position === 'DEF') defLastIndex = i;
      if (sorted[i].position === 'MID' && midFirstIndex === -1) midFirstIndex = i;
    }

    const center =
      defLastIndex !== -1 && midFirstIndex !== -1
        ? (result[defLastIndex] + result[midFirstIndex]) / 2
        : (result[0] + result[result.length - 1]) / 2;

    return result.map((x) => x - center);
  }, [visibleIds, isMobile, mobileSpacing, groupCount]);
  const [railPositions, setRailPositions] = useState(initialPositions);
  const [dragging, setDragging] = useState(false);
  const railGroup = useRef<Group>(null);
  const railTargetOffset = useRef(0);
  const railMomentum = useRef(0);
  const railVelocity = useRef(0);
  const drag = useRef<{
    id: string;
    origin: number;
    positions: number[];
    mobile: boolean;
    startOffset: number;
    lastOffset: number;
    lastTime: number;
  } | null>(null);
  const dragFrame = useRef<number | null>(null);
  const contentHalfWidth = Math.max(0, ...initialPositions.map(Math.abs)) + 0.15;
  const maxRailOffset = isMobile
    ? Math.max(Math.abs(initialPositions[0] ?? 0), Math.abs(initialPositions.at(-1) ?? 0))
    : Math.max(0, contentHalfWidth - Math.min(halfWidth, worldWidth / 2));
  useFrame((_state, delta) => {
    if (!railGroup.current) return;
    const boundedOffset = Math.max(
      -maxRailOffset,
      Math.min(maxRailOffset, railTargetOffset.current),
    );
    if (drag.current?.mobile) railMomentum.current = 0;
    else if (Math.abs(railMomentum.current) > 0.015) {
      railTargetOffset.current = Math.max(
        -maxRailOffset,
        Math.min(maxRailOffset, boundedOffset + railMomentum.current * delta),
      );
      railMomentum.current *= Math.exp(-4.5 * delta);
    } else {
      railMomentum.current = 0;
      railTargetOffset.current = boundedOffset;
    }
    const previousOffset = railGroup.current.position.x;
    railGroup.current.position.x = MathUtils.damp(
      previousOffset,
      railTargetOffset.current,
      18,
      delta,
    );
    railVelocity.current = (railGroup.current.position.x - previousOffset) / Math.max(delta, 0.001);
  });
  useEffect(
    () => () => {
      if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    },
    [],
  );
  const validPositions = railPositions.length === sorted.length ? railPositions : initialPositions;
  const hoveredIndex =
    !selected && !dragging ? sorted.findIndex((product) => product.id === hovered?.id) : -1;
  const displayPositions = openJerseyGap(validPositions, hoveredIndex, bounds);
  useEffect(() => {
    if (drag.current) return;
    setRailPositions(initialPositions);
    railTargetOffset.current = 0;
    railMomentum.current = 0;
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    drag.current = null;
    setDragging(false);
  }, [initialPositions, reset]);
  useEffect(() => {
    if (selected) {
      railTargetOffset.current = 0;
      railMomentum.current = 0;
    }
  }, [selected]);
  useEffect(() => {
    onReady();
  }, [onReady]);
  function startDrag(id: string) {
    const index = sorted.findIndex((product) => product.id === id);
    const mobile = size.width <= 760;
    drag.current = {
      id,
      origin: displayPositions[index],
      positions: [...displayPositions],
      mobile,
      startOffset: railTargetOffset.current,
      lastOffset: railTargetOffset.current,
      lastTime: 0,
    };
  }
  function moveDrag(id: string, delta: number) {
    if (!drag.current || drag.current.id !== id) return;
    if (drag.current.mobile) {
      setDragging(true);
      const offset = Math.max(
        -maxRailOffset,
        Math.min(maxRailOffset, drag.current.startOffset + delta),
      );
      const time = performance.now();
      if (drag.current.lastTime) {
        const elapsed = Math.max(0.001, (time - drag.current.lastTime) / 1000);
        railMomentum.current = Math.max(
          -2.5,
          Math.min(2.5, (offset - drag.current.lastOffset) / elapsed),
        );
      }
      drag.current.lastOffset = offset;
      drag.current.lastTime = time;
      railTargetOffset.current = offset;
      return;
    }
    const index = sorted.findIndex((product) => product.id === id);
    setDragging(true);
    // Use the last positions, so reversing direction does not pull pushed neighbors back.
    const next = pushJerseys(
      drag.current.positions,
      index,
      drag.current.origin + delta,
      bounds,
      0.45,
      0.32,
    );
    drag.current.positions = next;
    // Pointer events can arrive faster than display frames. Commit only the latest positions.
    if (dragFrame.current === null) {
      dragFrame.current = requestAnimationFrame(() => {
        dragFrame.current = null;
        if (drag.current) setRailPositions(drag.current.positions);
      });
    }
  }
  function endDrag() {
    if (dragFrame.current !== null) {
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = null;
      if (drag.current) setRailPositions(drag.current.positions);
    }
    const activeDrag = drag.current;
    drag.current = null;
    if (activeDrag?.mobile && activeDrag.lastTime) {
      const projectedOffset = activeDrag.lastOffset + railMomentum.current / 4.5;
      const nearestPosition = initialPositions.reduce(
        (nearest, position) =>
          Math.abs(position + projectedOffset) < Math.abs(nearest + projectedOffset)
            ? position
            : nearest,
        initialPositions[0] ?? 0,
      );
      railTargetOffset.current = -nearestPosition;
    }
    railMomentum.current = 0;
    setDragging(false);
  }
  function hoverJersey(product: Product | null) {
    if (!drag.current) onHover(product);
  }
  return (
    <>
      <ReferenceCamera />
      <ambientLight intensity={0.55} />
      <directionalLight position={[-2, 4, 3]} intensity={2.5} color="#ffe4bd" />
      <directionalLight position={[3, 3, 2]} intensity={1.7} color="#fff3db" />
      <Environment files={assetUrl('reference/probe_512.hdr')} environmentIntensity={0.55} />
      <group ref={railGroup}>
        {sorted.map((product, index) => (
          <HangingJersey
            key={product.id}
            product={product}
            x={displayPositions[index]}
            selected={selected?.id === product.id}
            hovered={hoveredIndex === index}
            dragging={dragging && !drag.current?.mobile && drag.current?.id === product.id}
            railVelocity={railVelocity}
            waveIndex={index}
            clearance={Math.min(
              index
                ? displayPositions[index] - displayPositions[index - 1] - 0.075
                : displayPositions[index] - bounds.min + 0.06,
              index < sorted.length - 1
                ? displayPositions[index + 1] - displayPositions[index] - 0.075
                : bounds.max - displayPositions[index] + 0.06,
            )}
            rotation={rotation}
            onSelect={onSelect}
            onHover={hoverJersey}
            onDragStart={startDrag}
            onDrag={moveDrag}
            onDragEnd={endDrag}
          />
        ))}
        {!selected &&
          positions.map((position) => {
            const members = sorted
              .map((product, index) => ({ product, index }))
              .filter(({ product }) => product.position === position);
            if (!members.length) return null;
            const x =
              members.reduce((sum, { index }) => sum + displayPositions[index], 0) / members.length;
            return (
              <Html
                key={position}
                position={[x, 1.988, 0]}
                center
                style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
              >
                <div className="ref-group-label">
                  <i />
                  {positionNames[position]} <b>{members.length}</b>
                  <i />
                </div>
              </Html>
            );
          })}
        {!selected && filter === 'ALL' && (
          <Html
            position={[0, 2.04, 0]}
            center
            style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
          >
            <div className="ref-rail-champions">CHAMPIONS</div>
          </Html>
        )}
      </group>
    </>
  );
}

export default function ReferenceScene(props: SceneProps) {
  const fallback = (
    <div className="ref-fallback">
      {props.products
        .filter((product) => props.filter === 'ALL' || product.position === props.filter)
        .map((product) => (
          <button
            key={product.id}
            onClick={() => {
              props.onReady();
              props.onSelect(product);
            }}
          >
            <JerseyArtwork product={product} back />
            <span>{product.player}</span>
          </button>
        ))}
    </div>
  );
  return (
    <SceneBoundary fallback={fallback}>
      <Suspense fallback={null}>
        <Canvas
          camera={{ position: [0, 1.5, 5.6], fov: 19.5 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true, localClippingEnabled: true }}
          fallback={fallback}
          onPointerMissed={() => props.onSelect(null)}
        >
          <Suspense fallback={null}>
            <Scene {...props} />
          </Suspense>
        </Canvas>
      </Suspense>
      <LoadingProgress onProgress={props.onProgress} />
    </SceneBoundary>
  );
}
