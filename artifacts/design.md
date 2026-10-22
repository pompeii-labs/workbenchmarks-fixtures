# Neon Pinball: design brief

## Brief
A small, single-table 3D pinball machine for the browser. Tight, arcade-y,
quick to learn: two flippers, a spring plunger, three pop bumpers that flash
and score, three balls per game, and a persistent high score. Ships as a
static site (relative base path) that can be uploaded to any folder.

## Core loop contract
- **Input**: left flipper (Z / Left Arrow / Left Shift / left half of screen),
  right flipper (/ / Right Arrow / Right Shift / right half), plunger
  (hold Space / Down / Enter, or hold the on-screen PLUNGE button; release to
  fire; longer hold = harder launch).
- **Pressure**: gravity pulls the ball to the drain between the flippers and
  down the outlanes.
- **Reward**: pop bumpers (100 x multiplier, flash + pop sound + kick),
  slingshots (10), top rollover lanes (50 each; all three lit = +1x
  multiplier, up to 5x, and 1000 bonus). Score pops float above hits.
- **Fail**: a drained ball costs one of three balls. Ball 3 drained = game over.
- **Retry**: game-over screen shows final score and high score; Space / tap
  starts a new game immediately.

## Table plan (table units, x right, y up the table; ball radius 0.25)
- Playfield x in [-4.5, 4.5], y in [-10, 10]; plunger lane x in [4.5, 5.5].
- Rounded top arch guides lane launches left into the field.
- Three top lanes at y ~ 7.6, x = -1.6, 0, 1.6.
- Pop bumpers at (-1.6, 4.1), (1.6, 4.1), (0, 2.0).
- Slingshots above each flipper; inlane guides feed the flippers.
- Flipper pivots at (+-2.35, -7.4), length 1.85, rest -28 deg, up +30 deg.

## Feel targets
- Fixed 240 Hz physics step, ball speed capped, flipper swing ~ 0.04 s.
- Flipper contact transfers surface velocity: a moving flipper hits hard, a
  held flipper cradles.
- Bumpers kick at a fixed outgoing speed so hits always feel punchy.
- Gentle camera nudge on bumper hits; no compounding multipliers at walls.

## Art direction
Dark midnight-blue playfield with neon inserts (magenta, cyan, amber), chrome
rails and a chrome ball lit by a room environment map, bloom on emissive
parts. All procedural: canvas-texture playfield art, extruded flippers,
lathe bumpers. Camera: classic player view from the bottom of the cabinet,
fitted so the full table is visible on desktop landscape and phone portrait.
