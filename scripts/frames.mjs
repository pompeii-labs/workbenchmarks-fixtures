// Dev tool: capture a strip of frames at chosen act times from a served test build.
// usage: node scripts/frames.mjs <url> <outdir> <az> <el> <t0> <dt> <n> [w h]
import { chromium } from '@playwright/test';
const [url, out, az, el, t0, dt, n, w = 640, h = 480] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
await page.goto(url);
await page.waitForFunction(() => window.__THREE_GAME_TEST_HOOKS__);
await page.waitForFunction(() => document.body.classList.contains('ready'));
await page.waitForTimeout(700);
await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true));
for (let i = 0; i < +n; i++) {
  await page.evaluate(([t, a, e]) => { const H = window.__THREE_GAME_TEST_HOOKS__; H.setCamera(a, e); H.setTime(t); }, [+t0 + i * +dt, +az, +el]);
  await page.screenshot({ path: `${out}/f${String(i).padStart(3, '0')}.png` });
}
await browser.close();
