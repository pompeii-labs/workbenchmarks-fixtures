import { defineConfig } from 'vite';

// `base: './'` makes dist/ portable: upload it to any folder of a static host.
export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __TEST_HOOKS__: JSON.stringify(mode === 'test'),
  },
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  preview: { host: '127.0.0.1', port: 4188, strictPort: true },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
}));
