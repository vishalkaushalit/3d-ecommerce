// Run with the frontend dev server: node --import tsx scripts/mobile-rail-browser-check.mjs
// Fixtures keep this rendering/input regression check independent of the store database.
import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';
import { referencePlayers } from '../shared/referencePlayers.ts';

const products = Object.entries(referencePlayers).map(([number, player]) => {
  const goalkeeper = ['1', '12', '13'].includes(number);
  return {
    id: `player-${number}`,
    name: `${player.name} Jersey`,
    player: player.shirt,
    number,
    position: goalkeeper
      ? 'GK'
      : ['2', '3', '4', '5', '6', '16', '20', '21', '22', '23'].includes(number)
        ? 'DEF'
        : ['8', '9', '10'].includes(number)
          ? 'FWD'
          : 'MID',
    kit: goalkeeper ? 'gk' : 'home',
    color: goalkeeper ? '#168a9c' : '#a72227',
    featured: true,
    price: 89,
    sizes: ['S', 'M', 'L'],
    stock: 25,
    description: 'Rendering test jersey',
    collectionId: goalkeeper ? 'goalkeeper-kit' : 'home-kit',
  };
});
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-webgl', '--use-angle=metal'],
});
const errors = [];
try {
  for (const mobile of [true, false]) {
    const context = await browser.newContext(
      mobile ? { ...devices['Pixel 7'] } : { viewport: { width: 1440, height: 900 } },
    );
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /shader|webgl|THREE/i.test(message.text()))
        errors.push(message.text());
    });
    await page.route('**/api/products', (route) => route.fulfill({ json: products }));
    await page.route('**/api/collections', (route) => route.fulfill({ json: [] }));
    await page.goto(process.env.RAIL_TEST_URL || 'http://127.0.0.1:5173');
    await page.getByRole('button', { name: 'MUTED', exact: true }).click({ timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.evaluate(async () => {
      const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      const { Vector3 } = await import('/node_modules/.vite/deps/three.js');
      window.readRail = () => {
        const canvas = document.querySelector('canvas');
        const { scene, camera, gl } = _roots.get(canvas).store.getState();
        scene.updateMatrixWorld(true);
        const jerseys = [];
        const lights = [];
        scene.traverse((object) => {
          if (object.isLight && object.castShadow) lights.push(object.uuid);
          if (!object.name.startsWith('rail-')) return;
          const point = new Vector3(0, -0.4, 0).applyMatrix4(object.matrixWorld).project(camera);
          const jersey = object.getObjectByName('Jersey');
          jerseys.push({
            id: object.name.slice(5),
            z: object.position.z,
            x: ((point.x + 1) * canvas.clientWidth) / 2,
            y: ((1 - point.y) * canvas.clientHeight) / 2,
            receiveShadow: jersey.receiveShadow,
            castShadow: jersey.castShadow,
          });
        });
        return {
          jerseys,
          shadowLights: lights.length,
          autoUpdate: gl.shadowMap.autoUpdate,
          offset: camera.view.offsetX,
          contextLost: gl.getContext().isContextLost(),
          coarse: matchMedia('(pointer: coarse)').matches,
        };
      };
    });
    const initial = await page.evaluate(() => window.readRail());
    assert.equal(
      initial.coarse,
      mobile,
      'Exercise the touch render path, not just a narrow viewport',
    );
    assert.equal(initial.jerseys.length, products.length);
    assert.ok(initial.autoUpdate, 'Shadows stay synchronized with moving jerseys');
    assert.ok(
      initial.jerseys.every((jersey) => jersey.castShadow && jersey.receiveShadow === !mobile),
    );
    assert.ok(mobile ? initial.shadowLights === 1 : initial.shadowLights > 1);
    if (!mobile) {
      await page.getByRole('button', { name: 'Explore HAYE 19', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Close squad sheet' }).click();
      await context.close();
      continue;
    }

    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const touch = (type, x, y = 380) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }],
      });
    async function swipe(cancel = false) {
      await touch('touchStart', 330);
      for (let x = 310; x >= 110; x -= 20) {
        await touch('touchMove', x);
        await page.waitForTimeout(20);
      }
      await touch(cancel ? 'touchCancel' : 'touchEnd');
    }
    await page.evaluate(() => {
      window.panSamples = [];
      const sample = () => {
        window.panSamples.push({ time: performance.now(), offset: window.readRail().offset });
        if (window.panSamples.length < 240) window.panSampleFrame = requestAnimationFrame(sample);
      };
      window.panSampleFrame = requestAnimationFrame(sample);
    });
    await swipe();
    const released = await page.evaluate(() => window.readRail().offset);
    await page.waitForTimeout(150);
    assert.ok(
      (await page.evaluate(() => window.readRail().offset)) > released + 2,
      'Flick continues moving after release',
    );
    await page.waitForTimeout(2000);
    const samples = await page.evaluate(() => {
      cancelAnimationFrame(window.panSampleFrame);
      return window.panSamples;
    });
    assert.ok(samples.length > 10);
    assert.ok(
      samples.every((sample, i) => !i || Math.abs(sample.offset - samples[i - 1].offset) < 100),
      'Camera does not jump between frames',
    );
    await swipe(true);
    await page.waitForTimeout(1800);
    const settled = await page.evaluate(() => window.readRail().offset);
    await page.waitForTimeout(400);
    assert.ok(
      Math.abs((await page.evaluate(() => window.readRail().offset)) - settled) < 5,
      'Cancelled gesture settles without a stuck drag',
    );

    for (let cycle = 0; cycle < 3; cycle++) {
      const id = await page.locator('.ref-mobile-players button.active').getAttribute('aria-label');
      const player = products.find((product) => `Select ${product.player}` === id);
      assert.ok(player);
      const rail = await page.evaluate(() => window.readRail());
      const jersey = rail.jerseys.find((item) => item.id === player.id);
      await page.touchscreen.tap(jersey.x, jersey.y);
      await page.getByRole('button', { name: 'Close squad sheet' }).waitFor();
      await page.waitForTimeout(1100);
      await page.getByRole('button', { name: 'Close squad sheet' }).tap();
      await page.waitForTimeout(2200);
      const returned = await page.evaluate(() => window.readRail());
      assert.ok(
        returned.jerseys.every((item) => item.z < 0.01 && !item.receiveShadow),
        'Returning fabric cannot receive stale/self shadows',
      );
      assert.equal(returned.contextLost, false);
    }
    await page.screenshot({ path: '/tmp/garuda-mobile-rail-return.png' });
    await context.close();
    console.log(
      '[mobile rail] Touch flick, cancellation, repeated open/close, and shadow budget passed with 4x CPU throttling',
    );
  }
  assert.deepEqual(errors, [], 'No rendering or browser errors');
  console.log('[rail] Desktop shadow quality and detail selection preserved');
} finally {
  await browser.close();
}
