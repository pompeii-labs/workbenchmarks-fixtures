// prefers-reduced-motion: a still frame of the act; nothing moves on its own.
export const name = 'reduced-motion';

export default async function ({ page, check, state, until }) {
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.frame > 5, 20000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.reducedMotion === true, 5000);
    const a = await state((d) => ({ t: d.t, az: d.camera.az, frame: d.frame }));
    await page.waitForTimeout(1500);
    const b = await state((d) => ({ t: d.t, az: d.camera.az, frame: d.frame }));
    check('act clock frozen', a.t === b.t, `${a.t} -> ${b.t}`);
    check('camera does not drift', a.az === b.az, `${a.az} -> ${b.az}`);
    check('no continuous re-rendering while still', b.frame - a.frame <= 1, `${a.frame} -> ${b.frame}`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await until((t) => window.__THREE_GAME_DIAGNOSTICS__.t > t + 0.3, 10000, b.t);
    check('motion resumes when the preference is cleared', true);
}
