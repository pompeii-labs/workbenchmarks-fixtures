# Game progress

## Intent and constraints
Small 3D pinball (two flippers, plunger, lit scoring bumpers, 3 balls, high score),
tight arcade feel, static build for upload. No user available; make calls.

## Decisions
- Custom 2D physics (fixed 480 Hz) instead of Rapier: deterministic, no new deps
  (no network install at run time), capsule/circle collision is all pinball needs.
- Vite `base: './'` so `dist/` works from any subfolder of a site.
- Test hooks only in `build:test` (VITE_TEST_HOOKS=1); production build has none.
- High score in localStorage (`neon-orbit-best`).
- Everything procedural (no asset generators in this bench).

## Completed
- Sim, 3D view, HUD/overlays, touch, audio, hooks, tgcheck PASS (pass-22), full playtest PASS.
- Fixed: inlane dead-end, lane re-light, dropped short taps, plunger mesh offset, banner placement.

## Remaining
- Unverified: GPU perf, audio output, real touch devices.
