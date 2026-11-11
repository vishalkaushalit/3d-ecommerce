import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import { useStore } from '../StoreContext';
import { ProductCard, JerseyArtwork } from '../components/ProductCard';
export function CollectionPage() {
  const { collections, products } = useStore();
  return (
    <section className="section-wrap page-section">
      <p className="eyebrow">FIND YOUR COLORS</p>
      <h1>Our collections.</h1>
      <p className="page-intro">Different roles. The same unbreakable spirit.</p>
      <div className="collection-grid">
        {collections.map((collection) => {
          const product = products.find((product) => product.collectionId === collection.id);
          return (
            <Link
              key={collection.id}
              to={`/collections/${collection.id}`}
              className="collection-card"
              style={{ backgroundColor: collection.color }}
            >
              <span className="eyebrow">2026 · PLAYER EDITIONS</span>
              {product && <JerseyArtwork product={product} />}
              <div>
                <h2>{collection.name}</h2>
                <p>{collection.description}</p>
                <span>
                  Explore collection <ArrowUpRight size={20} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      {!collections.length && <p className="empty-state">New collections are coming soon.</p>}
    </section>
  );
}
export function ProductPage({
  collection = false,
  wishlist = false,
}: {
  collection?: boolean;
  wishlist?: boolean;
}) {
  const { products, collections, wishlist: wishlistIds } = useStore();
  const { id } = useParams();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('featured');
  const currentCollection = collections.find((item) => item.id === id);
  if (collection && !currentCollection)
    return (
      <section className="empty-state">
        <h1>Collection not found.</h1>
        <Link className="button" to="/collections">
          Browse collections
        </Link>
      </section>
    );
  const filteredProducts = products
    .filter(
      (product) =>
        (!collection || product.collectionId === id) &&
        (!wishlist || wishlistIds.includes(product.id)) &&
        product.name.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'price-low'
        ? a.price - b.price
        : sort === 'price-high'
          ? b.price - a.price
          : Number(b.featured) - Number(a.featured),
    );
  return (
    <section className="section-wrap page-section">
      <p className="eyebrow">{wishlist ? 'SAVED FOR MATCH DAY' : 'THE 2026 COLLECTION'}</p>
      <h1>
        {wishlist
          ? 'Your wishlist.'
          : collection
            ? currentCollection?.name
            : 'Every jersey. One spirit.'}
      </h1>
      <p className="page-intro">
        {currentCollection?.description ||
          (wishlist
            ? 'Your favorites, all in one place.'
            : 'Find the name, number, and colors that feel like you.')}
      </p>
      <div className="catalog-tools">
        <span>{filteredProducts.length} jerseys</span>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search jerseys"
            placeholder="Search a player or jersey"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Sort products"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="featured">Featured first</option>
          <option value="price-low">Price: low to high</option>
          <option value="price-high">Price: high to low</option>
        </select>
      </div>
      <div className="product-grid">
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {!filteredProducts.length && (
        <div className="empty-state">
          <h2>{wishlist ? 'Your favorites start here.' : 'No jerseys found.'}</h2>
          <p>
            {wishlist
              ? 'Tap the heart on any jersey to save it for later.'
              : 'Try another search or explore the full collection.'}
          </p>
          <Link className="button" to="/products">
            Explore jerseys <ArrowUpRight size={18} />
          </Link>
        </div>
      )}
    </section>
  );
}
