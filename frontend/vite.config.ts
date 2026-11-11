import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'VITE_');
  const assetBase = environment.VITE_ASSET_BASE_URL?.trim().replace(/\/$/, '');
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'blob-font-assets',
        enforce: 'pre',
        transform(code, id) {
          if (!assetBase || !id.split('?')[0].endsWith('/src/reference.css')) return;
          // CSS fonts use the same Blob folder as the models, textures, and room artwork.
          return code.replace(
            /url\('\/assets\/([^']+)'\)/g,
            (_match, file) => `url(${JSON.stringify(`${assetBase}/${file}`)})`,
          );
        },
      },
    ],
    server: { proxy: { '/api': 'http://127.0.0.1:4000' } },
    build: { chunkSizeWarningLimit: 1200 },
  };
});
