export const name = 'mobile';
export const mobile = true;

async function touch(cdp, type, x, y, id = 1) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id }] });
}

export default async function ({ page, check, state, until, hooks }) {
  const cdp = await page.context().newCDPSession(page);
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'title', 10000);
  await page.touchscreen.tap(195, 420);
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'plunger', 10000);
  check('tapping the title starts a game', true);
  const launchVisible = await page.evaluate(() => getComputedStyle(document.querySelector('#launch')).display !== 'none');
  check('the LAUNCH pad is shown while the ball is on the plunger', launchVisible);

  const box = await page.locator('#launch').boundingBox();
  const lx = box.x + box.width / 2;
  const ly = box.y + box.height / 2;
  await touch(cdp, 'touchStart', lx, ly);
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.plunger.charge > 0.95, 20000);
  await touch(cdp, 'touchEnd');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'play', 15000);
  check('hold and release on LAUNCH fires the ball', true);

  await touch(cdp, 'touchStart', 60, 700);
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.flippers[0].angle > 0.4, 5000);
  const l = await state((d) => d.flippers.map((f) => f.held));
  check('holding the left half raises the left flipper only', l[0] && !l[1], JSON.stringify(l));
  await touch(cdp, 'touchEnd');
  await touch(cdp, 'touchStart', 330, 600);
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.flippers[1].angle > 0.4, 5000);
  const r = await state((d) => d.flippers.map((f) => f.held));
  check('holding the right half raises the right flipper only', r[1] && !r[0], JSON.stringify(r));
  await touch(cdp, 'touchEnd');
  await until(() => !window.__THREE_GAME_DIAGNOSTICS__.flippers[1].held, 5000);
  check('lifting the finger drops the flipper', true);
}
