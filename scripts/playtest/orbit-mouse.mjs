// Dragging with a mouse orbits the camera; the drift resumes afterwards.
export const name = 'orbit-mouse';

export default async function ({ page, check, state, until }) {
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.frame > 5, 20000);
    const a0 = await state((d) => d.camera.az);
    await page.mouse.move(640, 360);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(640 - i * 25, 360 + i * 4);
    await page.mouse.up();
    const a1 = await state((d) => ({ az: d.camera.az, el: d.camera.el }));
    // Dragging left by 300 px turns the view the opposite way to the auto drift.
    check('mouse drag left orbits the camera (azimuth increases by > 0.5 rad)', a1.az - a0 > 0.5, `${a0} -> ${a1.az}`);
    await until((az) => window.__THREE_GAME_DIAGNOSTICS__.camera.az > az + 0.05, 30000, a1.az + 0.0);
    check('auto drift resumes after release', true);
}
