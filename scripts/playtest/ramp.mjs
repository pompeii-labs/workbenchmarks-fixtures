import { startRide } from './_helpers.mjs';
export const name = 'ramp';

// Real throttle + boost drives the ski up a kicker ramp and off the lip.
export default async function ({ page, check, state, until, hooks, metric }) {
    await startRide(page, until);
    await hooks((h) => h.placeBeforeRamp(1, 70));
    const before = await state((d) => ({ jumps: d.sim.rampJumps, wipeouts: d.sim.wipeouts }));
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.onRamp === 1, 20000);
    check('riding into the ramp puts the hull on the deck', true);
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.airborne && window.__THREE_GAME_DIAGNOSTICS__.sim.airFromRamp, 10000);
    check('the lip launches the ski', true);
    await page.keyboard.up('ShiftLeft');
    await until((n) => window.__THREE_GAME_DIAGNOSTICS__.sim.rampJumps > n, 15000, before.jumps);
    const after = await page.evaluate(() => ({
        air: window.__THREE_GAME_DIAGNOSTICS__.sim.lastRampAir,
        height: window.__THREE_GAME_DIAGNOSTICS__.sim.lastRampHeight,
        wipeouts: window.__THREE_GAME_DIAGNOSTICS__.sim.wipeouts,
        popups: [...document.querySelectorAll('#popups .popup')].map((p) => p.textContent),
    }));
    await page.keyboard.up('KeyW');
    metric('rampAirSeconds', after.air);
    metric('rampPeakHeightM', after.height);
    check('ramp jump is big air (>1.2 s, >4 m above water)', after.air > 1.2 && after.height > 4, JSON.stringify(after));
    check('hands-off ramp jump lands clean', after.wipeouts === before.wipeouts, JSON.stringify(after));
    check('a RAMP JUMP popup scores it', after.popups.some((t) => t.includes('RAMP JUMP')), JSON.stringify(after.popups));

    // Hitting the ramp from the side never traps or launches you.
    await hooks((h) => h.placeBeforeRamp(0, -6));
    await page.keyboard.down('KeyD');
    await page.keyboard.down('KeyW');
    const t0 = await state((d) => d.sim.t);
    await until((t) => window.__THREE_GAME_DIAGNOSTICS__.sim.t > t + 4, 20000, t0);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');
    const side = await state((d) => ({ speed: d.sim.speed, x: d.sim.x, z: d.sim.z, mode: d.sim.mode }));
    check('circling beside a ramp keeps moving (no trap)', side.speed > 5, JSON.stringify(side));
}
