import { startGame } from './_util.mjs';
export const name = 'soak';

// A simple bot plays real games: flips whichever flipper the ball is over.
// The ball must stay inside the cabinet and the game must reach game over and restart.
export default async function ({ page, check, state, until, hooks, metric }) {
  // Slower game time so the bot's reaction latency is closer to a person's.
  await hooks((h) => h.setTimeScale(1.5));
  await startGame(page, until);
  let out = 0;
  let maxScore = 0;
  let launches = 0;
  let held = { left: false, right: false };
  const started = Date.now();
  while (Date.now() - started < 100000) {
    const d = await state((d) => ({ mode: d.mode, x: d.ball.x, y: d.ball.y, vy: d.ball.vy, sp: Math.hypot(d.ball.vx, d.ball.vy), score: d.score, simTime: d.simTime }));
    if (d.x < -4.7 || d.x > 5.6 || d.y > 10.7 || (d.y < -11.5 && d.mode === 'play')) out += 1;
    maxScore = Math.max(maxScore, d.score);
    if (d.mode === 'over') break;
    if (d.mode === 'plunger') {
      await page.keyboard.down('Space');
      try {
        await until((c) => {
          const g = window.__THREE_GAME_DIAGNOSTICS__;
          return g.plunger.charge >= c || g.mode !== 'plunger';
        }, 20000, [0.6, 0.66, 0.95][launches % 3]);
      } catch (e) {
        const g = await state();
        throw new Error(`plunger never charged: ${JSON.stringify({ mode: g.mode, ball: g.ball, plunger: g.plunger })}`);
      }
      await page.keyboard.up('Space');
      launches += 1;
      continue;
    }
    // Flip at a ball near the flippers; let go of a cradled (resting) ball so play continues.
    const near = d.y < -6.2 && d.y > -8.4 && d.vy < 2 && d.sp > 1;
    const want = { left: near && d.x < 0.1, right: near && d.x > -0.1 };
    for (const [side, key] of [['left', 'KeyZ'], ['right', 'Slash']]) {
      if (want[side] && !held[side]) await page.keyboard.down(key);
      if (!want[side] && held[side]) await page.keyboard.up(key);
    }
    held = want;
  }
  await page.keyboard.up('KeyZ');
  await page.keyboard.up('Slash');
  const end = await state((d) => ({ mode: d.mode, stats: d.stats, score: d.score, simTime: d.simTime }));
  metric('botScore', maxScore);
  metric('simSeconds', end.simTime);
  metric('stats', end.stats);
  check('the ball never escaped the cabinet', out === 0, `${out} samples out of bounds`);
  check('the bot scored points from real play', maxScore > 0, String(maxScore));
  check('the ball reached bumpers, slings or lanes during real play', end.stats.bumperHits + end.stats.slingHits > 0 || maxScore > 0, JSON.stringify(end.stats));
  check('a full bot game reached game over', end.mode === 'over', end.mode);
}
