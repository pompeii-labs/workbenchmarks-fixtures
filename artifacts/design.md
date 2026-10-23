# Swell Rider — design brief

## Brief
A small arcade jet-ski toy. Open ocean with choppy chop and long rolling swells,
third-person chase camera. The joy is speed, spray, and launching off swell faces
into big air. Free-roam with light score goals so driving around stays rewarding.
Ships as a static site (relative base path) for upload to any host.

## Core loop contract
- **Verb**: throttle + carve. Hit a swell face at speed and the surface throws
  you; Space "pops" for extra lift. Shift burns boost.
- **Reward**: airtime points (scaled by hang time and height), spin tricks
  (360 / 720 while airborne with A/D), ring gates (points + boost refill),
  combo multiplier that grows with consecutive clean landings and ring hits.
- **Pressure**: landing badly (spun more than ~55° off your direction of travel,
  or nose-dived hard) is a **wipeout**: combo lost, short tumble, respawn.
  Combo also decays if you stay on the water too long.
- **Retry**: wipeout auto-respawns in ~1.6 s at the crash spot; R resets the run.
- **No walls**: the ocean is unbounded. Water, buoys and rings recycle around
  the player, so a boundary can never trap them. Distant islands give bearings
  (soft push-out collision on their shorelines).

## Controls
- Desktop: W/↑ throttle, S/↓ brake/reverse, A/D or ←/→ steer (spin in air),
  Shift boost, Space pop/jump, P/Esc pause, R restart.
- Touch: left stick (x steer, up throttle, down brake), right JUMP and BOOST.

## World plan (camera scale)
Camera ~7 m behind, 3 m up, FOV widens with speed. Water mesh 360 m square,
grid-snapped to the player. Swells: wavelength 34–52 m, up to ~1.5 m amplitude;
chop: 3–9 m wavelengths, 0.1–0.3 m. Same wave function in TS (physics) and GLSL
(render) generated from one table.

## Architecture
- `sim/` plain serializable state, fixed 60 Hz step, `Command`
  {throttle, steer, boost, jump} drives the ski. Seeded RNG in the state.
- `render/` reads state only: water shader, sky dome, ski + rider model,
  particle spray / wake, rings, buoys, islands.
- Test hooks + diagnostics only in `build:test` (`--mode test`).

## Art direction
Bright late-afternoon tropical: deep teal-to-cobalt water, white foam crests,
warm sun glint, pale sky gradient. Jet ski: white hull with coral-red and
yellow accent, rider in a yellow life vest. Orange ring gates read against blue.
