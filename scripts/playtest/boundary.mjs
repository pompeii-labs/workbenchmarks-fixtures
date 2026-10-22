import { startGame } from './_util.mjs';
export const name = 'boundary';

export default async function ({ page, check, state, until }) {
    await startGame(page, until);
    const z0 = await state((d) => d.dolphin.z);
    await page.keyboard.down('KeyD');
    await until((z) => window.__THREE_GAME_DIAGNOSTICS__.dolphin.z < z - 160, 60000, z0);
    const r = await state((d) => ({ x: d.dolphin.x, yaw: d.dolphin.yaw }));
    await page.keyboard.up('KeyD');
    check('steering right turns the dolphin toward the shore (+x)', r.x > 10, JSON.stringify(r));
    check('the shore edge pushes back without trapping', r.x < 38, JSON.stringify(r));
    await page.keyboard.down('KeyA');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.dolphin.x < 5, 60000);
    await page.keyboard.up('KeyA');
    check('steering left gets back out to sea', true);
}
