import { startGame } from './_util.mjs';
export const name = 'pause';

export default async function ({ page, check, state, until, hooks }) {
  await startGame(page, until);
  await hooks((h) => h.placeBall(-3, 6, 2, 0));
  await page.keyboard.press('KeyP');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.paused, 5000);
  const a = await state((d) => ({ y: d.ball.y, t: d.simTime, overlay: d.overlay }));
  await page.waitForTimeout(400);
  const b = await state((d) => ({ y: d.ball.y, t: d.simTime }));
  check('P pauses: overlay shown, simulation frozen', a.overlay === 'paused' && a.t === b.t && a.y === b.y, JSON.stringify({ a, b }));
  await page.keyboard.press('KeyP');
  await until((t) => window.__THREE_GAME_DIAGNOSTICS__.simTime > t, 5000, b.t);
  const c = await state((d) => ({ paused: d.paused, overlay: d.overlay }));
  check('P resumes play', !c.paused && c.overlay === 'none', JSON.stringify(c));
}
