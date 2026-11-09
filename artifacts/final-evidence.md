# Final evidence: The Great Pelicano

## Built
A single full-screen three.js page. A white pelican rides a unicycle around a circus ring and juggles three bowling pins. The model, the floor/feather/tent textures (canvas-generated), and all animation are written in code. Nothing is downloaded. The production JS is 585 kB raw, 153 kB gzip. There are no other assets.

## Gate
`tgcheck . --next --playtest scripts/playtest.mjs`: PASS on run `pass-8`, 22/22 playtest checks, full playtest on this build.
Captures are in artifacts/pass-8/: desktop-active-play, mobile-active-play, desktop-side-view, desktop-reduced-motion, mobile-reduced-motion.
Renderer (desktop): 110 draw calls, 68k triangles, 122 geometries, 6 textures.

## Measured from the posed scene graph (scripts/playtest/motion.mjs)
| check | result |
|---|---|
| tyre contact-point speed / travel speed (200 samples over 100 s) | max 0.46 % |
| ball of foot to pedal top | < 1e-15 m |
| leg and wing IK miss | 0 |
| held-pin neck to wrist | < 1e-14 m |
| pin vertical acceleration in flight vs g | error < 1e-10 m/s^2 over 531 samples |
| max pin step per 1/240 s across throws and catches | 1.04 cm (≈ 2.5 m/s; no teleport) |
| pattern repeat error, including 1 hour in | 4e-13 m |
| pins held at once | always 1 or 2 |
| lowest pin point | 0.72 m (never dropped) |
| pin inside torso (conservative ellipsoid) | never |
| fore-aft lean range | -2.0° to +3.0° |
| pin-to-pin belly clearance (one-off check) | ≥ 0.11 m between axis cores |

Input: a 300 px mouse drag orbits (desktop). A CDP touch drag orbits (390×844 phone). Auto-drift resumes after release.
Reduced motion (emulated media): the clock and camera freeze, rendering stops, and motion resumes when the preference clears.

Production bundle grep for `__THREE_GAME`, `setPausedForScreenshot`, `measureAt`, `slipAt`, `setTimeScale`: 0 matches.

## Not verified
- Real-GPU frame rate. All rendering here is SwiftShader, so FPS is meaningless. The budget above is modest for a laptop.
- Real touch hardware and iOS Safari. Touch was tested by Chromium touch emulation only.
