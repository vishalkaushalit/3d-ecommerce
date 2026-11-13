// Run with the frontend dev server: node --import tsx scripts/mobile-rail-browser-check.mjs
// Safari engine: RAIL_BROWSER=webkit node --import tsx scripts/mobile-rail-browser-check.mjs
// Fixtures keep this rendering/input regression check independent of the store database.
import { chromium, webkit, devices } from '@playwright/test';
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
const safari = process.env.RAIL_BROWSER === 'webkit';
const browser = safari
  ? await webkit.launch()
  : await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--enable-webgl', '--use-angle=metal'],
    });
const errors = [];
try {
  for (const profile of safari ? ['iPhone 13', 'iPad Pro 11'] : ['Pixel 7', 'desktop']) {
    const mobile = profile !== 'desktop';
    const context = await browser.newContext(
      mobile ? { ...devices[profile] } : { viewport: { width: 1440, height: 900 } },
    );
    await context.addInitScript(() => {
      // Retain references to detect canvas backing stores that were never released,
      // including discarded StrictMode allocations that aren't in the scene graph.
      window.jerseyCanvases = new Set();
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (kind === '2d') window.jerseyCanvases.add(this);
        return getContext.call(this, kind, ...args);
      };
    });
    const page = await context.newPage();
    let forcingContextLoss = false;
    const fullSizeRequests = [];
    page.on('request', (request) => {
      if (/\/(home|gk)_(color|normal)\.webp/.test(request.url()))
        fullSizeRequests.push(request.url());
    });
    page.on('pageerror', (error) => {
      if (forcingContextLoss && error.message === 'The 3D graphics context was lost') return;
      errors.push(error.message);
    });
    page.on('console', (message) => {
      if (forcingContextLoss && message.text().includes('The 3D graphics context was lost')) return;
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
            textureId: jersey.material.map.uuid,
            texturePixels: jersey.material.map.image.width * jersey.material.map.image.height,
            normalWidth: jersey.material.normalMap.image.width,
          });
        });
        return {
          jerseys,
          shadowLights: lights.length,
          autoUpdate: gl.shadowMap.autoUpdate,
          offset: camera.view.offsetX,
          contextLost: gl.getContext().isContextLost(),
          coarse: matchMedia('(pointer: coarse)').matches,
          dpr: gl.getPixelRatio(),
          canvasPixels: [...window.jerseyCanvases].reduce(
            (sum, canvas) => sum + canvas.width * canvas.height,
            0,
          ),
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
    if (mobile) {
      assert.deepEqual(fullSizeRequests, [], 'Mobile must not decode full-size source textures');
      const atlasMiB =
        initial.jerseys.reduce((sum, item) => sum + (item.texturePixels * 4 * 4) / 3, 0) /
        1024 ** 2;
      assert.ok(atlasMiB < 64, 'Full-squad atlas memory stays below 64 MiB');
      assert.ok(initial.jerseys.every((item) => item.normalWidth <= 1024));
      assert.ok(
        initial.canvasPixels <= products.length * 1024 * 512 + 1024 ** 2,
        'No orphaned full-size atlas canvases',
      );
      if (safari) assert.ok(initial.dpr <= 1, 'iOS starts within its drawing-buffer budget');
      console.log(
        `[${profile}] Atlas budget: ${atlasMiB.toFixed(1)} MiB; canvas pixels: ${initial.canvasPixels}`,
      );
    }
    if (!mobile) {
      await page.getByRole('button', { name: 'Explore HAYE 19', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Close squad sheet' }).click();
      await context.close();
      continue;
    }

    // Chrome exposes native touch injection and CPU throttling through CDP.
    // WebKit below exercises real page taps and resource/fallback behavior.
    if (!safari) {
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
    }

    for (let cycle = 0; cycle < 3; cycle++) {
      const id = profile.startsWith('iPad')
        ? null
        : await page.locator('.ref-mobile-players button.active').getAttribute('aria-label');
      const player = profile.startsWith('iPad')
        ? products[0]
        : products.find((product) => `Select ${product.player}` === id);
      assert.ok(player);
      const rail = await page.evaluate(() => window.readRail());
      const jersey = rail.jerseys.find((item) => item.id === player.id);
      if (profile.startsWith('iPad')) {
        // The wide iPad layout exposes the same keyboard-accessible chooser as desktop.
        await page
          .getByRole('button', { name: `Explore ${player.player} ${player.number}`, exact: true })
          .focus();
        await page.keyboard.press('Enter');
      } else await page.touchscreen.tap(jersey.x, jersey.y);
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
      assert.deepEqual(
        returned.jerseys.map((item) => item.textureId),
        initial.jerseys.map((item) => item.textureId),
        'Detail transitions reuse texture allocations',
      );
      assert.equal(
        returned.canvasPixels,
        initial.canvasPixels,
        'No canvas growth after opening and closing',
      );
    }
    await page.screenshot({
      path: `/tmp/garuda-${safari ? 'safari' : 'chrome'}-${profile.replaceAll(' ', '-')}.png`,
    });
    forcingContextLoss = true;
    await page.evaluate(async () => {
      const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      const canvas = document.querySelector('canvas');
      const { gl } = _roots.get(canvas).store.getState();
      const extension = gl.getContext().getExtension('WEBGL_lose_context');
      if (!extension) throw new Error('Context loss test extension is unavailable');
      extension.loseContext();
    });
    await page.locator('.ref-fallback button').first().waitFor();
    assert.equal(
      await page.locator('.ref-entry').count(),
      0,
      'Fallback is not hidden behind the loader',
    );
    assert.ok(
      await page.evaluate(() => [...window.jerseyCanvases].every((canvas) => canvas.width < 1024)),
      'Unmount releases atlas backing stores',
    );
    await page.locator('.ref-fallback button').first().click();
    await page.getByRole('button', { name: 'Close squad sheet' }).waitFor();
    await context.close();
    console.log(
      `[${profile}] Startup, repeated detail transitions, texture reuse, and context-loss fallback passed`,
    );
  }
  // A failed asset before onReady must not strand the user behind the loader.
  const failedContext = await browser.newContext({ ...devices['iPhone 13'] });
  const failedPage = await failedContext.newPage();
  await failedPage.route('**/api/products', (route) => route.fulfill({ json: products }));
  await failedPage.route('**/api/collections', (route) => route.fulfill({ json: [] }));
  await failedPage.route('**/jersey*.glb', (route) => route.abort());
  await failedPage.goto(process.env.RAIL_TEST_URL || 'http://127.0.0.1:5173');
  await failedPage.getByRole('button', { name: 'MUTED', exact: true }).click({ timeout: 30000 });
  await failedPage.locator('.ref-fallback button').first().tap();
  await failedPage.getByRole('button', { name: 'Close squad sheet' }).waitFor();
  await failedContext.close();
  console.log(
    '[rail] Startup asset failure dismisses the loader and keeps product selection available',
  );
  assert.deepEqual(errors, [], 'No rendering or browser errors');
  console.log(`[rail] ${safari ? 'WebKit' : 'Chrome mobile and desktop'} checks passed`);
} finally {
  await browser.close();
}
