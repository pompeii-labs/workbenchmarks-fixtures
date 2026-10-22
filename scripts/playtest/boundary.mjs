import { startGame } from './_game.mjs';
export const name = 'boundary';
export default async function ({ page, check, state, until }) {
    await startGame(page, until);
    await page.keyboard.down('ArrowRight');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.player.position.x > 8.5, 20000);
    const z0 = await state((d) => d.player.position.z);
    await until((z) => window.__THREE_GAME_DIAGNOSTICS__.player.position.z < z - 30, 20000, z0);
    const x = await state((d) => d.player.position.x);
    await page.keyboard.up('ArrowRight');
    check('shore edge holds the dolphin in the lane', x <= 11, String(x));
    await page.keyboard.down('ArrowLeft');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.player.position.x < 4, 15000);
    await page.keyboard.up('ArrowLeft');
    check('steering away from the edge works immediately (not trapped)', true);
}
