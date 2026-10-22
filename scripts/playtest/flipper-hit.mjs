// A real flipper press fires a resting ball back up the table.
import { startGame, placeBall } from './_helpers.mjs';
export const name = 'flipper-hit';

export default async function ({ page, check, state, until, hooks }) {
    await startGame(page, until);
    for (const [side, key, x] of [['left', 'KeyZ', -1.17], ['right', 'Slash', 1.17]]) {
        // Setup only: slow time and rest the ball on the lowered flipper; the shot is real input.
        await hooks((h) => h.setTimeScale(0.3));
        await placeBall(hooks, until, x, -7.54, 0, 0);
        await page.keyboard.down(key);
        await until(() => {
            const d = window.__THREE_GAME_DIAGNOSTICS__;
            return d.ballState.vy > 8 || d.mode !== 'play';
        }, 8000);
        const after = await state((d) => ({ vy: d.ballState.vy, vx: d.ballState.vx, mode: d.mode }));
        await hooks((h) => h.setTimeScale(3));
        await page.keyboard.up(key);
        check(`the ${side} flipper fires the ball up-table`, after.mode === 'play' && after.vy > 8, JSON.stringify(after));
        check(`the ${side} flipper shot is a hard hit`, Math.hypot(after.vx, after.vy) > 20, JSON.stringify(after));
        await until(() => window.__THREE_GAME_DIAGNOSTICS__.ballState.y > -2 || window.__THREE_GAME_DIAGNOSTICS__.mode !== 'play', 5000);
        check(`the ${side} flipper shot travels up the playfield`, (await state((d) => d.ballState.y)) > -2);
    }
}
