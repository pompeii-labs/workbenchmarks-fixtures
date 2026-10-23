export const name = 'start';

export default async function ({ page, check, state, until }) {
    const d0 = await page.evaluate(() => ({
        ui: window.__THREE_GAME_DIAGNOSTICS__.ui,
        titleVisible: !document.querySelector('#title').classList.contains('hidden'),
        loadingGone: document.querySelector('#loading').classList.contains('done'),
    }));
    check('opens on the title screen', d0.ui === 'title' && d0.titleVisible, JSON.stringify(d0));
    await until(() => document.querySelector('#loading').classList.contains('done'), 10000);
    check('loading screen clears after first frames', true);
    await page.click('#start-btn');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.ui === 'play', 10000);
    const d1 = await page.evaluate(() => ({
        ui: window.__THREE_GAME_DIAGNOSTICS__.ui,
        titleHidden: document.querySelector('#title').classList.contains('hidden'),
        score: window.__THREE_GAME_DIAGNOSTICS__.sim.score,
    }));
    check('Ride button starts a fresh run', d1.ui === 'play' && d1.titleHidden && d1.score === 0, JSON.stringify(d1));
    const t0 = await state((d) => d.sim.t);
    await until((t) => window.__THREE_GAME_DIAGNOSTICS__.sim.t > t + 1, 15000, t0);
    check('simulation advances during play', true);
}
