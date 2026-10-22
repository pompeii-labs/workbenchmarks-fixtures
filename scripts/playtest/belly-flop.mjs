import { startGame, diveAndLaunch } from './_game.mjs';
export const name = 'belly-flop';
export default async function ({ page, check, state, until, hooks }) {
    await startGame(page, until);
    await diveAndLaunch(page, until);
    // Slow game time so input latency in software rendering cannot overshoot the half-spin.
    await hooks((h) => h.setTimeScale(0.4));
    const r0 = await state((d) => d.player.roll);
    await page.keyboard.down('ArrowRight');
    await until((r) => Math.abs(window.__THREE_GAME_DIAGNOSTICS__.player.roll - r) > Math.PI * 0.5 || !window.__THREE_GAME_DIAGNOSTICS__.airborne, 20000, r0);
    await page.keyboard.up('ArrowRight');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.airborne === false, 20000);
    const r = await state((d) => ({ t: d.lastTrick, combo: d.combo, popup: document.querySelector('#pops .flop') !== null }));
    check('landing upside-down is a belly flop', r.t.grade === 'Belly flop' && r.t.points === 0, JSON.stringify(r.t));
    check('belly flop resets combo and shows a popup', r.combo === 0 && r.popup, JSON.stringify(r));
}
