export async function startGame(page, until) {
    await until(() => !!window.__THREE_GAME_DIAGNOSTICS__ && !!window.__THREE_GAME_TEST_HOOKS__, 20000);
    await page.click('#play-button');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.phase === 'playing', 10000);
}
export const D = () => window.__THREE_GAME_DIAGNOSTICS__;
// Dive with real keys, then rise until the dolphin leaves the water.
export async function diveAndLaunch(page, until) {
    await page.keyboard.down('ArrowDown');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.player.position.y < -4.5, 20000);
    await page.keyboard.up('ArrowDown');
    await page.keyboard.down('ArrowUp');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.airborne === true, 20000);
    await page.keyboard.up('ArrowUp');
}
