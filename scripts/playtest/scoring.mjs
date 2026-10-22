// Bumpers light up and score; rollover lanes light and award the multiplier.
import { startWithSpace } from './_util.mjs';
export const name = 'scoring';

export default async function ({ page, check, state, until, hooks }) {
  await startWithSpace(page, until);
  const info = await hooks((h) => h.tableInfo());
  for (const b of info.bumpers) {
    const before = await state((d) => ({ hits: d.bumperHits, score: d.score, n: d.bumperCount }));
    // Drop the ball onto the bumper from above (removes aim luck, physics does the rest).
    await hooks((h, x, y) => h.placeBall(x, y, 0, -6), b.x, b.y + 1.3);
    await until(([i, n]) => window.__THREE_GAME_DIAGNOSTICS__.bumperCount[i] > n, 5000, [b.index, before.n[b.index]]);
    const after = await state((d) => ({ hits: d.bumperHits, score: d.score, n: d.bumperCount, hud: d.hud.score, last: d.lastEvent }));
    check(`bumper ${b.index} is hit and scores 100`, after.score - before.score >= 100 && after.n[b.index] > before.n[b.index], JSON.stringify(after));
    check(`HUD shows score after bumper ${b.index}`, after.hud === after.score.toLocaleString('en-US'), after.hud);
  }
  const s0 = await state((d) => ({ score: d.score, mult: d.multiplier }));
  for (const lane of info.rollovers) {
    await hooks((h, x, y) => h.placeBall(x, y, 0, 9), lane.x, lane.y0 - 0.4);
    await until((x) => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      return d.ballPos.y < 15.5 && d.ballVel.y < 0 || d.multiplier > 1;
    }, 6000, lane.x);
  }
  const s1 = await state((d) => ({ score: d.score, mult: d.multiplier, lanes: d.lanes }));
  check('lighting all three lanes raises the multiplier', s1.mult >= s0.mult + 1 && s1.score - s0.score >= 1150, JSON.stringify([s0, s1]));
}
