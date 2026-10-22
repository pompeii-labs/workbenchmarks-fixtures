// Shared helpers for playtest sections.
export async function startWithSpace(page, until) {
  await until(() => window.__THREE_GAME_DIAGNOSTICS__?.mode === 'title', 10000);
  await page.keyboard.down('Space');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'play', 10000);
  await page.keyboard.up('Space');
}
