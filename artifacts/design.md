# NEON ORBIT — small 3D pinball

## Brief
A single compact pinball table rendered in Three.js, viewed from the player's end
like a real cabinet. Scope is a small arcade game for a personal site: one table,
tight physics, quick restarts, local high score, static build.

## Core loop contract
- **Input**: left flipper (Z / Left Shift / Left arrow / left half of screen),
  right flipper (/ / Right Shift / Right arrow / right half), plunger
  (hold Space / Down / Enter or the on-screen LAUNCH pad, release to fire).
- **Pressure**: gravity pulls the ball to a center drain between the flippers.
- **Reward**: 3 pop bumpers (100 x mult, light up), 2 slingshots (10), 3 top
  rollover lanes (50 each; all three lit = 1000 bonus and multiplier +1, max x5).
- **Fail**: ball drains. 3 balls per game. A short ball-save (first 4 s after
  each launch, once per ball) keeps an instant drain from feeling unfair.
- **Retry**: game over panel shows score and best; Space / tap starts a new game
  immediately.

## Simulation
- Plain serializable 2D state (table plane), fixed step 1/480 s, separate from
  rendering. One command type `{left, right, plunger, start}` drives everything.
- Ball vs capsule segments (walls, posts, flippers) and circles (bumpers).
  Flippers impart surface velocity (omega x r) for real "snap".
- Seeded RNG (mulberry32) for the only random bits: plunger jitter and the
  stuck-ball nudge.

## Level plan (sim units, y toward top)
- Playfield x -4.5..4.5, shooter lane x 4.55..5.35 on the right, top arc.
- Bumper triangle in the upper middle; 3 rollover lanes at the top.
- Slingshots above each flipper, inlane guides feeding the flippers.

## Art direction
Dark cabinet, deep indigo playfield with a procedural canvas print (rings,
arrows, logo), chrome rails and ball (PMREM room env), neon-cyan / magenta /
amber accents. Bumpers flash with emissive caps and additive halos.
Camera fixed, fit to the table for any aspect (portrait phones included).
