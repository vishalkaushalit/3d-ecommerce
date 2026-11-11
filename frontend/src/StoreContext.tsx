import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Product, Collection, CartItem } from '../../shared/types';
import { api } from './api';

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}
function useStoreState() {
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [cart, setCart] = useState<CartItem[]>(() =>
    readStorage<CartItem[]>('garuda-cart', []).filter(
      (item) =>
        typeof item.productId === 'string' &&
        typeof item.size === 'string' &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 20,
    ),
  );
  const [wishlist, setWishlist] = useState<string[]>(() =>
    readStorage<string[]>('garuda-wishlist', []).filter((id) => typeof id === 'string'),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const refresh = useCallback(async () => {
    setError('');
    try {
      const [products, collections] = await Promise.all([
        api<Product[]>('/products'),
        api<Collection[]>('/collections'),
      ]);
      setProducts(products);
      setCollections(collections);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load the store.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    try {
      localStorage.setItem('garuda-cart', JSON.stringify(cart));
    } catch {
      /* Shopping still works when browser storage is disabled. */
    }
  }, [cart]);
  useEffect(() => {
    try {
      localStorage.setItem('garuda-wishlist', JSON.stringify(wishlist));
    } catch {
      /* Favorites remain available for this visit. */
    }
  }, [wishlist]);
  useEffect(() => {
    if (toast) {
      const timeout = setTimeout(() => setToast(''), 3500);
      return () => clearTimeout(timeout);
    }
  }, [toast]);
  const addToCart = (product: Product, size: string) => {
    const quantity = cart
      .filter((item) => item.productId === product.id)
      .reduce((sum, item) => sum + item.quantity, 0);
    const existing = cart.find((item) => item.productId === product.id && item.size === size);
    if (quantity >= product.stock || (existing?.quantity || 0) >= 20) {
      setToast('You have reached the available quantity.');
      return;
    }
    setCart((items) =>
      existing
        ? items.map((item) =>
            item.productId === product.id && item.size === size
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          )
        : [...items, { productId: product.id, size, quantity: 1 }],
    );
    console.log('[addToCart]', product.id, size);
    setToast('Added to your bag. A little closer to match day.');
  };
  const toggleWishlist = (id: string) => {
    setWishlist((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
    console.log('[toggleWishlist]', id);
  };
  return {
    products,
    collections,
    cart,
    setCart,
    wishlist,
    toggleWishlist,
    addToCart,
    loading,
    error,
    refresh,
    toast,
    setToast,
  };
}
const StoreContext = createContext<ReturnType<typeof useStoreState> | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useStoreState();
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreProvider is missing.');
  return store;
}
