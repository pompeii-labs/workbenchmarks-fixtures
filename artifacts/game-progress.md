# Progress — Neon Pinball

## Intent / constraints
Small, tight arcade 3D pinball: two flippers, plunger, light-up scoring bumpers,
3 balls per game, high score. Must build to an uploadable static site.

## Decisions
- Custom 2D physics on a fixed 480 Hz step (plain serializable `SimState`,
  single `Command` type); Three.js only renders. No physics library.
- Flipper contact transfers surface velocity (omega x r); bumpers impose a
  minimum outgoing kick; ball speed capped at 40 u/s.
- Rollover lanes + lane change + multiplier (x2..x5) added for arcade depth.
- All visuals procedural (canvas playfield art, extruded flippers, PMREM chrome).
- Audio is synthesized WebAudio, no asset files.
- `base: './'` so `dist/` works from any folder; hooks only in `--mode test`.

## Completed
- Sim, view, HUD/overlays (loading, title, pause, game over, launch meter,
  touch zones + LAUNCH button), sfx, high score in localStorage.
- tgcheck PASS (pass-5) with full 5-section playtest (38/38 checks).
- Headless soak: 30 bot games, ~4 h simulated play, 0 stuck, 0 escapes.
- Production bundle grep: no hook/diagnostic names.

## Remaining / known weak
- Bot with perfect timing survives long games; human difficulty not tuned on
  real hardware. No tilt/nudge, no ball save.
- Audio and GPU performance not verifiable here.
