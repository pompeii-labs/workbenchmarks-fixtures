// Three drains end the game; the high score persists; Space restarts.
export const name = 'drain-gameover';

export default async function ({ page, check, state, until, hooks }) {
    await hooks((h) => h.clearHighScore());
    await page.keyboard.press('Space');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'play', 10000);
    // Score something real first: roll into a bumper.
    await hooks((h) => h.placeBall(0, 0.6, 0, 6));
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.bumperHits > 0, 5000);
    for (let ball = 1; ball <= 3; ball++) {
        // Setup: drop the ball between the flippers; the save is not armed without a launch.
        await hooks((h) => h.placeBall(0, -9.4, 0, -6));
        await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'drained', 5000);
        const msg = await state(() => document.querySelector('#message').textContent);
        check(`ball ${ball} drains with a message`, /BALL LOST/.test(msg), msg);
        if (ball < 3) {
            await until((b) => window.__THREE_GAME_DIAGNOSTICS__.mode === 'play' && window.__THREE_GAME_DIAGNOSTICS__.ball === b + 1, 8000, ball);
            const s = await state((d) => ({ ball: d.ball, left: d.ballsLeft, inLane: d.ballState.inLane, pips: document.querySelectorAll('#ball-pips i.used').length }));
            check(`ball ${ball + 1} is served to the plunger`, s.left === 3 - ball && s.inLane && s.pips === ball, JSON.stringify(s));
        }
    }
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'gameover', 8000);
    const over = await state((d) => ({ score: d.score, high: d.highScore, stored: Number(localStorage.getItem('neon-pinball-highscore')), overlay: !document.querySelector('#overlay-gameover').classList.contains('hidden'), badge: !document.querySelector('#new-high').classList.contains('hidden'), final: document.querySelector('#final-score').textContent }));
    check('game over after the third ball, showing the final score', over.overlay && over.final === over.score.toLocaleString('en-US') && over.score >= 100, JSON.stringify(over));
    check('a new high score is flagged and saved to localStorage', over.badge && over.high === over.score && over.stored === over.score, JSON.stringify(over));

    // Flipper mashing right at game over must not skip the result screen.
    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(50);
    check('game over ignores an instant restart press', (await state((d) => d.mode)) === 'gameover');

    await page.reload();
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__ && window.__THREE_GAME_DIAGNOSTICS__.frame > 2);
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.setTimeScale(3));
    const persisted = await state((d) => ({ high: d.highScore, title: document.querySelector('#title-high').textContent, hud: document.querySelector('#high-value').textContent }));
    check('the high score survives a reload', persisted.high === over.score && persisted.title === over.score.toLocaleString('en-US') && persisted.hud === persisted.title, JSON.stringify(persisted));

    await page.keyboard.press('Space');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.mode === 'play', 5000);
    const fresh = await state((d) => ({ score: d.score, ball: d.ball, left: d.ballsLeft, high: d.highScore }));
    check('a new game starts fresh and keeps the high score', fresh.score === 0 && fresh.ball === 1 && fresh.left === 3 && fresh.high === over.score, JSON.stringify(fresh));
}
