/**
 * Phones and tablets (touch-first or ≤4 GB RAM) get a lighter render path:
 * smaller jersey atlases, smaller shadow maps updated every other frame, and a
 * lower pixel-ratio ceiling. Desktop keeps full quality.
 */
export const isLowPowerDevice =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches ||
    ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4);
