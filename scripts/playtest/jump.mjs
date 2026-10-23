import { startRide, repeatUntil } from './_helpers.mjs';
export const name = 'jump';

export default async function ({ page, check, state, until, metric }) {
    await startRide(page, until);
    await page.keyboard.down('KeyW');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.speed > 12, 20000);
    const j0 = await state((d) => d.sim.jumps);
    await until(() => !window.__THREE_GAME_DIAGNOSTICS__.sim.airborne, 10000);
    await page.keyboard.press('Space');
    await until((j) => window.__THREE_GAME_DIAGNOSTICS__.sim.jumps > j && window.__THREE_GAME_DIAGNOSTICS__.sim.airborne, 5000, j0);
    check('Space pops the ski off the water', true);

    // Ride the swells with boost + pops until a scored big-air landing.
    await page.keyboard.down('ShiftLeft');
    const ok = await repeatUntil(
        page,
        () => window.__THREE_GAME_DIAGNOSTICS__.sim.bestAir > 0.9 && window.__THREE_GAME_DIAGNOSTICS__.sim.score > 0,
        () => page.keyboard.press('Space'),
        60000,
    );
    await page.keyboard.up('ShiftLeft');
    const s = await state((d) => ({ bestAir: d.sim.bestAir, score: d.sim.score, wipeouts: d.sim.wipeouts, jumps: d.sim.jumps }));
    metric('bestAirSeconds', s.bestAir);
    check('swell launch + pop gives >0.9 s big air that scores', ok, JSON.stringify(s));
    check('straight jumps land clean (no wipeouts)', s.wipeouts === 0, JSON.stringify(s));
}
