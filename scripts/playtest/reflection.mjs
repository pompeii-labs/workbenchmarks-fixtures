// Waves reflect off the cup wall: a drop at the centre sends a ring out; the
// circular wall focuses its reflection back on the centre after one round
// trip (2R / c, about 1.1 s). Without a reflecting wall the centre stays flat.
export const name = 'reflection';

export default async function ({ page, check, hooks, metric }) {
    await hooks((h) => h.setState('calm'));
    await page.mouse.move(4, 4);
    await hooks((h) => h.setTimeScale(0.5)); // finer sampling of the echo
    await hooks((h) => h.drop(0, 0, 0.02));
    const samples = [];
    for (;;) {
        const f = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.frame);
        await page.waitForFunction((s) => window.__THREE_GAME_DIAGNOSTICS__.frame > s, f, { polling: 'raf' });
        const d = await page.evaluate(() => {
            const g = window.__THREE_GAME_DIAGNOSTICS__;
            return { t: g.simTime, c: Math.abs(g.centerHeight), idle: g.idle };
        });
        samples.push(d);
        if (d.t > 1.5 || d.idle) break;
    }
    const quiet = Math.max(0, ...samples.filter((s) => s.t > 0.45 && s.t < 0.85).map((s) => s.c));
    const echo = Math.max(0, ...samples.filter((s) => s.t > 0.95 && s.t < 1.3).map((s) => s.c));
    metric('centreQuiet', quiet);
    metric('centreEcho', echo);
    metric('samples', samples.length);
    check('the centre goes quiet after the ring leaves', quiet < 0.0012, `quiet ${quiet}`);
    check('the wall reflection refocuses on the centre', echo > quiet * 3 && echo > 0.0015, `quiet ${quiet} echo ${echo}`);
}
