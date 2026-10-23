import { startRide } from './_helpers.mjs';
export const name = 'pause';

export default async function ({ page, check, state, until }) {
    await startRide(page, until);
    await page.keyboard.down('KeyW');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.speed > 8, 15000);
    await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyP');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.ui === 'paused', 5000);
    const t0 = await state((d) => d.sim.t);
    const f0 = await state((d) => d.frame);
    await until((f) => window.__THREE_GAME_DIAGNOSTICS__.frame > f + 20, 10000, f0);
    const p = await page.evaluate(() => ({
        t: window.__THREE_GAME_DIAGNOSTICS__.sim.t,
        overlay: !document.querySelector('#pause').classList.contains('hidden'),
    }));
    check('P pauses: overlay up, sim frozen', p.overlay && p.t === t0, JSON.stringify({ t0, ...p }));
    await page.click('#resume-btn');
    await until((t) => window.__THREE_GAME_DIAGNOSTICS__.ui === 'play' && window.__THREE_GAME_DIAGNOSTICS__.sim.t > t + 0.2, 10000, t0);
    check('Resume continues the run', true);
}
