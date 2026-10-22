import { startGame, diveAndLaunch } from './_game.mjs';
export const name = 'jump-score';
export default async function ({ page, check, state, until, metric }) {
    await startGame(page, until);
    await diveAndLaunch(page, until);
    check('rising from a dive launches out of the water', true);
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.airborne === false, 20000);
    const r = await state((d) => ({ score: d.score, t: d.lastTrick, combo: d.combo }));
    metric('breachPoints', r.score);
    metric('breachHeight', r.t?.height);
    check('a hands-off breach lands clean and scores', r.score > 0 && r.t && r.t.landMult >= 1.5, JSON.stringify(r.t));
    check('height multiplier applied', r.t.heightMult > 1, String(r.t.heightMult));
    check('clean landing starts a combo', r.combo >= 1, String(r.combo));
}
