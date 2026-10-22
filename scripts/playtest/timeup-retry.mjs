import { startGame, diveAndLaunch } from './_game.mjs';
export const name = 'timeup-retry';
export default async function ({ page, check, state, until, hooks }) {
    await startGame(page, until);
    await diveAndLaunch(page, until);
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.airborne === false, 20000);
    await hooks((h) => h.setRemaining(0.5));
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.phase === 'results', 10000);
    const r = await state((d) => ({ score: d.score, best: d.best, text: document.getElementById('res-score').textContent, shown: !document.getElementById('results-screen').hidden }));
    check('session ends at sunset with a results card', r.shown && r.score > 0 && r.text === r.score.toLocaleString(), JSON.stringify(r));
    check('best score recorded', r.best >= r.score, JSON.stringify(r));
    await page.click('#again-button');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.phase === 'playing', 5000);
    const s = await state((d) => ({ score: d.score, rem: d.remaining }));
    check('Swim again restarts a fresh session', s.score === 0 && s.rem > 85, JSON.stringify(s));
}
