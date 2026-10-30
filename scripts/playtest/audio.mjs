export const name = 'audio';

// Soundza samples load after the first gesture, the engine switches to the recorded loop,
// and race events play their sounds. Falls back to procedural audio if a file is missing.
export default async function ({ page, check, state, until, metric }) {
    const before = await state((d) => d.audio);
    check('no audio context before a user gesture', before.state === 'none', JSON.stringify(before));

    await page.click('#start-btn');
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.ui === 'play', 10000);
    try {
        await until(() => {
            const a = window.__THREE_GAME_DIAGNOSTICS__.audio;
            return a.loaded + a.failed >= a.total;
        }, 20000);
    } catch {
        // reported below
    }
    const a = await state((d) => d.audio);
    metric('samplesLoaded', a.loaded);
    check('all Soundza samples load and decode', a.loaded === a.total && a.failed === 0, JSON.stringify(a));
    check('audio context runs after the click', a.state === 'running', a.state);
    check('engine uses the recorded loop', a.sampledEngine, JSON.stringify(a));
    check('ocean ambience and music beds start', a.beds, JSON.stringify(a));

    await until(() => window.__THREE_GAME_DIAGNOSTICS__.field.phase === 'racing', 20000);
    const p = await state((d) => d.audio.plays);
    check('countdown beeps and GO play', (p.beep ?? 0) >= 1 && (p.go ?? 0) === 1, JSON.stringify(p));

    await page.keyboard.press('m');
    const muted = await state((d) => d.audio.muted);
    await page.keyboard.press('m');
    const unmuted = await state((d) => !d.audio.muted);
    check('M toggles mute', muted && unmuted);
}
