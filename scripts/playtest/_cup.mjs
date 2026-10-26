// Shared helpers: drive the real pointer across the cup. Points are in cup
// space (radius 1, y toward the camera) and projected to the screen by the
// page's own camera, so paths stay on the liquid at any viewport.

export async function toScreen(hooks, x, y) {
    return hooks((h, a, b) => h.projectToScreen(a, b), x, y);
}

/** Wait until the page has rendered/updated at least one more frame. */
export async function nextFrame(page) {
    const f = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.frame);
    await page.waitForFunction((start) => window.__THREE_GAME_DIAGNOSTICS__.frame > start, f, { polling: 'raf', timeout: 15000 });
}

/**
 * Move the mouse along a straight cup-space line in `moves` pointer events,
 * one per game frame. Few moves = fast swipe, many = slow drag. Returns the
 * peak surface height and cursor speed seen while moving.
 */
export async function mouseStroke(page, hooks, from, to, moves) {
    let peakH = 0;
    let peakSpeed = 0;
    const a = await toScreen(hooks, from[0], from[1]);
    await page.mouse.move(a.x, a.y);
    await nextFrame(page);
    for (let i = 1; i <= moves; i++) {
        const t = i / moves;
        const p = await toScreen(hooks, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t);
        await page.mouse.move(p.x, p.y);
        await nextFrame(page);
        const d = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
        peakH = Math.max(peakH, d.maxHeight);
        peakSpeed = Math.max(peakSpeed, d.peakCursorSpeed);
    }
    return { peakH, peakSpeed };
}

/** Park the mouse off the cup (top-left corner of the table). */
export async function parkMouse(page) {
    await page.mouse.move(4, 4);
    await nextFrame(page);
}

/** Track the peak height until `simSeconds` of simulation pass. */
export async function peakOver(page, simSeconds) {
    const start = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.simTime);
    let peak = 0;
    for (;;) {
        await nextFrame(page);
        const d = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
        peak = Math.max(peak, d.maxHeight);
        if (d.simTime - start >= simSeconds || d.idle) return peak;
    }
}

export async function resetCalm(page, hooks) {
    await hooks((h) => h.setState('calm'));
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.idle && window.__THREE_GAME_DIAGNOSTICS__.maxHeight === 0, null, { timeout: 15000 });
}
