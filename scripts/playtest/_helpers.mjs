// Shared helpers for sections.
export async function startRide(page, until) {
    await page.keyboard.press('Enter');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.ui === 'play', 10000);
}

/** Poll a condition while repeatedly doing an action (e.g. tapping Space). */
export async function repeatUntil(page, predicate, action, timeoutMs = 30000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        if (await page.evaluate(predicate)) return true;
        await action();
        try {
            await page.waitForFunction(predicate, null, { timeout: 400, polling: 'raf' });
            return true;
        } catch {
            // keep trying
        }
    }
    return page.evaluate(predicate);
}
