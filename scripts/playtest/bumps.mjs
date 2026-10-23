import { startRide } from './_helpers.mjs';
export const name = 'bumps';

// Ski-to-ski contact is a real momentum exchange. Hooks only park/place rivals;
// real W drives the player into them.
export default async function ({ page, check, state, until, hooks, metric }) {
    await startRide(page, until);
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.field.phase === 'racing', 15000);
    await hooks((h) => {
        h.setRivalsHold(true);
        // Park the field off to the left so the run-up is clear.
        for (let i = 0; i < 5; i += 1) h.placeRival(i, 10, -40 - i * 6, 0, 0);
    });
    await page.keyboard.down('KeyW');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.speed > 16 && !window.__THREE_GAME_DIAGNOSTICS__.sim.airborne, 20000);
    // Park rival 0 broadside dead ahead, engine idle.
    await hooks((h) => h.placeRival(0, 12, 0, Math.PI / 2, 0));
    const b0 = await state((d) => d.field.bumpsPlayerRival);
    await until((n) => window.__THREE_GAME_DIAGNOSTICS__.field.bumpsPlayerRival > n, 10000, b0);
    const hit = await state((d) => d.field.lastBump);
    await page.keyboard.up('KeyW');
    metric('rammingImpulse', Math.round(hit.j * 10) / 10);
    check('the contact is me (0) into rival KAI (1)', hit.a === 0 && hit.b === 1, JSON.stringify(hit));
    check('ramming a parked rival shoves it away (>5 m/s)', hit.bBefore < 1 && hit.bAfter > 5, JSON.stringify(hit));
    check('the rammer loses speed in the hit', hit.aAfter < hit.aBefore - 4, JSON.stringify(hit));
    check('momentum along the contact normal is conserved', Math.abs(hit.pnAfter - hit.pnBefore) < 0.05, JSON.stringify(hit));
    await until(() => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return Math.hypot(d.field.rivals[0].x - d.sim.x, d.field.rivals[0].z - d.sim.z) > 1.4;
    }, 5000);
    check('skis are pushed apart, not left overlapping', true);

    // Rival-on-rival: rival 2 coasts into parked rival 3 ahead of the player.
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.speed < 8, 15000);
    await hooks((h) => {
        h.placeRival(2, 40, 12, 0, 0);
        h.placeRival(1, 40, 0, -Math.PI / 2, 20);
    });
    const rr0 = await state((d) => d.field.bumpsRivalRival);
    await until((n) => window.__THREE_GAME_DIAGNOSTICS__.field.bumpsRivalRival > n, 10000, rr0);
    const rr = await state((d) => d.field.lastBump);
    check('a rival ramming another rival transfers momentum', rr.a === 2 && rr.b === 3 && rr.bAfter > 5 && rr.aAfter < rr.aBefore - 4, JSON.stringify(rr));

    // Release: rivals drive again and the race continues.
    await hooks((h) => h.setRivalsHold(false));
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.field.rivals.every((r) => r.speed > 6), 15000);
    check('released rivals resume racing', true);
}
