// Shared helpers for pinball playtest sections.
export const diag = () => window.__THREE_GAME_DIAGNOSTICS__;

export async function startGame(page, until) {
    await page.keyboard.press('Space');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'play', 10000);
}

/** Hold the plunger until the charge reaches `charge`, then release. */
export async function launch(page, until, charge = 0.6) {
    await until(() => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d.ballState.inLane && Math.abs(d.ballState.vy) < 0.05;
    }, 10000);
    await page.keyboard.down('Space');
    await until((c) => window.__THREE_GAME_DIAGNOSTICS__.plungerCharge >= c, 10000, charge);
    await page.keyboard.up('Space');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.launches >= 1, 10000);
}

/** Setup only: place the ball once a ball is live (a drain pauses placement). */
export async function placeBall(hooks, until, x, y, vx, vy) {
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'play', 10000);
    await hooks((h, a) => h.placeBall(...a), [x, y, vx, vy]);
}
