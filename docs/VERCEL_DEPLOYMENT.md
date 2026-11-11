# Deploy GARUDA as one Vercel project

Import the **repository root** once. The source remains in three folders: both the storefront and web panel run on root URL `/` (or `/admin/` in single-domain deployments), and the backend at `/api/*`.

MongoDB stores the catalog, orders, admin accounts, and sessions. A **public Vercel Blob store** serves the 3D models, textures, room artwork, lighting, and fonts. Deployment and asset upload are manual.

## 1. Prepared local environment files

| File             | Variable                | What to enter                                                 |
| ---------------- | ----------------------- | ------------------------------------------------------------- |
| `backend/.env`   | `MONGODB_URI`           | Keep your existing connection string                          |
| `backend/.env`   | `BLOB_READ_WRITE_TOKEN` | Paste the real token after creating the public Blob store     |
| `frontend/.env`  | `VITE_ASSET_BASE_URL`   | The upload script fills this with the public asset folder URL |
| `web-panel/.env` | None                    | The panel calls `/api` on the same domain                     |

The Blob entries are initially empty. Empty `VITE_ASSET_BASE_URL` uses local assets, so the initial deployment works before Blob is configured. Admin credentials remain in MongoDB as password hashes; do not put them in environment variables. Never expose the Blob write token through a `VITE_` variable.

## 2. Check the build and database

Use Node.js **22.x**, version 22.13 or later. From the repository root:

```bash
npm ci
npm run build
```

The command checks the API TypeScript and builds both apps into `dist/` and `dist/admin/`. Root `api/index.ts` is deployed separately as a function. Deploy the repository source, not only the `dist` folder.

In MongoDB Atlas, ensure the database user can read/write the intended database and Network Access permits your Vercel deployment's outbound connections. Allowing only your laptop IP is insufficient. Use your project's configured egress addresses where available. Checkout requires Atlas or another replica set because it uses transactions.

Your current store and admin are initialized. Only for a **fresh database**, run `npm run seed` and `npm run create:admin` locally. The latter prompts for an email and hidden password. Existing passwords are preserved. Do not add these commands to the deployment build.

## 3. Import the single Vercel project

Push the source to your Git provider, including `package-lock.json`, `vercel.json`, `tsconfig.json`, `api/`, and all three application folders. Keep `.env` files private; they are ignored by Git.

In Vercel choose **Add New → Project**, import the repository, and use:

| Setting          | Value                                           |
| ---------------- | ----------------------------------------------- |
| Root Directory   | Repository root (`./`)                          |
| Framework Preset | Other / Vite (`vercel.json` provides overrides) |
| Node.js Version  | 22.x                                            |
| Install Command  | `npm install` (`vercel.json` configures this)   |
| Build Command    | `npm run build` (`vercel.json` configures this) |
| Output Directory | `dist` (`vercel.json` configures this)          |

With `vercel.json` configured, Vercel will automatically run `npm run build` (via `buildCommand` and the `vercel-build` npm script), packaging both frontends and the backend into `dist`. You can also trigger deployments directly with `npm run deploy` if using the Vercel CLI.

Add **`MONGODB_URI`** to the project's environment variables with the exact value from `backend/.env`. Select Production, and Preview if desired. A separate Preview database avoids sharing real orders with previews.

Click **Deploy**. The first deployment uses bundled local assets. Root `vercel.json` routes API requests to the function and page requests to the correct React application, including on refresh.

## 4. Create and connect Vercel Blob

1. Open the project's **Storage** tab and create/connect a **Blob** store.
2. Choose **Public** access so browsers can fetch the models and textures directly.
3. Select **Add a read-write token env var to this connection** if offered. The local uploader uses a static read-write token rather than hosted OIDC authentication.
4. Copy the store's **`BLOB_READ_WRITE_TOKEN`** into the empty entry in local **`backend/.env`**.

Vercel may add the token to the connected project's environment variables. That is fine; this app needs it only for the local upload command. See [Vercel Blob authentication](https://vercel.com/docs/vercel-blob/using-blob-sdk#authentication).

## 5. Upload assets and redeploy

From the repository root:

```bash
npm run upload:assets
```

The script uploads the models, textures, HDR lighting, artwork, and fonts to a content-versioned folder. It preserves relative paths and writes the actual public folder URL into `frontend/.env`. It also prints a value shaped like:

```dotenv
VITE_ASSET_BASE_URL=https://your-store.public.blob.vercel-storage.com/garuda/content-hash
```

Use the **actual printed value**, including `/garuda/content-hash`; the example above is not a working URL.

In **Vercel Project → Settings → Environment Variables**, add `VITE_ASSET_BASE_URL` with that value for Production and any Preview deployments that should use Blob. Choose **Deployments → Redeploy**. Vite reads the URL at build time, so a new build is required.

Restart local `npm run dev` to use Blob in local previews too. If assets change later, repeat the upload, update the Vercel URL, and redeploy. Old asset folders remain available to older deployments.

The final variables are:

| Variable                | Local location  | Vercel setting                         | Purpose                                 |
| ----------------------- | --------------- | -------------------------------------- | --------------------------------------- |
| `MONGODB_URI`           | `backend/.env`  | Required, secret                       | Backend database                        |
| `BLOB_READ_WRITE_TOKEN` | `backend/.env`  | May be supplied by the Blob connection | Local uploads; never public             |
| `VITE_ASSET_BASE_URL`   | `frontend/.env` | Required for Blob assets, public       | Asset folder used by the frontend build |

## 6. Verify the deployment

```text
https://your-project.vercel.app/             Storefront
https://your-project.vercel.app/admin/       Web panel
https://your-project.vercel.app/api/health   Database health
```

Health should return `{"status":"ok","database":"connected"}`. Sign in with your existing MongoDB admin account.

- Hover, drag, select, and rotate a jersey; test Add to cart.
- Refresh a product page and `/admin/` to check routing.
- In browser Network tools, confirm GLB, WebP, HDR, and WOFF2 requests use the Blob hostname.
- Place a deliberate test order and verify it in the web panel. Cancel it to restore stock if it will not be fulfilled.

Checkout records cash-on-delivery orders. Online payments and email delivery are not configured.

## Troubleshooting

| Symptom                                  | Check                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| API or health check fails                | Vercel has `MONGODB_URI`; Atlas permissions and network access allow the deployment |
| Upload stops immediately                 | Local `BLOB_READ_WRITE_TOKEN` contains the real token from a public store           |
| Model, background, or font fails to load | Blob is public; the URL includes the versioned folder; redeploy after changing it   |
| Assets still use `/assets`               | Set `VITE_ASSET_BASE_URL` in Vercel, not only locally, and redeploy                 |
| Admin login fails                        | Use the existing MongoDB account; create an account only for a fresh database       |
| Pages fail on refresh                    | Retain root `vercel.json` and select the repository root                            |
| Orders fail while products load          | Check transaction support and database write permissions                            |

Official references: [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json), [Node.js functions and TypeScript](https://vercel.com/docs/functions/runtimes/node-js), [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), and [Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk).
