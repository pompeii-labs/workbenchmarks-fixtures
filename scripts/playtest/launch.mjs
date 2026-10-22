import { plunge, startGame } from './_util.mjs';
export const name = 'launch';

export default async function ({ page, check, state, until, metric }) {
  const t = await state((d) => ({ mode: d.mode, overlay: d.overlay }));
  check('game opens on the title screen', t.mode === 'title' && t.overlay === 'title', JSON.stringify(t));
  await startGame(page, until);
  const s = await state((d) => ({ mode: d.mode, balls: d.ballsLeft, y: d.ball.y, overlay: d.overlay }));
  check('Space starts a game with 3 balls, ball on the plunger', s.mode === 'plunger' && s.balls === 3 && s.overlay === 'none', JSON.stringify(s));
  await page.waitForTimeout(100);
  const still = await state((d) => d.plunger.charge);
  check('the start keypress does not charge the plunger', still === 0, `charge ${still}`);

  await plunge(page, until, 0.97);
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.ball.y > 6, 15000);
  const top = await state((d) => ({ mode: d.mode, y: d.ball.y, launches: d.stats.launches }));
  check('a full plunge sends the ball up the lane to the top of the table', top.y > 6 && top.launches === 1, JSON.stringify(top));
  const p = await (await until(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    return d.mode === 'play' && d.ball.x < 4.5 && { mode: d.mode, x: d.ball.x };
  }, 15000)).jsonValue();
  check('the launched ball leaves the shooter lane into play', p.mode === 'play' && p.x < 4.5, JSON.stringify(p));

  // A weak plunge falls back to the plunger and can be relaunched.
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.resetBall());
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.setTimeScale(1));
  await plunge(page, until, 0.05);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.setTimeScale(3));
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.stats.launches === 2, 5000);
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'plunger' && Math.abs(window.__THREE_GAME_DIAGNOSTICS__.ball.vy) < 0.5 && window.__THREE_GAME_DIAGNOSTICS__.simTime > 0, 15000);
  const back = await state((d) => ({ mode: d.mode, x: d.ball.x, y: d.ball.y }));
  check('a weak plunge rolls back onto the plunger', back.mode === 'plunger' && back.y < -8.3, JSON.stringify(back));
  metric('fullPlungeTopY', top.y);
}
