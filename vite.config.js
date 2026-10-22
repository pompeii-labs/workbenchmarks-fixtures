import { defineConfig } from 'vite'

// base './' makes the built site work from any folder or sub-path
// (drag dist/ onto any static host, or open it under a sub-directory).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096,
  },
})
