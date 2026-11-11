import { put } from '@vercel/blob';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
if (!token) {
  console.error(
    'Add BLOB_READ_WRITE_TOKEN from your Vercel Blob store to backend/.env, then run npm run upload:assets.',
  );
  process.exit(1);
}
const directory = resolve('frontend/public/assets');
async function listAssets(folder, prefix = '') {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory())
      result.push(...(await listAssets(resolve(folder, entry.name), `${path}/`)));
    else if (/\.(glb|webp|jpg|hdr|svg|woff2)$/.test(entry.name)) result.push(path);
  }
  return result;
}
const files = (await listAssets(directory)).sort();
const contentTypes = {
  glb: 'model/gltf-binary',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  hdr: 'application/octet-stream',
  svg: 'image/svg+xml',
  woff2: 'font/woff2',
};
// Content-addressed folders avoid replacing existing published assets.
const hash = createHash('sha256');
for (const file of files) hash.update(file).update(await readFile(resolve(directory, file)));
const folder = `garuda/${hash.digest('hex').slice(0, 12)}`;
let baseUrl = '';
for (const file of files) {
  const blob = await put(`${folder}/${file}`, await readFile(resolve(directory, file)), {
    token,
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: contentTypes[file.split('.').pop()],
  });
  baseUrl = blob.url.slice(0, blob.url.indexOf(`/${folder}/`)) + `/${folder}`;
  console.log('[upload]', file);
}
const environmentPath = resolve('frontend/.env');
let environment = await readFile(environmentPath, 'utf8').catch(() => '');
environment = environment
  .split('\n')
  .filter((line) => !/^\s*(?:export\s+)?VITE_ASSET_BASE_URL\s*=/.test(line))
  .join('\n')
  .trimEnd();
await writeFile(environmentPath, `${environment}\nVITE_ASSET_BASE_URL=${baseUrl}\n`);
console.log('\nAssets uploaded. Add this PUBLIC build variable in Vercel, then redeploy:');
console.log(`VITE_ASSET_BASE_URL=${baseUrl}`);
console.log('frontend/.env was updated. Restart the local frontend to load the Blob URLs.');
