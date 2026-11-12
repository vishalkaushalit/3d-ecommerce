import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, RotateCcw, ArrowUpRight, ShoppingBag } from 'lucide-react';
import { useStore } from '../StoreContext';

export function GarudaBrand() {
  return (
    <span className="garuda-brand">
      <svg width="28" height="32" viewBox="0 0 28 32" fill="none" aria-hidden="true">
        <path
          d="M14 1 26 5v13c0 7-8 11-12 13C10 29 2 25 2 18V5L14 1Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M14 5 22 8v10c0 4-5 8-8 9-3-1-8-5-8-9V8l8-3Z" stroke="currentColor" />
        <path
          d="M18 12h-4a5 5 0 1 0 4 8v-4h-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span>GARUDA</span>
    </span>
  );
}

export function StoreHeader({
  filter = 'ALL',
  selectedPosition,
  onFilter,
  onReset,
}: {
  filter?: string;
  selectedPosition?: string;
  onFilter?: (position: string) => void;
  onReset?: () => void;
}) {
  const { products, wishlist, cart } = useStore();
  const [menu, setMenu] = useState(false);
  // Phones have no ALL tab; the rail opens on GK instead.
  const [isPhone, setIsPhone] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setIsPhone(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    setMenu(false);
  }, [location.pathname]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const railProducts = products.filter((product) => product.featured);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <>
      <header className="ref-top store-header">
        <Link to="/" className="ref-logo" aria-label="GARUDA home">
          <GarudaBrand />
        </Link>
        <div className="ref-controls">
          <div className="ref-filters" role="group" aria-label="Show on the rail">
            {(isPhone ? ['GK', 'DEF', 'MID', 'FWD'] : ['ALL', 'GK', 'DEF', 'MID', 'FWD']).map((position) => (
              <button
                key={position}
                aria-pressed={filter === position}
                onClick={() => (onFilter ? onFilter(position) : navigate(`/?position=${position}`))}
                className={filter === position ? 'active' : ''}
                data-current-filter={filter === position}
                data-selected-position={selectedPosition === position}
              >
                {position}
                <sup>
                  {
                    railProducts.filter(
                      (product) => position === 'ALL' || product.position === position,
                    ).length
                  }
                </sup>
              </button>
            ))}
          </div>
          <button
            className="ref-round"
            aria-label="Reset the rail"
            title="Reset the rail"
            onClick={() => (onReset ? onReset() : navigate('/'))}
          >
            <RotateCcw size={21} />
          </button>
          <Link
            to="/cart"
            className="ref-round ref-cart-btn"
            aria-label={`Shopping bag (${cartCount} items)`}
            title="Shopping bag"
          >
            <ShoppingBag size={21} />
            <span className="ref-cart-badge">{cartCount}</span>
          </Link>
          <button
            className="ref-round"
            aria-label={menu ? 'Close menu' : 'Open menu'}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>
      </header>
      {menu && (
        <nav className="ref-menu" aria-label="Store menu">
          <p>THE GARUDA LOCKER ROOM</p>
          {[
            ['/', 'The rail'],
            ['/collections', 'Collections'],
            ['/products', 'All jerseys'],
            ['/wishlist', `Wishlist (${wishlist.length})`],
            ['/cart', `Your bag (${cart.reduce((sum, item) => sum + item.quantity, 0)})`],
            ['/checkout', 'Checkout'],
            ['/contact', 'Contact'],
          ].map(([path, label]) => (
            <Link key={path} to={path} onClick={() => setMenu(false)}>
              {label}
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}

export function StoreFooter() {
  return (
    <footer className="ref-ticker" aria-label="Garuda 2026 fan tribute">
      <div>
        {[0, 1, 2].map((index) => (
          <span key={index} aria-hidden={index > 0}>
            TERIMA KASIH, GARUDA ❤️🤍 <b>•</b> ONE NATION · ONE SPIRIT · ONE JERSEY <b>•</b> THE
            GARUDA 2026 COLLECTION <b>•</b> INDONESIA CROWNED ASEAN CUP KINGS 👑 <b>•</b> UNOFFICIAL
            FAN TRIBUTE <b>•</b>
          </span>
        ))}
      </div>
    </footer>
  );
}
