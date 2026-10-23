// Keyboard race bot: reads the game's course-steering hint and holds real
// A/D/W/S keys. All movement goes through real key events.
export async function driveWithKeys(page, done, timeoutMs) {
    const held = new Set();
    const set = async (key, on) => {
        if (on && !held.has(key)) {
            await page.keyboard.down(key);
            held.add(key);
        } else if (!on && held.has(key)) {
            await page.keyboard.up(key);
            held.delete(key);
        }
    };
    const end = Date.now() + timeoutMs;
    let ok = false;
    while (Date.now() < end) {
        const d = await page.evaluate((src) => {
            const g = window.__THREE_GAME_DIAGNOSTICS__;
            // eslint-disable-next-line no-new-func
            return { steer: g.race.steerHint, thr: g.race.throttleHint, air: g.sim.airborne, speed: g.sim.speed, done: new Function(`return (${src})()`)() };
        }, done.toString());
        if (d.done) {
            ok = true;
            break;
        }
        // Hands off in the air: A/D there spins the ski.
        await set('KeyD', !d.air && d.steer > 0.25);
        await set('KeyA', !d.air && d.steer < -0.25);
        await set('KeyW', d.thr > 0.3);
        // Brake only while fast: a slow poll loop holding S would stop the ski dead.
        await set('KeyS', d.thr < -0.2 && d.speed > 13);
        await page.waitForTimeout(15);
    }
    for (const k of [...held]) await set(k, false);
    return ok;
}
