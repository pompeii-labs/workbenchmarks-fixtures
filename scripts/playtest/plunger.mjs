// Hold Space to charge, release to launch the ball out of the shooter lane.
import { startWithSpace } from './_util.mjs';
export const name = 'plunger';

export default async function ({ page, check, state, until, metric }) {
  await startWithSpace(page, until);
  const pre = await state((d) => ({ x: d.ballPos.x, hint: d.hud.launchHintVisible, charge: d.plungerCharge }));
  check('ball is served on the plunger with a launch hint', pre.x > 4.3 && pre.hint && pre.charge === 0, JSON.stringify(pre));

  await page.keyboard.down('Space');
  await until(() => window.__THREE_GAME_DIAGNOSTICS__.plungerCharge > 0.95, 8000);
  check('holding Space charges the plunger', true);
  await page.keyboard.up('Space');
  await until(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    return d.ballPos.x < 4.0 && d.ballPos.y > 12;
  }, 10000);
  const after = await state((d) => ({ pos: d.ballPos, hint: d.hud.launchHintVisible }));
  check('full launch sends the ball around the top into the field', after.pos.x < 4 && !after.hint, JSON.stringify(after));
  metric('launchExit', after.pos);
}
