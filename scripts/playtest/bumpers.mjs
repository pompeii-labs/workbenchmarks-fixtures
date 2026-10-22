import { startGame } from './_util.mjs';
export const name = 'bumpers';

export default async function ({ page, check, state, until, hooks }) {
  await startGame(page, until);
  const before = await state((d) => ({ score: d.score, hits: d.stats.bumperHits }));
  await hooks((h) => h.placeBall(-1.45, 2.4, 0, 9));
  // Snapshot inside the browser on the first frame after the hit.
  const handle = await until(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    return d.stats.bumperHits > 0 && { score: d.score, flash: d.bumperFlash, vy: d.ball.vy, speed: Math.hypot(d.ball.vx, d.ball.vy) };
  }, 10000);
  const hit = await handle.jsonValue();
  check('hitting a bumper scores 100', hit.score - before.score === 100, JSON.stringify(hit));
  check('the hit bumper lights up', hit.flash[0] > 0.2 && hit.flash[1] === 0, JSON.stringify(hit.flash));
  check('the bumper kicks the ball away hard', hit.vy < 0 && hit.speed >= 11, JSON.stringify(hit));
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.bumperFlash[0] === 0, 10000);
  check('the bumper light fades after the hit', true);

  // Slingshot kick.
  await hooks((h) => h.placeBall(-2.2, -4.6, -4, -2));
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.stats.slingHits > 0 || window.__THREE_GAME_DIAGNOSTICS__.ball.y < -9, 10000);
  const sling = await (await until(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    return (d.stats.slingHits > 0 || d.ball.y < -9) && { hits: d.stats.slingHits, vx: d.ball.vx };
  }, 1000)).jsonValue();
  check('a slingshot kicks the ball back toward center', sling.hits > 0 && sling.vx > 2, JSON.stringify(sling));

  // Rollover lanes: pass the ball through all three to raise the multiplier.
  for (const x of [-1.3, 0, 1.3]) {
    await hooks((h, lx) => h.placeBall(lx, 7.3, 0, 5), x);
    await until((lx) => window.__THREE_GAME_DIAGNOSTICS__.ball.y < 6.5, 10000, x);
  }
  const lanes = await state((d) => ({ mult: d.mult, lit: d.laneLit }));
  check('lighting all three top lanes raises the multiplier', lanes.mult === 2 && lanes.lit.every((l) => !l), JSON.stringify(lanes));
  const hud = await page.evaluate(() => document.querySelector('#mult').textContent);
  check('the HUD shows the multiplier', hud === 'x2', hud);
}
