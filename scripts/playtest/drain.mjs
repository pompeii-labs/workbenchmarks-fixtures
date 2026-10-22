import { plunge, startGame } from './_util.mjs';
export const name = 'drain';

export default async function ({ page, check, state, until, hooks }) {
  await page.evaluate(() => localStorage.removeItem('neon-orbit-best'));
  await startGame(page, until);
  // Ball save: launch for real, then drain at once.
  await plunge(page, until, 0.97);
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'play', 15000);
  await hooks((h) => h.placeBall(0, -8.6, 0, -4));
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'plunger', 10000);
  const saved = await state((d) => ({ balls: d.ballsLeft, mode: d.mode }));
  check('an instant drain is ball-saved once', saved.balls === 3 && saved.mode === 'plunger', JSON.stringify(saved));

  // Real drain through the center gap between the flippers.
  await hooks((h) => h.placeBall(0, -7.0, 0, -2));
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'drain', 10000);
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'plunger', 10000);
  const b2 = await state((d) => ({ balls: d.ballsLeft, n: d.ballNumber }));
  check('a drain costs a ball and serves ball 2', b2.balls === 2 && b2.n === 2, JSON.stringify(b2));

  // Score something, then lose the last ball.
  await hooks((h) => h.placeBall(-1.45, 2.4, 0, 9));
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.score > 0, 10000);
  await hooks((h) => h.setBallsLeft(1));
  await hooks((h) => h.placeBall(0, -8.6, 0, -4));
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'over', 15000);
  const over = await state((d) => ({ overlay: d.overlay, score: d.score, best: d.best, newBest: d.newBest }));
  const dom = await page.evaluate(() => ({
    final: document.querySelector('#final-score').textContent,
    badge: getComputedStyle(document.querySelector('#new-best')).display,
    stored: localStorage.getItem('neon-orbit-best'),
  }));
  check('losing the last ball shows the game over screen', over.overlay === 'over', JSON.stringify(over));
  check('game over shows the final score', dom.final === over.score.toLocaleString('en-US'), JSON.stringify(dom));
  check('a new best is flagged and saved', over.newBest && over.best === over.score && dom.badge !== 'none' && Number(dom.stored) === over.score, JSON.stringify({ over, dom }));

  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'over' && window.__THREE_GAME_DIAGNOSTICS__.simTime > 0, 1000);
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'plunger', 10000);
  const again = await state((d) => ({ score: d.score, balls: d.ballsLeft, best: d.best }));
  check('Space restarts a fresh game, best kept', again.score === 0 && again.balls === 3 && again.best === over.best, JSON.stringify(again));

  await page.reload();
  await until(() => window.__THREE_GAME_DIAGNOSTICS__ && window.__THREE_GAME_DIAGNOSTICS__.mode === 'title', 20000);
  const persisted = await state((d) => d.best);
  check('high score survives a reload', persisted === over.best, `${persisted} vs ${over.best}`);
}
