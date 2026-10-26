// Touch works like the mouse: a finger swipe across the cup on a phone.
import { nextFrame, resetCalm, toScreen } from './_cup.mjs';

export const name = 'touch';
export const mobile = true;

export default async function ({ page, check, hooks, metric }) {
    await resetCalm(page, hooks);
    const cdp = await page.context().newCDPSession(page);
    const pts = [];
    for (let i = 0; i <= 5; i++) pts.push(await toScreen(hooks, -0.6 + 1.2 * (i / 5), 0.05));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0].x, y: pts[0].y }] });
    await nextFrame(page);
    let peak = 0;
    for (const p of pts.slice(1)) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] });
        await nextFrame(page);
        peak = Math.max(peak, await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.maxHeight));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const d = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    peak = Math.max(peak, d.maxHeight);
    metric('touchPeakHeight', peak);
    check('the input arrived as touch', d.pointerKind === 'touch', d.pointerKind);
    check('a finger swipe makes waves', peak > 0.005, `peak ${peak}`);
    check('crema follows the finger', d.maxCrema > 0.05, `crema ${d.maxCrema}`);
    await nextFrame(page);
    const after = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.cursorSpeed);
    check('lifting the finger releases the liquid', after === 0, `cursor speed ${after}`);
}
