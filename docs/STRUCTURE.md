# Website structure

## Application layout

```text
3d-ecommerce/
├── backend/
│   ├── .env.example
│   ├── src/
│   │   ├── app.ts             Express routes, validation, authentication, order transactions
│   │   ├── database.ts        Reusable MongoDB connection, indexes, helpers, transactions
│   │   ├── seed.ts            23 jerseys and two collections
│   │   ├── admin.ts           MongoDB admin creation with salted password hashes
│   │   ├── create-admin.ts    Interactive setup with hidden password input
│   │   └── server.ts          Local HTTP server
│   └── tests/api.test.ts      Integration checks against a temporary database
├── frontend/
│   ├── public/assets/        Original GLBs, texture maps, and reference room assets
│   └── src/
│       ├── main.tsx          React entry and customer routes
│       ├── api.ts            Shared request helper and USD formatting
│       ├── StoreContext.tsx  Catalog state, browser cart, wishlist, notifications
│       ├── components/
│       │   ├── ReferenceScene.tsx  Camera, hover spacing, dragging, selection, rotation
│       │   ├── JerseyModel.tsx    Original geometry + kit textures + player lettering
│       │   ├── ProductViewer.tsx  Rotatable single-product view
│       │   ├── SceneBoundary.tsx  2D fallback if WebGL fails
│       │   ├── StoreChrome.tsx    Shared GARUDA branding, header, menu, and ticker footer
│       │   ├── clothMotion.ts     Frame-independent springs and GPU fabric waves
│       │   ├── railPhysics.ts     Bounded hover clearance and push-without-crossing rules
│       │   ├── Layout.tsx         Navigation and footer for shopping pages
│       │   └── ProductCard.tsx    Lightweight product cards
│       ├── pages/
│       │   ├── ReferenceHomePage.tsx  Fullscreen rail, loading gate, squad sheet, cart action
│       │   ├── CatalogPages.tsx      Collections, collection detail, products, wishlist
│       │   ├── SingleProductPage.tsx Product detail, size selection, 3D view
│       │   ├── CartPage.tsx          Bag quantity changes and availability checks
│       │   ├── CheckoutPage.tsx      Delivery details and server-created order
│       │   └── ContactPage.tsx       Contact form and customer information
│       ├── reference.css     Scoped locker-room styling and animations
│       └── styles.css        Tailwind import and shopping-page styles
├── web-panel/src/
│   ├── main.tsx              Admin sign-in, overview, product/collection editors, orders, inbox
│   ├── api.ts                Cookie-authenticated request helper
│   └── styles.css            Tailwind import and responsive panel styling
├── shared/
│   ├── types.ts              Same entity names and fields in all three apps
│   └── referencePlayers.ts   Reference campaign player facts and match timelines
├── api/index.ts              Vercel Node function exporting the Express app
├── scripts/
│   ├── package-vercel.mjs    Merge compiled frontends into dist and dist/admin
│   ├── upload-assets.mjs     Content-versioned public Vercel Blob asset upload
│   └── browser-check.mjs    Browser workflow and screenshots with isolated test data
└── vercel.json               Build output and route configuration
```

## Customer routes

| URL                        | Page                                       |
| -------------------------- | ------------------------------------------ |
| `/`, `/rail`               | Full-screen reference-style 3D homepage    |
| `/collections`             | All collections                            |
| `/collections/:id`         | Products in one collection                 |
| `/products`                | Searchable, sortable product catalog       |
| `/products/:id`            | One product and 3D viewer                  |
| `/wishlist`                | Saved products                             |
| `/cart`                    | Cart and quantity controls                 |
| `/checkout`                | Cash-on-delivery checkout and confirmation |
| `/contact`                 | Contact form; messages appear in the panel |
| `/` (web-panel), `/admin/` | Separately built administration app        |

## MongoDB collections

`products`, `collections`, `orders`, `contacts`, `admins`, and `sessions` are stored as normal MongoDB documents. Public entity IDs are strings; MongoDB also assigns its internal `_id`.

