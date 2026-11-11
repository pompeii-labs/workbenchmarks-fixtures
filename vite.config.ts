import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: {
    __SOLAR_STATIC_BUILD__: 'false',
  },
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
