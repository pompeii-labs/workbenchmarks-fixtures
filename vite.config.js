import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // the built site works from any path, or straight from a static host
  build: { target: 'es2020', chunkSizeWarningLimit: 700 },
});
