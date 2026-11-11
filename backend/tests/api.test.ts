import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

// Isolate every run in its own database. Never modify or drop the store database.
const testDatabaseName = `garuda_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
process.env.MONGODB_DB_NAME = testDatabaseName;
const adminPassword = 'test-password-only-never-for-production';
const adminEmail = 'test@example.com';
const { app } = await import('../src/app.js');
const { connectDatabase, closeDatabase } = await import('../src/database.js');
const { seedDatabase } = await import('../src/seed.js');
await seedDatabase();
const { createAdmin } = await import('../src/admin.js');
await createAdmin(adminEmail, adminPassword);
await createAdmin(adminEmail, 'must-not-replace-the-existing-password');
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
let cookie = '';
async function request(path: string, method = 'GET', body?: unknown, authenticated = false) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(authenticated ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, data: await response.json() };
}
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  const database = await connectDatabase();
  assert.equal(database.databaseName, testDatabaseName);
  await database.dropDatabase();
  await closeDatabase();
});

test('catalog, authenticated management, stock, idempotency, cancellation and contact lifecycle', async () => {
  assert.equal((await request('/health')).data.status, 'ok');
  const { data: products } = await request('/products');
  assert.equal(products.length, 23);
  assert.equal((await request('/admin/orders')).response.status, 401);
  assert.equal((await request('/admin/products', 'POST', {})).response.status, 401);
  assert.equal(
    (await request('/admin/login', 'POST', { email: 'test@example.com', password: 'wrong' }))
      .response.status,
    401,
  );
  const login = await request('/admin/login', 'POST', {
    email: 'test@example.com',
    password: adminPassword,
  });
  assert.equal(login.response.status, 200);
  cookie = login.response.headers.get('set-cookie')!.split(';')[0];
  assert.match(login.response.headers.get('set-cookie')!, /HttpOnly/);
  assert.equal((await request('/admin/session', 'GET', undefined, true)).response.status, 200);

  const badOrigin = await fetch(`${baseUrl}/admin/collections`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: 'https://untrusted.example',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(badOrigin.status, 403);
  const { data: collection } = await request(
    '/admin/collections',
    'POST',
    { name: 'Test collection', description: 'Test description', color: '#123456' },
    true,
  );
  assert.ok(collection.id);
  const inputProduct = {
    ...products[0],
    collectionId: collection.id,
    name: 'Test player jersey',
    stock: 4,
    price: 49.95,
  };
  const { data: product, response: productResponse } = await request(
    '/admin/products',
    'POST',
    inputProduct,
    true,
  );
  assert.equal(productResponse.status, 201);
  assert.equal(
    (await request(`/admin/collections/${collection.id}`, 'DELETE', undefined, true)).response
      .status,
    409,
  );
  assert.equal(
    (await request(`/admin/products/${product.id}`, 'PUT', { ...product, price: -1 }, true))
      .response.status,
    400,
  );

  const customer = {
    name: 'Test Customer',
    email: 'customer@example.com',
    phone: '+15555550100',
    address: '1 Test Street',
    city: 'Test City',
    postalCode: '12345',
  };
  const checkout = {
    requestId: crypto.randomUUID(),
    customer,
    items: [{ productId: product.id, size: 'M', quantity: 2 }],
    total: 0.01,
  };
  const placed = await request('/orders', 'POST', checkout);
  assert.equal(placed.response.status, 201);
  assert.equal(placed.data.total, 109.9, 'server ignores a client-supplied total');
  assert.equal((await request(`/products/${product.id}`)).data.stock, 2);
  const retry = await request('/orders', 'POST', checkout);
  assert.equal(retry.data.id, placed.data.id);
  assert.equal(
    (await request(`/products/${product.id}`)).data.stock,
    2,
    'retry must not deduct stock twice',
  );
  assert.equal(
    (
      await request('/orders', 'POST', {
        ...checkout,
        requestId: crypto.randomUUID(),
        items: [
          { productId: product.id, size: 'M', quantity: 2 },
          { productId: product.id, size: 'L', quantity: 2 },
        ],
      })
    ).response.status,
    409,
    'stock is shared across sizes',
  );
  assert.equal(
    (await request(`/products/${product.id}`)).data.stock,
    2,
    'failed transaction preserves stock',
  );
  assert.equal(
    (
      await request('/orders', 'POST', {
        ...checkout,
        requestId: crypto.randomUUID(),
        items: [{ productId: product.id, size: 'INVALID', quantity: 1 }],
      })
    ).response.status,
    409,
  );
  const { data: orders } = await request('/admin/orders', 'GET', undefined, true);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].customer.name, customer.name);
  assert.equal(
    (await request(`/admin/orders/${placed.data.id}`, 'PATCH', { status: 'delivered' }, true))
      .response.status,
    409,
  );
  assert.equal(
    (await request(`/admin/orders/${placed.data.id}`, 'PATCH', { status: 'cancelled' }, true))
      .response.status,
    200,
  );
  assert.equal((await request(`/products/${product.id}`)).data.stock, 4);
  await request(`/admin/orders/${placed.data.id}`, 'PATCH', { status: 'cancelled' }, true);
  assert.equal(
    (await request(`/products/${product.id}`)).data.stock,
    4,
    'cancellation only restores stock once',
  );
  assert.equal(
    (await request(`/admin/orders/${placed.data.id}`, 'PATCH', { status: 'confirmed' }, true))
      .response.status,
    409,
  );

  assert.equal(
    (
      await request('/contact', 'POST', {
        name: 'Test',
        email: 'test@example.com',
        message: 'A question about my jersey.',
      })
    ).response.status,
    201,
  );
  assert.equal((await request('/admin/contacts', 'GET', undefined, true)).data.length, 1);
  assert.equal(
    (await request(`/admin/products/${product.id}`, 'DELETE', undefined, true)).response.status,
    200,
  );
  assert.equal(
    (await request(`/admin/collections/${collection.id}`, 'DELETE', undefined, true)).response
      .status,
    200,
  );
  await request('/admin/logout', 'POST', {}, true);
  assert.equal((await request('/admin/orders', 'GET', undefined, true)).response.status, 401);
});
