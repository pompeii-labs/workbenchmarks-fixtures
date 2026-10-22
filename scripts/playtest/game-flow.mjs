// Three balls per game, game over, high score saved and kept after reload, retry.
import { startWithSpace } from './_util.mjs';
export const name = 'game-flow';

export default async function ({ page, check, state, until, hooks }) {
  await hooks((h) => h.clearHighScore());
  await startWithSpace(page, until);
  const t = await hooks((h) => h.tableInfo());
  const b = t.bumpers[2];
  for (let ball = 1; ball <= 3; ball++) {
    await until((n) => window.__THREE_GAME_DIAGNOSTICS__.ball === n && window.__THREE_GAME_DIAGNOSTICS__.mode === 'play', 8000, ball);
    const hud = await state((d) => d.hud.ball);
    check(`HUD shows ball ${ball}/3`, hud === `${ball}/3`, hud);
    // Score once, then drop the ball straight down the drain gap.
    const hits = await state((d) => d.bumperHits);
    await hooks((h, x, y) => h.placeBall(x, y, 0, -6), b.x, b.y + 1.3);
    await until((n) => window.__THREE_GAME_DIAGNOSTICS__.bumperHits > n, 5000, hits);
    await hooks((h, x) => h.placeBall(x, 1.2, 0, -12), (t.flippers[0].px + t.flippers[1].px) / 2);
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode !== 'play', 5000);
    check(`ball ${ball} drains between the flippers`, true);
  }
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'gameover', 8000);
  const over = await state((d) => ({ score: d.score, high: d.highScore, stored: d.storedHigh, overlay: d.hud.overVisible, newHigh: d.newHigh }));
  check('game over after the third ball', over.overlay, JSON.stringify(over));
  check('new high score is recorded and saved', over.newHigh && over.high === over.score && over.stored === over.score && over.score > 0, JSON.stringify(over));

  await until(() => window.__THREE_GAME_DIAGNOSTICS__.modeAge > 1, 8000);
  await page.keyboard.down('Space');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'play', 8000);
  await page.keyboard.up('Space');
  const again = await state((d) => ({ ball: d.ball, score: d.score, high: d.highScore }));
  check('Space restarts at ball 1 with score 0 and the high kept', again.ball === 1 && again.score === 0 && again.high === over.score, JSON.stringify(again));

  await page.reload();
  await until(() => window.__THREE_GAME_DIAGNOSTICS__?.mode === 'title', 15000);
  const reload = await state((d) => ({ high: d.highScore, hud: d.hud.high }));
  check('high score survives a reload', reload.high === over.score && reload.hud === over.score.toLocaleString('en-US'), JSON.stringify(reload));
}
