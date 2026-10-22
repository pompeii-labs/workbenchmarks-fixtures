# Final evidence: Neon Pinball

## Built
- Fixed-step (240 Hz, 2 substeps) 2D pinball simulation in `src/sim/` (plain data, one `Command` per step, an event log with ids, a seeded RNG stored in state), separate from the Three.js view in `src/render/`.
- Table: arch top, shooter lane with a one-way gate, 3 pop bumpers (100 x mult, fixed-speed kick, flash, pop sound, camera nudge), 2 slingshots (10), 3 top lanes (50; all three lit = +1x up to 5x and 1000 bonus; flippers rotate the lit lanes), 4 s ball save once per ball, 3 balls, high score in localStorage.
- Everything is procedural: canvas playfield art, extruded flippers and slings, lathe-style bumpers, a tube spring, RoomEnvironment reflections, and bloom. Sounds are synthesized with WebAudio.
- UI: styled inline loading screen, HUD (score, ball pips, multiplier, high score), title, pause (with mute), game over with a NEW HIGH SCORE badge, a touch LAUNCH button, and score popups.
- Static build: `base: './'`. Test hooks are compiled out of `npm run build` (grep for hook names in `dist/assets/*.js` finds 0 matches).

## Gate
- `tgcheck` PASS, run `pass-15`: 9 captures (desktop title/active-play/plunger/late-game/paused/game-over; mobile active-play/plunger/game-over), evidence check passed.
- Full playtest PASS on the final source (7/7 sections, 43 checks): controls, flipper-hit, scoring, ball-save, drain-gameover, pause, mobile.
- Renderer (late-game, desktop): 73 draw calls, 11.8k triangles, 48 geometries, 16 textures.

## Screenshots (opened and reviewed)
- `artifacts/pass-15/desktop-active-play.png`: the lit pink bumper, the chrome ball near the cyan bumper, the raised right flipper.
- `artifacts/pass-15/mobile-plunger.png`: the full table on a phone, the LAUNCH button below the table, chasing lane arrows.
- `artifacts/pass-15/desktop-late-game.png`, `desktop-title.png`, `desktop-paused.png`, `mobile-game-over.png`.

## Played with scripted input
Real key, mouse and touch events: Space start, plunger hold/release, Z, /, and the arrows raise the matching flipper only, flipper shots off a resting ball (vy > 8, speed > 20), bumper hits score and flash, 3 lanes give 2x and bumpers then score 200, ball save, 3 drains to game over, the high score persists across a reload, the restart lockout, P pause/resume, touch halves, the touch LAUNCH hold, and sub-frame taps still give a full flip.
Hooks were used only for setup (placing the ball, slowing time for one flipper check).

## Fixed during verification
- Apron colliders trapped drained balls, so they were removed. Sling ping-pong loops were broken with a fixed kick speed, an up-table bias, and seeded jitter.
- On slow frames a bumper flash could be skipped. Flashes are now event-driven.
- Sub-frame taps produced a partial flip. Each press now holds for at least 16 steps.
- The mobile LAUNCH button covered the shooter lane, so touch layouts now reserve a strip under the table for it.
- Hook bodies leaked into the production bundle. They are now constant-folded out.

## Not verified
- Real-GPU frame rate (this runtime renders in software).
- Audio output (it is synthesized but nobody listened to it).
- Real touch hardware and iOS Safari.
