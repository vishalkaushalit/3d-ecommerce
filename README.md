# Garuda 3D ecommerce

React, TypeScript, Tailwind CSS, Three.js, Express, and MongoDB. The homepage recreates the supplied Garuda locker-room reference, including the original jersey models, room artwork, position filters, draggable jerseys, rotating detail view, and a shopping-enabled squad sheet.

## Start locally

Requires Node.js 22.x (22.13 or later) and a MongoDB Atlas database (or a MongoDB replica set for transactions).

```bash
npm install
# Create backend/.env from backend/.env.example if it does not exist.
npm run seed
npm run dev
```

- Storefront: <http://localhost:5173>
- Web panel: <http://localhost:5174>
- API health: <http://localhost:4000/api/health>

The configured MongoDB store has been initialized. Sign in with your existing admin account. Passwords in MongoDB are salted scrypt hashes; admin credentials are not kept in `.env`. For a fresh database, run `npm run create:admin` and enter the email and password at the terminal prompts. Re-running the seed preserves existing products, orders, and admin passwords.

For a side-by-side VS Code preview, run **Simple Browser: Show** from the command palette, enter `http://localhost:5173`, and move the browser tab to the right editor group.

## Project folders

```text
backend/       Express API, MongoDB storage, authentication, seed, integration tests
frontend/      Customer-facing React app, 3D scenes, pages, local reference assets
web-panel/     Separate React app for products, collections, orders, and messages
shared/        Consistent Product, Collection, Order types and reference player facts
api/           Vercel function entry point
scripts/       Build packaging, Vercel Blob upload, browser verification
docs/          Architecture and manual Vercel deployment instructions
```

See [the structure and API documentation](docs/STRUCTURE.md) and [manual Vercel deployment](docs/VERCEL_DEPLOYMENT.md).

## Commands

| Command                 | Purpose                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| `npm run dev`           | Start all three apps                                                   |
| `npm run seed`          | Create missing catalog records                                         |
| `npm run create:admin`  | Create a MongoDB admin using a hidden password prompt                  |
| `npm run build`         | Type-check and compile all three apps                                  |
| `npm run build:vercel`  | Build and combine storefront and panel under `dist/`                   |
| `npm start`             | Serve both built apps and the API through port 4000                    |
| `npm test`              | Run isolated MongoDB integration checks                                |
| `npm run test:browser`  | Check the running previews with installed Google Chrome                |
| `npm run upload:assets` | Upload local reference assets to a configured public Vercel Blob store |
| `npm run format`        | Format the source for readability                                      |

Tests use randomly named temporary databases on the configured MongoDB cluster, verify their names before removal, and never use the store database for test orders. The database user must be permitted to create and drop those temporary databases. Browser checks require `npm run dev` to be running and Google Chrome installed.

## Environment

Only this value is required in `backend/.env`:

```dotenv
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/garuda_store
```

Admin creation uses `npm run create:admin`, with a hidden password prompt. Sign-in reads the hashed account from MongoDB. The storefront and panel require no local `.env` variables because they use same-origin `/api` requests.

The prepared `backend/.env` also has an empty `BLOB_READ_WRITE_TOKEN` entry. Fill it with your public Vercel Blob store's token, then run `npm run upload:assets`. This fills `VITE_ASSET_BASE_URL` in `frontend/.env`; copy that public URL to the Vercel project's environment variables and redeploy. Models, artwork, lighting, and fonts use that URL. The MongoDB connection and Blob token are secrets; the asset URL is public. See [the manual deployment steps](docs/VERCEL_DEPLOYMENT.md).

## Store behavior

All requested shopping routes are implemented: homepage/rail, collection listing, collection detail, product listing, product detail, wishlist, cart, checkout, and contact. Cart and wishlist persist in the browser. Orders, products, stock, collections, contact messages, admins, and sessions persist in MongoDB.

Checkout uses **cash on delivery**. No card payment or email delivery is implied. Prices, stock quantities, size measurements, and shipping terms are editable/example store data. Stock is shared across a product's available sizes.

The 3D geometry and visual assets come from the supplied reference; see [asset attribution](frontend/public/assets/ATTRIBUTION.md). Animations, hover spacing, interaction code, and synthesized room ambience are implemented locally. The campaign player information is a snapshot of the reference, not a current sports-data feed. The lower-right locker card leads to the shop's collection pages.

Vercel deployment is intentionally left to you, as requested. The source, root deployment configuration, and Blob upload script are prepared; no Vercel project or Blob store has been created automatically.
