# Progress

## Intent and constraints
Small 3D pinball (two flippers, plunger, lit scoring bumpers, 3 balls, high
score), tight arcade feel, static-site build for upload. No user available:
make calls autonomously.

## Decisions
- Vite + TS + Three.js from `tgnew`; scaffold demo entities removed.
- 2D fixed-step sim (`src/sim`) separate from Three.js rendering (`src/render`).
- `base: './'` so `dist/` works from any folder.
- Test hooks only in `vite build --mode test` (`build:test`).
- High score in localStorage.

## Completed
- Design brief, sim, renderer, HUD/overlays, audio, touch, test hooks (test build only)
- tgcheck PASS (pass-15); full playtest 7/7 sections; prod bundle hook-free

## Remaining / next
- Unverified: GPU perf, audio by ear, real touch devices.
