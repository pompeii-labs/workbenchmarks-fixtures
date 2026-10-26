// Dev tool: screenshot scene mounts in named states from a test build.
// node scripts/scene-shots.mjs <outDir> <width>x<height> state1 state2 ...
// Needs a test build (npm run build:test) served at BASE_URL.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir = 'artifacts/shots', size = '1440x900', ...states] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:4188';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(baseURL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__THREE_GAME_TEST_HOOKS__, null, { timeout: 30000 });
for (const state of states) {
  const t0 = Date.now();
  const scene = await page.evaluate(async (s) => {
    const h = window.__THREE_GAME_TEST_HOOKS__;
    await h.setState(s);
    await h.setPausedForScreenshot(true);
    return window.__THREE_GAME_DIAGNOSTICS__;
  }, state);
  await page.waitForTimeout(300);
  const name = scene.scene;
  await page.locator(`[data-scene="${name}"]`).screenshot({ path: `${outDir}/${state}-${width}.png` });
  console.log(state, `${Date.now() - t0}ms`, JSON.stringify(scene.renderer));
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false));
}
await browser.close();
