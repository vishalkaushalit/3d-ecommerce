import { Link } from 'react-router-dom';
import { ArrowRight, Minus, Plus, X, ShoppingBag } from 'lucide-react';
import { useStore } from '../StoreContext';
import { formatPrice } from '../api';
import { JerseyArtwork } from '../components/ProductCard';
export function CartPage() {
  const { products, cart, setCart, setToast } = useStore();
  const subtotal = cart.reduce(
    (sum, item) =>
      sum + (products.find((product) => product.id === item.productId)?.price || 0) * item.quantity,
    0,
  );
  const shipping = subtotal >= 150 || !cart.length ? 0 : 10;
  function updateQuantity(index: number, quantity: number) {
    const item = cart[index];
    const product = products.find((product) => product.id === item.productId);
    const otherQuantity = cart
      .filter((other, otherIndex) => other.productId === item.productId && otherIndex !== index)
      .reduce((sum, other) => sum + other.quantity, 0);
    if (quantity > 20 || (product && quantity + otherQuantity > product.stock)) {
      setToast('That quantity is not available.');
      return;
    }
    setCart((items) =>
      items.flatMap((item, itemIndex) =>
        itemIndex === index ? (quantity > 0 ? [{ ...item, quantity }] : []) : [item],
      ),
    );
  }
  const unavailable = cart.some((item) => {
    const product = products.find((product) => product.id === item.productId);
    return (
      !product ||
      !product.sizes.includes(item.size) ||
      cart
        .filter((other) => other.productId === item.productId)
        .reduce((sum, other) => sum + other.quantity, 0) > product.stock
    );
  });
  return (
    <section className="section-wrap page-section">
      <p className="eyebrow">YOUR MATCH DAY STARTS HERE</p>
      <h1>Your bag.</h1>
      {!cart.length ? (
        <div className="empty-state">
          <ShoppingBag size={40} />
          <h2>A little room for your colors.</h2>
          <p>Your bag is empty. Find a jersey that feels like you.</p>
          <Link className="button" to="/products">
            Explore jerseys <ArrowRight size={18} />
          </Link>
        </div>
      ) : (
        <div className="checkout-layout">
          <div className="cart-items">
            {cart.map((item, index) => {
              const product = products.find((product) => product.id === item.productId);
              return (
                <article className="cart-item" key={`${item.productId}-${item.size}`}>
                  <div className="cart-art">{product && <JerseyArtwork product={product} />}</div>
                  <div>
                    <Link to={`/products/${item.productId}`}>
                      <h3>{product?.name || 'Unavailable jersey'}</h3>
                    </Link>
                    <p>
                      Size {item.size} · {product?.kit === 'gk' ? 'Goalkeeper' : 'Home'}
                    </p>
                    <span>{formatPrice(product?.price || 0)}</span>
                    <div className="quantity-control">
                      <button
                        aria-label={`Decrease ${product?.name || 'item'} quantity`}
                        onClick={() => updateQuantity(index, item.quantity - 1)}
                      >
                        <Minus size={13} />
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        aria-label={`Increase ${product?.name || 'item'} quantity`}
                        onClick={() => updateQuantity(index, item.quantity + 1)}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                  <button
                    className="remove-item"
                    aria-label={`Remove ${product?.name || 'item'}`}
                    onClick={() =>
                      setCart((items) => items.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    <X size={18} />
                  </button>
                </article>
              );
            })}
          </div>
          <aside className="order-summary">
            <h2>The line-up.</h2>
            <div>
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div>
              <span>Shipping</span>
              <span>{shipping ? formatPrice(shipping) : 'On us'}</span>
            </div>
            <div className="summary-total">
              <strong>Total</strong>
              <strong>{formatPrice(subtotal + shipping)}</strong>
            </div>
            <p>
              {subtotal < 150
                ? `${formatPrice(150 - subtotal)} away from free shipping.`
                : 'Your order qualifies for free shipping.'}
            </p>
            {unavailable ? (
              <p className="error-message">
                An item or quantity is unavailable. Update your bag to continue.
              </p>
            ) : (
              <Link className="button" to="/checkout">
                Continue to checkout <ArrowRight size={18} />
              </Link>
            )}
            <Link className="continue-link" to="/products">
              Keep exploring
            </Link>
          </aside>
        </div>
      )}
    </section>
  );
}
