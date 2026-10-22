import { startGame } from './_game.mjs';
export const name = 'pause';
export default async function ({ page, check, state, until }) {
    await startGame(page, until);
    await page.keyboard.press('p');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.phase === 'paused', 5000);
    const a = await state((d) => ({ t: d.elapsed, f: d.frame, shown: !document.getElementById('pause-screen').hidden }));
    await until((f) => window.__THREE_GAME_DIAGNOSTICS__.frame > f + 20, 10000, a.f);
    const b = await state((d) => d.elapsed);
    check('P pauses: overlay shown and sim time frozen', a.shown && b === a.t, `${a.t} -> ${b}`);
    await page.click('#resume-button');
    await until((t) => window.__THREE_GAME_DIAGNOSTICS__.phase === 'playing' && window.__THREE_GAME_DIAGNOSTICS__.elapsed > t + 0.2, 10000, b);
    check('Resume continues play', true);
}
