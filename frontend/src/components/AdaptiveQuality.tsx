import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

/**
 * Adaptive pixel ratio, as on the Garuda rail: render at the device's
 * sharpness, and if frames come too slowly, lower the pixel ratio in 0.25
 * steps. A steady frame rate looks smoother than a sharper picture that stutters.
 */
export function AdaptiveQuality({ min = 1, max = 2 }: { min?: number; max?: number }) {
  const setDpr = useThree((state) => state.setDpr);
  const dpr = useRef(Math.min(max, window.devicePixelRatio || 1));
  const frames = useRef<number[]>([]);
  const last = useRef(0);
  const cooldownUntil = useRef(performance.now() + 4000); // let loading finish first

  useEffect(() => {
    setDpr(dpr.current);
  }, [setDpr]);

  useFrame(() => {
    const now = performance.now();
    const gap = last.current ? now - last.current : 0;
    last.current = now;
    if (document.hidden || now < cooldownUntil.current || gap <= 0 || gap > 250) return;
    frames.current.push(gap);
    if (frames.current.length < 40) return;
    const median = [...frames.current].sort((a, b) => a - b)[20];
    frames.current.length = 0;
    if (median > 21 && dpr.current > min + 0.01) {
      dpr.current = Math.max(min, Math.round((dpr.current - 0.25) * 4) / 4);
      setDpr(dpr.current);
      cooldownUntil.current = now + 1500;
    }
  });
  return null;
}
