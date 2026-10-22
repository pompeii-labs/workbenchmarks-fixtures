// Shared helpers for playtest sections.
export const D = () => window.__THREE_GAME_DIAGNOSTICS__;

export async function startGame(page, until) {
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'title', 10000);
  await page.keyboard.press('Space');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'plunger', 10000);
  // The start key must be seen released before the plunger charges (by design); let a few frames pass.
  const f = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.frame);
  await until((start) => window.__THREE_GAME_DIAGNOSTICS__.frame >= start + 3, 10000, f);
}

/** Hold Space until the plunger reaches `charge`, then release. */
export async function plunge(page, until, charge = 1) {
  await page.keyboard.down('Space');
  await until((c) => window.__THREE_GAME_DIAGNOSTICS__.plunger.charge >= c, 20000, charge);
  await page.keyboard.up('Space');
}
