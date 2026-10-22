# Neon Orbit: final evidence

## Built
A small 3D pinball table in Three.js (Vite + TypeScript). Two flippers, a spring plunger
(hold to charge, release to fire), 3 pop bumpers that light up and score 100 x multiplier,
2 slingshots (10), 3 top rollover lanes "O R B" (50 each; all three = +1000 and multiplier +1, max x5),
3 balls per game, a 4 s once-per-ball ball save, high score saved in localStorage, pause (P/Esc,
auto-pause on tab blur), mute (M), synthesized WebAudio sound effects, keyboard plus touch controls.
All geometry, textures and sound are procedural: no asset files.

Physics is a custom 2D solver on the table plane at a fixed 480 Hz step: ball vs capsule rails,
circles (bumpers) and tapered-capsule flippers that pass on their surface velocity, so shots snap.
The sim is plain data driven by one `Command {left,right,plunger,start}`, separate from rendering.
All randomness (launch jitter, the stuck-ball nudge) goes through a seeded RNG.

## Gate
`tgcheck` final fast gate: PASS (run pass-22, 8 captures). The full playtest passed on this build
(7 sections, 40 checks: launch, flippers, bumpers, drain, pause, mobile, soak).
Renderer (desktop active-play, from the inspector): 59 draw calls, 12.8k triangles, 54 geometries, 9 textures.
Rendering ran on SwiftShader (software), so FPS was not measured.

## Screenshots (artifacts/pass-22/)
- desktop-title.png, desktop-active-play.png, desktop-late.png (ball 3, x3), desktop-paused.png, desktop-game-over.png
- mobile-active-play.png, mobile-plunger.png (LAUNCH pad), mobile-game-over.png

## Played with scripted input (scripts/playtest/)
- launch: Space starts; the start press does not charge the plunger; a full plunge orbits the ball over the top; a weak plunge rolls back.
- flippers: Z/`/`/arrows raise only their own flipper; real keypresses shoot a dropped ball up and toward the center; a held flipper cradles.
- bumpers: hit = +100, only that bumper lights and then fades, kick >= 11 u/s; sling kicks to center; three lanes raise the multiplier (HUD shows x2).
- drain: ball save, drain costs a ball, game over shows the score, NEW HIGH SCORE, saved best survives a reload, Space restarts.
- pause: P freezes the sim and shows the overlay; P resumes.
- mobile (touch via CDP): tap starts, hold/release LAUNCH fires, left/right halves flip their own flipper.
- soak: a bot plays a whole game; the ball never leaves the cabinet; it scores; the game reaches game over.

Bugs the playtests found and fixed: the inlanes were dead ends (the ball wedged between the slingshot and the guide),
a completed lane set re-lit at once, and key taps shorter than a frame were dropped.

## Not verified
Real GPU frame rate, audio output (synthesized, never heard), real touch hardware and iOS Safari.
Ball/flipper tuning was judged from metrics and bot play, not by a person playing.

## Release
`npm run build` writes `dist/` with relative paths (`base: './'`); upload its contents to any folder.
Grepping the production bundle finds no test hooks or diagnostics globals (they only exist under `build:test`).
