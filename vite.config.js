import { defineConfig } from 'vite';

// `base: './'` makes every asset path relative, so the built `dist/` folder
// works from any URL: a domain root, a subfolder like /games/pinball/, or an iframe.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
});
