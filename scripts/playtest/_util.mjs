export async function startGame(page, until) {
    await page.click('#start-btn');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.phase === 'play', 10000);
}
// Dive with S, then pull up with W until the dolphin leaves the water.
export async function diveAndLaunch(page, until) {
    await page.keyboard.down('KeyS');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.dolphin.y < -2.6, 20000);
    await page.keyboard.up('KeyS');
    await page.keyboard.down('KeyW');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.dolphin.airborne, 20000);
}
