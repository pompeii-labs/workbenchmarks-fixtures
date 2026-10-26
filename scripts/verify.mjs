import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const checks = [];
const errors = [];

function observe(page, label) {
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
  page.on('requestfailed', (request) => errors.push(`${label}: ${request.url()} failed`));
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  observe(desktop, 'desktop');
  await desktop.goto(baseURL, { waitUntil: 'networkidle' });
  assert.match(await desktop.title(), /Caffè Scavo/);
  assert.equal(await desktop.locator('h1').count(), 1);
  assert.equal(await desktop.locator('[data-scene]').count(), 4);
  // The hero renderer loads after first paint and replaces the still only after a complete frame.
  await desktop.waitForSelector('#scene-hero-extraction.has-scene-renderer', { timeout: 60000 });
  assert.equal(await desktop.locator('#scene-hero-extraction > canvas[aria-hidden="true"]').count(), 1);
  assert.equal(await desktop.locator('#scene-latte > canvas').count(), 0, 'Below the fold scenes must not start on the initial request');

  const missingAnchors = await desktop.locator('a[href^="#"]').evaluateAll((links) =>
    links.filter((link) => !document.getElementById(link.getAttribute('href').slice(1))).map((link) => link.getAttribute('href')),
  );
  assert.deepEqual(missingAnchors, [], 'Every fragment link needs a target');
  const directionLinks = await desktop.getByRole('link', { name: 'Get directions' }).evaluateAll((links) =>
    links.map((link) => ({ href: link.href, target: link.target, rel: link.rel })),
  );
  assert.equal(directionLinks.length, 2);
  assert.ok(directionLinks.every((link) => link.href === directionLinks[0].href));
  assert.ok(directionLinks.every((link) => link.target === '_blank' && link.rel.includes('noopener')));
  checks.push('desktop content, four scene mounts, fragment links, and matching directions actions');

  const secondQuestion = desktop.locator('.faq-list details').nth(1);
  await secondQuestion.locator('summary').click();
  assert.notEqual(await secondQuestion.getAttribute('open'), null);
  assert.ok(await secondQuestion.locator('.faq-answer').isVisible());
  checks.push('FAQ disclosure opens and exposes its answer');

  const milkStep = desktop.locator('[data-craft-step="1"]');
  await milkStep.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await desktop.waitForTimeout(160);
  const milkProgress = Number(await desktop.locator('#scene-milk').getAttribute('data-progress'));
  assert.ok(milkProgress > 0 && milkProgress < 1, `Expected local milk progress, received ${milkProgress}`);
  assert.equal(await desktop.locator('#scene-milk').getAttribute('data-scene-state'), 'active');
  const requestedScene = await desktop.evaluate(() => new Promise((resolve) => {
    document.addEventListener('scavo:scene', (event) => {
      if (event.detail.source === 'request') resolve(event.detail);
    }, { once: true });
    document.dispatchEvent(new CustomEvent('scavo:scene-ready', { detail: { scene: 'milk' } }));
  }));
  assert.equal(requestedScene.scene, 'milk');
  assert.equal(requestedScene.source, 'request');
  assert.equal(requestedScene.reducedMotion, false);
  checks.push('scroll driven scene progress and renderer ready handshake');

  for (const path of ['/privacy.html', '/terms.html', '/404.html']) {
    const response = await desktop.context().request.get(`${baseURL}${path}`);
    assert.equal(response.status(), 200, `${path} should be present in the static build`);
  }
  await desktop.goto(`${baseURL}/privacy.html`, { waitUntil: 'networkidle' });
  assert.match(await desktop.locator('h1').textContent(), /Privacy/);
  await desktop.goto(`${baseURL}/terms.html`, { waitUntil: 'networkidle' });
  assert.match(await desktop.locator('h1').textContent(), /Clear terms/);
  await desktop.goto(`${baseURL}/404.html`, { waitUntil: 'networkidle' });
  assert.match(await desktop.locator('h1').textContent(), /off the map/);
  checks.push('privacy, terms, and branded 404 pages');

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  observe(phone, 'phone');
  await phone.goto(baseURL, { waitUntil: 'networkidle' });
  const toggle = phone.locator('[data-menu-toggle]');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(await phone.locator('[data-mobile-menu]').getAttribute('aria-hidden'), 'false');
  await phone.keyboard.press('Escape');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  assert.ok(await toggle.evaluate((element) => document.activeElement === element), 'Escape should restore toggle focus');
  await phone.waitForTimeout(520);
  await toggle.click();
  await phone.locator('[data-mobile-menu] a[href="#menu"]').click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(new URL(phone.url()).hash, '#menu');
  checks.push('phone menu opens, closes with Escape, restores focus, and follows navigation');

  await phone.setViewportSize({ width: 320, height: 740 });
  await phone.goto(baseURL, { waitUntil: 'networkidle' });
  const narrowOverflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(narrowOverflow <= 0, `320px layout has ${narrowOverflow}px horizontal overflow`);
  checks.push('320px layout has no horizontal overflow');

  const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  observe(reduced, 'reduced motion');
  await reduced.goto(baseURL, { waitUntil: 'networkidle' });
  const sceneStates = await reduced.locator('[data-scene]').evaluateAll((mounts) => mounts.map((mount) => mount.dataset.sceneState));
  assert.ok(sceneStates.every((state) => state === 'static'));
  const wordOpacities = await reduced.locator('.tagline-word').evaluateAll((words) => words.map((word) => getComputedStyle(word).opacity));
  assert.ok(wordOpacities.every((opacity) => opacity === '1'));
  assert.equal(await reduced.locator('.craft-step-scene').first().evaluate((element) => getComputedStyle(element).position), 'relative');
  await reduced.waitForTimeout(2500);
  assert.equal(await reduced.locator('canvas').count(), 0, 'Reduced motion must not start any renderer');
  const engineRequested = await reduced.evaluate(() => performance.getEntriesByType('resource').some((entry) => /engine-.*\.js/.test(entry.name)));
  assert.equal(engineRequested, false, 'Reduced motion must not download the 3D runtime');
  checks.push('reduced motion keeps complete stills, static mounts, and unstuck chapters');

  assert.deepEqual(errors, [], 'Browser console and requests should stay clean');
  checks.push('no browser errors or failed requests');
  console.log(JSON.stringify({ ok: true, baseURL, checks }, null, 2));
} finally {
  await browser.close();
}
