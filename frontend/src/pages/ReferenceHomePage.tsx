import { lazy, Suspense, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { StoreHeader, StoreFooter, GarudaBrand } from '../components/StoreChrome';
import {
  Menu,
  X,
  RotateCcw,
  Volume2,
  VolumeX,
  ArrowUpRight,
  ShoppingBag,
  Heart,
  Rotate3D,
} from 'lucide-react';
import { useStore } from '../StoreContext';
import type { Product } from '../../../shared/types';
import { formatPrice } from '../api';
import '../reference.css';
import { referencePlayers } from '../../../shared/referencePlayers';
const ReferenceScene = lazy(() => import('../components/ReferenceScene'));
const assetUrl = (file: string) =>
  `${(import.meta.env.VITE_ASSET_BASE_URL || '/assets').replace(/\/$/, '')}/reference/${file}`;
const positionNames = { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' };

export function ReferenceHomePage() {
  const { products, cart, addToCart, toggleWishlist, wishlist, toast } = useStore();
  const [filter, setFilter] = useState('ALL');
  const [selected, setSelected] = useState<Product | null>(null);
  const [hovered, setHovered] = useState<Product | null>(null);
  const location = useLocation();
  useEffect(() => {
    const position = new URLSearchParams(location.search).get('position');
    if (position && ['ALL', 'GK', 'DEF', 'MID', 'FWD'].includes(position)) setFilter(position);
  }, [location.search]);
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(() => {
    try {
      return sessionStorage.getItem('garuda-entered') === 'true';
    } catch {
      return false;
    }
  });
  const [progress, setProgress] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [reset, setReset] = useState(0);
  const [sound, setSound] = useState(false);
  const [size, setSize] = useState('M');
  const sheet = useRef<HTMLElement>(null);
  const mobilePlayers = useRef<HTMLDivElement>(null);
  // Phones browse like Garuda: one focused shirt at a time, shown in the label and number strip.
  const [isPhone, setIsPhone] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setIsPhone(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  // Phones have no ALL tab: the rail opens on the goalkeepers instead.
  const railFilter = isPhone && filter === 'ALL' ? 'GK' : filter;
  const browsing = isPhone && !selected && hovered ? hovered : null;
  const current = selected ?? browsing;
  useEffect(() => {
    if (selected && window.matchMedia('(min-width: 761px)').matches) sheet.current?.focus();
  }, [selected]);
  useEffect(() => {
    if (current) {
      mobilePlayers.current
        ?.querySelector<HTMLButtonElement>('.active')
        ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, [current]);
  const audio = useRef<AudioContext | null>(null);
  const noise = useRef<AudioBufferSourceNode | null>(null);
  const gain = useRef<GainNode | null>(null);
  const onReady = useCallback(() => setReady(true), []);
  const onSelect = useCallback((product: Product | null) => {
    setSelected(product);
    setRotation(0);
    if (product) setSize(product.sizes.includes('M') ? 'M' : product.sizes[0]);
  }, []);
  const railProducts = useMemo(
    () =>
      products
        .filter((product) => product.featured)
        .sort(
          (a, b) =>
            ['GK', 'DEF', 'MID', 'FWD'].indexOf(a.position) -
            ['GK', 'DEF', 'MID', 'FWD'].indexOf(b.position) ||
            Number(a.number) - Number(b.number),
        ),
    [products],
  );
  // Phones show the whole squad on the rail; elsewhere the tab filters it.
  const shownProducts = isPhone
    ? railProducts
    : railProducts.filter((product) => railFilter === 'ALL' || product.position === railFilter);
  const reference =
    selected && referencePlayers[selected.number]?.shirt === selected.player
      ? referencePlayers[selected.number]
      : undefined;
  const currentReference =
    current && referencePlayers[current.number]?.shirt === current.player
      ? referencePlayers[current.number]
      : undefined;
  function nextJersey(direction: number) {
    if (!selected) return;
    const ordered = [...railProducts].sort(
      (a, b) =>
        ['GK', 'DEF', 'MID', 'FWD'].indexOf(a.position) -
        ['GK', 'DEF', 'MID', 'FWD'].indexOf(b.position) || Number(a.number) - Number(b.number),
    );
    const index = ordered.findIndex((product) => product.id === selected.id);
    onSelect(ordered[(index + direction + ordered.length) % ordered.length]);
  }
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected(null);
      }
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, []);
  useEffect(
    () => () => {
      noise.current?.stop();
      void audio.current?.close();
    },
    [],
  );
  function toggleSound(enabled: boolean) {
    if (!audio.current && enabled) {
      // Locally synthesized room ambience; no remote audio or autoplay before consent.
      const context = new AudioContext();
      audio.current = context;
      const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index++)
        samples[index] = (Math.random() * 2 - 1) * 0.15;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 350;
      const volume = context.createGain();
      volume.gain.value = 0.15;
      gain.current = volume;
      source.connect(filter);
      filter.connect(volume);
      volume.connect(context.destination);
      source.start();
      noise.current = source;
    }
    if (audio.current) {
      void audio.current.resume();
      gain.current?.gain.setTargetAtTime(enabled ? 0.15 : 0, audio.current.currentTime, 0.3);
    }
    setSound(enabled);
  }
  function enterRoom(withSound: boolean) {
    setEntered(true);
    try {
      sessionStorage.setItem('garuda-entered', 'true');
    } catch {
      /* The entry still works without storage. */
    }
    toggleSound(withSound);
  }
  return (
    <main
      className={`reference-home ${entered ? 'ref-entered' : ''} ${selected ? 'ref-detail' : ''} ${browsing ? 'ref-browse' : ''}`}
      style={{ backgroundImage: `url("${assetUrl('plate.jpg')}")` }}
    >
      <h1 className="sr-only">Garuda 2026: The Champions’ Rail</h1>
      <div className="ref-scene">
        <Suspense fallback={null}>
          <ReferenceScene
            products={railProducts}
            filter={railFilter}
            selected={selected}
            onSelect={onSelect}
            onHover={setHovered}
            rotation={rotation}
            reset={reset}
            hovered={hovered}
            onReady={onReady}
            onProgress={setProgress}
          />
        </Suspense>
      </div>
      <StoreHeader
        filter={railFilter}
        selectedPosition={current?.position}
        onFilter={(position) => {
          setFilter(position);
          setSelected(null);
          // On a phone the rail glides to the group's first shirt, as on Garuda.
          if (isPhone) setHovered(railProducts.find((product) => product.position === position) ?? null);
        }}
        onReset={() => {
          setFilter('ALL');
          setSelected(null);
          setHovered(null);
          setReset((value) => value + 1);
        }}
      />

      <p className="ref-hint">
        {selected
          ? 'Tap or drag the shirt to turn it · tap outside to close'
          : 'Hover a shirt · drag to slide it along the rail · click to take it down'}
      </p>
      <button
        className="ref-round ref-sound"
        aria-label={sound ? 'Mute sound' : 'Enable sound'}
        onClick={() => toggleSound(!sound)}
      >
        {sound ? <Volume2 size={21} /> : <VolumeX size={21} />}
      </button>
      {!selected && (
        <Link className="ref-next" to="/collections">
          <span>
            NEXT DOOR<small>23 JERSEYS TO EXPLORE</small>
          </span>
          <div className="ref-next-stack">
            <img src={assetUrl('lockers-full.webp')} alt="" />
            <div>
              <img src={assetUrl('lockers-open.webp')} alt="Open jersey locker" />
              <strong>
                THE LOCKERS <ArrowUpRight size={14} />
              </strong>
            </div>
          </div>
        </Link>
      )}
      <StoreFooter />
      {current && (
        <div className="ref-player-label" role="status" aria-live="polite">
          <strong>{current.number}</strong>
          <span className="ref-selected-name">{currentReference?.name || current.player}</span>
          <span className="ref-selected-hint">
            {positionNames[current.position].toUpperCase()} · TAP THE SHIRT
          </span>
        </div>
      )}
      {selected && (
        <aside
          ref={sheet}
          tabIndex={-1}
          className="ref-squad"
          aria-label={`${selected.name} squad sheet`}
        >
          <div className="ref-squad-heading">
            <span>SQUAD SHEET</span>
            <b>ASEAN CUP 2026 CHAMPIONS</b>
            <span className="ref-squad-count">
              {railProducts.findIndex((product) => product.id === selected.id) + 1} /{' '}
              {railProducts.length}
            </span>
            <button aria-label="Close squad sheet" onClick={() => setSelected(null)}>
              <X size={18} />
            </button>
          </div>
          <div className="ref-squad-grid">
            <div className="ref-player-profile">
              <div className="ref-profile-name">
                <div>
                  <i className="ref-flag" />
                  <strong>{selected.number}</strong>
                </div>
                <div>
                  <span>{positionNames[selected.position]}</span>
                  <h2>{reference?.name || selected.player}</h2>
                </div>
              </div>
              <dl>
                {[
                  ['Club', reference?.club || 'Indonesia'],
                  [
                    'Caps',
                    reference ? `${reference.caps} · ${reference.goals} goals` : 'Player edition',
                  ],
                  [
                    'Born',
                    reference
                      ? new Date(reference.born).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'UTC',
                      })
                      : '—',
                  ],
                  ['Birthplace', reference?.birthplace || '—'],
                  ['Height', reference ? `${reference.height} cm` : '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <i />
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="ref-squad-product">
                <span>2026 PLAYER EDITION</span>
                <div>
                  <strong>{formatPrice(selected.price)}</strong>
                  <button
                    aria-label="Save jersey to wishlist"
                    aria-pressed={wishlist.includes(selected.id)}
                    onClick={() => toggleWishlist(selected.id)}
                  >
                    <Heart
                      size={19}
                      fill={wishlist.includes(selected.id) ? 'currentColor' : 'none'}
                    />
                  </button>
                </div>
                <div className="ref-sizes" aria-label="Choose size">
                  {selected.sizes.map((item) => (
                    <button
                      key={item}
                      aria-pressed={size === item}
                      onClick={() => setSize(item)}
                      className={size === item ? 'active' : ''}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="ref-match-profile">
              <div className="ref-matches">
                <h3>
                  <b>FIG. 1</b> ASEAN CUP 2026, MATCH BY MATCH
                </h3>
                <div className="ref-match-scale">
                  <span>0′</span>
                  <span>45′</span>
                  <span>90′</span>
                  <span>120′</span>
                </div>
                {[
                  ['SGP', '2–0', '25 Sep'],
                  ['MAS', '0–0', '28 Sep'],
                  ['BAN', '9–2', '1 Oct'],
                  ['THA', '2–2', '5 Oct · 4–2 p'],
                ].map(([code, score, date], index) => {
                  const match = reference?.matches[index];
                  const on = match?.on || 0;
                  const minutes = match?.minutes || 0;
                  return (
                    <div className="ref-match-row" key={code}>
                      <div>
                        <span>
                          vs{' '}
                          <strong>
                            {code} {score}
                          </strong>
                        </span>
                        <small>{date}</small>
                      </div>
                      <div>
                        <div className="ref-match-track">
                          <i
                            style={{
                              left: `${(on / 120) * 100}%`,
                              width: `${(minutes / 120) * 100}%`,
                            }}
                          />
                        </div>
                        <small>
                          {minutes
                            ? match?.start
                              ? `Started · ${minutes}′`
                              : `On ${on}′ · ${minutes}′`
                            : 'Unused substitute'}
                        </small>
                      </div>
                    </div>
                  );
                })}
                <p>
                  {reference?.matches.filter((match) => match.minutes > 0).length || 0} APPS ·{' '}
                  {reference?.matches.filter((match) => match.start).length || 0} STARTS ·{' '}
                  {reference?.matches.reduce((sum, match) => sum + match.minutes, 0) || 0}′
                </p>
              </div>
              <div className="ref-profile-story">
                <h3>PROFILE</h3>
                <p>
                  {reference
                    ? `${reference.name} wears number ${selected.number} for Indonesia. ${positionNames[selected.position]} · ${reference.club}, ${reference.clubCountry}.`
                    : selected.description}
                </p>
                <p>
                  Explore the jersey in 3D. Choose your size, turn it to see every detail, and add
                  your colors to the cart.
                </p>
                <div>
                  <button onClick={() => setRotation((value) => value + Math.PI)}>
                    <Rotate3D size={16} /> Turn jersey
                  </button>
                  <Link to={`/products/${selected.id}`}>
                    Full product details <ArrowUpRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <p className="ref-squad-source">
            REFERENCE CAMPAIGN SNAPSHOT · PLAYER EDITION · CASH ON DELIVERY
          </p>
          <div className="ref-squad-bottom">
            <button
              className="ref-add-cart"
              disabled={!selected.stock}
              onClick={() => addToCart(selected, size)}
            >
              {selected.stock ? 'ADD TO CART' : 'SOLD OUT'}
              <ShoppingBag size={17} />
            </button>
            <button
              className="ref-round"
              aria-label="Previous jersey"
              onClick={() => nextJersey(-1)}
            >
              ‹
            </button>
            <button className="ref-round" aria-label="Next jersey" onClick={() => nextJersey(1)}>
              ›
            </button>
          </div>
        </aside>
      )}
      <div className="ref-keyboard-rail" aria-label="Choose a jersey">
        {shownProducts
          .map((product) => (
            <button
              key={product.id}
              onFocus={() => setHovered(product)}
              onBlur={() => setHovered(null)}
              onClick={() => onSelect(product)}
            >
              Explore {product.player} {product.number}
            </button>
          ))}
      </div>
      <div ref={mobilePlayers} className="ref-mobile-players" aria-label="Browse all players">
        {shownProducts
          .map((product) => (
            <button
              key={product.id}
              className={current?.id === product.id ? 'active' : ''}
              aria-label={`Select ${product.player}`}
              // While browsing on a phone, a number brings that shirt to the center; tap the shirt to open it.
              onClick={() => (browsing ? setHovered(product) : onSelect(product))}
            >
              {product.number}
            </button>
          ))}
      </div>
      {current && (
        <div className="ref-mobile-credit">
          CRAFTED WITH 💛 <img src={assetUrl('screenagers-word.svg')} alt="Screenagers" />
        </div>
      )}

      {(!ready || !entered) && (
        <div className="ref-entry">
          <GarudaBrand />
          <p>INTERACTIVE 3D LOCKER ROOM</p>
          <div className="ref-entry-progress">
            <img src={assetUrl('shirts.webp')} alt="The 23-player jersey rail" />
            <div>
              <strong>
                {ready ? '100' : Math.min(99, Math.round(progress)).toString().padStart(3, '0')}
              </strong>
              <span>{ready ? 'READY' : 'OPENING THE LOCKER ROOM'}</span>
            </div>
          </div>
          <div className="ref-entry-buttons">
            <button disabled={!ready} onClick={() => enterRoom(true)}>
              <Volume2 size={17} /> ENTER WITH SOUND
            </button>
            <button disabled={!ready} onClick={() => enterRoom(false)}>
              <VolumeX size={17} /> MUTED
            </button>
          </div>
          <small>BEST WITH SOUND</small>
          <div className="ref-entry-credit">
            CRAFTED WITH 💛 <img src={assetUrl('screenagers-word.svg')} alt="Screenagers" />
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast} <Link to="/cart">View bag →</Link>
        </div>
      )}
    </main>
  );
}
