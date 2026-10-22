import { startGame } from './_util.mjs';
export const name = 'flippers';

export default async function ({ page, check, state, until, hooks, metric }) {
  await startGame(page, until);
  const rest = await state((d) => d.flippers.map((f) => f.angle));
  await page.keyboard.down('KeyZ');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.flippers[0].angle > 0.4, 5000);
  const lUp = await state((d) => d.flippers.map((f) => f.angle));
  check('Z raises only the left flipper', lUp[0] > rest[0] + 0.8 && lUp[1] === rest[1], JSON.stringify({ rest, lUp }));
  await page.keyboard.up('KeyZ');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.flippers[0].angle < -0.5, 5000);
  check('releasing Z drops the left flipper back', true);
  await page.keyboard.down('Slash');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.flippers[1].angle > 0.4, 5000);
  const rUp = await state((d) => d.flippers.map((f) => f.angle));
  check('/ raises only the right flipper', rUp[1] > rest[1] + 0.8 && rUp[0] < -0.5, JSON.stringify(rUp));
  await page.keyboard.up('Slash');
  await page.keyboard.down('ArrowLeft');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.flippers[0].held, 5000);
  check('arrow keys also flip', true);
  await page.keyboard.up('ArrowLeft');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.flippers[0].angle < -0.5, 5000);

  // Drop a ball onto the resting left flipper, then hit it with a real keypress.
  // Slow game time so key latency does not decide whether the shot connects.
  await hooks((h) => h.setTimeScale(0.25));
  await hooks((h) => h.placeBall(-1.3, -6.6, 0, 0));
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.ball.y < -6.9, 10000);
  await page.keyboard.down('KeyZ');
  const shot = await (await until(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    return (d.ball.vy > 10 || d.ball.y < -10) && { vy: d.ball.vy, vx: d.ball.vx, y: d.ball.y };
  }, 15000)).jsonValue();
  await page.keyboard.up('KeyZ');
  check('the left flipper shoots the ball up the table', shot.vy > 10, JSON.stringify(shot));
  check('the left flipper sends the ball toward the right/center', shot.vx > -3, JSON.stringify(shot));
  metric('leftShotSpeed', Math.hypot(shot.vx, shot.vy));

  await hooks((h) => h.placeBall(1.3, -6.6, 0, 0));
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.ball.y < -6.9, 10000);
  await page.keyboard.down('Slash');
  const shot2 = await (await until(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    return (d.ball.vy > 10 || d.ball.y < -10) && { vy: d.ball.vy, vx: d.ball.vx };
  }, 15000)).jsonValue();
  await page.keyboard.up('Slash');
  check('the right flipper shoots the ball up the table, toward the left/center', shot2.vy > 10 && shot2.vx < 3, JSON.stringify(shot2));

  await hooks((h) => h.setTimeScale(3));
  // Cradle: hold the flipper up and the ball settles on it rather than draining.
  await page.keyboard.down('KeyZ');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.flippers[0].angle > 0.4, 5000);
  await hooks((h) => h.placeBall(-1.6, -6.0, 0, 0));
  await until(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    return Math.hypot(d.ball.vx, d.ball.vy) < 0.3 || d.ball.y < -10;
  }, 15000);
  const cradle = await state((d) => ({ x: d.ball.x, y: d.ball.y, mode: d.mode }));
  await page.keyboard.up('KeyZ');
  check('a held flipper cradles the ball', cradle.y > -8 && cradle.mode === 'play', JSON.stringify(cradle));
}
