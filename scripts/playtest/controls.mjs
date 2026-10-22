import { startGame } from './_game.mjs';
export const name = 'controls';
export default async function ({ page, check, state, until }) {
    await startGame(page, until);
    const y0 = await state((d) => d.player.position.y);
    await page.keyboard.down('ArrowDown');
    await until((y) => window.__THREE_GAME_DIAGNOSTICS__.player.position.y < y - 2, 15000, y0);
    await page.keyboard.up('ArrowDown');
    check('Down dives the dolphin', true);
    const x0 = await state((d) => d.player.position.x);
    await page.keyboard.down('ArrowRight');
    await until((x) => window.__THREE_GAME_DIAGNOSTICS__.player.position.x > x + 2, 15000, x0);
    await page.keyboard.up('ArrowRight');
    const yaw = await state((d) => d.player.yaw);
    check('Right steers toward +x (shore) and yaws right', yaw > 0, `yaw ${yaw}`);
    const x1 = await state((d) => d.player.position.x);
    await page.keyboard.down('ArrowLeft');
    await until((x) => window.__THREE_GAME_DIAGNOSTICS__.player.position.x < x - 2, 15000, x1);
    await page.keyboard.up('ArrowLeft');
    check('Left steers back toward open sea', true);
}
