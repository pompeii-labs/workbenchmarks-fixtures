export const name = 'mobile';
export const mobile = true;
export default async function ({ page, check, state, until }) {
    await until(() => !!window.__THREE_GAME_DIAGNOSTICS__, 20000);
    await page.tap('#play-button');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.phase === 'playing', 10000);
    const box = await page.locator('#touch-stick').boundingBox();
    check('touch pad is visible on a touch device', !!box && box.width > 80, JSON.stringify(box));
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const y0 = await state((d) => d.player.position.y);
    await touch('touchStart', cx, cy);
    await touch('touchMove', cx, cy + 55);
    await until((y) => window.__THREE_GAME_DIAGNOSTICS__.player.position.y < y - 2, 15000, y0);
    check('dragging the pad down dives', true);
    await touch('touchMove', cx, cy - 55);
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.airborne === true, 20000);
    await touch('touchEnd', 0, 0);
    check('dragging up launches a leap', true);
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.airborne === false, 20000);
    const s = await state((d) => d.score);
    check('mobile leap scores', s > 0, String(s));
}
