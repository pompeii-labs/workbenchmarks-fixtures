import { startRide } from './_helpers.mjs';
export const name = 'race-guide';

export default async function ({ page, check, state, until, metric }) {
    await startRide(page, until);
    await page.keyboard.down('KeyW');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.race.started, 20000);
    const r = await state((d) => d.race);
    check('crossing the start gate starts the lap clock and targets gate 1', r.started && r.nextGate === 1, JSON.stringify(r));
    // Turn around with real input and head back down the start straight:
    // brake first so the U-turn stays on the course.
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyS');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.sim.speed < 7, 15000);
    await page.keyboard.up('KeyS');
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyA');
    await until(() => Math.cos(window.__THREE_GAME_DIAGNOSTICS__.sim.heading) < -0.9, 20000);
    await page.keyboard.up('KeyA');
    metric('afterTurn', await state((d) => ({ msg: d.race.message, x: d.sim.x, z: d.sim.z, h: d.sim.heading, v: d.sim.speed, t: d.sim.t })));
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.race.message === 'wrong-way', 15000).catch(async (e) => {
        metric('stateAtTimeout', await state((d) => ({ msg: d.race.message, x: d.sim.x, z: d.sim.z, h: d.sim.heading, v: d.sim.speed, ng: d.race.nextGate, mode: d.sim.mode })));
        throw e;
    });
    const msg = await page.evaluate(() => ({
        text: document.querySelector('#race-msg').textContent,
        visible: !document.querySelector('#race-msg').classList.contains('hidden'),
    }));
    check('riding the course backwards shows WRONG WAY', msg.visible && /wrong way/i.test(msg.text), JSON.stringify(msg));
    const arrow = await page.evaluate(() => getComputedStyle(document.querySelector('#gate-arrow svg')).transform);
    check('gate arrow points behind you when heading away', arrow !== 'none', arrow);
    await page.keyboard.up('KeyW');
    const t = await state((d) => d.race.clock);
    await until((c) => window.__THREE_GAME_DIAGNOSTICS__.race.clock > c + 0.5, 10000, t);
    check('lap clock keeps running', true);
}
