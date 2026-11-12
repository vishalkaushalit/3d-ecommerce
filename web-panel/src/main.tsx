import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard,
  Shirt,
  Layers3,
  ShoppingBag,
  Mail,
  LogOut,
  ArrowUpRight,
  Plus,
  Pencil,
  Trash2,
  X,
  Menu,
} from 'lucide-react';
import type { Product, Collection, Order, Contact, OrderStatus } from '../../shared/types';
import { api, formatPrice } from './api';
import './styles.css';

async function readDesign(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)
    throw new Error('Choose a PNG, JPEG, or WebP image smaller than 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/webp', 0.88);
    if (image.length > 750000) throw new Error('This design is too detailed. Please use a smaller image.');
    return image;
  } finally { bitmap.close(); }
}

type Tab = 'Overview' | 'Products' | 'Collections' | 'Orders' | 'Messages';
const tabs = [
  { name: 'Overview', icon: LayoutDashboard },
  { name: 'Products', icon: Shirt },
  { name: 'Collections', icon: Layers3 },
  { name: 'Orders', icon: ShoppingBag },
  { name: 'Messages', icon: Mail },
] as const;
const transitions: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>('Overview');
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{
    type: 'products' | 'collections';
    record?: Product | Collection;
  } | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<{
    type: 'products' | 'collections';
    id: string;
    name: string;
  } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [query, setQuery] = useState('');
  const [orderStatus, setOrderStatus] = useState('all');
  const [mobileMenu, setMobileMenu] = useState(false);

  async function loadData() {
    const [products, collections, orders, contacts] = await Promise.all([
      api<Product[]>('/products'),
      api<Collection[]>('/collections'),
      api<Order[]>('/admin/orders'),
      api<Contact[]>('/admin/contacts'),
    ]);
    setProducts(products);
    setCollections(collections);
    setOrders(orders);
    setContacts(contacts);
  }
  useEffect(() => {
    api('/admin/session')
      .then(() => {
        setAuthenticated(true);
        return loadData();
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    setQuery('');
    setMobileMenu(false);
  }, [tab]);
  useEffect(() => {
    if (notice) {
      const timeout = setTimeout(() => setNotice(''), 4000);
      return () => clearTimeout(timeout);
    }
  }, [notice]);
  async function runAction(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }
  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget));
    void runAction(async () => {
      await api('/admin/login', { method: 'POST', body: JSON.stringify(input) });
      setAuthenticated(true);
      await loadData();
      console.log('[login] Admin session ready');
    });
  }
  function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget);
    const data: Record<string, unknown> = Object.fromEntries(form);
    if (editor.type === 'products') {
      data.price = Number(data.price);
      data.stock = Number(data.stock);
      data.featured = form.has('featured');
      data.sizes = form.getAll('sizes');
    }
    void runAction(async () => {
      if (editor.type === 'products') {
        for (const side of ['frontDesign', 'backDesign'] as const) {
          const file = form.get(side);
          data[side] = form.has(`remove-${side}`) ? undefined : (editor.record as Product | undefined)?.[side];
          if (file instanceof File && file.size) data[side] = await readDesign(file);
          delete data[`remove-${side}`];
        }
      }
      await api(`/admin/${editor.type}${editor.record ? `/${editor.record.id}` : ''}`, {
        method: editor.record ? 'PUT' : 'POST',
        body: JSON.stringify(data),
      });
      console.log('[saveRecord]', editor.type, editor.record?.id || 'new');
      setEditor(null);
      await loadData();
      setNotice('Saved. Your storefront is up to date.');
    });
  }
  function changeOrderStatus(order: Order, status: string) {
    void runAction(async () => {
      const updated = await api<Order>(`/admin/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setSelectedOrder(updated);
      await loadData();
      setNotice(`Order marked ${status}.`);
      console.log('[changeOrderStatus]', order.id, status);
    });
  }
  if (checking)
    return (
      <div className="login-page">
        <p>Opening store management…</p>
      </div>
    );
  if (!authenticated)
    return (
      <div className="login-page">
        <form onSubmit={login} className="login-card">
          <div className="brand">
            ✳ GARUDA<sup>®</sup>
          </div>
          <span className="eyebrow">STORE MANAGEMENT</span>
          <h1>Welcome back.</h1>
          <p>Your collections. Your community. Your store.</p>
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              defaultValue="admin@gmail.com"
            />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="button" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
            <ArrowUpRight size={17} />
          </button>
          <small>Use the admin credentials in backend/.env.</small>
        </form>
      </div>
    );
  const revenue = orders
    .filter((order) => order.status === 'delivered')
    .reduce((sum, order) => sum + order.total, 0);
  const matches = (value: string) => value.toLowerCase().includes(query.toLowerCase());
  const visibleOrders = orders.filter(
    (order) =>
      (orderStatus === 'all' || order.status === orderStatus) &&
      matches(`${order.id} ${order.customer.name} ${order.customer.email}`),
  );
  const productRecord =
    editor?.type === 'products' ? (editor.record as Product | undefined) : undefined;
  return (
    <div className="admin-layout">
      <aside className={mobileMenu ? 'sidebar mobile-open' : 'sidebar'}>
        <div className="brand">
          ✳ GARUDA<sup>®</sup>
        </div>
        <span className="eyebrow">STORE MANAGEMENT</span>
        <nav>
          {tabs.map(({ name, icon: Icon }) => (
            <button
              key={name}
              onClick={() => setTab(name)}
              className={tab === name ? 'active' : ''}
            >
              <Icon size={18} />
              {name}
              {name === 'Orders' && orders.some((order) => order.status === 'pending') && (
                <small>{orders.filter((order) => order.status === 'pending').length}</small>
              )}
            </button>
          ))}
        </nav>
        <a
          className="store-link"
          href={import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:5173'}
          onClick={(event) => {
            const storefrontUrl = import.meta.env.VITE_STOREFRONT_URL;
            if (
              !storefrontUrl &&
              !import.meta.env.DEV &&
              window.location.pathname.startsWith('/admin')
            ) {
              event.preventDefault();
              window.location.href = '/';
            }
          }}
          target={import.meta.env.DEV || import.meta.env.VITE_STOREFRONT_URL ? '_blank' : undefined}
          rel="noreferrer"
        >
          View storefront <ArrowUpRight size={16} />
        </a>
        <button
          className="logout"
          onClick={() =>
            void runAction(async () => {
              await api('/admin/logout', { method: 'POST' });
              setAuthenticated(false);
            })
          }
        >
          <LogOut size={17} /> Sign out
        </button>
      </aside>
      <div className="admin-main">
        <header>
          <button
            className="mobile-toggle"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Toggle navigation"
          >
            <Menu />
          </button>
          <span>
            YOUR STORE / <strong>{tab.toUpperCase()}</strong>
          </span>
          <div>
            <span className="status-dot" /> Store connected <span className="avatar">G</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">A LITTLE BEHIND THE SCENES</span>
              <h1>
                {tab === 'Overview'
                  ? 'Your store, at a glance.'
                  : tab === 'Messages'
                    ? 'Let’s keep in touch.'
                    : `${tab}.`}
              </h1>
              <p>
                {tab === 'Products'
                  ? 'The names, numbers, and colors on your rail.'
                  : tab === 'Collections'
                    ? 'Bring your jerseys together.'
                    : tab === 'Orders'
                      ? 'From the first click to the final delivery.'
                      : tab === 'Messages'
                        ? 'Messages from your community.'
                        : 'Everything you need to keep the spirit moving.'}
              </p>
            </div>
            {(tab === 'Products' || tab === 'Collections') && (
              <button
                className="button"
                onClick={() => {
                  setError('');
                  setEditor({ type: tab === 'Products' ? 'products' : 'collections' });
                }}
              >
                <Plus size={17} /> Add {tab === 'Products' ? 'product' : 'collection'}
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError('')} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {tab === 'Overview' && (
            <>
              <div className="stats-grid">
                {[
                  ['Delivered revenue', formatPrice(revenue)],
                  ['Total orders', orders.length],
                  ['Active products', products.length],
                  ['Pending orders', orders.filter((order) => order.status === 'pending').length],
                ].map(([label, value]) => (
                  <article key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>
                      {label === 'Delivered revenue'
                        ? 'Cash-on-delivery orders marked delivered'
                        : 'Live store data'}
                    </small>
                  </article>
                ))}
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Recent orders</h2>
                  <button onClick={() => setTab('Orders')}>
                    View all <ArrowUpRight size={15} />
                  </button>
                </div>
                {orders.length ? (
                  <OrderTable orders={orders.slice(0, 6)} onSelect={setSelectedOrder} />
                ) : (
                  <Empty
                    title="Your first order is on its way."
                    text="Orders placed at checkout will appear here."
                  />
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Stock watch</h2>
                  <button onClick={() => setTab('Products')}>
                    Manage products <ArrowUpRight size={15} />
                  </button>
                </div>
                {products.filter((product) => product.stock < 6).length ? (
                  products
                    .filter((product) => product.stock < 6)
                    .map((product) => (
                      <div className="stock-row" key={product.id}>
                        <span>{product.name}</span>
                        <strong>{product.stock} left</strong>
                        <button onClick={() => setEditor({ type: 'products', record: product })}>
                          Edit stock
                        </button>
                      </div>
                    ))
                ) : (
                  <Empty
                    title="Your rail is well stocked."
                    text="Products with fewer than 6 units appear here."
                  />
                )}
              </section>
            </>
          )}
          {tab === 'Products' && (
            <section className="panel">
              <div className="panel-heading">
                <h2>{products.length} products</h2>
                <input
                  className="search"
                  aria-label="Search products"
                  placeholder="Search jerseys…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Collection</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th>On rail</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products
                      .filter((product) => matches(product.name))
                      .map((product) => (
                        <tr key={product.id}>
                          <td>
                            <div className="product-name">
                              <span style={{ background: product.color }}>
                                <Shirt size={22} />
                              </span>
                              <div>
                                <strong>{product.name}</strong>
                                <small>
                                  {product.player} · {product.number}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>
                            {collections.find(
                              (collection) => collection.id === product.collectionId,
                            )?.name || 'Unassigned'}
                          </td>
                          <td>{formatPrice(product.price)}</td>
                          <td>
                            <span
                              className={`badge ${product.stock < 6 ? 'pending' : 'delivered'}`}
                            >
                              {product.stock} units
                            </span>
                          </td>
                          <td>{product.featured ? 'Featured' : 'Hidden'}</td>
                          <td>
                            <div className="row-actions">
                              <button
                                aria-label={`Edit ${product.name}`}
                                onClick={() => {
                                  setError('');
                                  setEditor({ type: 'products', record: product });
                                }}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                aria-label={`Delete ${product.name}`}
                                onClick={() =>
                                  setDeleteRecord({
                                    type: 'products',
                                    id: product.id,
                                    name: product.name,
                                  })
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!products.filter((product) => matches(product.name)).length && (
                <Empty title="No products found." text="Add a product or try another search." />
              )}
            </section>
          )}
          {tab === 'Collections' && (
            <div className="collections-grid">
              {collections.map((collection) => (
                <article className="collection-panel" key={collection.id}>
                  <div className="collection-color" style={{ background: collection.color }}>
                    <Layers3 size={44} />
                    <span>
                      {products.filter((product) => product.collectionId === collection.id).length}{' '}
                      JERSEYS
                    </span>
                  </div>
                  <div>
                    <h2>{collection.name}</h2>
                    <p>{collection.description}</p>
                    <div className="collection-actions">
                      <button
                        onClick={() => {
                          setError('');
                          setEditor({ type: 'collections', record: collection });
                        }}
                      >
                        <Pencil size={15} /> Edit collection
                      </button>
                      <button
                        aria-label={`Delete ${collection.name}`}
                        onClick={() =>
                          setDeleteRecord({
                            type: 'collections',
                            id: collection.id,
                            name: collection.name,
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {!collections.length && (
                <Empty
                  title="A new collection starts here."
                  text="Add your first collection to organize products."
                />
              )}
            </div>
          )}
          {tab === 'Orders' && (
            <section className="panel">
              <div className="panel-heading">
                <select
                  aria-label="Filter order status"
                  value={orderStatus}
                  onChange={(event) => setOrderStatus(event.target.value)}
                >
                  <option value="all">All orders</option>
                  {['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
                <input
                  className="search"
                  aria-label="Search orders"
                  placeholder="Search order or customer…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              {visibleOrders.length ? (
                <OrderTable orders={visibleOrders} onSelect={setSelectedOrder} />
              ) : (
                <Empty
                  title="No orders here yet."
                  text="Try another filter, or check back after your first sale."
                />
              )}
            </section>
          )}
          {tab === 'Messages' && (
            <section className="panel">
              {contacts.map((contact) => (
                <article className="message" key={contact.id}>
                  <div>
                    <h3>{contact.name}</h3>
                    <a href={`mailto:${contact.email}`}>{contact.email}</a>
                    <time>{new Date(contact.createdAt).toLocaleString()}</time>
                  </div>
                  <p>{contact.message}</p>
                </article>
              ))}
              {!contacts.length && (
                <Empty
                  title="Your inbox is clear."
                  text="Contact form messages will appear here."
                />
              )}
            </section>
          )}
        </main>
      </div>
      {editor && (
        <div className="overlay">
          <section
            className="editor"
            role="dialog"
            aria-modal="true"
            aria-label={`${editor.record ? 'Edit' : 'Add'} ${editor.type}`}
          >
            <div className="panel-heading">
              <h2>
                {editor.record ? 'Edit' : 'Add'}{' '}
                {editor.type === 'products' ? 'product' : 'collection'}
              </h2>
              <button onClick={() => !busy && setEditor(null)} aria-label="Close editor">
                <X />
              </button>
            </div>
            <form onSubmit={saveRecord}>
              <label>
                Name
                <input name="name" required maxLength={300} defaultValue={editor.record?.name} />
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  required
                  rows={3}
                  maxLength={editor.type === 'products' ? 3000 : 1000}
                  defaultValue={editor.record?.description}
                />
              </label>
              <div className="form-grid">
                <label>
                  Jersey / collection color
                  <input
                    name="color"
                    type="color"
                    defaultValue={editor.record?.color || '#a72227'}
                    required
                  />
                </label>
                {editor.type === 'products' && (
                  <label>
                    Collection
                    <select
                      name="collectionId"
                      required
                      defaultValue={productRecord?.collectionId || collections[0]?.id}
                    >
                      <option value="" disabled>
                        Choose collection
                      </option>
                      {collections.map((collection) => (
                        <option value={collection.id} key={collection.id}>
                          {collection.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {editor.type === 'products' && (
                <>
                  <fieldset>
                    <legend>Upload jersey artwork</legend>
                    <p>Use flat, tightly cropped front and back artwork. Each image covers one side of the existing 3D jersey; photos may stretch. Include any names, numbers, and logos in your artwork.</p>
                    {(['frontDesign', 'backDesign'] as const).map((side) => (
                      <label key={side} style={{ display: 'block', marginBottom: 16 }}>
                        {side === 'frontDesign' ? 'Front artwork' : 'Back artwork'}
                        <input type="file" name={side} accept="image/png,image/jpeg,image/webp" />
                        {productRecord?.[side] && <>
                          <img src={productRecord[side]} alt="Saved jersey artwork" style={{ width: 100, height: 100, objectFit: 'contain' }} />
                          <span><input type="checkbox" name={`remove-${side}`} /> Remove saved artwork</span>
                        </>}
                      </label>
                    ))}
                    <p>PNG, JPEG, or WebP, up to 10 MB each. Save, then refresh the storefront. Unuploaded sides retain the standard jersey design.</p>
                  </fieldset>
                  <div className="form-grid">
                    <label>
                      Price (USD)
                      <input
                        name="price"
                        type="number"
                        min="0.01"
                        max="100000"
                        step="0.01"
                        required
                        defaultValue={productRecord?.price || 89}
                      />
                    </label>
                    <label>
                      Stock (all sizes combined)
                      <input
                        name="stock"
                        type="number"
                        min="0"
                        max="100000"
                        step="1"
                        required
                        defaultValue={productRecord?.stock ?? 25}
                      />
                    </label>
                    <label>
                      3D jersey model
                      <select name="kit" defaultValue={productRecord?.kit || 'home'}>
                        <option value="home">Red home jersey</option>
                        <option value="gk">Teal goalkeeper jersey</option>
                      </select>
                    </label>
                    <label>
                      Playing position
                      <select name="position" defaultValue={productRecord?.position || 'MID'}>
                        {['GK', 'DEF', 'MID', 'FWD'].map((position) => (
                          <option key={position}>{position}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Player name
                      <input
                        name="player"
                        maxLength={20}
                        defaultValue={productRecord?.player || ''}
                      />
                    </label>
                    <label>
                      Jersey number
                      <input
                        name="number"
                        pattern="[0-9]{1,2}"
                        maxLength={2}
                        required
                        defaultValue={productRecord?.number || '10'}
                      />
                    </label>
                  </div>
                  <fieldset>
                    <legend>Available sizes</legend>
                    <div className="checkboxes">
                      {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((size) => (
                        <label key={size}>
                          <input
                            name="sizes"
                            type="checkbox"
                            value={size}
                            defaultChecked={
                              productRecord ? productRecord.sizes.includes(size) : size !== 'XS'
                            }
                          />
                          {size}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="check-label">
                    <input
                      name="featured"
                      type="checkbox"
                      defaultChecked={productRecord?.featured ?? true}
                    />{' '}
                    Show on the homepage rail
                  </label>
                  <p className="form-note">
                    The selected model chooses the base jersey pattern. Uploaded artwork replaces the
                    design on that side, while the selected color applies to sides without artwork.
                    Refresh the storefront after saving to see your changes.
                  </p>
                </>
              )}
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditor(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  className="button"
                  disabled={busy || (editor.type === 'products' && !collections.length)}
                >
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
              </div>
              {editor.type === 'products' && !collections.length && (
                <p className="error">Create a collection first.</p>
              )}
            </form>
          </section>
        </div>
      )}
      {deleteRecord && (
        <div className="overlay">
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <h2 id="delete-title">
              Delete this {deleteRecord.type === 'products' ? 'product' : 'collection'}?
            </h2>
            <p>
              {deleteRecord.name} will be removed from the storefront. Existing order records are
              preserved.
            </p>
            {error && <div className="error">{error}</div>}
            <div className="form-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  setDeleteRecord(null);
                  setError('');
                }}
                disabled={busy}
              >
                Keep it
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    await api(`/admin/${deleteRecord.type}/${deleteRecord.id}`, {
                      method: 'DELETE',
                    });
                    setDeleteRecord(null);
                    await loadData();
                    setNotice('Deleted successfully.');
                  })
                }
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </section>
        </div>
      )}
      {selectedOrder && (
        <div className="overlay">
          <section
            className="editor order-detail"
            role="dialog"
            aria-modal="true"
            aria-label="Order details"
          >
            <div className="panel-heading">
              <h2>Order details</h2>
              <button onClick={() => setSelectedOrder(null)} aria-label="Close order">
                <X />
              </button>
            </div>
            <code>{selectedOrder.id}</code>
            <p>{new Date(selectedOrder.createdAt).toLocaleString()}</p>
            <div className="order-customer">
              <h3>{selectedOrder.customer.name}</h3>
              <p>
                {selectedOrder.customer.email}
                <br />
                {selectedOrder.customer.phone}
                <br />
                {selectedOrder.customer.address}
                <br />
                {selectedOrder.customer.city}, {selectedOrder.customer.postalCode}
              </p>
            </div>
            {selectedOrder.items.map((item, index) => (
              <div className="order-line" key={index}>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    Size {item.size} · Qty {item.quantity}
                  </small>
                </div>
                <span>{formatPrice(item.price * item.quantity)}</span>
              </div>
            ))}
            <div className="order-line">
              <span>Shipping</span>
              <span>{formatPrice(selectedOrder.shipping)}</span>
            </div>
            <div className="order-line">
              <strong>Total · Cash on delivery</strong>
              <strong>{formatPrice(selectedOrder.total)}</strong>
            </div>
            <label>
              Order status
              <select
                disabled={busy || !transitions[selectedOrder.status].length}
                value={selectedOrder.status}
                onChange={(event) => changeOrderStatus(selectedOrder, event.target.value)}
              >
                <option value={selectedOrder.status}>{selectedOrder.status}</option>
                {transitions[selectedOrder.status].map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <p className="form-note">
              Cancelled orders restore stock once. Delivered and cancelled orders cannot be
              reopened.
            </p>
            {error && <div className="error">{error}</div>}
          </section>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <ShoppingBag size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function OrderTable({ orders, onSelect }: { orders: Order[]; onSelect: (order: Order) => void }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Status</th>
            <th>Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <button className="order-link" onClick={() => onSelect(order)}>
                  #{order.id.slice(0, 8)}
                </button>
              </td>
              <td>
                <strong>{order.customer.name}</strong>
                <small>{order.customer.email}</small>
              </td>
              <td>{new Date(order.createdAt).toLocaleDateString()}</td>
              <td>
                <span className={`badge ${order.status}`}>{order.status}</span>
              </td>
              <td>{formatPrice(order.total)}</td>
              <td>
                <button aria-label={`View order ${order.id}`} onClick={() => onSelect(order)}>
                  <ArrowUpRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
