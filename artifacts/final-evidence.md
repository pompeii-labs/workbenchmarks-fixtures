# Final evidence: AI rivals update

- Gate: `tgcheck` pass-27 PASS with 17 captures, inside the render budget. With the full pack on screen: 135 draw calls, 167k triangles, 125 geometries, 4 textures. The full playtest passed 11/11 sections on this source (batched gates, last one pass-26).
- Screenshots (artifacts/pass-27/):
  - desktop-countdown.png, mobile-countdown.png: the grid, the "2" countdown, place badge and standings.
  - desktop-pack-ramp.png: a rival airborne off ramp 1 ahead of the player.
  - desktop-bump.png: the player in contact with a rival, with spray.
  - desktop-race-finish.png, mobile-race-finish.png: the finish screen with place, race time, best lap, six standings rows and Race again.
  - The existing states (active-play, ramp-jump, hairpin, lap-complete, big-air, wipeout, title, paused) now all show rivals.
- Scripted play with real keys:
  - race-lap: a 1-lap race from countdown to finish. Throttle stays locked during the countdown and the rivals launch after GO. The finish screen shows the correct place and my row. All 5 rivals finished through every gate and each took 2 to 4 ramp jumps. Rivals bumped each other. R restarts on the grid and keeps the best lap.
  - bumps: me ramming a parked rival pushes it from 0 to over 5 m/s and I lose over 4 m/s. Momentum along the contact normal is conserved (to 0.05). A rival hitting a rival exchanges momentum the same way.
- Headless: `bun scripts/race-sim.ts 1 3` runs a 3-lap race. All 6 finish within about 5 s of each other, with 6 to 7 ramp jumps each and 30 or more contacts.
- Production bundle: a grep of dist/ for the hook and diagnostics names finds 0 matches. Asset paths are relative.
- Not verified: real-GPU frame rate, audio output, real touch hardware. The keyboard test bot is slow here (~114 s for 1 lap at ~4 fps software rendering), so it does not tell you how competitive the rivals are against a human.
