// Smoke test against the production build: console errors, bytes before first paint,
// chapter screenshots on desktop + phone, and the reduced-motion fallback.
// Usage: npm run build && npm run check   -> screenshots in /tmp/lapillo-check
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/ms-playwright';
  const dir = existsSync(base) && readdirSync(base).find((d) => d.startsWith('chromium-'));
  return dir ? join(base, dir, 'chrome-linux64', 'chrome') : undefined;
}

const out = '/tmp/lapillo-check';
mkdirSync(out, { recursive: true });
const server = await preview({ preview: { port: 4181, strictPort: true } });
const url = 'http://localhost:4181/';
const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let failures = 0;
const fail = (msg) => { failures++; console.log('FAIL', msg); };

async function run(name, ctxOpts, { reduced = false } = {}) {
  const ctx = await browser.newContext({ ...ctxOpts, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const bytes = { beforeLoad: 0, total: 0, three: false };
  let loaded = false;
  page.on('response', async (r) => {
    try {
      const b = (await r.body()).length;
      bytes.total += b;
      if (!loaded) bytes.beforeLoad += b;
      if (r.url().includes('scene-')) bytes.three = true;
    } catch {}
  });
  await page.goto(url, { waitUntil: 'load' });
  loaded = true;
  const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1);
  if (!reduced) {
    await page.waitForFunction(() => document.documentElement.classList.contains('is-live'), null, { timeout: 60000 })
      .catch(() => fail(`${name}: live scene never started`));
  } else {
    await page.waitForTimeout(800);
  }
  const live = await page.evaluate(() => document.documentElement.classList.contains('is-live'));
  if (reduced && live) fail(`${name}: WebGL started under reduced motion`);
  const tops = await page.evaluate(() => [...document.querySelectorAll('.chapter')].map((c) => c.getBoundingClientRect().top + scrollY));
  for (let i = 0; i < tops.length; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), tops[i] + (i === 0 ? 0 : 200));
    await page.waitForTimeout(reduced ? 300 : 2500);
    await page.screenshot({ path: join(out, `${name}-ch${i}.png`) });
  }
  for (const id of ['perche', 'menu', 'dove']) {
    await page.evaluate((id) => document.getElementById(id).scrollIntoView({ behavior: 'instant' }), id);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `${name}-${id}.png`) });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) fail(`${name}: horizontal overflow ${overflow}px`);
  if (errors.length) fail(`${name}: console errors: ${errors.join(' | ')}`);
  console.log(`${name}: FCP ${fcp.toFixed(0)} ms, ${(bytes.beforeLoad / 1024).toFixed(0)} KB before load, ${(bytes.total / 1024).toFixed(0)} KB total, three loaded: ${bytes.three}, live: ${live}`);
  await ctx.close();
}

try {
  await run('desktop', { viewport: { width: 1440, height: 900 } });
  await run('phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await run('reduced', { viewport: { width: 1440, height: 900 } }, { reduced: true });
  await run('reduced-phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true }, { reduced: true });
} finally {
  await browser.close();
  server.httpServer.close();
}
console.log(failures ? `${failures} problem(s)` : 'all checks passed');
process.exit(failures ? 1 : 0);
