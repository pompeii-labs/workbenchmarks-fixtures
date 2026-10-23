import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // Relative asset URLs: dist/ works from any folder on any static host.
  base: './',
  define: {
    __TEST_HOOKS__: JSON.stringify(mode === 'test'),
  },
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
}));
