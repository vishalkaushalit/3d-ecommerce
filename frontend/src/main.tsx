import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { StoreProvider, useStore } from './StoreContext';
import { Layout } from './components/Layout';
import { ReferenceHomePage } from './pages/ReferenceHomePage';
import { CollectionPage, ProductPage } from './pages/CatalogPages';
import { SingleProductPage } from './pages/SingleProductPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ContactPage } from './pages/ContactPage';
import './styles.css';
import './store-theme.css';
function App() {
  const { loading, error, refresh } = useStore();
  if (loading) return <div className="app-loading" aria-busy="true" />;
  if (error)
    return (
      <div className="empty-state">
        <h1>We couldn’t load the store.</h1>
        <p role="alert">{error}</p>
        <button className="button" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );
  return (
    <BrowserRouter>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Routes>
        <Route path="/" element={<ReferenceHomePage />} />
        <Route path="/rail" element={<ReferenceHomePage />} />
        <Route element={<Layout />}>
          <Route path="/collections" element={<CollectionPage />} />
          <Route path="/collections/:id" element={<ProductPage collection />} />
          <Route path="/products" element={<ProductPage />} />
          <Route path="/products/:id" element={<SingleProductPage />} />
          <Route path="/wishlist" element={<ProductPage wishlist />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route
            path="*"
            element={
              <section className="empty-state">
                <h1>Off the pitch.</h1>
                <p>We couldn’t find that page.</p>
                <Link className="button" to="/">
                  Back to the rail
                </Link>
              </section>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>,
);
