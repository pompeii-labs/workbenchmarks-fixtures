import { defineConfig } from 'vite';

// base './' makes every asset path relative, so dist/ works from any folder on any host.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
});
