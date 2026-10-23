import { startRide } from './_helpers.mjs';
import { driveWithKeys } from './_racebot.mjs';
export const name = 'race-lap';

// A one-lap race against the five AI rivals, driven by real keys, to the finish screen.
export default async function ({ page, check, state, until, hooks, metric }) {
    await hooks((h) => h.setRaceLaps(1));
    await startRide(page, until);
    await hooks((h) => { h.setTimeScale(1.5); h.setRenderScale(0.25); });
    const r0 = await page.evaluate(() => ({
        race: window.__THREE_GAME_DIAGNOSTICS__.race,
        field: window.__THREE_GAME_DIAGNOSTICS__.field,
        countdown: document.querySelector('#countdown').textContent,
        pos: document.querySelector('#pos-place').textContent,
    }));
    check('race opens on a countdown with 6 skis on the grid', r0.field.phase === 'countdown' && r0.field.racers === 6 && /^[123]$/.test(r0.countdown), JSON.stringify({ ...r0.field, rivals: undefined, cd: r0.countdown }));
    check('lap clock waits for the start line', !r0.race.started && r0.race.clock === 0, JSON.stringify(r0.race));
    check('HUD shows race position', /^[1-6](st|nd|rd|th)$/.test(r0.pos), r0.pos);

    // Throttle is locked during the countdown.
    await page.keyboard.down('KeyW');
    const held = await state((d) => ({ phase: d.field.phase, speed: d.sim.speed }));
    check('W during countdown does not move the ski', held.phase !== 'countdown' || held.speed < 1, JSON.stringify(held));
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.field.phase === 'racing', 15000);
    await page.keyboard.up('KeyW');

    const posSeen = new Set();
    const ok = await driveWithKeys(page, () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        (window.__posSeen ||= new Set()).add(d.field.position);
        if (d.field.clock > 1 && d.field.clock < 4 && d.field.rivals.every((r) => r.speed > 10)) window.__launched = true;
        window.__trace ||= [];
        if (!window.__traceT || d.sim.t > window.__traceT + 3) {
            window.__traceT = d.sim.t;
            window.__trace.push(`${d.sim.t.toFixed(0)}:${d.sim.x.toFixed(0)},${d.sim.z.toFixed(0)} g${d.race.nextGate} s${d.race.steerHint.toFixed(1)} v${d.sim.speed.toFixed(0)}`);
        }
        return d.field.finished;
    }, 170000);
    const seen = await page.evaluate(() => [...(window.__posSeen || [])]);
    seen.forEach((p) => posSeen.add(p));
    check('rivals launch off the grid after GO', await page.evaluate(() => window.__launched === true));
    metric('positionsHeld', [...posSeen].sort().join(','));
    if (!ok) metric('botTrace', await page.evaluate(() => window.__trace.join(' | ')));
    metric('botEndState', await state((d) => `t=${d.sim.t.toFixed(1)} x=${d.sim.x.toFixed(0)} z=${d.sim.z.toFixed(0)} ng=${d.race.nextGate} laps=${d.race.laps} fin=${d.field.finished} ui=${d.ui}`));
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.field.finishVisible, 15000);
    const r1 = await page.evaluate(() => ({
        race: window.__THREE_GAME_DIAGNOSTICS__.race,
        field: window.__THREE_GAME_DIAGNOSTICS__.field,
        ui: window.__THREE_GAME_DIAGNOSTICS__.ui,
        place: document.querySelector('#finish-place').textContent,
        rows: [...document.querySelectorAll('#finish-rows li')].map((li) => li.textContent),
        overlay: !document.querySelector('#finish').classList.contains('hidden'),
    }));
    metric('botRaceSeconds', r1.field.finishTime);
    metric('botFinishPlace', r1.field.position);
    check('keyboard bot finishes the race through every gate', ok && r1.race.laps === 1 && r1.race.gatesPassed >= r1.race.gates - 1, JSON.stringify(r1.race));
    check('finish screen shows place and 6 standings rows', r1.overlay && r1.ui === 'finished' && r1.place === ['1st', '2nd', '3rd', '4th', '5th', '6th'][r1.field.position - 1] && r1.rows.length === 6, JSON.stringify({ place: r1.place, rows: r1.rows }));
    check('my row is in the standings at my place', r1.rows[r1.field.position - 1].includes('YOU'), JSON.stringify(r1.rows));
    check('race time is plausible (30-200 s) and becomes best lap', r1.field.finishTime > 30 && r1.field.finishTime < 200 && r1.race.bestLap > 0, JSON.stringify({ t: r1.field.finishTime, best: r1.race.bestLap }));

    // Rivals follow the course: they all finish the lap and take ramps on the way.
    await hooks((h) => h.setTimeScale(3));
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.field.rivals.every((r) => r.finished), 120000);
    const f = await page.evaluate(() => ({
        field: window.__THREE_GAME_DIAGNOSTICS__.field,
        rows: [...document.querySelectorAll('#finish-rows li')].map((li) => li.textContent),
    }));
    const rv = f.field.rivals;
    metric('rivalRampJumps', rv.map((r) => r.rampJumps).join(','));
    metric('bumpsPlayerRival', f.field.bumpsPlayerRival);
    metric('bumpsRivalRival', f.field.bumpsRivalRival);
    check('every rival completes the lap through all gates', rv.every((r) => r.finished && r.laps >= 1 && r.gatesPassed >= 7), JSON.stringify(rv.map((r) => [r.name, r.laps, r.gatesPassed])));
    check('rivals take the ramps (each at least one ramp jump)', rv.every((r) => r.rampJumps >= 1), JSON.stringify(rv.map((r) => [r.name, r.rampJumps])));
    check('finish table updates with rival times', f.rows.every((t) => /\d:\d\d\.\d\d|\+\d+\.\d\ds/.test(t)), JSON.stringify(f.rows));
    check('the pack bumped into each other during the race', f.field.bumpsRivalRival > 0, String(f.field.bumpsRivalRival));

    // R from the finish screen starts a new race (keeps the best lap).
    await page.keyboard.press('KeyR');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.field.phase === 'countdown' && window.__THREE_GAME_DIAGNOSTICS__.ui === 'play', 5000);
    const r2 = await page.evaluate(() => ({
        race: window.__THREE_GAME_DIAGNOSTICS__.race,
        overlay: document.querySelector('#finish').classList.contains('hidden'),
        bestText: document.querySelector('#best-lap').textContent,
    }));
    check('R restarts on the grid, finish screen closed, best lap kept', r2.overlay && r2.race.laps === 0 && r2.race.bestLap === r1.race.bestLap, JSON.stringify(r2));
}
