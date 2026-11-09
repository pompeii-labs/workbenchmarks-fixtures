// A finger drag on a phone-sized viewport orbits the camera.
export const name = 'orbit-touch';
export const mobile = true;

export default async function ({ page, check, state, until }) {
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.frame > 5, 20000);
    const a0 = await state((d) => d.camera.az);
    const cdp = await page.context().newCDPSession(page);
    const pt = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(300, 420) });
    for (let i = 1; i <= 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(300 - i * 18, 420) });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const a1 = await state((d) => d.camera.az);
    check('finger drag orbits the camera (azimuth increases by > 0.5 rad)', a1 - a0 > 0.5, `${a0} -> ${a1}`);
    const canvas = await state(() => ({ w: document.querySelector('#scene').clientWidth, h: document.querySelector('#scene').clientHeight }));
    check('canvas fills the phone viewport', canvas.w === 390 && canvas.h === 844, JSON.stringify(canvas));
}
