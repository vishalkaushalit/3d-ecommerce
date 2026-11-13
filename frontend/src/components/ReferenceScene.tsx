import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Html, useGLTF, useProgress } from '@react-three/drei';
import {
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Plane,
  Raycaster,
  ShadowMaterial,
  SpotLight,
  Vector2,
  Vector3,
} from 'three';
import roomSettings from '../../public/assets/reference/room.json';
import type { Product } from '../../../shared/types';
import { referencePlayers } from '../../../shared/referencePlayers';
import { JerseyModel, assetUrl } from './JerseyModel';
import { SceneBoundary } from './SceneBoundary';
import { JerseyArtwork } from './ProductCard';
import { RailSim, type Hanger } from './railSim';
import { createClothMotion, createClothUniforms, updateClothMotion } from './clothMotion';
import { clampDelta } from './spring';
import { AdaptiveQuality } from './AdaptiveQuality';
import { isIOSDevice, isLowPowerDevice } from './device';
import { WebGLGuard } from './WebGLGuard';

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
  /** False while the entry loader covers the room. */
  entered?: boolean;
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

function RoomLighting({
  selected,
  shadowsEnabled,
  stage,
}: {
  selected: boolean;
  shadowsEnabled: boolean;
  stage: Vector3;
}) {
  const key = useRef<SpotLight>(null);
  const fillLight = useRef<SpotLight>(null);
  const detailTarget = useMemo(() => new Group(), []);
  useFrame((_state, delta) => {
    // Aim the detail lights just below the stage hook, as on Garuda (stage - 0.42).
    detailTarget.position.set(stage.x, stage.y - 0.42, stage.z);
    if (key.current) key.current.intensity = MathUtils.damp(key.current.intensity, selected ? 18 : 0, 8, delta);
    if (fillLight.current) fillLight.current.intensity = MathUtils.damp(fillLight.current.intensity, selected ? 5 : 0, 8, delta);
  });
  const { scene } = useGLTF(assetUrl('reference/room.glb'));
  const lighting = useMemo(() => {
    const group = new Group();
    roomSettings.spots.forEach((spot, index) => {
      const light = new SpotLight(16771798, 11, 9, MathUtils.degToRad(spot.cone / 2), spot.blend, 2);
      light.position.set(spot.pos[0], spot.pos[2], -spot.pos[1]);
      light.target.position.set(spot.target[0], spot.target[2], -spot.target[1]);
      // Phones use the single key-light shadow below, refreshed every frame.
      // Skipping alternate frames leaves old silhouettes on moving fabric.
      light.castShadow = shadowsEnabled && !isLowPowerDevice && index % 2 === 0;
      light.shadow.mapSize.setScalar(isLowPowerDevice ? 768 : 1536);
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.01;
      light.shadow.radius = 6;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = 6;
      group.add(light, light.target);
    });
    const fill = new DirectionalLight(12572927, 0.55);
    fill.position.set(-3.2, 2.6, -0.9);
    fill.target.position.set(-0.4, 1.5, 0);
    group.add(fill, fill.target);
    return group;
  }, [shadowsEnabled]);
  const room = useMemo(() => {
    const model = scene.clone(true);
    const dark = new ShadowMaterial({ color: 0, opacity: 0.5 });
    const soft = new ShadowMaterial({ color: 0, opacity: 0.14 });
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      if (/^Part/.test(object.name)) { object.visible = false; return; }
      object.material = /^(Back|Shelf|Upper|SeatBase)/.test(object.name) ? soft : dark;
      object.receiveShadow = true;
    });
    return { model, dark, soft };
  }, [scene]);
  useEffect(() => () => {
    room.dark.dispose();
    room.soft.dispose();
    lighting.traverse((object) => {
      if (object instanceof SpotLight || object instanceof DirectionalLight) object.dispose();
    });
  }, [room, lighting]);
  return <>
    <primitive object={detailTarget} />
    {/* The key light always casts shadows, even while dark: the ShadowMaterial
        catchers only read the shadow map, so this is what throws the moving shirt
        shadows across the lockers and bench seats, as on the Garuda rail. */}
    <spotLight ref={key} position={[2.5, 2.9, 4.1]} target={detailTarget}
      intensity={0} distance={12} angle={MathUtils.degToRad(22)} penumbra={0.65} decay={2}
      color="#fff4e7"
      castShadow={shadowsEnabled}
      shadow-mapSize={isLowPowerDevice ? [512, 512] : [2048, 2048]}
      shadow-bias={-0.0003}
      shadow-normalBias={0.012}
      shadow-radius={4}
      shadow-camera-near={1}
      shadow-camera-far={6} />
    <spotLight ref={fillLight} position={[-1.9, 2.5, 4]} target={detailTarget}
      intensity={0} distance={10} angle={MathUtils.degToRad(40)} penumbra={0.7} decay={2}
      color="#cfe3ff" />
    <primitive object={lighting} />
    <primitive object={room.model} dispose={null} />
    <Environment files={assetUrl('reference/probe_512.hdr')} environmentIntensity={0.55} />
  </>;
}

