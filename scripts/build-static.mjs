import { build } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const assetsDir = path.join(distDir, 'assets');

async function run() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(assetsDir, { recursive: true });

  // 1. Build lightweight main bundle + CSS (IIFE, no module CORS issues on file://)
  await build({
    root,
    configFile: false,
    base: './',
    define: {
      __SOLAR_STATIC_BUILD__: 'true',
    },
    build: {
      outDir: distDir,
      emptyOutDir: false,
      cssCodeSplit: false,
      minify: 'esbuild',
      lib: {
        entry: path.join(root, 'src/main.ts'),
        name: 'SolarStoryApp',
        formats: ['iife'],
        fileName: () => 'assets/main.js',
      },
      rollupOptions: {
        external: [],
        output: {
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && assetInfo.name.endsWith('.css')) {
              return 'assets/style.css';
            }
            return 'assets/[name]-[hash][extname]';
          },
        },
      },
    },
  });

  // 2. Build deferred 3D WebGL bundle (Three.js + 3D interactive scenes)
  // Loaded asynchronously after first paint so initial load stays tiny (<100 KB)
  // and works via file:// with zero server as well as over HTTP.
  await build({
    root,
    configFile: false,
    base: './',
    build: {
      outDir: distDir,
      emptyOutDir: false,
      minify: 'esbuild',
      lib: {
        entry: path.join(root, 'src/three/standaloneEntry.ts'),
        name: 'SolarStoryThree',
        formats: ['iife'],
        fileName: () => 'assets/three-scenes.js',
      },
    },
  });

  // 3. Transform index.html for standalone static / file:// & HTTP execution
  let html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  html = html.replace(
    /<script\s+type="module"\s+src="\/src\/main\.ts"><\/script>/,
    '<link rel="stylesheet" href="./assets/style.css" />\n    <script defer src="./assets/main.js"></script>'
  );
  await fs.writeFile(path.join(distDir, 'index.html'), html, 'utf8');

  // Report output sizes
  const files = [
    'index.html',
    'assets/style.css',
    'assets/main.js',
    'assets/three-scenes.js',
  ];
  console.log('\nStatic build complete (works on file:// and http://):');
  for (const rel of files) {
    const full = path.join(distDir, rel);
    try {
      const stat = await fs.stat(full);
      console.log(`  dist/${rel.padEnd(24)} ${(stat.size / 1024).toFixed(1)} KB`);
    } catch {
      // ignore if optional
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
