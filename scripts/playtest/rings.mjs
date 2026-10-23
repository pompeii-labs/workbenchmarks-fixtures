import { startRide } from './_helpers.mjs';
export const name = 'rings';

export default async function ({ page, check, state, until, hooks }) {
    await startRide(page, until);
    const before = await state((d) => ({ hits: d.sim.ringsHit, score: d.sim.score, rings: d.sim.rings }));
    // Remove spawn luck: a surface ring straight ahead. Real input drives through it.
    await hooks((h) => h.placeRingAhead(30, false));
    await page.keyboard.down('KeyW');
    await until((n) => window.__THREE_GAME_DIAGNOSTICS__.sim.ringsHit > n, 20000, before.hits);
    await page.keyboard.up('KeyW');
    const after = await page.evaluate(() => ({
        hits: window.__THREE_GAME_DIAGNOSTICS__.sim.ringsHit,
        score: window.__THREE_GAME_DIAGNOSTICS__.sim.score,
        combo: window.__THREE_GAME_DIAGNOSTICS__.sim.combo,
        rings: window.__THREE_GAME_DIAGNOSTICS__.sim.rings,
        popup: document.querySelectorAll('#popups .popup').length,
    }));
    check('driving through a ring scores and bumps combo', after.score >= before.score + 150 && after.combo >= 2, JSON.stringify(after));
    check('a popup shows the points', after.popup > 0, JSON.stringify(after));
    check('ring field refills', after.rings >= before.rings, JSON.stringify(after));
}
