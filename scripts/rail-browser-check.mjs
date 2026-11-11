import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-webgl', '--use-angle=metal'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const renderErrors = [];
page.on('pageerror', (error) => renderErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && /shader|webgl|THREE/i.test(message.text()))
    renderErrors.push(message.text());
});
try {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'MUTED', exact: true }).click();
  await page.waitForTimeout(2500);
  async function checkHeader() {
    const complete = await page.locator('.store-header').evaluate((header) => {
      const bounds = header.getBoundingClientRect();
      const controls = header.querySelector('.ref-controls');
      const cartBtn = header.querySelector('.ref-cart-btn');
      return bounds.width > 0 && bounds.height > 0 && !!controls && !!cartBtn;
    });
    assert.ok(complete, 'Header, controls, and cart button are present and visible');
  }
  await checkHeader();
  // Inspect actual rendered transforms, not just the requested target positions.
  async function readRail() {
    return page.evaluate(async () => {
      const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      const { Vector3, Box3 } = await import('/node_modules/.vite/deps/three.js');
      const canvas = document.querySelector('canvas');
      const { scene, camera, gl } = _roots.get(canvas).store.getState();
      if (!gl.localClippingEnabled) throw new Error('Hanger collar clipping must be enabled');
      scene.updateMatrixWorld(true);
      const items = [];
      scene.traverse((object) => {
        if (!object.name.startsWith('rail-')) return;
        const center = new Vector3(0, -0.3, 0).applyMatrix4(object.matrixWorld).project(camera);
        const box = new Box3().setFromObject(object);
        let minX = Infinity,
          maxX = -Infinity;
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
              const point = new Vector3(x, y, z).project(camera);
              minX = Math.min(minX, point.x);
              maxX = Math.max(maxX, point.x);
            }
        items.push({
          id: object.name,
          x: object.position.x,
          screenX: ((center.x + 1) * canvas.clientWidth) / 2,
          screenY: ((1 - center.y) * canvas.clientHeight) / 2,
          minX,
          maxX,
          hanger: object.getObjectByName('hanger').rotation.y,
          cloth: object.getObjectByName('cloth').rotation.y,
          bend: object.getObjectByName('Jersey').material.userData.clothUniforms.uClothBend.value,
          ripple:
            object.getObjectByName('Jersey').material.userData.clothUniforms.uClothRipple.value,
          energy:
            object.getObjectByName('Jersey').material.userData.clothUniforms.uClothEnergy.value,
          clearance:
            object.getObjectByName('Jersey').material.userData.clothUniforms.uClothClearance.value,
        });
      });
      return items.sort((a, b) => a.x - b.x);
    });
  }
  const before = await readRail();
  const target = before[10];
  await page.mouse.move(target.screenX, target.screenY);
  await page.waitForTimeout(1400);
  const hovered = await readRail();
  const item = hovered.find((item) => item.id === target.id);
  assert.ok(Math.abs(item.hanger - target.hanger) < 0.001, 'Hanger stays still');
  assert.ok(Math.abs(item.cloth - target.cloth) > 1, 'Only the jersey rotates');
  const index = hovered.findIndex((item) => item.id === target.id);
  assert.ok(item.x - hovered[index - 1].x > 0.34, 'Gap on left');
  assert.ok(hovered[index + 1].x - item.x > 0.34, 'Gap on right');
  assert.ok(
    hovered.every((item) => item.minX >= -1.02 && item.maxX <= 1.02),
    'Hover keeps all jerseys in view',
  );
  await page.screenshot({ timeout: 90000, path: 'docs/screenshots/rail-hover.png' });
  await page.mouse.move(item.screenX, item.screenY);
  await page.mouse.down();
  await page.mouse.move(item.screenX + 200, item.screenY, { steps: 20 });
  await page.waitForTimeout(80);
  const moving = await readRail();
  const movingItem = moving.find((entry) => entry.id === target.id);
  assert.ok(
    Math.abs(movingItem.hanger - target.hanger) < 0.001,
    'Hanger stays upright during drag',
  );
  assert.ok(Math.abs(movingItem.bend) > 0.01, 'Fabric bends while sliding');
  assert.ok(movingItem.energy > 0.05, 'Dragging sends ripples down the fabric');
  assert.ok(movingItem.clearance > 0.03, 'The moving cloth has space to bend');
  assert.deepEqual(
    moving.map((entry) => entry.id),
    before.map((entry) => entry.id),
    'No crossing during drag',
  );
  await page.screenshot({ path: 'docs/screenshots/rail-drag.png' });
  await page.mouse.up();
  await page.mouse.move(700, 780);
  await page.waitForTimeout(1200);
  const dragged = await readRail();
  assert.ok(dragged[index].energy < movingItem.energy, 'Fabric waves settle after release');
  assert.deepEqual(
    dragged.map((item) => item.id),
    before.map((item) => item.id),
    'Dragging preserves jersey order',
  );
  assert.ok(
    dragged[index + 1].x > before[index + 1].x + 0.05,
    'Dragging pushes the neighboring jerseys',
  );
  assert.ok(
    dragged.every((item) => item.minX >= -1.02 && item.maxX <= 1.02),
    'Dragged jerseys remain in view',
  );
  const movedItem = dragged.find((entry) => entry.id === target.id);
  await page.mouse.move(movedItem.screenX, movedItem.screenY);
  await page.waitForTimeout(1000);
  const openedRail = await readRail();
  const openTarget = openedRail.find((entry) => entry.id === target.id);
  await page.mouse.click(openTarget.screenX, openTarget.screenY);
  await page.getByRole('button', { name: 'Close squad sheet' }).waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'docs/screenshots/jersey-detail.png' });
  await page.getByRole('button', { name: 'Close squad sheet' }).click();
  await page.mouse.move(700, 780);
  await page.waitForTimeout(1500);
  const returned = await readRail();
  for (let i = 0; i < dragged.length; i++) {
    assert.equal(returned[i].id, dragged[i].id);
    assert.ok(
      Math.abs(returned[i].x - dragged[i].x) < 0.015,
      'Closing restores the dragged rail positions',
    );
  }
  console.log(
    '[rail] Hover clearance, fixed hangers, push behavior, order, and viewport bounds passed',
  );
  for (const edge of [0, 22]) {
    await page.getByRole('button', { name: 'Reset the rail', exact: true }).click();
    await page.waitForTimeout(700);
    const rail = await readRail();
    await page.mouse.move(rail[edge].screenX, rail[edge].screenY);
    await page.waitForTimeout(1000);
    assert.ok(
      (await readRail()).every((item) => item.minX >= -1.02 && item.maxX <= 1.02),
      'Edge hover remains on screen',
    );
  }
  for (const [path, heading] of [
    ['collections', 'Our collections.'],
    ['products', 'Every jersey. One spirit.'],
    ['contact', 'Let’s talk.'],
  ]) {
    await page.goto(`http://127.0.0.1:5173/${path}`);
    await page.getByRole('heading', { name: heading }).waitFor();
    await checkHeader();
    assert.equal(await page.getByRole('link', { name: 'GARUDA home' }).count(), 1);
    assert.equal(await page.locator('.ref-ticker').count(), 1);
    await page.screenshot({ timeout: 90000, path: `docs/screenshots/${path}-desktop.png` });
  }
  console.log('[rail] Shared brand, header, footer, and shopping-page screenshots verified');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['', 'products']) {
    await page.goto(`http://127.0.0.1:5173/${path}`);
    await page.locator('.store-header').waitFor();
    await page.waitForTimeout(800);
    await checkHeader();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'No mobile overflow',
    );
    await page.screenshot({ path: `docs/screenshots/${path || 'homepage'}-mobile.png` });
  }
  console.log('[header] Complete campaign block fits desktop and mobile headers');
  assert.deepEqual(renderErrors, [], 'Cloth shader compiles and renders without errors');
} finally {
  await browser.close();
}
