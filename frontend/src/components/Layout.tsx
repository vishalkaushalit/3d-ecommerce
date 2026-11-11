import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../StoreContext';
import { StoreHeader, StoreFooter } from './StoreChrome';

export function Layout() {
  const { toast } = useStore();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const assetBase = (import.meta.env.VITE_ASSET_BASE_URL || '/assets').replace(/\/$/, '');
  return (
    <div
      className="store-shell"
      style={{
        backgroundImage: `linear-gradient(#100b08d9,#100b08ed), url("${assetBase}/reference/plate.jpg")`,
      }}
    >
      <StoreHeader />
      <main id="main-content">
        <Outlet />
      </main>
      <StoreFooter />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
