export const name = 'mobile';
export const mobile = true;

export default async function ({ page, check, state, until, hooks }) {
    // Real-time sim so per-frame key timing is precise enough to stop at one flip.
    await hooks((h) => h.setTimeScale(1));
    await page.tap('#start-btn');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.phase === 'play', 10000);
    const pad = await page.locator('#pad').boundingBox();
    const cx = pad.x + pad.width / 2;
    const cy = pad.y + pad.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await touch('touchStart', cx, cy);
    await touch('touchMove', cx, cy + 60); // drag down = dive
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.dolphin.y < -2.6, 20000);
    const roll = await page.locator('#roll-btn').boundingBox();
    const rx = roll.x + roll.width / 2;
    const ry = roll.y + roll.height / 2;
    await touch('touchMove', cx, cy - 60); // drag up = rise
    // Second finger holds Roll while the first keeps rising.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy - 60, id: 1 }, { x: rx, y: ry, id: 2 }] });
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.dolphin.airborne, 20000);
    check('touch pad dive + rise launches the dolphin', true);
    await until(() => Math.abs(window.__THREE_GAME_DIAGNOSTICS__.dolphin.roll) > 1 || !window.__THREE_GAME_DIAGNOSTICS__.dolphin.airborne, 20000);
    const r = await state((d) => d.dolphin.roll);
    await touch('touchEnd', 0, 0);
    check('holding the Roll button rolls the dolphin in the air', Math.abs(r) > 1, String(r));
}
