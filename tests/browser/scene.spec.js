import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`renders without errors at ${viewport.width} x ${viewport.height}`, async ({ page }) => {
    const errors = [];
    const externalRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (!request.url().startsWith('http://localhost:4173')) externalRequests.push(request.url());
    });
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('#fallback')).toBeHidden();
    await page.waitForTimeout(500);
    expect(await page.locator('canvas').boundingBox()).toMatchObject({ x: 0, y: 0, ...viewport });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
    const screenshot = await page.locator('canvas').screenshot();
    expect(screenshot.byteLength).toBeGreaterThan(15_000);
  });
}

test('reduced motion is a genuinely still frame; drag and keyboard still orbit', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForTimeout(500);
  const canvas = page.locator('canvas');
  const still = await canvas.screenshot();
  await page.waitForTimeout(400);
  expect((await canvas.screenshot()).equals(still)).toBe(true);
  await page.mouse.move(600, 350);
  await page.mouse.down();
  await page.mouse.move(820, 420, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const orbit = await canvas.screenshot();
  expect(orbit.equals(still)).toBe(false);
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1200);
  expect((await canvas.screenshot()).equals(orbit)).toBe(false);
});

test('touch dragging orbits without scrolling the phone page', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForTimeout(300);
  const before = await page.locator('canvas').screenshot();
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 400 }] });
  for (let x = 160; x <= 280; x += 20) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 420 }] });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(1200);
  expect((await page.locator('canvas').screenshot()).equals(before)).toBe(false);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('animation runs and changing motion preference freezes the current act', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const canvas = page.locator('canvas');
  const first = await canvas.screenshot();
  await page.waitForTimeout(400);
  expect((await canvas.screenshot()).equals(first)).toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(200);
  const frozen = await canvas.screenshot();
  await page.waitForTimeout(400);
  expect((await canvas.screenshot()).equals(frozen)).toBe(true);
});

test('context loss stops scheduling frames even after interaction or tab wake', async ({ page }) => {
  await page.addInitScript(() => {
    window.frameRequests = 0;
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      window.frameRequests++;
      return request(callback);
    };
  });
  await page.goto('/');
  await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    window.contextExtension = gl.getExtension('WEBGL_lose_context');
    window.contextExtension.loseContext();
  });
  await expect(page.locator('#fallback')).toBeVisible();
  const requests = await page.evaluate(() => window.frameRequests);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.locator('canvas').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.frameRequests)).toBe(requests);
  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(() => window.contextExtension.restoreContext()),
  ]);
  await expect(page.locator('#fallback')).toBeHidden();
});
