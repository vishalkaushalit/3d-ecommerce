import { cp, mkdir, rm } from 'node:fs/promises';

// Keep source apps separate; combine compiled output for single-origin or multi-origin hosting.
await rm('dist', { recursive: true, force: true });
await mkdir('dist/admin', { recursive: true });
await cp('frontend/dist', 'dist', { recursive: true });
await cp('web-panel/dist', 'dist/admin', { recursive: true });
await cp('web-panel/dist/assets', 'dist/assets', { recursive: true });
console.log('[build] Output ready: / storefront, / web panel on root, /admin compatibility');
