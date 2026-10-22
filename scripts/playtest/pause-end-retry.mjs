import { startGame } from './_util.mjs';
export const name = 'pause-end-retry';

export default async function ({ page, check, state, until, hooks }) {
    await startGame(page, until);
    await page.keyboard.press('Escape');
    const p = await state((d) => ({ phase: d.phase, t: d.runTime, vis: !document.querySelector('#pause').hidden }));
    check('Escape pauses with an overlay', p.phase === 'paused' && p.vis, JSON.stringify(p));
    const frame = await state((d) => d.frame);
    await until((f) => window.__THREE_GAME_DIAGNOSTICS__.frame > f + 10, 10000, frame);
    const p2 = await state((d) => d.runTime);
    check('the clock stops while paused', p2 === p.t, `${p.t} -> ${p2}`);
    await page.click('#resume-btn');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.phase === 'play', 5000);
    check('resume button returns to play', true);
    await hooks((h) => h.setRunTime(88.5));
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.phase === 'results', 20000);
    const r = await state(() => ({ vis: !document.querySelector('#results').hidden, score: document.querySelector('#final-score').textContent }));
    check('the run ends at 90 s with a results card', r.vis, JSON.stringify(r));
    await page.click('#again-btn');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.phase === 'play', 5000);
    const a = await state((d) => ({ score: d.score, t: d.runTime }));
    check('Swim again restarts a fresh run', a.score === 0 && a.t < 2, JSON.stringify(a));
}
