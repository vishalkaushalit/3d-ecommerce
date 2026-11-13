/**
 * Phones and tablets (touch-first or ≤4 GB RAM) get a lighter render path:
 * smaller jersey atlases, one room shadow updated every frame, and a lower
 * pixel-ratio ceiling. Desktop keeps full quality.
 */
// iPadOS can advertise a desktop user agent, including with a trackpad attached.
export const isIOSDevice =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const isLowPowerDevice =
  typeof window !== 'undefined' &&
  (isIOSDevice ||
    window.matchMedia?.('(pointer: coarse)').matches ||
    ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4);
