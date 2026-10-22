// Phone: tap to start, tap halves to flip, hold the LAUNCH button to plunge.
export const name = 'mobile';
export const mobile = true;

export default async function ({ page, check, state, until }) {
    const vp = page.viewportSize();
    await page.touchscreen.tap(vp.width / 2, vp.height / 2);
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'play', 10000);
    check('a tap starts the game', true);

    const btn = await state(() => {
        const el = document.querySelector('#plunger-button');
        const r = el.getBoundingClientRect();
        return { visible: getComputedStyle(el).display !== 'none', x: r.x + r.width / 2, y: r.y + r.height / 2, bottom: r.bottom, h: innerHeight, touch: document.body.classList.contains('touch') };
    });
    check('the LAUNCH button shows while the ball waits in the lane', btn.visible && btn.touch && btn.bottom <= btn.h, JSON.stringify(btn));

    for (const [x, i, label] of [[vp.width * 0.2, 0, 'left'], [vp.width * 0.8, 1, 'right']]) {
        await page.mouse.move(x, vp.height * 0.7);
        await page.mouse.down();
        await until((idx) => window.__THREE_GAME_DIAGNOSTICS__.flippers[idx].angle > 0.4, 5000, i);
        const f = await state((d) => d.flippers.map((fl) => fl.pressed));
        await page.mouse.up();
        check(`holding the ${label} half raises only the ${label} flipper`, f[i] && !f[1 - i], JSON.stringify(f));
    }
    // A quick tap (down/up inside one frame) still flips thanks to the input latch.
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.flippers[0].angle < -0.4, 5000);
    const flips = await state((d) => d.flipCount[0]);
    await page.touchscreen.tap(vp.width * 0.2, vp.height * 0.7);
    await until((n) => window.__THREE_GAME_DIAGNOSTICS__.flipCount[0] > n, 5000, flips);
    check('a quick tap still fires a full left flip', true);

    // Hold the button (pointer down, wait for charge, pointer up).
    await page.mouse.move(btn.x, btn.y);
    await page.mouse.down();
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.plungerCharge > 0.5, 10000);
    await page.mouse.up();
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.launches === 1, 5000);
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.ballState.y > 4, 10000);
    const flipsBefore = await state((d) => d.flippers.map((f) => f.pressed));
    check('holding and releasing LAUNCH fires the ball', true, JSON.stringify(flipsBefore));

    const layout = await state(() => {
        const hud = document.querySelector('#hud').getBoundingClientRect();
        const pause = document.querySelector('#pause-button').getBoundingClientRect();
        return { overlap: hud.right > pause.left && hud.top < pause.bottom, hudRight: hud.right, pauseLeft: pause.left };
    });
    check('the HUD does not overlap the pause button', !layout.overlap, JSON.stringify(layout));
}
