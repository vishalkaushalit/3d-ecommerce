export function createClothMotion() {
  return { bend: 0, bendVelocity: 0, ripple: 0, rippleVelocity: 0, energy: 0, phase: 0, speed: 0 };
}
export type ClothMotion = ReturnType<typeof createClothMotion>;

/** Small spring steps keep the cloth stable across different display refresh rates. */
export function updateClothMotion(motion: ClothMotion, speed: number, delta: number) {
  const elapsed = Math.min(Math.max(delta, 0), 0.05);
  const steps = Math.max(1, Math.ceil(elapsed * 120));
  const step = elapsed / steps;
  const limitedSpeed = Math.max(-3, Math.min(3, speed));
  motion.rippleVelocity -= (limitedSpeed - motion.speed) * 0.12;
  motion.speed = limitedSpeed;
  const target = Math.max(-0.2, Math.min(0.2, -limitedSpeed * 0.15));
  for (let index = 0; index < steps; index++) {
    motion.bendVelocity += ((target - motion.bend) * 55 - motion.bendVelocity * 7) * step;
    motion.bend += motion.bendVelocity * step;
    motion.rippleVelocity += (-motion.ripple * 145 - motion.rippleVelocity * 5) * step;
    motion.ripple += motion.rippleVelocity * step;
    const energyTarget = Math.min(1, Math.abs(limitedSpeed));
    const damping = energyTarget > motion.energy ? 9 : 2.8;
    motion.energy += (energyTarget - motion.energy) * (1 - Math.exp(-damping * step));
    motion.phase += step;
  }
}

// These uniforms belong to one jersey. Updating them does not rerender React or upload geometry.
export function createClothUniforms() {
  return {
    uClothBend: { value: 0 },
    uClothRipple: { value: 0 },
    uClothEnergy: { value: 0 },
    uClothTime: { value: 0 },
    uClothYaw: { value: 0 },
    uClothClearance: { value: 0 },
  };
}
export type ClothUniforms = ReturnType<typeof createClothUniforms>;

// Offset and normal calculation share the same surface, keeping lighting attached to the waves.
export const clothShader = `
uniform float uClothBend;
uniform float uClothRipple;
uniform float uClothEnergy;
uniform float uClothTime;
uniform float uClothYaw;
uniform float uClothClearance;
vec2 clothOffset(float y) {
  float fall = clamp((-y - 0.12) / 0.72, 0.0, 1.0);
  float weight = fall * fall;
  float wave = sin(fall * 10.0 - uClothTime * 8.0);
  float sideways = weight * (uClothBend + uClothRipple * wave);
  // Smooth saturation prevents fabric crossing neighbors without abruptly clipping its motion.
  float room = max(uClothClearance, 0.0001);
  sideways = room * tanh(sideways / room);
  float depth = weight * (uClothRipple * 0.7 * sin(fall * 8.0 - uClothTime * 6.0)
    + uClothEnergy * 0.024 * sin(fall * 13.0 - uClothTime * 10.0));
  vec2 slide = vec2(cos(uClothYaw), sin(uClothYaw));
  vec2 forward = vec2(-sin(uClothYaw), cos(uClothYaw));
  return slide * sideways + forward * depth;
}
`;
