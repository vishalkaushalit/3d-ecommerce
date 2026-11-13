import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

/**
 * Adaptive pixel ratio, as on the Garuda rail: render at the device's
 * sharpness, and if frames come too slowly, lower the pixel ratio in 0.25
 * steps. A steady frame rate looks smoother than a sharper picture that stutters.
 */
export function AdaptiveQuality({
  min = 1,
  max = 2,
  active = true,
}: {
  min?: number;
  max?: number;
  /** Sample only while the scene is on screen; the entry loader and zoom are not representative. */
  active?: boolean;
}) {
  const setDpr = useThree((state) => state.setDpr);
  const dpr = useRef(Math.min(max, window.devicePixelRatio || 1));
  const frames = useRef<number[]>([]);
  const last = useRef(0);
  const cooldownUntil = useRef(Infinity);

  useEffect(() => {
    setDpr(dpr.current);
  }, [setDpr]);
  useEffect(() => {
    // Shader compiles and the 1.7 s entrance zoom produce slow frames that say
    // nothing about steady-state speed; dropping resolution on them is the
    // visible "flash" just after entering. Start judging once that settles.
    frames.current.length = 0;
    cooldownUntil.current = active ? performance.now() + 2500 : Infinity;
  }, [active]);

  useFrame(() => {
    const now = performance.now();
    const gap = last.current ? now - last.current : 0;
    last.current = now;
    if (document.hidden || now < cooldownUntil.current || gap <= 0 || gap > 250) return;
    frames.current.push(gap);
    if (frames.current.length < 60) return;
    const median = [...frames.current].sort((a, b) => a - b)[30];
    frames.current.length = 0;
    if (median > 21 && dpr.current > min + 0.01) {
      // Every change re-sizes the canvas and visibly re-sharpens the shirts, so
      // jump straight to the ratio that should hold ~60 fps (fill cost scales
      // with dpr²) instead of stepping down 0.25 at a time.
      const target = dpr.current * Math.sqrt(16.7 / median);
      dpr.current = Math.max(min, Math.min(dpr.current - 0.25, Math.floor(target * 4) / 4));
      setDpr(dpr.current);
      cooldownUntil.current = now + 8000;
    }
  });
  return null;
}
