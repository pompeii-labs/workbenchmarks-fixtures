// Real-input check of the 3D scene integration against a served build.
// BASE_URL=http://127.0.0.1:4188 node scripts/verify-scenes.mjs
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const checks = [];
const errors = [];
  // Real wheel input drives the story: each chapter renderer starts as it is reached,
// progress follows scroll down and back up, and a live reduced motion switch restores every still.
// Full Chromium (not the headless shell) for the WebGL/WebGPU pages.
const storyBrowser = await chromium.launch({ channel: 'chromium' });
const story = await storyBrowser.newPage({ viewport: { width: 1440, height: 900 } });
story.on('pageerror', (error) => errors.push(error.message));
story.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await story.goto(baseURL, { waitUntil: 'load' });
await story.waitForSelector('#scene-hero-extraction.has-scene-renderer', { timeout: 60000 });
const progressOf = (id) => story.locator(id).evaluate((el) => Number(el.dataset.progress));
for (const id of ['#scene-espresso', '#scene-milk', '#scene-latte']) {
  for (let i = 0; i < 40 && (await progressOf(id)) < 0.5; i += 1) {
    await story.mouse.wheel(0, 240);
    await story.waitForTimeout(60);
  }
  await story.waitForSelector(`${id}.has-scene-renderer`, { timeout: 60000 });
  checks.push(`${id} renderer started by scrolling (progress ${await progressOf(id)})`);
}
const latteDown = await progressOf('#scene-latte');
for (let i = 0; i < 40 && (await progressOf('#scene-latte')) > 0.1; i += 1) {
  await story.mouse.wheel(0, -240);
  await story.waitForTimeout(60);
}
const latteUp = await progressOf('#scene-latte');
assert.ok(latteDown >= 0.5 && latteUp <= 0.1, `latte progress should reverse (${latteDown} -> ${latteUp})`);
assert.equal(await story.locator('[data-scene] > canvas').count(), 4);
await story.emulateMedia({ reducedMotion: 'reduce' });
await story.waitForFunction(() => document.querySelectorAll('[data-scene] > canvas').length === 0, null, { timeout: 5000 });
assert.equal(await story.locator('.has-scene-renderer').count(), 0);
checks.push('wheel scrolling starts each chapter renderer, progress reverses, live reduced motion restores stills');

assert.deepEqual(errors, [], 'no page errors');
await storyBrowser.close();
console.log(JSON.stringify({ ok: true, baseURL, checks }, null, 2));
