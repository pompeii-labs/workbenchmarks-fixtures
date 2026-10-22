// Mobile: tap to start, touch halves drive the flippers, LAUNCH button fires.
export const name = 'touch';
export const mobile = true;

export default async function ({ page, check, state, until }) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y, id = 1) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id }] });
  await until(() => window.__THREE_GAME_DIAGNOSTICS__?.mode === 'title', 10000);
  await touch('touchStart', 195, 600);
  await touch('touchEnd');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'play', 5000);
  check('tap starts the game', true);

  await until(() => window.__THREE_GAME_DIAGNOSTICS__.hud.launchButtonVisible, 5000);
  check('LAUNCH button shows while the ball is on the plunger', true);

  await touch('touchStart', 80, 800);
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.flipperAngle[0] > 0.5, 5000);
  const a = await state((d) => d.flipperAngle);
  check('left-half touch raises only the left flipper', a[1] < -0.3, JSON.stringify(a));
  await touch('touchEnd');
  await touch('touchStart', 250, 800);
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.flipperAngle[1] > 0.5, 5000);
  const b = await state((d) => d.flipperAngle);
  check('right-half touch raises only the right flipper', b[0] < -0.3, JSON.stringify(b));
  await touch('touchEnd');

  const box = await page.locator('#launch-btn').boundingBox();
  await touch('touchStart', box.x + box.width / 2, box.y + box.height / 2);
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.plungerCharge > 0.9, 8000);
  await touch('touchEnd');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.ballPos.y > 10, 8000);
  const f = await state((d) => ({ y: d.ballPos.y, btn: d.hud.launchButtonVisible }));
  check('holding and releasing LAUNCH fires the ball', f.y > 10 && !f.btn, JSON.stringify(f));
}
