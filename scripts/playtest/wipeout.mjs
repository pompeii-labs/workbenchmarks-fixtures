import { startRide } from './_helpers.mjs';
export const name = 'wipeout';

export default async function ({ page, check, state, until }) {
    await startRide(page, until);
    await page.keyboard.down('KeyW');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.speed > 18, 20000);
    // Pop, then hold a quarter spin through the landing.
    let wiped = false;
    for (let attempt = 0; attempt < 6 && !wiped; attempt += 1) {
        await until(() => !window.__THREE_GAME_DIAGNOSTICS__.sim.airborne, 10000);
        await page.keyboard.press('Space');
        await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.airborne && window.__THREE_GAME_DIAGNOSTICS__.sim.airTime > 0.3, 5000).catch(() => {});
        await page.keyboard.down('KeyD');
        await until(() => !window.__THREE_GAME_DIAGNOSTICS__.sim.airborne || window.__THREE_GAME_DIAGNOSTICS__.sim.mode === 'wipeout', 8000);
        await page.keyboard.up('KeyD');
        wiped = await state((d) => d.sim.mode === 'wipeout' || d.sim.wipeouts > 0);
    }
    const s = await page.evaluate(() => ({
        mode: window.__THREE_GAME_DIAGNOSTICS__.sim.mode,
        wipeouts: window.__THREE_GAME_DIAGNOSTICS__.sim.wipeouts,
        combo: window.__THREE_GAME_DIAGNOSTICS__.sim.combo,
        banner: !document.querySelector('#wipeout').classList.contains('hidden'),
    }));
    check('landing sideways is a wipeout', s.wipeouts > 0, JSON.stringify(s));
    check('wipeout resets combo and shows banner', s.combo === 1 && (s.banner || s.mode === 'ride'), JSON.stringify(s));
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.mode === 'ride', 10000);
    const banner = await page.evaluate(() => document.querySelector('#wipeout').classList.contains('hidden'));
    check('auto-respawns and banner clears', banner);
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.speed > 12, 15000);
    check('W drives again after respawn', true);
    // Restart
    await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyR');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.wipeouts === 0 && window.__THREE_GAME_DIAGNOSTICS__.sim.score === 0, 5000);
    check('R restarts a fresh run', true);
}
