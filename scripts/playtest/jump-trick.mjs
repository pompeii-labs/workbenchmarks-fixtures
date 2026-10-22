import { startGame, diveAndLaunch } from './_util.mjs';
export const name = 'jump-trick';

export default async function ({ page, check, state, until, metric, hooks }) {
    // Real-time sim so per-frame key timing is precise enough to stop at one flip.
    await hooks((h) => h.setTimeScale(1));
    await startGame(page, until);
    await diveAndLaunch(page, until);
    const air = await state((d) => ({ jumps: d.jumps, airborne: d.dolphin.airborne }));
    check('diving then pulling up launches the dolphin', air.airborne && air.jumps === 1, JSON.stringify(air));
    // Keep W held: in the air it rotates the dolphin into a backflip.
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.dolphin.flip > 5.3 || !window.__THREE_GAME_DIAGNOSTICS__.dolphin.airborne, 20000);
    await page.keyboard.up('KeyW');
    const mid = await state((d) => ({ flip: d.dolphin.flip, airborne: d.dolphin.airborne, hud: document.querySelector('#air').classList.contains('show') }));
    check('holding W in the air flips the dolphin and the air meter shows', mid.flip > 5.3 && mid.hud, JSON.stringify(mid));
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.lastLanding !== null, 20000);
    const res = await state((d) => ({ landing: d.lastLanding, score: d.score, chain: d.chain, popup: document.querySelector('#popup').textContent }));
    metric('landing', res.landing);
    check('the backflip is recognised on landing', res.landing.tricks.includes('Backflip'), JSON.stringify(res.landing.tricks));
    check('a released near-full flip lands cleanly', res.landing.quality === 'Silky' || res.landing.quality === 'Clean', res.landing.quality);
    check('score = (100+400) × height × landing multipliers', res.score === res.landing.points && res.score >= Math.round(500 * res.landing.heightMult * res.landing.landingMult / 10) * 10 - 10, JSON.stringify(res));
    check('height multiplier exceeds 1', res.landing.heightMult > 1, String(res.landing.heightMult));
    check('chain grows after a clean trick', res.chain > 1, String(res.chain));
    check('landing popup shows the points', res.popup.includes('Backflip') && res.popup.includes('+'), res.popup);
}