The database has unique indexes for entity IDs, admin email, session token hashes, and order request IDs. Sessions expire after eight hours and have a MongoDB TTL index; requests also check expiry directly. A warm Vercel function reuses its database connection pool.

Product stock is a total across all sizes. An order transaction reads current product prices and sizes, atomically decrements stock only when enough remains, and inserts a price snapshot. Client-supplied totals are ignored. An idempotency request ID prevents duplicate orders from a retry. Cancellation restores stock once in a transaction.

Order transitions:

```text
pending → confirmed → shipped → delivered
   └────────┴────────→ cancelled  (only before shipment)
```

Delivered and cancelled orders cannot be reopened. Deleting a product preserves historical order names and prices. Collections containing products cannot be deleted.

## API

| Method | Endpoint                                                | Access / purpose                                   |
| ------ | ------------------------------------------------------- | -------------------------------------------------- |
| GET    | `/api/health`                                           | Database readiness                                 |
| GET    | `/api/products`, `/api/products/:id`                    | Public catalog                                     |
| GET    | `/api/collections`, `/api/collections/:id`              | Public collections                                 |
| POST   | `/api/orders`                                           | Create validated cash-on-delivery order            |
| POST   | `/api/contact`                                          | Persist a customer message                         |
| POST   | `/api/admin/login`                                      | Password verification and HTTP-only session cookie |
| GET    | `/api/admin/session`                                    | Check authenticated session                        |
| POST   | `/api/admin/logout`                                     | Revoke session                                     |
| POST   | `/api/admin/products`, `/api/admin/collections`         | Create records                                     |
| PUT    | `/api/admin/products/:id`, `/api/admin/collections/:id` | Update records                                     |
| DELETE | `/api/admin/products/:id`, `/api/admin/collections/:id` | Remove records                                     |
| GET    | `/api/admin/orders`                                     | List orders with customer and item details         |
| PATCH  | `/api/admin/orders/:id`                                 | Change order status                                |
| GET    | `/api/admin/contacts`                                   | Read customer messages                             |

Zod validates input. Admin endpoints require a session cookie. Mutations check browser origins; the Vercel deployment uses the same origin for both apps and API. Login and public writes have process-local rate limits; multi-instance deployments should additionally configure Vercel Firewall rate limits for those routes.

## 3D and UI

The original home and goalkeeper GLBs contain Jersey, Hanger, and Hook meshes. Materials are assigned in `JerseyModel`. A canvas texture adds player lettering to the reference UV atlas. Colors use sRGB and textures use `flipY=false`.

The rail uses Three.js through React Three Fiber, with the reference's photographic room plate and camera parameters. Pointer capture separates sliding gestures from clicks. Hover opens a bounded gap and rotates only the jersey cloth while the hanger stays fixed. A clipping plane hides the wood below the collar. Dragging pushes neighbors without changing their order, bends the cloth with spring-driven GPU waves anchored below the collar, and preserves their positions when direction reverses or the detail view closes. Selection moves the jersey to the foreground; click or drag rotates it. Position filters, reset, previous/next controls, Escape, keyboard jersey selection, mobile player buttons, and outside-click dismissal are available. Pointer updates are committed once per animation frame. Fabric normals follow the deformed surface, and waves decay after release. Reduced-motion preferences disable the fabric waves and CSS animations. WebGL failures have a 2D fallback.

The squad sheet uses a translucent style and includes **Add to cart** in its bottom action bar. Select a size before adding. The reference player data is display content; product name, number, kit, position, collection, price, sizes, stock, and rail visibility are editable through the panel.

## Environment and logging

Only `MONGODB_URI` is required for normal backend operation. `npm run create:admin` prompts for account details and stores a salted password hash in MongoDB. Admin credentials are not kept in `.env`, and existing passwords are never silently reset. Optional Blob configuration is described in the deployment guide. Frontend variables are public build values, never secrets.

Requested `console.log` calls report connection readiness, entity IDs, cart actions, rail interactions, order totals, and status transitions. They do not log passwords, MongoDB URIs, session cookies, or customer delivery details.
