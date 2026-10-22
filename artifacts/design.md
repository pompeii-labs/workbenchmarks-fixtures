# Dolphin Coast: design brief

**Fantasy:** a cozy golden-hour swim along a pastel coastline as a dolphin, leaping out of the swell to land tricks.
**Session:** 90 s ("Sunset in"). Score as much as you can, keep your best (stored in localStorage), retry right away.

## Core loop
1. Dive (Down/S). Going deeper turns depth into speed (dive gain 9 vs climb cost 3.2).
2. Rise (Up/W). Leaving the water with vertical speed above 2.6 m/s launches you.
   - Launch vy = speed·sin(pitch)·angleEfficiency + swell boost.
   - Angle efficiency is best at about 50° and drops for steeper or flatter exits.
   - Swell boost = rising water (dh/dt × 2.1, which rewards **timing**) plus climbing the wave face (heading · slope × speed × 0.85, which rewards **angling**). The HUD "Swell boost" meter shows it live.
3. In the air: Up/Down flips, Left/Right spins. A held input only starts acting after you release it once, so holding Up through the breach doesn't flip you by accident. With no input the body follows its arc and levels out, so a plain breach lands clean.
4. Landing compares the nose against the velocity direction and the roll against level: Perfect ×2, Clean ×1.5, Sloppy ×1, Belly flop ×0 (also loses the combo and stuns you briefly).
5. Points = (100 + airtime·60 + flips·600 + spins·450 [+400 for flip+spin]) × height (1 + h/5, max 3.5) × landing × swell (up to 1.6) × combo (1 + 0.25 per clean landing in a row, max ×3, ends after 7 s without a landing).

## World
The swim lane runs along −z, with the shore at +x: beach, palms, pastel houses, a lighthouse every third tile, and green hills. Buoys mark both lane edges. Steering near an edge is pushed back softly, so you are never trapped there. Three swells are summed identically in TS (sim) and GLSL (water shader).

## Architecture
- `src/sim/`: fixed 60 Hz step, plain data, one `Command` type for keyboard, touch, and bots.
- `src/render/`: dolphin, world, and fx are procedural (no external assets).
- Test hooks and diagnostics exist only in `vite build --mode test` (`build:test`).
