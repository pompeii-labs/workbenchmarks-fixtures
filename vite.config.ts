import { defineConfig } from 'vite';

// base './' makes dist/ work from any folder on a static host.
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  preview: { host: '127.0.0.1', port: 4188, strictPort: true },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
});
