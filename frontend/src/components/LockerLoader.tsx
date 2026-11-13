import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { GarudaBrand } from './StoreChrome';

const referenceAsset = (file: string) =>
  `${(import.meta.env.VITE_ASSET_BASE_URL || '/assets').replace(/\/$/, '')}/reference/${file}`;
// shirts.webp is one strip of 23 equal 64×100 cells. Reuse that small image;
// the loader must not allocate another set of 3D models or jersey textures.
const JERSEY_COUNT = 23;
const SHIRTS_URL = referenceAsset('shirts.webp');
// Shirts hang one at a time even when loading jumps ahead, so the rail always
// fills in visibly (23 × 70 ms ≈ 1.6 s at most once everything has loaded).
const STEP_MS = 70;
// As on the reference loader: one 600px rail of 23 hooks, or 12 + 11 on phones.
const NARROW_QUERY = '(max-width: 700px)';

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
}

export function LockerLoader({
  ready,
  progress,
  onEnter,
}: {
  ready: boolean;
  progress: number;
  onEnter: (withSound: boolean) => void;
}) {
  const narrow = useNarrow();
  const [artworkReady, setArtworkReady] = useState(false);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const image = new Image();
    const loaded = () => setArtworkReady(true);
    image.onload = loaded;
    image.onerror = loaded;
    image.src = SHIRTS_URL;
    return () => {
      image.onload = image.onerror = null;
    };
  }, []);

  const percent = ready ? 100 : Math.min(99, Math.max(0, Math.round(progress)));
  // Hold the last shirt back until the room is ready, so a full rail means "enter".
  const target = !artworkReady
    ? 0
    : ready
      ? JERSEY_COUNT
      : Math.min(JERSEY_COUNT - 1, Math.floor((percent / 100) * JERSEY_COUNT));
  useEffect(() => {
    if (shown >= target) return;
    const timer = window.setTimeout(() => setShown((count) => count + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [shown, target]);

  // The counter and the gold rail follow the shirts actually on the rail, not
  // raw load progress (which can hit 100 instantly from cache). The number
  // counts up smoothly toward the next shirt so it reads 000 → 100 in step.
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  useEffect(() => {
    const goal = (shown / JERSEY_COUNT) * 100;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Cover one shirt's worth (~4.3%) in one STEP_MS.
      countRef.current = Math.min(goal, countRef.current + ((now - last) / STEP_MS) * (100 / JERSEY_COUNT));
      last = now;
      setCount(countRef.current);
      if (countRef.current < goal) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shown]);

  const shownPercent = Math.round(count);
  const complete = ready && shown >= JERSEY_COUNT && shownPercent >= 100;
  const perRow = narrow ? 12 : JERSEY_COUNT;
  const rows = narrow ? [0, 12] : [0];
  const filled = (count / 100) * JERSEY_COUNT;
  const status = complete ? 'READY' : shownPercent < 50 ? 'PRINTING THE KITS' : 'LIGHTING THE ROOM';

  return (
    <div className="ref-entry" aria-busy={!complete}>
      <GarudaBrand />
      <p>INTERACTIVE 3D LOCKER ROOM</p>
      <div className="ref-entry-progress" style={{ ['--per-row' as string]: perRow }}>
        <div className="ref-entry-rail" aria-hidden="true">
          {rows.map((start) => {
            const count = Math.min(perRow, JERSEY_COUNT - start);
            const fill = Math.min(1, Math.max(0, (filled - start) / count));
            return (
              <div className="ref-entry-row" key={start} style={{ ['--count' as string]: count }}>
                <i className="ref-entry-bar" style={{ transform: `scaleX(${fill})` }} />
                {Array.from({ length: count }, (_, offset) => {
                  const index = start + offset;
                  return (
                    <span className={`ref-entry-hook${index < shown ? ' is-in' : ''}`} key={index}>
                      <i />
                      <b
                        style={{
                          backgroundImage: `url(${SHIRTS_URL})`,
                          backgroundPosition: `${(index / (JERSEY_COUNT - 1)) * 100}% 0`,
                        }}
                      />
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div
          className={`ref-entry-status${complete ? ' is-done' : ''}`}
          role="progressbar"
          aria-label="Loading the locker room"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={shownPercent}
        >
          <strong>{shownPercent.toString().padStart(3, '0')}</strong>
          <span>{status}</span>
        </div>
      </div>
      <div className="ref-entry-buttons">
        <button disabled={!complete} onClick={() => onEnter(true)}>
          <Volume2 size={17} /> ENTER WITH SOUND
        </button>
        <button disabled={!complete} onClick={() => onEnter(false)}>
          <VolumeX size={17} /> MUTED
        </button>
      </div>
      <small>BEST WITH SOUND</small>
      <div className="ref-entry-credit">
        CRAFTED WITH 💛 <img src={referenceAsset('screenagers-word.svg')} alt="Screenagers" />
      </div>
    </div>
  );
}
