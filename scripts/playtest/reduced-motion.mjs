// prefers-reduced-motion: the page composes one still frame and ignores the
// pointer; nothing animates.
import { nextFrame, toScreen } from './_cup.mjs';

export const name = 'reduced-motion';

export default async function ({ page, check, hooks, until }) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await until(() => window.__THREE_GAME_DIAGNOSTICS__.reducedMotion === true, 15000);
    const before = await page.evaluate(() => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return { steps: d.simSteps, renders: d.renders, crema: d.maxCrema, rms: d.rmsHeight };
    });
    check('the still frame shows stirred crema', before.crema > 0.05, `crema ${before.crema}`);
    for (let i = 0; i <= 4; i++) {
        const p = await toScreen(hooks, -0.6 + 0.3 * i, 0);
        await page.mouse.move(p.x, p.y);
        await nextFrame(page);
    }
    for (let i = 0; i < 5; i++) await nextFrame(page);
    const after = await page.evaluate(() => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return { steps: d.simSteps, renders: d.renders };
    });
    check('no simulation runs under reduced motion', after.steps === before.steps, `${before.steps} -> ${after.steps}`);
    check('the still frame is not re-rendered while idle', after.renders === before.renders, `${before.renders} -> ${after.renders}`);
}
