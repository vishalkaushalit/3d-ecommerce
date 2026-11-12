import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { connectDatabase, transaction, getRecords, getRecord, saveRecord } from './database.js';
import type { Collection, Product, Order, OrderStatus } from '../../shared/types.js';

export const app = express();
app.disable('x-powered-by');
if (process.env.VERCEL) app.set('trust proxy', 1);
app.use('/api/admin/products', requireAdmin, express.json({ limit: '2mb' }));
app.use(express.json({ limit: '64kb' }));
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const isLocalOrigin = (origin: string) =>
  process.env.NODE_ENV !== 'production' &&
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(origin);
app.use('/api', (request, response, next) => {
  response.set('Cache-Control', 'no-store');
  response.set('X-Content-Type-Options', 'nosniff');
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    request.headers.origin &&
    !isLocalOrigin(request.headers.origin) &&
    !allowedOrigins.has(request.headers.origin) &&
    request.headers.origin !== `https://${request.headers.host}`
  ) {
    return response.status(403).json({ message: 'This origin is not allowed.' });
  }
  next();
});
const writeLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again in a minute.' },
});
const loginLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' },
});
const text = z.string().trim().min(1).max(300);
const collectionSchema = z.object({
  name: text,
  description: text.max(1000),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
const designImage = z.string().max(750000).regex(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/).optional();
const productSchema = z.object({
  frontDesign: designImage,
  backDesign: designImage,
  name: text,
  collectionId: text,
  description: z.string().trim().min(1).max(3000),
  price: z.number().min(0.01).max(100000),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  kit: z.enum(['home', 'gk']),
  player: z.string().trim().max(20),
  number: z.string().regex(/^\d{1,2}$/),
  sizes: z
    .array(z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']))
    .min(1)
    .max(6),
  stock: z.number().int().min(0).max(100000),
  featured: z.boolean(),
  position: z.enum(['GK', 'DEF', 'MID', 'FWD']).default('MID'),
});
const customerSchema = z.object({
  name: text,
  email: z.email().max(254),
  address: text,
  city: text,
  postalCode: text.max(20),
  phone: z.string().trim().min(5).max(30),
});
const orderSchema = z.object({
  requestId: z.uuid(),
  customer: customerSchema,
  items: z
    .array(z.object({ productId: text, size: text, quantity: z.number().int().min(1).max(20) }))
    .min(1)
    .max(50),
});
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const getToken = (request: Request) =>
  request.headers.cookie
    ?.split('; ')
    .find((cookie) => cookie.startsWith('garuda_session='))
    ?.slice(15) || '';
async function requireAdmin(request: Request, response: Response, next: NextFunction) {
  const database = await connectDatabase();
  const session = await database
    .collection('sessions')
    .findOne({ token: tokenHash(getToken(request)), expiresAt: { $gt: new Date() } });
  if (!session) return response.status(401).json({ message: 'Please sign in to the web panel.' });
  next();
}

app.get('/api/health', async (_request, response) => {
  const database = await connectDatabase();
  await database.command({ ping: 1 });
  response.json({ status: 'ok', database: 'connected' });
});
app.get('/api/products', async (_request, response) =>
  response.json((await getRecords<Product>('products')).reverse()),
);
app.get('/api/collections', async (_request, response) =>
  response.json((await getRecords<Collection>('collections')).reverse()),
);
for (const table of ['products', 'collections'] as const) {
  app.get(`/api/${table}/:id`, async (request, response) => {
    const record = await getRecord(table, String(request.params.id));
    if (!record) return response.status(404).json({ message: 'Not found.' });
    response.json(record);
  });
}

app.post('/api/admin/login', loginLimit, async (request, response) => {
  const input = z
    .object({
      email: z.email().transform((value) => value.toLowerCase()),
      password: z.string().min(1).max(200),
    })
    .parse(request.body);
  const database = await connectDatabase();
  const admin = await database.collection('admins').findOne({ email: input.email });
  const salt = admin?.salt || 'invalid-account';
  const actual = scryptSync(input.password, salt, 64);
  const expected = admin ? Buffer.from(admin.passwordHash, 'hex') : Buffer.alloc(64);
  if (!timingSafeEqual(expected, actual) || !admin)
    return response.status(401).json({ message: 'Email or password is incorrect.' });
  const token = randomBytes(32).toString('hex');
  await database.collection('sessions').insertOne({
    token: tokenHash(token),
    email: admin.email,
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
  });
  response.cookie('garuda_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/api',
  });
  console.log('[login] Admin signed in');
  response.json({ email: input.email });
});
app.get('/api/admin/session', requireAdmin, (_request, response) =>
  response.json({ email: 'admin' }),
);
app.post('/api/admin/logout', requireAdmin, async (request, response) => {
  const database = await connectDatabase();
  await database.collection('sessions').deleteOne({ token: tokenHash(getToken(request)) });
  response.clearCookie('garuda_session', { path: '/api' });
  response.json({ success: true });
});

for (const table of ['products', 'collections'] as const) {
  for (const method of ['post', 'put'] as const) {
    app[method](
      `/api/admin/${table}${method === 'put' ? '/:id' : ''}`,
      requireAdmin,
      async (request, response) => {
        const data = (table === 'products' ? productSchema : collectionSchema).parse(request.body);
        const id = method === 'put' ? String(request.params.id) : randomUUID();
        if (method === 'put' && !(await getRecord(table, id)))
          return response.status(404).json({ message: 'Record not found.' });
        if ('collectionId' in data && !(await getRecord('collections', String(data.collectionId))))
          return response.status(400).json({ message: 'Choose an existing collection.' });
        const record = { ...data, id };
        await saveRecord(table, record);
        console.log(`[${table}] ${method === 'post' ? 'Created' : 'Updated'}`, id);
        response.status(method === 'post' ? 201 : 200).json(record);
      },
    );
  }
  app.delete(`/api/admin/${table}/:id`, requireAdmin, async (request, response) => {
    const id = String(request.params.id);
    if (!(await getRecord(table, id)))
      return response.status(404).json({ message: 'Record not found.' });
    if (
      table === 'collections' &&
      (await getRecords<Product>('products')).some((product) => product.collectionId === id)
    )
      return response
        .status(409)
        .json({ message: 'Move or delete the products in this collection first.' });
    const database = await connectDatabase();
    await database.collection(table).deleteOne({ id });
    console.log(`[${table}] Deleted`, id);
    response.json({ success: true });
  });
}

app.post('/api/orders', writeLimit, async (request, response) => {
  const input = orderSchema.parse(request.body);
  const database = await connectDatabase();
  const existing = await database.collection('orders').findOne({ requestId: input.requestId });
  if (existing) return response.json({ id: existing.id, total: existing.total });
  try {
    const order = await transaction(async (database, session) => {
      const quantities = new Map<string, number>();
      const items = [];
      for (const item of input.items) {
        const product = await getRecord<Product>('products', item.productId, session);
        if (!product || !product.sizes.includes(item.size))
          throw new Error('A product or size is no longer available. Please review your bag.');
        quantities.set(product.id, (quantities.get(product.id) || 0) + item.quantity);
        items.push({ ...item, name: product.name, price: product.price });
      }
      for (const [id, quantity] of quantities) {
        const result = await database
          .collection('products')
          .updateOne(
            { id, stock: { $gte: quantity } },
            { $inc: { stock: -quantity } },
            { session },
          );
        if (!result.modifiedCount) throw new Error('Not enough stock. Please review your bag.');
      }
      const subtotal =
        items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0) / 100;
      const shipping = subtotal >= 150 ? 0 : 10;
      const order: Order = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        status: 'pending',
        customer: input.customer,
        items,
        subtotal,
        shipping,
        total: Math.round((subtotal + shipping) * 100) / 100,
        paymentMethod: 'cash-on-delivery',
      };
      await database
        .collection('orders')
        .insertOne({ ...order, requestId: input.requestId }, { session });
      return order;
    });
    console.log('[orders] Created', order.id, 'total:', order.total);
    response.status(201).json({ id: order.id, total: order.total });
  } catch (error) {
    // Concurrent retries are resolved using the unique requestId index.
    const existing = await database.collection('orders').findOne({ requestId: input.requestId });
    if (existing) return response.json({ id: existing.id, total: existing.total });
    const message =
      error instanceof Error && /stock|product or size/.test(error.message)
        ? error.message
        : 'Could not place order. Please try again.';
    response.status(409).json({ message });
  }
});
app.get('/api/admin/orders', requireAdmin, async (_request, response) =>
  response.json(await getRecords<Order>('orders')),
);
app.patch('/api/admin/orders/:id', requireAdmin, async (request, response) => {
  const { status } = z
    .object({ status: z.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']) })
    .parse(request.body);
  try {
    const order = await transaction(async (database, session) => {
      const order = await getRecord<Order>('orders', String(request.params.id), session);
      if (!order) throw new Error('Order not found.');
      const transitions: Record<OrderStatus, OrderStatus[]> = {
        pending: ['confirmed', 'cancelled'],
        confirmed: ['shipped', 'cancelled'],
        shipped: ['delivered'],
        delivered: [],
        cancelled: [],
      };
      if (status !== order.status && !transitions[order.status].includes(status))
        throw new Error(`Cannot change ${order.status} to ${status}.`);
      if (status === 'cancelled' && order.status !== 'cancelled')
        for (const item of order.items) {
          await database
            .collection('products')
            .updateOne({ id: item.productId }, { $inc: { stock: item.quantity } }, { session });
        }
      order.status = status;
      await database
        .collection('orders')
        .updateOne({ id: order.id }, { $set: { status } }, { session });
      return order;
    });
    console.log('[orders] Status changed', order.id, status);
    response.json(order);
  } catch (error) {
    const message =
      error instanceof Error && /Order not found|Cannot change/.test(error.message)
        ? error.message
        : 'Could not update order.';
    response.status(message === 'Order not found.' ? 404 : 409).json({ message });
  }
});
app.post('/api/contact', writeLimit, async (request, response) => {
  const input = z
    .object({ name: text, email: z.email().max(254), message: z.string().trim().min(10).max(5000) })
    .parse(request.body);
  const contact = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
  const database = await connectDatabase();
  await database.collection('contacts').insertOne(contact);
  console.log('[contact] Message saved', contact.id);
  response.status(201).json({ success: true });
});
app.get('/api/admin/contacts', requireAdmin, async (_request, response) =>
  response.json(await getRecords('contacts')),
);
app.use('/api', (_request, response) =>
  response.status(404).json({ message: 'API route not found.' }),
);

// After a production build, one server hosts both React apps and the API.
const frontendDirectory = resolve(process.env.FRONTEND_DIST || '../frontend/dist');
const adminDirectory = resolve(process.env.ADMIN_DIST || '../web-panel/dist');
const isAdminRequest = (request: Request) => {
  if (process.env.SERVE_APP === 'admin' || process.env.SERVE_APP === 'web-panel') return true;
  const host = request.hostname || request.headers.host || '';
  return host.startsWith('admin.') || host.startsWith('panel.');
};

// Serve static assets from both applications
app.use(express.static(frontendDirectory));
app.use(express.static(adminDirectory));

// Web panel on /admin prefix for single-origin hosting
app.use('/admin', express.static(adminDirectory));
app.get('/admin/{*path}', (_request, response) =>
  response.sendFile(resolve(adminDirectory, 'index.html')),
);

// Root path handler: serves web panel or storefront based on host/environment
app.get('/{*path}', (request, response) => {
  if (isAdminRequest(request)) {
    return response.sendFile(resolve(adminDirectory, 'index.html'));
  }
  response.sendFile(resolve(frontendDirectory, 'index.html'));
});
app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError)
    return response.status(400).json({
      message: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    });
  if (error instanceof SyntaxError) return response.status(400).json({ message: 'Invalid JSON.' });
  console.error('[api] Unexpected error:', error instanceof Error ? error.name : 'Unknown error');
  response.status(500).json({ message: 'Something went wrong. Please try again.' });
});
