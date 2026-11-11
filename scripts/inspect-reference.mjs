import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--enable-webgl',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (error) => console.log('[reference error]', error.message.slice(0, 180)));
await page.goto('https://garuda2026.offwg.com/rail', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(12000);
console.log((await page.locator('body').innerText()).slice(0, 5000));
console.log('Buttons:', await page.getByRole('button').allTextContents());
await page.screenshot({ path: 'docs/screenshots/reference-entry.png', fullPage: true });
const muted = page.getByText('Muted', { exact: true });
if (await muted.count()) {
  await page.waitForTimeout(5000);
  await page.locator('.pl-off').evaluate((button) => button.click());
  await page.waitForTimeout(20000);
}
console.log('Loader present:', await page.locator('#pl').count());
await page.screenshot({ path: 'docs/screenshots/reference-rail.png', fullPage: true });
console.log('Reference screenshots saved.');
await browser.close();
