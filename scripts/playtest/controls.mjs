// Flippers respond to real keys, move the right way, and hit the ball hard.
import { startWithSpace } from './_util.mjs';
export const name = 'controls';

export default async function ({ page, check, state, until, hooks }) {
  await startWithSpace(page, until);
  const rest = await state((d) => d.flipperAngle);
  check('flippers rest down', rest[0] < -0.3 && rest[1] < -0.3, JSON.stringify(rest));

  for (const [key, i] of [['KeyZ', 0], ['ArrowLeft', 0], ['Slash', 1], ['ArrowRight', 1]]) {
    await page.keyboard.down(key);
    await until((idx) => window.__THREE_GAME_DIAGNOSTICS__.flipperAngle[idx] > 0.5, 5000, i);
    const other = await state((d) => d.flipperAngle);
    check(`${key} raises flipper ${i} only`, other[1 - i] < -0.3, JSON.stringify(other));
    await page.keyboard.up(key);
    await until((idx) => window.__THREE_GAME_DIAGNOSTICS__.flipperAngle[idx] < -0.4, 5000, i);
    check(`${key} release drops flipper ${i}`, true);
  }

  // Cradle and fire: hold the left flipper, let the ball settle against it,
  // drop the flipper so the ball rolls out, then flip. Real time here so the
  // press lands while the ball is still on the flipper.
  await hooks((h) => h.setTimeScale(1));
  const info = await hooks((h) => h.tableInfo());
  const f = info.flippers[0];
  await page.keyboard.down('KeyZ');
  await hooks((h, x, y) => h.placeBall(x, y, 0, 0), f.px + 1.2, f.py + 1.4);
  await until(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    return Math.hypot(d.ballVel.x, d.ballVel.y) < 0.3;
  }, 8000);
  const cradle = await state((d) => d.ballPos);
  check('a held flipper cradles the ball', Math.abs(cradle.x - f.px) < 0.6 && cradle.y > f.py, JSON.stringify(cradle));
  await page.keyboard.up('KeyZ');
  await until((px) => window.__THREE_GAME_DIAGNOSTICS__.ballPos.x > px + 0.5, 5000, f.px);
  await page.keyboard.down('KeyZ');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.ballPos.y > 8 || window.__THREE_GAME_DIAGNOSTICS__.mode !== 'play', 8000);
  const shot = await state((d) => ({ pos: d.ballPos, mode: d.mode }));
  check('a flip fires the ball up the table', shot.pos.y > 8 && shot.mode === 'play', JSON.stringify(shot));
  await page.keyboard.up('KeyZ');
  await hooks((h) => h.setTimeScale(3));

  // Pause freezes the ball and shows the overlay; P resumes.
  await page.keyboard.press('KeyP');
  const p1 = await state((d) => ({ paused: d.paused, pos: d.ballPos, overlay: d.hud.pauseVisible }));
  await page.waitForTimeout(300);
  const p2 = await state((d) => d.ballPos);
  check('P pauses with overlay and frozen ball', p1.paused && p1.overlay && p1.pos.y === p2.y, JSON.stringify([p1, p2]));
  await page.keyboard.press('KeyP');
  await until(() => !window.__THREE_GAME_DIAGNOSTICS__.paused && !window.__THREE_GAME_DIAGNOSTICS__.hud.pauseVisible, 3000);
  check('P resumes', true);
}
