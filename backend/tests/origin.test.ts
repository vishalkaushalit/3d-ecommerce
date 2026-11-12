import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

test('API origin checks allow arbitrary local ports and restrict production origins', async (t) => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousOrigins = process.env.ALLOWED_ORIGINS;
  process.env.NODE_ENV = 'development';
  process.env.ALLOWED_ORIGINS = ' https://store.example , https://panel.example ';
  t.after(() => {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    if (previousOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previousOrigins;
  });

  const { app } = await import('../src/app.js');
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // An unknown API route reaches the 404 handler without accessing MongoDB.
  const statusFor = async (origin?: string) => (await fetch(`${baseUrl}/api/origin-check`, {
    method: 'POST',
    headers: origin ? { Origin: origin } : {},
  })).status;

  for (const origin of [
    'http://localhost:3000',
    'http://127.0.0.1:8080',
    'https://localhost:65432',
    'http://[::1]:9000',
    'http://localhost',
    'https://store.example',
    'https://panel.example',
    baseUrl.replace('http:', 'https:'),
  ]) assert.equal(await statusFor(origin), 404, origin);
  assert.equal(await statusFor(), 404);

  for (const origin of [
    'https://untrusted.example',
    'http://localhost.evil.example:3000',
    'http://127.0.0.1.evil.example:8080',
    'http://localhost:3000@evil.example',
    'ftp://localhost:3000',
    'null',
  ]) assert.equal(await statusFor(origin), 403, origin);

  process.env.NODE_ENV = 'production';
  assert.equal(await statusFor('http://localhost:3000'), 403);
  assert.equal(await statusFor('http://127.0.0.1:8080'), 403);
  assert.equal(await statusFor('https://panel.example'), 404);
  assert.equal(await statusFor(baseUrl.replace('http:', 'https:')), 404);
});
