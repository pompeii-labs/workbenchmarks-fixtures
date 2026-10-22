# Final evidence — Neon Pinball

## Built
Vite + TypeScript + Three.js pinball table (`src/sim` physics, `src/render/View.ts`
scene, `src/game` loop/input/audio/HUD, `src/testHooks.ts` test-build hooks).
Everything is procedural; no external assets.

## Gate
`tgcheck . --next --playtest scripts/playtest.mjs` -> PASS, run `pass-5`, full
playtest on this build: 5/5 sections, 38/38 checks.

Captures (all PASS, SwiftShader software raster so FPS is not evidence):
- artifacts/pass-5/desktop-active-play.png, mobile-active-play.png
- artifacts/pass-5/desktop-title.png, desktop-launch.png, desktop-late-game.png
- artifacts/pass-5/desktop-game-over.png, mobile-game-over.png
Renderer budget: ok on every capture (inspector reports in the same folder).

## Screenshots checked
Title card over dimmed table; active play shows chrome ball, flippers, three
star-capped bumpers, lane lights, multiplier inserts; late-game shows bumper
flare, x3 lit, lanes lit; launch shows charge lights in the lane + HUD meter;
game over shows final score, NEW HIGH SCORE, retry.

## Played with scripted input (real keys / CDP touch)
- controls: Z/Left and / /Right raise only their flipper and drop on release;
  held flipper cradles the ball; drop-and-flip fires it above y=8; P pauses
  (frozen ball, overlay) and resumes.
- plunger: Space hold charges to full; release sends the ball round the arc.
- scoring: each bumper is hit and scores 100; HUD matches; three lanes raise
  the multiplier.
- game-flow: 3 balls drain, game over, high score saved to localStorage,
  Space restarts at ball 1, high score survives reload.
- touch (390x844, touch): tap starts, left/right halves drive flippers,
  LAUNCH button hold/release fires the ball.

## Other checks
- Production build (`npm run build`) grep: 0 occurrences of hook/diagnostic
  globals. Production page smoke: no console errors, game starts and launches.
- Headless sim soak: 30 bot games, 0 stuck balls, 0 escapes.

## Not verified
Real GPU frame rate, audio output, real touch hardware / iOS Safari.