const RAIL_Y = roomSettings.rail.z;
const RAIL_HALF = roomSettings.rail.half - 0.09;
const PLATE_ASPECT = roomSettings.plate[0] / roomSettings.plate[1];
const DESKTOP_STAGE = { y: 1.86, z: 2.55 };
const smoothstep = (value: number) => value * value * (3 - 2 * value);
const soften = (value: number, limit: number) => limit * Math.tanh(value / limit);

type HangingJerseyProps = {
  product: Product;
  index: number;
  sim: RailSim;
  stage: Vector3;
  selected: boolean;
  hovered: boolean;
  showHoverCard: boolean;
  registerGroup: (index: number, group: Group | null) => void;
};

/** Draws one hanger from the rail simulation. It never re-renders during a drag. */
function HangingJersey({
  product,
  index,
  sim,
  stage,
  selected,
  hovered,
  showHoverCard,
  registerGroup,
}: HangingJerseyProps) {
  const group = useRef<Group>(null);
  const cloth = useRef<Group>(null);
  const motion = useRef(createClothMotion());
  const clothUniforms = useMemo(createClothUniforms, []);
  const reducedMotion = useRef(false);
  const fly = useRef(0); // 0 on the rail, 1 on the stage
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      reducedMotion.current = preference.matches;
    };
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    registerGroup(index, group.current);
    return () => registerGroup(index, null);
  }, [index, registerGroup]);
  useFrame((_state, rawDelta) => {
    const model = group.current;
    const hanger = sim.hangers[index];
    if (!model || !cloth.current || !hanger) return;
    const delta = clampDelta(rawDelta);
    const onStage = sim.selected === hanger;
    const still = reducedMotion.current;
    // Fly between the rail and the stage with an eased blend, as on Garuda.
    fly.current += ((onStage ? 1 : 0) - fly.current) * Math.min(1, delta * 3.2);
    if (fly.current < 0.001) fly.current = 0;
    const blend = smoothstep(fly.current);
    const bob = still ? 0 : Math.sin(sim.t * 1.3) * 0.006 * blend;
    const previousX = model.position.x;
    model.position.set(
      MathUtils.lerp(hanger.x, stage.x, blend),
      MathUtils.lerp(RAIL_Y + hanger.lift, stage.y, blend) + bob,
      MathUtils.lerp(0, stage.z, blend),
    );
    // The whole hanger swings from its hook; only the cloth turns.
    model.rotation.set(
      still ? 0 : soften(hanger.sway, 0.3) * (1 - blend),
      0,
      still ? 0 : soften(hanger.tilt, 0.42) * (1 - blend),
    );
    cloth.current.rotation.y = hanger.yaw;

    // Fabric reacts to the real movement, including being knocked by neighbors.
    const velocity = (model.position.x - previousX) / Math.max(delta, 0.001);
    updateClothMotion(motion.current, onStage || still ? 0 : velocity, delta);
    const width =
      Math.abs(Math.cos(hanger.yaw)) * 0.296 + Math.abs(Math.sin(hanger.yaw)) * 0.059;
    const previous = sim.hangers[index - 1];
    const next = sim.hangers[index + 1];
    const clearance = onStage
      ? 1
      : Math.min(
          previous ? hanger.x - previous.x - 0.075 : hanger.x - sim.walls.min + 0.06,
          next ? next.x - hanger.x - 0.075 : sim.walls.max - hanger.x + 0.06,
        );
    clothUniforms.uClothBend.value = still ? 0 : motion.current.bend;
    clothUniforms.uClothRipple.value = still ? 0 : motion.current.ripple;
    clothUniforms.uClothEnergy.value = still ? 0 : motion.current.energy;
    clothUniforms.uClothTime.value = motion.current.phase + index * 0.24;
    clothUniforms.uClothYaw.value = hanger.yaw;
    clothUniforms.uClothClearance.value = Math.max(0, clearance - width - 0.02);
  });
  return (
    <group name={`rail-${product.id}`} ref={group}>
      <JerseyModel
        product={product}
        clothRef={cloth}
        clothUniforms={clothUniforms}
        receiveShadows={!isLowPowerDevice}
      />
      {showHoverCard && hovered && !selected && (
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

function getInterGroupGap(posA: string, posB: string): number {
  if (posA === posB) return 0;
  // Center gap between DEF and MID is the widest, leaving space around the center pillar
  if ((posA === 'DEF' && posB === 'MID') || (posA === 'MID' && posB === 'DEF')) return 0.28;
  return 0.16;
}

/**
 * Garuda's mobile layout: every shirt stays on the real rail, spread evenly,
 * with a wider gap between position groups. The camera zooms in and pans instead.
 */
function spreadOnRail(groupsInOrder: string[]) {
  const count = groupsInOrder.length;
  const breaks = groupsInOrder.filter((group, index) => index && group !== groupsInOrder[index - 1]).length;
  const min = -RAIL_HALF + 0.14;
  const max = RAIL_HALF - 0.14;
  const groupGap = 0.24;
  const step = Math.min(0.22, Math.max(0.1, (max - min - breaks * groupGap) / Math.max(1, count - 1 - breaks)));
  const span = (count - 1 - breaks) * step + breaks * groupGap;
  let x = (min + max) / 2 - span / 2;
  return groupsInOrder.map((group, index) => {
    if (index) x += group !== groupsInOrder[index - 1] ? groupGap : step;
    return x;
  });
}

type Press = {
  pointerId: number;
  x: number;
  y: number;
  time: number;
  moved: boolean;
  mode: 'grab' | 'sweep' | 'spin' | 'swipe' | 'none';
  onShirt: boolean;
  lastTime: number;
};

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
  const { size, gl, camera } = useThree();
  const isMobile = size.width <= 760; // same breakpoint as the page CSS (max-width: 760px)
  // As on Garuda, a phone keeps the whole squad on the rail: a position tab
  // moves the camera along the rail to that group instead of hiding shirts.
  const sorted = useMemo(
    () =>
      [...products]
        .filter((product) => isMobile || filter === 'ALL' || product.position === filter)
        .sort(
          (a, b) =>
            positions.indexOf(a.position) - positions.indexOf(b.position) ||
            Number(a.number) - Number(b.number),
        ),
    [products, filter, isMobile],
  );
  const visibleIds = sorted.map((product) => product.id).join(',');
  const worldWidth = (2 * Math.tan(((19.5 / 2) * Math.PI) / 180) * 5.6 * size.width) / size.height;
  const groupCount = new Set(sorted.map((product) => product.position)).size;
  const halfWidth = isMobile ? RAIL_HALF : worldWidth / 2 - 0.14;
  const initialPositions = useMemo(() => {
    if (!sorted.length) return [];
    if (isMobile) return spreadOnRail(sorted.map((product) => product.position));
    if (groupCount <= 1) {
      const spacing = Math.min(0.14, 2.2 / Math.max(1, sorted.length - 1));
      const totalWidth = (sorted.length - 1) * spacing;
      return sorted.map((_, i) => i * spacing - totalWidth / 2);
    }
    const result: number[] = [];
    let cursor = 0;
    sorted.forEach((product, index) => {
      if (index > 0) {
        const prev = sorted[index - 1];
        cursor +=
          prev.position !== product.position ? getInterGroupGap(prev.position, product.position) : 0.088;
      }
      result.push(cursor);
    });
    // Fill the desktop rail while reserving room for the end jerseys' sleeves.
    const span = result[result.length - 1] - result[0];
    const midpoint = (result[0] + result[result.length - 1]) / 2;
    const availableSpan = Math.max(0.5, worldWidth * 0.88 - 0.18);
    return result.map((x) => ((x - midpoint) / span) * availableSpan);
  }, [visibleIds, isMobile, groupCount, worldWidth]);

  // One simulation per visible set of shirts. It lives outside React state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sim = useMemo(() => new RailSim(initialPositions), [visibleIds]);
  sim.walls = { min: Math.max(-RAIL_HALF, -halfWidth), max: Math.min(RAIL_HALF, halfWidth) };
  sim.rotationOffset = rotation;

  /**
   * Camera framing, as on Garuda: the room plate is "cover"-fitted to the
   * screen. On a phone it is zoomed in (up to 1.22x) and panned sideways in
   * pixels, so the rail stays real and the camera travels along it.
   */
  const view = useRef({ pan: 0, maxPan: 0, focus: -1, detail: 0, swipeVelocity: 0, pressing: false, coasting: false });
  const stage = useMemo(() => new Vector3(0, DESKTOP_STAGE.y, DESKTOP_STAGE.z), []);
  const groups = useRef<(Group | null)[]>([]);
  const registerGroup = useCallback((index: number, group: Group | null) => {
    groups.current[index] = group;
  }, []);
  const tools = useMemo(
    () => ({ raycaster: new Raycaster(), ndc: new Vector2(), point: new Vector3(), plane: new Plane(new Vector3(0, 0, 1), 0) }),
    [],
  );

  const live = useRef({ sorted, isMobile, onSelect, onHover });
  live.current = { sorted, isMobile, onSelect, onHover };

  const applyView = (zoom: number) => {
    const perspective = camera as PerspectiveCamera;
    const { width, height } = size;
    let fullWidth = Math.max(width, height * PLATE_ASPECT) * zoom;
    const fullHeight = (fullWidth / PLATE_ASPECT);
    view.current.maxPan = isMobile ? Math.max(0, (fullWidth - width) / 2 - fullWidth * 0.12) : 0;
    view.current.pan = Math.max(-view.current.maxPan, Math.min(view.current.maxPan, view.current.pan));
    fullWidth = Math.max(fullWidth, width);
    perspective.aspect = PLATE_ASPECT;
    perspective.setViewOffset(
      fullWidth,
      fullHeight,
      (fullWidth - width) / 2 + view.current.pan,
      (fullHeight - height) / 2,
      width,
      height,
    );
    perspective.updateProjectionMatrix();
  };
  /** Screen x (in canvas pixels) of a point on the rail. */
  const railToScreen = (x: number) => {
    tools.point.set(x, RAIL_Y, 0).project(camera);
    return (tools.point.x * 0.5 + 0.5) * size.width;
  };
  /** Find the closest actual shirt, including displacement from its neighbors. */
  const nearestToCenter = () => {
    let best = 0;
    let bestDistance = Infinity;
    sim.hangers.forEach((hanger, index) => {
      const distance = Math.abs(railToScreen(hanger.x) - size.width / 2);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  };
  const focus = (index: number) => {
    if (!sim.hangers.length) return;
    const next = Math.max(0, Math.min(sim.hangers.length - 1, index));
    if (next === view.current.focus) return;
    view.current.coasting = false;
    view.current.focus = next;
    live.current.onHover(live.current.sorted[next] ?? null);
  };
  /**
   * Where the opened shirt hangs beside the squad sheet. As on Garuda: keep the
   * usual spot if the whole shirt clears the sheet. Otherwise (tall or narrow
   * windows, where the sheet takes over half the screen) center it in the free
   * space left of the sheet, and move it back from the camera until it fits.
   */
  const stageFit = useRef({ key: '', x: 0, z: DESKTOP_STAGE.z });
  const desktopStage = () => {
    const preferred = { x: size.width > 900 ? -0.53 : 0, z: DESKTOP_STAGE.z };
    const sheet = gl.domElement.ownerDocument.querySelector<HTMLElement>('.ref-squad');
    if (!sheet) return stageFit.current.key ? stageFit.current : preferred;
    const key = `${size.width}x${size.height}`;
    if (stageFit.current.key === key) return stageFit.current;
    // offsetLeft ignores the sheet's entry animation transform.
    const parentLeft = (sheet.offsetParent as HTMLElement | null)?.getBoundingClientRect().left ?? 0;
    const sheetLeft = sheet.offsetLeft + parentLeft - gl.domElement.getBoundingClientRect().left;
    const margin = 24;
    const shirtHalf = 0.31; // half the shirt's width across the sleeves
    const midY = DESKTOP_STAGE.y - 0.4;
    const toScreen = (x: number, z: number) => {
      tools.point.set(x, midY, z).project(camera);
      return (tools.point.x * 0.5 + 0.5) * size.width;
    };
    const toWorld = (screenX: number, z: number) => {
      tools.point.set(0, midY, z).project(camera);
      tools.ndc.set((screenX / size.width) * 2 - 1, tools.point.y);
      tools.raycaster.setFromCamera(tools.ndc, camera);
      tools.plane.constant = -z;
      const hit = tools.raycaster.ray.intersectPlane(tools.plane, tools.point);
      tools.plane.constant = 0;
      return hit ? hit.x : 0;
    };
    let fit = preferred;
    const fits =
      toScreen(preferred.x - shirtHalf, preferred.z) >= margin &&
      toScreen(preferred.x + shirtHalf, preferred.z) <= sheetLeft - margin;
    if (!fits) {
      const free = Math.max(120, sheetLeft - margin * 2);
      const halfPx = toScreen(shirtHalf, DESKTOP_STAGE.z) - toScreen(0, DESKTOP_STAGE.z);
      const cameraZ = camera.position.z;
      // On-screen size falls off with distance from the camera.
      const needed = (halfPx * 2 * (cameraZ - DESKTOP_STAGE.z)) / free;
      const z = MathUtils.clamp(cameraZ - needed, 0.6, DESKTOP_STAGE.z);
      fit = { x: toWorld(Math.max(free, sheetLeft) / 2, z), z };
    }
    stageFit.current = { key, ...fit };
    return stageFit.current;
  };
  const tick = useRef({ applyView, railToScreen, nearestToCenter, focus, desktopStage });
  tick.current = { applyView, railToScreen, nearestToCenter, focus, desktopStage };

  // Step the physics and the camera before the jerseys read them (negative priority runs first).
  useFrame((_state, rawDelta) => {
    const delta = clampDelta(rawDelta);
    const v = view.current;
    sim.step(delta);
    v.detail += ((sim.selected ? 1 : 0) - v.detail) * Math.min(1, delta * 3.2);
    const aspect = size.width / size.height;
    const browseZoom = isMobile && aspect < 1 ? Math.min(1.22, (1 / aspect) * 0.95) : 1;
    tick.current.applyView(MathUtils.lerp(browseZoom, 1, smoothstep(v.detail)));

    if (isMobile) {
      if (!sim.selected && !v.pressing && v.coasting) {
        // Integrate friction in seconds so 30/60/120 Hz devices travel the same distance.
        const decay = Math.exp(-6 * delta);
        const nextPan = v.pan + (v.swipeVelocity * 1000 * (1 - decay)) / 6;
        v.pan = MathUtils.clamp(nextPan, -v.maxPan, v.maxPan);
        v.swipeVelocity *= decay;
        tick.current.applyView(MathUtils.lerp(browseZoom, 1, smoothstep(v.detail)));
        if (Math.abs(v.swipeVelocity) < 0.025 || v.pan !== nextPan) {
          v.coasting = false;
          v.swipeVelocity = 0;
          tick.current.focus(tick.current.nearestToCenter());
        }
      }
      // The focused shirt faces you, and the camera eases until it is centered.
      if (!sim.selected && !v.pressing && !v.coasting && sim.hangers[v.focus]) {
        sim.hover(sim.hangers[v.focus]);
        const target = v.pan + tick.current.railToScreen(sim.hangers[v.focus].x) - size.width / 2;
        v.pan = MathUtils.damp(v.pan, MathUtils.clamp(target, -v.maxPan, v.maxPan), 5, delta);
        tick.current.applyView(MathUtils.lerp(browseZoom, 1, smoothstep(v.detail)));
      }
      // Phone stage: the hook sits 11.5% from the top of the screen, 0.6 in front of the rail.
      tools.ndc.set(0, 1 - 2 * 0.115);
      tools.raycaster.setFromCamera(tools.ndc, camera);
      tools.plane.constant = -0.6;
      if (tools.raycaster.ray.intersectPlane(tools.plane, tools.point)) stage.copy(tools.point);
      tools.plane.constant = 0;
    } else {
      const fit = tick.current.desktopStage();
      stage.set(fit.x, DESKTOP_STAGE.y, fit.z);
    }
  }, -1);

  // New slots after a resize or reset: glide there instead of jumping.
  useEffect(() => {
    sim.setHomes(initialPositions, true);
  }, [sim, initialPositions, reset]);

  // On a phone, start browsing from the shirt in the middle of the rail.
  useEffect(() => {
    if (!isMobile) {
      view.current.focus = -1;
      return;
    }
    view.current.pan = 0;
    view.current.coasting = false;
    view.current.swipeVelocity = 0;
    view.current.focus = -1;
    // Start on the chosen group's first shirt (GK by default), else the middle of the rail.
    let start = filter === 'ALL' ? -1 : sorted.findIndex((product) => product.position === filter);
    if (start < 0) {
      start = 0;
      initialPositions.forEach((x, index) => {
        if (Math.abs(x) < Math.abs(initialPositions[start])) start = index;
      });
    }
    tick.current.focus(start);
    // Only when the shirt set or the layout mode changes, not on every resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, isMobile, reset]);

  // The page owns the selection; the simulation follows it.
  const selectedIndex = selected ? sorted.findIndex((product) => product.id === selected.id) : -1;
  useEffect(() => {
    const hanger = selectedIndex >= 0 ? sim.hangers[selectedIndex] : null;
    if (hanger && sim.selected !== hanger) {
      view.current.coasting = false;
      view.current.swipeVelocity = 0;
      sim.open(hanger);
      if (isMobile) view.current.focus = selectedIndex;
    } else if (!hanger && sim.selected) sim.close();
  }, [sim, selectedIndex, isMobile]);

  // Hover can also come from the page (the number strip). On a phone that moves the focus.
  const hoveredIndex = hovered ? sorted.findIndex((product) => product.id === hovered.id) : -1;
  useEffect(() => {
    if (isMobile) {
      if (hoveredIndex >= 0) {
        view.current.coasting = false;
        view.current.focus = hoveredIndex;
      }
    } else sim.hover(hoveredIndex >= 0 ? sim.hangers[hoveredIndex] : null);
  }, [sim, hoveredIndex, isMobile]);

  useEffect(() => {
    if (sorted.length) onReady();
  }, [onReady, sorted.length]);

  // All input goes through the canvas, as on Garuda: grab, sweep, spin, swipe.
  // A shirt opens only on a real tap: under 5px of movement and under 450ms.
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.style.touchAction = 'none';
    const raycaster = new Raycaster();
    const plane = new Plane(new Vector3(0, 0, 1), 0);
    const pointer = new Vector2();
    const hit = new Vector3();
    const screen = new Vector3();
    let press: Press | null = null;
    let lastX = 0;
    let hoverId: string | null = null;

    const aim = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
    };
    const toRail = (clientX: number, clientY: number) => {
      aim(clientX, clientY);
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      return { x: hit.x, y: hit.y };
    };
    const selectedGroup = () => (sim.selected ? groups.current[sim.hangers.indexOf(sim.selected)] : null);
    const overSelected = (clientX: number, clientY: number) => {
      const group = selectedGroup();
      if (!group) return false;
      aim(clientX, clientY);
      return raycaster.intersectObject(group, true).length > 0;
    };
    const productOf = (hanger: Hanger | null) =>
      hanger ? live.current.sorted[sim.hangers.indexOf(hanger)] ?? null : null;
    const setHover = (hanger: Hanger | null) => {
      sim.hover(hanger);
      const product = productOf(sim.hovered);
      const id = product?.id ?? null;
      if (id !== hoverId) {
        hoverId = id;
        live.current.onHover(product);
      }
    };
    const updateCursor = (clientX: number, clientY: number) => {
      if (press?.mode === 'grab') canvas.style.cursor = 'grabbing';
      else if (sim.selected) canvas.style.cursor = overSelected(clientX, clientY) ? 'grab' : 'zoom-out';
      else canvas.style.cursor = sim.hovered ? 'grab' : 'default';
    };

    const down = (event: PointerEvent) => {
      if (press || !event.isPrimary) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* capture is optional */
      }
      lastX = event.clientX;
      const now = performance.now();
      const base: Press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: now, moved: false, mode: 'none', onShirt: false, lastTime: now };
      if (sim.selected) {
        sim.spinning = true;
        press = { ...base, mode: 'spin', onShirt: overSelected(event.clientX, event.clientY) };
        return;
      }
      if (live.current.isMobile) {
        // Phone: a finger on the rail pans the camera (the focused shirt keeps facing you).
        view.current.pressing = true;
        view.current.swipeVelocity = 0;
        view.current.coasting = false;
        press = { ...base, mode: 'swipe' };
        return;
      }
      const point = toRail(event.clientX, event.clientY);
      const hanger = point && sim.pick(point.x, point.y, RAIL_Y);
      if (point && hanger) {
        sim.grab(hanger, point.x);
        setHover(null);
        press = { ...base, mode: 'grab' };
      } else if (point && point.y < RAIL_Y + 0.15 && point.y > RAIL_Y - 0.9) {
        sim.sweep(point.x);
        press = { ...base, mode: 'sweep' };
      } else press = base;
      updateCursor(event.clientX, event.clientY);
    };

    const move = (event: PointerEvent) => {
      if (!event.isPrimary || (press && press.pointerId !== event.pointerId)) return;
      if (!press) {
        if (!sim.selected && !live.current.isMobile) {
          const point = toRail(event.clientX, event.clientY);
          setHover(point && sim.pick(point.x, point.y, RAIL_Y));
          updateCursor(event.clientX, event.clientY);
        }
        if (sim.selected) updateCursor(event.clientX, event.clientY);
        return;
      }
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) press.moved = true;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      if (press.mode === 'spin') sim.spin(dx * 0.012);
      else if (press.mode === 'swipe') {
        const v = view.current;
        v.pan = Math.max(-v.maxPan, Math.min(v.maxPan, v.pan - dx));
        // Smooth px/ms velocity by elapsed time, independent of touch event frequency.
        const now = performance.now();
        const elapsed = Math.max(1, now - press.lastTime);
        const velocity = MathUtils.clamp(-dx / elapsed, -2.5, 2.5);
        v.swipeVelocity = MathUtils.lerp(v.swipeVelocity, velocity, 1 - Math.exp(-elapsed / 40));
        press.lastTime = now;
      } else if (press.mode === 'grab' || press.mode === 'sweep') {
        const point = toRail(event.clientX, event.clientY);
        if (point) sim.dragTo(point.x);
      }
    };

    const finish = (event: PointerEvent, cancelled: boolean) => {
      if (!press || press.pointerId !== event.pointerId) return;
      const current = press;
      press = null;
      view.current.pressing = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      const tap = !cancelled && !current.moved && performance.now() - current.time < 450;
      const grabbed = sim.grabbed;
      sim.spinning = false;
      sim.release();
      const { sorted: list, onSelect: select } = live.current;

      if (current.mode === 'grab') {
        // Only a tap opens the detail card. A drag just moves the shirt.
        if (tap && grabbed) select(list[sim.hangers.indexOf(grabbed)] ?? null);
      } else if (current.mode === 'swipe') {
        if (tap) {
          // Tap the focused shirt to open it; tap a neighbor to bring it to the center.
          const point = toRail(event.clientX, event.clientY);
          const hanger = point && sim.pick(point.x, point.y, RAIL_Y);
          const index = hanger ? sim.hangers.indexOf(hanger) : -1;
          if (index >= 0 && index === view.current.focus) select(list[index] ?? null);
          else if (index >= 0) tick.current.focus(index);
        } else {
          // A held finger or cancelled touch must not launch an old flick.
          const v = view.current;
          v.swipeVelocity *= Math.exp(-Math.max(0, performance.now() - current.lastTime) / 80);
          v.coasting = !cancelled && Math.abs(v.swipeVelocity) >= 0.025;
          if (!v.coasting) {
            v.swipeVelocity = 0;
            tick.current.focus(tick.current.nearestToCenter());
          }
        }
      } else if (current.mode === 'spin' && tap) {
        const group = selectedGroup();
        if (current.onShirt && group) {
          // Tap the shirt: turn it toward the tapped side.
          group.getWorldPosition(screen).project(camera);
          const rect = canvas.getBoundingClientRect();
          const shirtX = rect.left + (screen.x * 0.5 + 0.5) * rect.width;
          sim.flip(event.clientX < shirtX ? -1 : 1);
        } else select(null); // Tap outside the shirt closes it.
      }
      if (!cancelled && !sim.selected && !live.current.isMobile) {
        const point = toRail(event.clientX, event.clientY);
        setHover(point && sim.pick(point.x, point.y, RAIL_Y));
      }
      updateCursor(event.clientX, event.clientY);
    };
    const up = (event: PointerEvent) => finish(event, false);
    const cancel = (event: PointerEvent) => finish(event, true);
    const leave = () => {
      if (!press && !live.current.isMobile) setHover(null);
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('lostpointercapture', cancel);
    canvas.addEventListener('pointerleave', leave);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('lostpointercapture', cancel);
      canvas.removeEventListener('pointerleave', leave);
      view.current.pressing = false;
      view.current.coasting = false;
      view.current.swipeVelocity = 0;
      sim.release();
      sim.spinning = false;
    };
  }, [gl, camera, sim]);

  return (
    <>
      <ReferenceCamera />
      <RoomLighting selected={Boolean(selected)} shadowsEnabled={sorted.length > 0} stage={stage} />
      <group>
        {sorted.map((product, index) => (
          <HangingJersey
            key={product.id}
            product={product}
            index={index}
            sim={sim}
            stage={stage}
            selected={selectedIndex === index}
            hovered={!selected && hoveredIndex === index}
            showHoverCard={!isMobile}
            registerGroup={registerGroup}
          />
        ))}
        {!selected &&
          positions.map((position) => {
            const members = sorted
              .map((product, index) => ({ product, index }))
              .filter(({ product }) => product.position === position);
            if (!members.length) return null;
            const x =
              members.reduce((sum, { index }) => sum + (initialPositions[index] ?? 0), 0) / members.length;
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
        {!selected && filter === 'ALL' && !isMobile && (
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

function RailFallback({
  products,
  filter,
  onReady,
  onSelect,
  signalReady = true,
}: SceneProps & { signalReady?: boolean }) {
  // A failed Canvas must also dismiss the loader; otherwise the fallback buttons
  // are covered by the entry screen and the visitor cannot reach the store.
  useEffect(() => {
    if (signalReady) onReady();
  }, [onReady, signalReady]);
  return (
    <div className="ref-fallback">
      {products
        .filter((product) => filter === 'ALL' || product.position === filter)
        .map((product) => (
          <button
            key={product.id}
            onClick={() => onSelect(product)}
          >
            <JerseyArtwork product={product} back />
            <span>{product.player}</span>
          </button>
        ))}
    </div>
  );
}

export default function ReferenceScene(props: SceneProps) {
  const fallback = <RailFallback {...props} />;
  // R3F always mounts <Canvas fallback> inside the <canvas> element, even when
  // WebGL works, so that copy must not report ready: it would end the loader
  // before the jerseys have loaded. Real WebGL failures reach SceneBoundary.
  const canvasFallback = <RailFallback {...props} signalReady={false} />;
  const maxDpr = isIOSDevice ? 1 : isLowPowerDevice ? 1.5 : 2;
  return (
    <SceneBoundary fallback={fallback}>
      <Suspense fallback={null}>
        <Canvas
          shadows
          camera={{ position: [0, 1.5, 5.6], fov: 19.5 }}
          dpr={[1, maxDpr]}
          gl={{ antialias: !isLowPowerDevice, alpha: true, localClippingEnabled: true, powerPreference: 'high-performance' }}
          fallback={canvasFallback}
          // The room zooms from scale(1.035) to 1 on entry. Measure layout size,
          // not the transformed box, or the canvas locks in 3.5% too large (wrong
          // framing and shadows) and then jumps when something re-measures.
          resize={{ offsetSize: true }}
        >
          <WebGLGuard />
          <AdaptiveQuality min={isIOSDevice ? 0.75 : 1} max={maxDpr} active={props.entered ?? true} />
          <Suspense fallback={null}>
            <Scene {...props} />
          </Suspense>
        </Canvas>
      </Suspense>
      <LoadingProgress onProgress={props.onProgress} />
    </SceneBoundary>
  );
}
