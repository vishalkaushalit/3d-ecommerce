import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, LockKeyhole } from 'lucide-react';
import { useStore } from '../StoreContext';
import { api, formatPrice } from '../api';
export function CheckoutPage() {
  const { cart, setCart, products, refresh } = useStore();
  const requestId = useRef(crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<{ id: string; total: number } | null>(null);
  const subtotal = cart.reduce(
    (sum, item) =>
      sum + (products.find((product) => product.id === item.productId)?.price || 0) * item.quantity,
    0,
  );
  const shipping = subtotal >= 150 ? 0 : 10;
  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    const customer = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const order = await api<{ id: string; total: number }>('/orders', {
        method: 'POST',
        body: JSON.stringify({ requestId: requestId.current, customer, items: cart }),
      });
      console.log('[placeOrder] Order accepted', order.id);
      setOrder(order);
      setCart([]);
      void refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to place order.');
    } finally {
      setPending(false);
    }
  }
  if (order)
    return (
      <section className="empty-state success-state">
        <CheckCircle2 size={48} />
        <p className="eyebrow">YOU’RE PART OF THE LINE-UP</p>
        <h1>Good choice. Great spirit.</h1>
        <p>Your order has been received. Save your order reference below.</p>
        <code>{order.id}</code>
        <p>Total: {formatPrice(order.total)} · Payment due on delivery.</p>
        <p>This is an order confirmation, not an online payment receipt.</p>
        <Link className="button" to="/products">
          Back to the collection <ArrowRight size={18} />
        </Link>
      </section>
    );
  if (!cart.length)
    return (
      <section className="empty-state">
        <h1>Your bag is empty.</h1>
        <Link className="button" to="/products">
          Explore jerseys
        </Link>
      </section>
    );
  return (
    <section className="section-wrap page-section">
      <p className="eyebrow">THE FINAL WHISTLE</p>
      <h1>Make it yours.</h1>
      <form className="checkout-layout" onSubmit={placeOrder}>
        <div className="checkout-form">
          <h2>Delivery details</h2>
          <p>Tell us where your match-day colors are headed.</p>
          <div className="form-grid">
            {[
              ['name', 'Full name', 'text', 'name'],
              ['email', 'Email address', 'email', 'email'],
              ['phone', 'Phone number', 'tel', 'tel'],
              ['address', 'Street address', 'text', 'street-address'],
              ['city', 'City', 'text', 'address-level2'],
              ['postalCode', 'Postal code', 'text', 'postal-code'],
            ].map(([name, label, type, autoComplete]) => (
              <label key={name}>
                {label}
                <input
                  required
                  name={name}
                  type={type}
                  autoComplete={autoComplete}
                  maxLength={name === 'postalCode' ? 20 : name === 'phone' ? 30 : 254}
                  minLength={name === 'phone' ? 5 : 1}
                />
              </label>
            ))}
          </div>
          <h2>Payment</h2>
          <div className="payment-choice">
            <span className="selected-radio" />
            <div>
              <strong>Cash on delivery</strong>
              <p>Pay when your jersey arrives. No payment is taken online.</p>
            </div>
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
        <aside className="order-summary">
          <h2>Your order.</h2>
          {cart.map((item) => (
            <div key={`${item.productId}-${item.size}`}>
              <span>
                {products.find((product) => product.id === item.productId)?.name ||
                  'Unavailable jersey'}
                <small>
                  Size {item.size} · Qty {item.quantity}
                </small>
              </span>
              <span>
                {formatPrice(
                  (products.find((product) => product.id === item.productId)?.price || 0) *
                    item.quantity,
                )}
              </span>
            </div>
          ))}
          <div>
            <span>Shipping</span>
            <span>{shipping ? formatPrice(shipping) : 'On us'}</span>
          </div>
          <div className="summary-total">
            <strong>Total</strong>
            <strong>{formatPrice(subtotal + shipping)}</strong>
          </div>
          <button className="button" disabled={pending}>
            {pending ? 'Placing your order…' : 'Place order'}
            <ArrowRight size={18} />
          </button>
          <p className="secure-note">
            <LockKeyhole size={14} /> Your details go directly to the store.
          </p>
        </aside>
      </form>
    </section>
  );
}
