# Swell Rider: final evidence

## What was built
A three.js jet-ski game built with Vite + TypeScript. It has open ocean with chop and long swells, a third-person chase camera, launches off swell faces, pop jumps, air spins, ring gates, combos, and a wipeout and respawn loop. Everything is procedural: the water shader, sky, jet ski and rider, islands, buoys, rings, particles, and WebAudio sound. No external assets are used.

- `src/sim/`: plain serializable state on a fixed 60 Hz step, driven by one `Command` type. RNG state lives inside the sim state.
- `src/sim/waves.ts`: one wave table. Physics uses it in TypeScript, and the water vertex/fragment GLSL is generated from the same numbers.
- Launches come from the physics rather than a scripted ramp. The hull follows the surface's vertical velocity, and when a crest drops away faster than gravity the ski leaves the water. Space adds pop.
- The ocean is unbounded. Rings, buoys, and the water mesh recycle around the player. Islands push the ski out softly and keep its sliding speed, so nothing can trap the player.

## Gate
The final `tgcheck . --next --playtest scripts/playtest.mjs` run (pass-7) reported **PASS (full playtest on this build)**. There were 7 captures, the evidence check passed, and 31 of 31 playtest checks passed across 7 sections.

## Screenshots (pass-7, opened and reviewed)
- `artifacts/pass-7/desktop-active-play.png`: riding at 56 km/h with a score of 649 and a x2 combo after a natural 1.8 s jump. Shows wake foam, rings, an island and buoys.
- `artifacts/pass-7/mobile-active-play.png`: the same state on a phone, with the touch stick, BOOST/JUMP buttons and pause/mute buttons.
- `artifacts/pass-7/desktop-big-air.png` and `mobile-big-air.png`: the ski near the top of a jump, clearly above the water, with the AIR readout showing.
- `artifacts/pass-7/desktop-wipeout.png`: a sideways landing. The ski tumbles, the rider is thrown off, there is a spray burst, and the WIPEOUT banner shows.
- `artifacts/pass-7/desktop-title.png`: title card over the attract-mode ride.
- `artifacts/pass-7/mobile-paused.png`: pause overlay.

## Played with scripted real input (keyboard, mouse-as-pointer, tap)
- start: title screen, Ride button, loading screen clears.
- controls: W throttles, D turns right, A turns left, Shift boosts past normal top speed and drains the meter, S brakes.
- jump: Space pops. Boost plus pops over swells gives more than 0.9 s of air that scores, and straight landings stay clean.
- wipeout: a held spin through landing causes a wipeout, which resets the combo and shows the banner. After that the ski auto-respawns, W drives again, and R restarts.
- rings: a ring is forced straight ahead with a hook, then real W input drives through it. The bot confirmed points, combo, the popup, and that rings refill.
- pause: P freezes the sim and Resume continues it.
- mobile: the stick drives and steers right, the JUMP button pops, and the pause button works.

## Renderer metrics (inspector, desktop active-play)
59 draw calls, ~120k triangles, 46 geometries, 2 textures. The scene runs on SwiftShader here, so FPS readings are not valid.

## Release
- `npm run build` writes `dist/` with `base: './'`, so the asset URLs are relative and the folder works from any directory on a static host.
- Test hooks exist only in `npm run build:test` (`--mode test` → `__TEST_HOOKS__`). A grep of the production bundle for `__THREE_GAME_TEST_HOOKS__`, `__THREE_GAME_DIAGNOSTICS__`, `setTimeScale`, `placeRingAhead`, `setPausedForScreenshot` and `big-air` found 0 matches.

## Not verified
- Real-GPU frame rate, especially phones. The water mesh has about 48k vertices and is grid-snapped, and DPR is capped at 1.75.
- Audio output. The engine, hiss, splash and chime sounds are synthesized but were never heard here.
- Real touch hardware and Safari/iOS. Touch was only tested in Chromium mobile emulation.
