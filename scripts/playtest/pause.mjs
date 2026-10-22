// P pauses the simulation with an overlay; P again resumes.
import { startGame, launch } from './_helpers.mjs';
export const name = 'pause';

export default async function ({ page, check, state, until }) {
    await startGame(page, until);
    await launch(page, until, 1);
    await page.keyboard.press('KeyP');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.paused, 3000);
    const a = await state((d) => ({ t: d.elapsed, overlay: !document.querySelector('#overlay-pause').classList.contains('hidden') }));
    const f0 = await state((d) => d.frame);
    await until((f) => window.__THREE_GAME_DIAGNOSTICS__.frame > f + 20, 10000, f0);
    const b = await state((d) => d.elapsed);
    check('pause shows the overlay and freezes the table', a.overlay && b === a.t, JSON.stringify({ a, b }));
    await page.keyboard.press('KeyP');
    await until((t) => window.__THREE_GAME_DIAGNOSTICS__.elapsed > t, 5000, b);
    const c = await state((d) => ({ paused: d.paused, overlay: document.querySelector('#overlay-pause').classList.contains('hidden') }));
    check('P resumes play', !c.paused && c.overlay, JSON.stringify(c));
}
