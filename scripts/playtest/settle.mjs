// When the cursor stops, the surface settles to calm within a few seconds of
// simulated time (the sim snaps to exact rest once below visibility).
import { mouseStroke, parkMouse, resetCalm } from './_cup.mjs';

export const name = 'settle';

export default async function ({ page, check, hooks, metric, until }) {
    await parkMouse(page);
    await resetCalm(page, hooks);
    await mouseStroke(page, hooks, [-0.7, -0.2], [0.6, 0.3], 5);
    // Cursor stays still on the cup: stopping, not leaving, is what settles.
    const start = await page.evaluate(() => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return { t: d.simTime, rms: d.rmsHeight };
    });
    // Find when rms falls under 5% of its value when the cursor stopped.
    await until((s) => window.__THREE_GAME_DIAGNOSTICS__.rmsHeight < s.rms * 0.05, 60000, start);
    const at5 = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.simTime);
    metric('settleTo5PercentSimSeconds', at5 - start.t);
    check('waves settle to 5% within 5 s after the cursor stops', at5 - start.t < 5, `${(at5 - start.t).toFixed(2)} s`);
    await parkMouse(page);
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.idle, 60000);
    const end = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.simTime);
    metric('fullRestSimSeconds', end - start.t);
    check('the surface comes to full rest (sim idles)', true, `${(end - start.t).toFixed(2)} s`);
}
