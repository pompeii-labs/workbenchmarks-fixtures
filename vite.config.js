import { defineConfig } from 'vite';

// base: './' makes the build work from any folder on any static host.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1000 },
});
