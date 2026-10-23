export const name = 'mobile';
export const mobile = true;

export default async function ({ page, check, state, until }) {
    const vis = await page.evaluate(() => getComputedStyle(document.querySelector('#touch-controls')).display);
    check('touch controls visible on phone viewport', vis === 'flex', vis);
    await page.tap('#start-btn');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.ui === 'play', 10000);
    const box = await page.locator('#touch-stick').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // Hold the stick slightly up-right: ride forward and carve right.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + box.width * 0.3, cy - box.height * 0.2);
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.speed > 12, 20000);
    const h0 = await state((d) => d.sim.heading);
    check('stick drives the ski', true);
    await until((h) => window.__THREE_GAME_DIAGNOSTICS__.sim.heading < h - 0.5, 15000, h0);
    check('stick right steers right', true);
    await page.mouse.move(cx, cy - box.height * 0.2);
    const j0 = await state((d) => d.sim.jumps);
    await until(() => !window.__THREE_GAME_DIAGNOSTICS__.sim.airborne, 10000);
    await page.tap('#jump-button');
    await until((j) => window.__THREE_GAME_DIAGNOSTICS__.sim.jumps > j, 5000, j0);
    check('JUMP button pops', true);
    await page.mouse.up();
    await page.tap('#pause-btn');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.ui === 'paused', 5000);
    check('pause button pauses on touch', true);
}
