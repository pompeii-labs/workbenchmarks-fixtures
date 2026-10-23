import { startRide } from './_helpers.mjs';
import { driveWithKeys } from './_racebot.mjs';
export const name = 'race-lap';

export default async function ({ page, check, state, until, hooks, metric }) {
    await startRide(page, until);
    // The bot steers with real keys from a hint it polls; lower game speed keeps its reaction time realistic.
    await hooks((h) => h.setTimeScale(1.5));
    const r0 = await state((d) => d.race);
    check('lap clock waits for the start line', !r0.started && r0.clock === 0 && r0.message === 'start', JSON.stringify(r0));

    const ok = await driveWithKeys(page, () => window.__THREE_GAME_DIAGNOSTICS__.race.laps >= 1, 180000);
    const r1 = await page.evaluate(() => ({
        race: window.__THREE_GAME_DIAGNOSTICS__.race,
        bestText: document.querySelector('#best-lap').textContent,
        lastText: document.querySelector('#last-lap').textContent,
        banner: !document.querySelector('#lap-banner').classList.contains('hidden'),
        bannerTitle: document.querySelector('#lap-banner-title').textContent,
    }));
    metric('botLapSeconds', r1.race.lastLap);
    check('keyboard bot completes a full lap through every gate', ok && r1.race.laps === 1 && r1.race.gatesPassed >= r1.race.gates - 1, JSON.stringify(r1.race));
    check('lap time is plausible (30-200 s)', r1.race.lastLap > 30 && r1.race.lastLap < 200, String(r1.race.lastLap));
    check('first lap becomes best lap', r1.race.bestLap > 0 && Math.abs(r1.race.bestLap - r1.race.lastLap) < 1e-6 && r1.race.storedBest === r1.race.bestLap, JSON.stringify(r1.race));
    const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60 < 10 ? '0' : '') + (t % 60).toFixed(2)}`;
    check('HUD shows best and last lap', r1.bestText === fmt(r1.race.bestLap) && r1.lastText === fmt(r1.race.lastLap), `${r1.bestText} / ${r1.lastText}`);
    check('NEW BEST LAP banner shows', r1.banner && r1.bannerTitle === 'NEW BEST LAP', JSON.stringify(r1));
    check('next lap clock restarted', r1.race.clock < 10 && r1.race.nextGate === 1, JSON.stringify(r1.race));

    // Restart keeps the best lap.
    await page.keyboard.press('KeyR');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.race.laps === 0 && !window.__THREE_GAME_DIAGNOSTICS__.race.started, 5000);
    const r2 = await page.evaluate(() => ({ race: window.__THREE_GAME_DIAGNOSTICS__.race, bestText: document.querySelector('#best-lap').textContent }));
    check('R restarts the race but keeps the best lap', r2.race.bestLap === r1.race.bestLap && r2.bestText === r1.bestText, JSON.stringify(r2));
}
