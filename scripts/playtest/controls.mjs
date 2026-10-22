// Start, plunger and both flippers respond to real keys, in the right direction.
import { startGame } from './_helpers.mjs';
export const name = 'controls';

export default async function ({ page, check, state, until }) {
    const title = await state((d) => ({ mode: d.mode, overlay: !document.querySelector('#overlay-title').classList.contains('hidden') }));
    check('boots to the title screen', title.mode === 'attract' && title.overlay, JSON.stringify(title));

    await startGame(page, until);
    const s = await state((d) => ({ mode: d.mode, ball: d.ball, balls: d.ballsLeft, score: d.score, overlay: document.querySelector('#overlay-title').classList.contains('hidden') }));
    check('Space starts a 3-ball game with the title hidden', s.mode === 'play' && s.ball === 1 && s.balls === 3 && s.score === 0 && s.overlay, JSON.stringify(s));
    const charged = await state((d) => d.plungerCharge);
    check('the start press does not also charge the plunger', charged === 0, `charge ${charged}`);

    // Flippers: a raised left flipper's angle goes up (tip rises); the right mirrors it.
    for (const [key, i, label] of [['KeyZ', 0, 'Z raises the left flipper'], ['ArrowRight', 1, 'Right Arrow raises the right flipper'], ['ArrowLeft', 0, 'Left Arrow raises the left flipper'], ['Slash', 1, '/ raises the right flipper']]) {
        const rest = await state((d, ) => d.flippers.map((f) => f.angle));
        await page.keyboard.down(key);
        await until((idx) => window.__THREE_GAME_DIAGNOSTICS__.flippers[idx].angle > 0.4, 5000, i);
        const up = await state((d) => d.flippers.map((f) => ({ a: f.angle, p: f.pressed })));
        check(label, up[i].p && up[i].a > rest[i] + 0.5 && !up[1 - i].p, JSON.stringify({ rest, up }));
        await page.keyboard.up(key);
        await until((idx) => window.__THREE_GAME_DIAGNOSTICS__.flippers[idx].angle < -0.4, 5000, i);
    }
    check('flippers drop back to rest on release', true);
    // Plunger: hold charges and pulls the rod back; release fires the ball up the lane.
    await page.keyboard.down('Space');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.plungerCharge > 0.5, 10000);
    const pulled = await state((d) => ({ charge: d.plungerCharge, offset: d.plungerOffset, launches: d.launches }));
    check('holding Space pulls the plunger back', pulled.offset > 0.3 && pulled.launches === 0, JSON.stringify(pulled));
    await page.keyboard.up('Space');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.launches === 1, 5000);
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.ballState.y > 4, 10000);
    const fired = await state((d) => ({ y: d.ballState.y, x: d.ballState.x }));
    check('releasing fires the ball up the shooter lane', fired.y > 4, JSON.stringify(fired));
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.ballState.x < 4.2, 10000);
    check('the launched ball enters the playfield', (await state((d) => d.ballState.x)) < 4.2);

}
