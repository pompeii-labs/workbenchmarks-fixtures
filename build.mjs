// Builds the static site into dist/. `node build.mjs --serve` rebuilds on change
// and serves dist/ locally.
//
// The output is deliberately plain: one HTML file, one stylesheet, and classic
// (non-module) scripts with relative URLs, so dist/index.html also works when it
// is opened straight from disk (file://), where ES modules are blocked.
import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const serve = process.argv.includes('--serve');
const outdir = 'dist';

const common = {
  bundle: true,
  minify: !serve,
  sourcemap: serve,
  target: ['es2020'],
  logLevel: 'info',
  legalComments: 'none',
};

const configs = [
  // Page script: text, charts and 2D simulations. Small; loaded with `defer`.
  { ...common, entryPoints: { main: 'src/main.ts' }, outdir: `${outdir}/assets`, format: 'iife' },
  // The 3D scenes (three.js). Loaded on demand when a 3D figure nears the viewport.
  {
    ...common,
    entryPoints: { scene3d: 'src/three/index.ts' },
    outdir: `${outdir}/assets`,
    format: 'iife',
    globalName: '__solar3d',
  },
  {
    ...common,
    entryPoints: { styles: 'src/styles.css' },
    outdir: `${outdir}/assets`,
    loader: { '.woff2': 'file' },
    assetNames: '[name]',
  },
];

await rm(outdir, { recursive: true, force: true });
await mkdir(`${outdir}/assets`, { recursive: true });
await cp('index.html', `${outdir}/index.html`);
await cp('public', outdir, { recursive: true }).catch(() => {});

if (serve) {
  const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
  await Promise.all(contexts.map((c) => c.watch()));
  const { watch } = await import('node:fs');
  watch('index.html', () => cp('index.html', `${outdir}/index.html`));
  const { hosts, port } = await contexts[0].serve({ servedir: outdir, port: 5173 });
  console.log(`\n  Serving http://${hosts[0] === '0.0.0.0' ? 'localhost' : hosts[0]}:${port}\n`);
} else {
  await Promise.all(configs.map((c) => esbuild.build(c)));
}
