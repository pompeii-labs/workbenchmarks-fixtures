import { startRide } from './_helpers.mjs';
export const name = 'controls';

export default async function ({ page, check, state, until, metric }) {
    await startRide(page, until);
    const z0 = await state((d) => d.sim.z);
    await page.keyboard.down('KeyW');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.speed > 15, 20000);
    const s1 = await state((d) => ({ speed: d.sim.speed, heading: d.sim.heading, x: d.sim.x, z: d.sim.z }));
    check('W throttles up past 54 km/h', s1.speed > 15, JSON.stringify(s1));
    check('ski drives forward (-Z at start)', s1.z < z0 - 5, `${z0} -> ${JSON.stringify(s1)}`);

    // Steer right: heading decreases (clockwise from above) and the bars turn right.
    await page.keyboard.down('KeyD');
    await until((h) => window.__THREE_GAME_DIAGNOSTICS__.sim.heading < h - 0.8, 15000, s1.heading);
    await page.keyboard.up('KeyD');
    const s2 = await state((d) => ({ heading: d.sim.heading }));
    // forward = (-sin h, -cos h): a decreasing heading swings the nose from -Z toward +X (right).
    check('D turns right (heading decreases)', s2.heading < s1.heading - 0.8, JSON.stringify(s2));

    await page.keyboard.down('KeyA');
    await until((h) => window.__THREE_GAME_DIAGNOSTICS__.sim.heading > h + 0.8, 15000, s2.heading);
    await page.keyboard.up('KeyA');
    const s3 = await state((d) => d.sim.heading);
    check('A turns left (heading increases)', s3 > s2.heading + 0.8, `${s2.heading} -> ${s3}`);

    // Boost
    await page.keyboard.down('ShiftLeft');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.boosting, 10000);
    // Gates and rings refill boost, so prove the drain on its own.
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.boosting && window.__THREE_GAME_DIAGNOSTICS__.sim.boost < 0.97, 15000);
    const drained = await state((d) => d.sim.boost);
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.speed > 26 || window.__THREE_GAME_DIAGNOSTICS__.sim.boost < 0.05, 20000);
    const s4 = await state((d) => ({ speed: d.sim.speed, boost: d.sim.boost }));
    await page.keyboard.up('ShiftLeft');
    metric('boostTopSpeedKmh', Math.round(s4.speed * 3.6));
    check('Shift boost exceeds normal top speed and drains meter', s4.speed > 25.5 && drained < 0.97, JSON.stringify({ ...s4, drained }));

    // Brake
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyS');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.speed < 3, 20000);
    await page.keyboard.up('KeyS');
    check('S brakes to a stop', true);
}
