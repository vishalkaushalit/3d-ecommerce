/**
 * Velocity-based springs (the same model the Garuda rail uses).
 * Unlike MathUtils.damp, a spring keeps momentum: it can overshoot a little and
 * settle, so motion keeps flowing when the target changes mid-move.
 */
export type Spring = { x: number; v: number };

export const createSpring = (x = 0): Spring => ({ x, v: 0 });

/** Clamp frame time so a background tab or a hitch never makes the springs jump. */
export const clampDelta = (delta: number) => Math.min(Math.max(delta, 0), 0.05);

/**
 * Advance a damped spring toward `target`.
 * `stiffness` controls speed; `damping` controls how much it overshoots
 * (critical damping is 2 * sqrt(stiffness); lower values bounce more).
 * Fixed 120 Hz substeps make it behave the same at 60, 120 or 144 Hz.
 */
export function stepSpring(spring: Spring, target: number, stiffness: number, damping: number, delta: number) {
  const elapsed = clampDelta(delta);
  const steps = Math.max(1, Math.ceil(elapsed * 120));
  const dt = elapsed / steps;
  for (let i = 0; i < steps; i++) {
    spring.v += (stiffness * (target - spring.x) - damping * spring.v) * dt;
    spring.x += spring.v * dt;
  }
  return spring.x;
}
