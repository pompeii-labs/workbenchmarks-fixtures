// Dev tool: render one scene at several progress values into a contact strip.
// node scripts/scene-sequence.mjs <scene> <outPng> p1 p2 ...   (test build at BASE_URL)
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';

const [scene, out, ...ps] = process.argv.slice(2);
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:4188';
const size = 320;
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(baseURL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__THREE_GAME_TEST_HOOKS__, null, { timeout: 30000 });
const strip = new PNG({ width: size * ps.length, height: size });
for (const [i, p] of ps.entries()) {
  const frame = await page.evaluate(async ({ scene, p, size }) => {
    const h = window.__THREE_GAME_TEST_HOOKS__;
    await h.snapScene(scene, Number(p), 4 + Number(p) * 6);
    await h.setPausedForScreenshot(true);
    return h.readFrame(size, size);
  }, { scene, p, size });
  const src = Buffer.from(frame.rgba, 'base64');
  const enc = (v) => Math.round(255 * (v / 255 <= 0.0031308 ? 12.92 * (v / 255) : 1.055 * Math.pow(v / 255, 1 / 2.4) - 0.055));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const s = (y * size + x) * 4, d = (y * strip.width + i * size + x) * 4;
    strip.data[d] = enc(src[s]); strip.data[d + 1] = enc(src[s + 1]); strip.data[d + 2] = enc(src[s + 2]); strip.data[d + 3] = 255;
  }
}
writeFileSync(out, PNG.sync.write(strip));
await browser.close();
console.log('wrote', out);
