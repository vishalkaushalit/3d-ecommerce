export type RailBounds = { min: number; max: number; gap: number };

/** Push the neighboring hangers in the drag direction; never reorder the rail. */
export function pushJerseys(
  positions: number[],
  index: number,
  desired: number,
  bounds: RailBounds,
  activeGap = bounds.gap,
  edgePadding = 0,
) {
  const next = [...positions];
  if (index < 0 || index >= next.length) return next;
  const last = next.length - 1;
  const minimum = Math.max(
    bounds.min + edgePadding,
    bounds.min + Math.max(0, index - 1) * bounds.gap + (index ? activeGap : 0),
  );
  const maximum = Math.min(
    bounds.max - edgePadding,
    bounds.max - Math.max(0, last - index - 1) * bounds.gap - (index < last ? activeGap : 0),
  );
  next[index] = Math.max(minimum, Math.min(maximum, desired));
  for (let cursor = index + 1; cursor <= last; cursor++) {
    const gap = cursor === index + 1 ? activeGap : bounds.gap;
    next[cursor] = Math.max(next[cursor], next[cursor - 1] + gap);
  }
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    const gap = cursor === index - 1 ? activeGap : bounds.gap;
    next[cursor] = Math.min(next[cursor], next[cursor + 1] - gap);
  }
  return next;
}

/** Reserve the turned jersey's width, redistributing neighbors inside the screen. */
export function openJerseyGap(
  positions: number[],
  index: number,
  bounds: RailBounds,
  hoverGap = 0.37,
) {
  if (index < 0 || !positions.length) return [...positions];
  const next = [...positions];
  const last = positions.length - 1;
  const edgePadding = 0.24; // The open shirt is wider than its hanger.
  const minimum = Math.max(
    bounds.min + edgePadding,
    bounds.min + Math.max(0, index - 1) * bounds.gap + (index ? hoverGap : 0),
  );
  const maximum = Math.min(
    bounds.max - edgePadding,
    bounds.max - Math.max(0, last - index - 1) * bounds.gap - (index < last ? hoverGap : 0),
  );
  next[index] = Math.max(minimum, Math.min(maximum, next[index]));
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    const gap = cursor === index - 1 ? hoverGap : bounds.gap;
    next[cursor] = Math.max(
      bounds.min + cursor * bounds.gap,
      Math.min(next[cursor], next[cursor + 1] - gap),
    );
  }
  for (let cursor = index + 1; cursor <= last; cursor++) {
    const gap = cursor === index + 1 ? hoverGap : bounds.gap;
    next[cursor] = Math.min(
      bounds.max - (last - cursor) * bounds.gap,
      Math.max(next[cursor], next[cursor - 1] + gap),
    );
  }
  return next;
}
