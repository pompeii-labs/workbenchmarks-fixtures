// Cursor speed is the force: a slow drag leaves a gentle wake, a fast swipe a
// strong wave. Same path, same game, only the pointer speed differs.
import { mouseStroke, parkMouse, peakOver, resetCalm } from './_cup.mjs';

export const name = 'force';

export default async function ({ page, check, hooks, metric }) {
    await parkMouse(page);
    await resetCalm(page, hooks);
    const slow = await mouseStroke(page, hooks, [-0.6, 0.1], [0.6, 0.1], 20);
    await parkMouse(page);
    const slowPeak = Math.max(slow.peakH, await peakOver(page, 0.6));

    await resetCalm(page, hooks);
    const fast = await mouseStroke(page, hooks, [-0.6, 0.1], [0.6, 0.1], 3);
    await parkMouse(page);
    const fastPeak = Math.max(fast.peakH, await peakOver(page, 0.6));

    metric('slowPeakHeight', slowPeak);
    metric('fastPeakHeight', fastPeak);
    metric('slowCursorSpeed', slow.peakSpeed);
    metric('fastCursorSpeed', fast.peakSpeed);
    check('a slow drag over the cup disturbs the liquid', slowPeak > 0.0005, `peak ${slowPeak}`);
    check('the fast swipe is measured as faster', fast.peakSpeed > slow.peakSpeed * 3, `${slow.peakSpeed} vs ${fast.peakSpeed}`);
    check('a fast swipe throws a much stronger wave than a slow drag', fastPeak > slowPeak * 3, `slow ${slowPeak} fast ${fastPeak}`);
    const crema = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.maxCrema);
    metric('cremaDisplacement', crema);
    check('the crema is carried by the motion', crema > 0.05, `max crema displacement ${crema}`);
}
