import { lazy, Suspense, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Heart, ArrowLeft, ArrowRight, Truck, Rotate3D, Check } from 'lucide-react';
import { useStore } from '../StoreContext';
import { formatPrice } from '../api';
import { ProductCard } from '../components/ProductCard';
const ProductViewer = lazy(() => import('../components/ProductViewer'));
export function SingleProductPage() {
  const { id } = useParams();
  const { products, addToCart, wishlist, toggleWishlist } = useStore();
  const product = products.find((product) => product.id === id);
  const [selectedSize, setSelectedSize] = useState('');
  const size = product?.sizes.includes(selectedSize) ? selectedSize : product?.sizes[0] || '';
  if (!product)
    return (
      <section className="empty-state">
        <h1>Jersey not found.</h1>
        <Link className="button" to="/products">
          Explore jerseys
        </Link>
      </section>
    );
  return (
    <section className="section-wrap page-section">
      <Link className="back-link" to="/products">
        <ArrowLeft size={16} /> All jerseys
      </Link>
      <div className="product-detail">
        <div className="product-viewer">
          <Suspense fallback={<div className="scene-loading">Loading your jersey…</div>}>
            <ProductViewer key={product.id} product={product} />
          </Suspense>
          <p>
            <Rotate3D size={17} /> Drag to turn · Scroll to zoom
          </p>
        </div>
        <div className="product-info">
          <p className="eyebrow">
            INDONESIA 2026 · {product.kit === 'home' ? 'HOME' : 'GOALKEEPER'} KIT
          </p>
          <h1>{product.name}</h1>
          <p className="detail-price">
            {formatPrice(product.price)} <span>USD</span>
          </p>
          <p className="detail-description">{product.description}</p>
          <div className="stock-label">
            <span className="live-dot" />
            {product.stock
              ? `${product.stock} available · Ready for match day`
              : 'Currently sold out'}
          </div>
          <div className="size-heading">
            <strong>Select size</strong>
            <span>Unisex fit</span>
          </div>
          <div className="sizes">
            {product.sizes.map((item) => (
              <button
                key={item}
                onClick={() => setSelectedSize(item)}
                className={size === item ? 'selected' : ''}
                aria-pressed={size === item}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="purchase-buttons">
            <button
              className="button"
              disabled={!product.stock || !size}
              onClick={() => addToCart(product, size)}
            >
              Add to bag <ArrowRight size={19} />
            </button>
            <button
              className="outline-icon"
              aria-label="Toggle wishlist"
              aria-pressed={wishlist.includes(product.id)}
              onClick={() => toggleWishlist(product.id)}
            >
              <Heart size={21} fill={wishlist.includes(product.id) ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div className="detail-benefits">
            <span>
              <Truck size={18} /> Free shipping on orders $150+
            </span>
            <span>
              <Check size={18} /> Cash on delivery · No card details needed
            </span>
          </div>
          <details>
            <summary>Details & care</summary>
            <p>
              Player-name and number detailing. Wash cold with similar colors, inside out. Air dry.
              Do not iron prints.
            </p>
          </details>
          <details>
            <summary>Size guide</summary>
            <p>
              Indicative chest measurements: S 90–96 cm · M 96–102 cm · L 102–108 cm · XL 108–114 cm
              · XXL 114–120 cm. Choose a larger size for a relaxed fit.
            </p>
          </details>
          <details>
            <summary>Delivery & returns</summary>
            <p>
              Example shipping: $10, or free over $150. Please contact the store to confirm delivery
              availability and return arrangements before ordering.
            </p>
          </details>
        </div>
      </div>
      <div className="section-heading">
        <h2>Keep good company.</h2>
        <Link to="/products">
          All jerseys <ArrowRight size={17} />
        </Link>
      </div>
      <div className="product-grid">
        {products
          .filter((item) => item.id !== product.id)
          .slice(0, 4)
          .map((item) => (
            <ProductCard key={item.id} product={item} />
          ))}
      </div>
    </section>
  );
}
