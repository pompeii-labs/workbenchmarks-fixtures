import { startGame, diveAndLaunch } from './_game.mjs';
export const name = 'flip';
export default async function ({ page, check, state, until }) {
    await startGame(page, until);
    await diveAndLaunch(page, until);
    const p0 = await state((d) => d.player.pitch);
    await page.keyboard.down('ArrowUp');
    await until((p) => window.__THREE_GAME_DIAGNOSTICS__.player.pitch > p + Math.PI * 1.5 || !window.__THREE_GAME_DIAGNOSTICS__.airborne, 20000, p0);
    await page.keyboard.up('ArrowUp');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.airborne === false, 20000);
    const t = await state((d) => d.lastTrick);
    check('holding Up in the air completes a backflip', t.flips >= 1, JSON.stringify(t));
    check('flip scores more than a plain breach base', t.points > 0 ? t.points >= 600 : t.landMult === 0, String(t.points));
}
