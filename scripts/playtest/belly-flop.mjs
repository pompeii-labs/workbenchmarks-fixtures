import { startGame, diveAndLaunch } from './_util.mjs';
export const name = 'belly-flop';

// Holding a spin through the whole jump lands the dolphin sideways at some
// arbitrary angle; a landing far from nose-first is a belly flop worth 0.
export default async function ({ page, check, state, until }) {
    await startGame(page, until);
    await diveAndLaunch(page, until);
    await page.keyboard.up('KeyW');
    // Spin until roughly half a turn and keep holding into the water.
    await page.keyboard.down('KeyD');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.dolphin.spin < -2.4 || !window.__THREE_GAME_DIAGNOSTICS__.dolphin.airborne, 20000);
    await page.keyboard.up('KeyD');
    // Freeze the half-turn by holding the opposite direction briefly balanced? No: hold S to tumble too.
    await page.keyboard.down('KeyS');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.lastLanding !== null, 20000);
    await page.keyboard.up('KeyS');
    const r = await state((d) => ({ l: d.lastLanding, score: d.score, chain: d.chain }));
    check('a tumbling, sideways entry scores lower than a clean one', r.l.smooth < 0.85, JSON.stringify({ q: r.l.quality, smooth: r.l.smooth }));
    if (r.l.quality === 'Belly flop') check('belly flop scores 0 and resets the chain', r.l.points === 0 && r.chain === 1, JSON.stringify(r));
}
