// A ball lost right after launch is returned once.
import { startGame, launch } from './_helpers.mjs';
export const name = 'ball-save';

export default async function ({ page, check, state, until, hooks }) {
    await startGame(page, until);
    await launch(page, until, 0.3);
    // Setup: send the launched ball straight down the drain while the save is armed.
    await hooks((h) => h.placeBall(0, -9.4, 0, -6));
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.ballState.inLane, 5000);
    const s = await state((d) => ({ mode: d.mode, balls: d.ballsLeft, drains: d.drains, msg: document.querySelector('#message').textContent }));
    check('the ball is saved and returned to the plunger', s.mode === 'play' && s.balls === 3 && s.drains === 0 && s.msg === 'BALL SAVED', JSON.stringify(s));
}
