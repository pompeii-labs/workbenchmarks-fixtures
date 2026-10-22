import { defineConfig } from 'vite';

// Test hooks and diagnostics are compiled in only for dev and `--mode test`.
// The production build (`npm run build`) strips them entirely.
export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __TEST_HOOKS__: JSON.stringify(mode !== 'production'),
  },
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  preview: { host: '127.0.0.1', port: 4188, strictPort: true },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
}));
