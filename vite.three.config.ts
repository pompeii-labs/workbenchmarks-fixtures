import { defineConfig } from 'vite';

// Separate classic-script bundle for the three.js scenes, loaded lazily.
export default defineConfig({
  publicDir: false,
  build: {
    target: 'es2020',
    emptyOutDir: false,
    outDir: 'dist/assets',
    lib: {
      entry: 'src/three/index.ts',
      name: 'SolarThree',
      formats: ['iife'],
      fileName: () => 'scenes3d.js',
    },
  },
});
