import { Link } from 'react-router-dom';
import { Heart, ArrowUpRight } from 'lucide-react';
import type { Product } from '../../../shared/types';
import { useStore } from '../StoreContext';
import { formatPrice } from '../api';
export function JerseyArtwork({ product, back = false }: { product: Product; back?: boolean }) {
  const uploadedDesign = back ? product.backDesign : product.frontDesign;
  if (uploadedDesign) {
    return (
      <img
        className={`jersey-art uploaded-jersey-art ${product.kit === 'gk' ? 'jersey-gk' : ''}`}
        src={uploadedDesign}
        style={{ background: product.color }}
        alt={`${product.name}, uploaded ${back ? 'back' : 'front'} artwork`}
      />
    );
  }
  return (
    <div
      className={`jersey-art ${product.kit === 'gk' ? 'jersey-gk' : ''}`}
      style={{ background: `linear-gradient(135deg, #ffffff24, transparent 40%, #00000055), ${product.color}` }}
      aria-label={`${product.name}, ${back ? 'back' : 'front'} view`}
    >
      <div className="jersey-neck" />
      {back ? (
        <div className="jersey-lettering">
          <span>{product.player}</span>
          <strong>{product.number}</strong>
        </div>
      ) : (
        <>
          <span className="jersey-maker">
            KELME
            <br />✣
          </span>
          <img
            className="jersey-crest"
            src={`${(import.meta.env.VITE_ASSET_BASE_URL || '/assets').replace(/\/$/, '')}/crest.webp`}
            alt="Garuda crest"
          />
          <span className="jersey-front-number">{product.number}</span>
        </>
      )}
      <span className="jersey-hem">INDONESIA · 2026</span>
    </div>
  );
}
export function ProductCard({ product }: { product: Product }) {
  const { wishlist, toggleWishlist } = useStore();
  return (
    <article className="product-card">
      <div className="product-image">
        <Link to={`/products/${product.id}`} aria-label={`View ${product.name}`}>
          <JerseyArtwork product={product} />
        </Link>
        <span className="product-tag">{product.stock ? '2026 EDITION' : 'SOLD OUT'}</span>
        <button
          className="favorite"
          aria-label={`${wishlist.includes(product.id) ? 'Remove from' : 'Add to'} wishlist: ${product.name}`}
          onClick={() => toggleWishlist(product.id)}
        >
          <Heart size={18} fill={wishlist.includes(product.id) ? 'currentColor' : 'none'} />
        </button>
        <Link className="product-explore" to={`/products/${product.id}`}>
          Explore jersey <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="product-meta">
        <div>
          <h3>
            <Link to={`/products/${product.id}`}>{product.name}</Link>
          </h3>
          <p>{product.kit === 'home' ? 'Home' : 'Goalkeeper'} · Player edition</p>
        </div>
        <span>{formatPrice(product.price)}</span>
      </div>
    </article>
  );
}
