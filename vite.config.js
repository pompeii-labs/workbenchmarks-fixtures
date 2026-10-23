import { defineConfig } from 'vite';

// `base: './'` makes every asset URL relative, so the built `dist/` folder
// works from any path on any static host (site root or a sub-folder).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1000,
  },
});
