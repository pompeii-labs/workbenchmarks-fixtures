import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    // three.js is one lazy chunk (~147 kB gzip) loaded after first paint
    chunkSizeWarningLimit: 700,
  },
});
