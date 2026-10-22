# Neon Pinball — design brief

## Intent
A small, tight, arcade 3D pinball table in Three.js that ships as a static site
(relative `base: './'`, upload `dist/` anywhere). Scope is small: one table, no
premium pipeline.

## Core loop contract
- **Input**: left flipper (Z / Left Shift / Left Arrow / A), right flipper
  (/ / Right Shift / Right Arrow / L), plunger hold+release (Space / Down /
  Enter). Touch: left half = left flipper, right half = right flipper, the
  LAUNCH button holds/releases the plunger. P / Esc pauses.
- **Pressure**: tilted-table gravity pulls the ball to a drain gap between the
  flippers; outer guides funnel it to the flippers.
- **Reward**: pop bumpers kick the ball and score 100 x multiplier while
  flashing; three top rollover lanes light (50 x mult); lighting all three
  adds 1000 x mult and raises the multiplier (max x5). Flipper presses rotate
  the lit lanes (classic lane change).
- **Fail**: a ball past the flippers drains. Three balls per game; after the
  third, game over with final score and high score (localStorage).
- **Retry**: Space / Enter / tap from game over starts a new game instantly.

## Feel targets
- Fixed 480 Hz physics step, ball speed cap, flippers swing in ~45 ms.
- Flipper contact transfers surface velocity (omega x r) so timing matters.
- Bumpers impose a minimum outgoing speed (hard kick), with flash, camera
  shake and synth "pop".
- Plunger charge visible (spring compresses, HUD meter).

## Table plan (sim units, x right, y up the table)
- Walls x = -5..5, top semicircle radius 5 centred at y = 15.
- Shooter lane x 4.3..5 on the right; plunger at the bottom; one-way sloped
  gate at the lane top keeps balls from falling back in.
- Flippers pivot at (xc -/+ 2.0, 2.4), length 1.75, rest -28 deg, up +32 deg.
- Inlane guides from side walls to the flipper pivots.
- 3 pop bumpers in a triangle around y 10.6-12.6; 3 rollover lanes at y ~17.

## Art direction
Dark cabinet, deep-blue playfield with procedural canvas artwork (inserts,
lane arrows, stars), neon magenta/cyan/amber accents, chrome ball lit by a
PMREM room environment, emissive bumper caps that flare on hit. Camera looks
down the table from the player's end; it fits the table to any aspect.

## Evidence states
`title`, `active-play`, `launch` (ball on plunger, charged), `late-game`
(ball 3, x3, lanes lit, bumper flashing), `game-over`.
