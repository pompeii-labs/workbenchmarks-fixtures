import { defineConfig } from 'vite';

// base: './' makes every asset URL relative, so dist/ works from any folder on any static host.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
  },
});
