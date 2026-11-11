import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

// Exercise checkout and admin without adding test orders to the actual store.
const testDatabaseName = `garuda_browser_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
process.env.MONGODB_DB_NAME = testDatabaseName;
const adminEmail = 'browser-test@example.com';
const adminPassword = randomUUID();
const { connectDatabase, closeDatabase } = await import('../backend/src/database.ts');
const { seedDatabase } = await import('../backend/src/seed.ts');
const { app } = await import('../backend/src/app.ts');
await seedDatabase();
const { createAdmin } = await import('../backend/src/admin.ts');
await createAdmin(adminEmail, adminPassword);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const backendUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-webgl', '--use-angle=metal'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/**', async (route) => {
  const url = new URL(route.request().url());
  const response = await route.fetch({ url: `${backendUrl}${url.pathname}${url.search}` });
  await route.fulfill({ response });
});
await mkdir('docs/screenshots', { recursive: true });
try {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'MUTED', exact: true }).click();
  await page.waitForTimeout(5000);
  await page.screenshot({ timeout: 90000, path: 'docs/screenshots/homepage-desktop.png' });
  assert.equal(await page.locator('.ref-keyboard-rail button').count(), 23);
  await page.getByRole('button', { name: 'GK3', exact: true }).click();
  assert.equal(await page.locator('.ref-keyboard-rail button').count(), 3);
  await page.getByRole('button', { name: 'Reset the rail', exact: true }).click();
  await page.getByRole('button', { name: 'Explore HAYE 19', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.locator('.ref-squad').waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({ timeout: 90000, path: 'docs/screenshots/jersey-back.png' });
  await page.getByRole('button', { name: 'Turn jersey', exact: true }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ timeout: 90000, path: 'docs/screenshots/jersey-detail.png' });
  await page.getByRole('button', { name: 'ADD TO CART', exact: true }).click();
  await page.getByRole('button', { name: 'Save jersey to wishlist', exact: true }).click();
  await page.goto('http://127.0.0.1:5173/wishlist');
  await page.getByRole('heading', { name: 'Thom Haye Home Jersey' }).waitFor();
  await page.goto('http://127.0.0.1:5173/cart');
  await page.getByRole('link', { name: 'Continue to checkout' }).click();
  for (const [name, value] of Object.entries({
    name: 'Browser Test',
    email: 'browser@example.com',
    phone: '+15555550100',
    address: '1 Test Street',
    city: 'Test City',
    postalCode: '12345',
  }))
    await page.locator(`[name="${name}"]`).fill(value);
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await page.getByRole('heading', { name: 'Good choice. Great spirit.' }).waitFor();
  console.log('[browser] Checkout, cart, wishlist, and rail selection passed');
  await page.goto('http://127.0.0.1:5174/');
  await page.getByLabel('Email address').fill(adminEmail);
  await page.getByLabel('Password', { exact: true }).fill(adminPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Your store, at a glance.' }).waitFor();
  await page.screenshot({ timeout: 90000, path: 'docs/screenshots/admin-desktop.png' });
  await page.getByRole('button', { name: /^Orders/ }).click();
  await page.getByRole('button', { name: /^View order/ }).click();
  await page.locator('.order-detail').getByLabel('Order status').selectOption('confirmed');
  await page.getByText('Order marked confirmed.', { exact: true }).waitFor();
  await page.locator('.order-detail').getByLabel('Order status').selectOption('shipped');
  await page.getByText('Order marked shipped.', { exact: true }).waitFor();
  await page.locator('.order-detail').getByLabel('Order status').selectOption('delivered');
  await page.getByText('Order marked delivered.', { exact: true }).waitFor();
  console.log('[browser] Admin sign-in and order fulfillment passed');
  await page.goto('http://127.0.0.1:5173/contact');
  await page.getByLabel('Your name').fill('Browser Test');
  await page.getByLabel('Email address').fill('browser@example.com');
  await page
    .getByLabel('What’s on your mind?')
    .fill('Testing that customer messages reach the store.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByRole('heading', { name: 'You’re heard.' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5173');
  await page.waitForTimeout(2500);
  await page.screenshot({ timeout: 90000, path: 'docs/screenshots/homepage-mobile.png' });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
  );
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('link', { name: 'All jerseys', exact: true }).click();
  await page.getByRole('heading', { name: 'Every jersey. One spirit.' }).waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
  );
  assert.deepEqual(errors, [], 'No browser JavaScript errors');
  console.log('[browser] Contact, mobile navigation, and overflow checks passed');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  const database = await connectDatabase();
  assert.equal(database.databaseName, testDatabaseName);
  await database.dropDatabase();
  await closeDatabase();
  console.log('[browser] Temporary test database removed');
}
