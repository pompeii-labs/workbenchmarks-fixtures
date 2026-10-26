import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    // The lazily imported 3D runtime (three/webgpu) is one ~220 kB gzip chunk, fetched after first paint.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        privacy: resolve(import.meta.dirname, 'privacy.html'),
        terms: resolve(import.meta.dirname, 'terms.html'),
        notFound: resolve(import.meta.dirname, '404.html'),
      },
    },
  },
});
