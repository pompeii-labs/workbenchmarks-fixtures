// Renders the still frames used before WebGL loads and for prefers-reduced-motion.
// Usage: npm run build && npm run posters   (needs Chromium; set CHROMIUM_PATH if not at /ms-playwright)
// Optional: node scripts/posters.mjs --debug  -> PNGs of extra frames into /tmp/lapillo-shots
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const debug = process.argv.includes('--debug');
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/ms-playwright';
  const dir = existsSync(base) && readdirSync(base).find((d) => d.startsWith('chromium-'));
  return dir ? join(base, dir, 'chrome-linux64', 'chrome') : undefined;
}

const FRAMES = debug
  ? [0, 0.5, 0.9, 1.2, 1.5, 1.8, 2.2, 2.6, 2.95, 3.2, 3.4, 3.6, 3.75, 3.88, 3.95, 4.2, 4.6].map((t) => ({ name: `t${t}`, t }))
  : [
      { name: 'hero', t: 0.35 },
      { name: 'crema', t: 1.6 },
      { name: 'vapore', t: 2.45 },
      { name: 'disegno', t: 3.9 },
      { name: 'servito', t: 4.6 },
    ];
const SIZES = debug
  ? [{ tag: 'landscape', w: 1440, h: 900 }, ...(process.argv.includes('--phone') ? [{ tag: 'portrait', w: 390, h: 844 }] : [])]
  : [
      { tag: 'landscape', w: 1600, h: 1000 },
      { tag: 'portrait', w: 800, h: 1500 },
    ];

const server = await preview({ preview: { port: 4179, strictPort: true } });
const url = 'http://localhost:4179/';
const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const outDir = debug ? '/tmp/lapillo-shots' : 'public/posters';
mkdirSync(outDir, { recursive: true });
try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
    page.on('console', (m) => m.type() === 'error' && console.log('[page]', m.text()));
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    for (const f of FRAMES) {
      await page.goto(`${url}?poster&t=${f.t}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 });
      await page.waitForTimeout(300);
      const png = join('/tmp', `poster-${f.name}-${size.tag}.png`);
      await page.screenshot({ path: debug ? join(outDir, `${f.name}-${size.tag}.png`) : png });
      if (!debug) {
        const out = join(outDir, `${f.name}-${size.tag}.webp`);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-c:v', 'libwebp', '-quality', '78', out]);
        console.log('wrote', out);
      } else console.log('shot', f.name, size.tag);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.httpServer.close();
}
