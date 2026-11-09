// Dev tool: one frame from several camera azimuths. usage: node scripts/views.mjs <url> <out.png-prefix> <t> az1,az2,... [el] [size]
import { chromium } from '@playwright/test';
const [url, out, t, azs, el = 0.15, size = 700] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: +size, height: +size } });
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
await page.goto(url);
await page.waitForFunction(() => window.__THREE_GAME_TEST_HOOKS__ && document.body.classList.contains('ready'));
await page.waitForTimeout(600);
await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true));
let i = 0;
for (const az of azs.split(',')) {
  await page.evaluate(([t, a, e]) => { const H = window.__THREE_GAME_TEST_HOOKS__; H.setCamera(a, e); H.setTime(t); }, [+t, +az, +el]);
  await page.screenshot({ path: `${out}${i++}.png` });
}
await browser.close();
