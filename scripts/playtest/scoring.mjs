// Bumpers light up and score; top lanes light, and all three raise the multiplier.
import { startGame, placeBall } from './_helpers.mjs';
export const name = 'scoring';

export default async function ({ page, check, state, until, hooks }) {
    await startGame(page, until);
    const before = await state((d) => ({ score: d.score, hits: d.bumperHits }));
    // Setup: roll a ball into the lower bumper at (0, 2).
    await placeBall(hooks, until, 0, 0.6, 0, 6);
    // Wait for the frame where the hit has been drawn lit.
    // Snapshot state and DOM inside the predicate: the frame where the hit is drawn lit.
    const hitHandle = await until((h0) => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        if (!(d.bumperHits > h0 && d.bumperFlash.some((v) => v > 0))) return false;
        return { score: d.score, hits: d.bumperHits, light: d.bumperFlash, popups: document.querySelectorAll('.popup').length, hud: document.querySelector('#score-value').textContent };
    }, 5000, before.hits);
    const hit = await hitHandle.jsonValue();
    check('a bumper hit scores 100', hit.score - before.score >= 100 && hit.score % 10 === 0, JSON.stringify(hit));
    check('the struck bumper lights up', hit.light.some((v) => v > 0), JSON.stringify(hit.light));
    check('a score popup and the HUD show the hit', hit.popups > 0 && hit.hud === hit.score.toLocaleString('en-US'), JSON.stringify(hit));
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.bumperFlash.every((v) => v === 0), 5000);
    check('bumper light fades after the hit', true);

    // Top lanes: drop a ball through each lane.
    let lanes = null;
    for (const x of [-1.6, 0, 1.6]) {
        const lit = await state((d) => d.lanes.filter(Boolean).length);
        await placeBall(hooks, until, x, 8.4, 0, -2);
        const handle = await until((n) => {
            const d = window.__THREE_GAME_DIAGNOSTICS__;
            if (d.multiplier > 1) return { mult: d.multiplier, lanes: d.lanes, hud: document.querySelector('#mult-value').textContent };
            return d.lanes.filter(Boolean).length > n;
        }, 5000, lit);
        const v = await handle.jsonValue();
        if (typeof v === 'object') lanes = v;
    }
    lanes = lanes ?? { mult: 1 };
    check('lighting all three lanes raises the multiplier to 2x', lanes.mult === 2 && lanes.hud === '2x' && lanes.lanes.every((l) => !l), JSON.stringify(lanes));

    const b2 = await state((d) => ({ score: d.score, hits: d.bumperHits }));
    await placeBall(hooks, until, 0, 0.6, 0, 6);
    await until((h0) => window.__THREE_GAME_DIAGNOSTICS__.bumperHits > h0, 5000, b2.hits);
    const s2 = await state((d) => d.score);
    check('bumpers score with the multiplier (200 at 2x)', s2 - b2.score >= 200, `${b2.score} -> ${s2}`);
}
