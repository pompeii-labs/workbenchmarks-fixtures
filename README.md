# Swell Rider

A small three.js jet ski game. You ride open water with choppy waves, hit swells to launch into big air, spin tricks, and fly through rings.

## Race course
A buoy course floats in the open water by the start: 8 gates (tall orange pylons, checkered START · FINISH banner) around a ~1.15 km loop with a sweeping right, a hairpin, an S-bend, and a bottom hairpin. Three floating kicker ramps sit on the straights for big jumps (1.5 to 2.5 s of air). Yellow buoys mark the bends only, so the straights stay open water.

- The lap clock starts when you cross the start line. Take the gates in order; the gate that counts next glows green, and the arrow under the timer points to it.
- The HUD shows the current lap time, gate count, **best lap** and last lap. A new best shows a banner and is saved in the browser (localStorage), so it survives restarts and reloads.
- If you miss a gate the HUD tells you to turn back; riding the course backwards shows WRONG WAY. You can leave the course and free-ride any time.

## Racing the AI
Press **Race** and you line up on a 6-ski grid behind the start line with five AI rivals (KAI, MARA, RIO, JUNO, SKYE). A 3-2-1-GO countdown locks everyone's throttle, then it's **3 laps**.

- Rivals use the same physics and the same command type as you. They follow the course on their own lanes, line up on the kicker ramps and jump them, pass slower skis, and loop back if a hit knocks them past a gate. A mild catch-up keeps the pack close (at most -7% / +4% pace).
- Skis collide as capsules. A hit is an equal-mass impulse along the contact normal (momentum conserved, restitution 0.45). It spins off-centre hits a little and loosens the hull's side grip for a moment, so a shove slides you sideways. Jumping over someone misses them.
- The HUD shows your place (e.g. **3rd/6**), live standings with metre gaps (desktop), and a place + name tag over each rival.
- Crossing the line on the last lap opens the **finish screen**: your place, race time, best lap, and the full standings. Rivals still on the water show live until they finish. **Race again** or **R** restarts on the grid.
- A turn held through takeoff carves; it doesn't spin. Release or re-press A/D in the air to start a spin trick.

`bun scripts/race-sim.ts [seed] [laps]` runs a headless race (the AI drives your seat too) and prints the result table.

## Controls
- **W / ↑** throttle, **S / ↓** brake/reverse, **A D / ← →** steer
- **Space** pop jump, **Shift** boost
- **A / D in the air** spin (land facing your direction of travel or you wipe out)
- **P / Esc** pause, **R** restart the race, **M** mute
- Touch: left stick to ride and steer (pull down to brake), JUMP and BOOST buttons

## Run
```
npm install
npm run dev        # http://127.0.0.1:5188
```

## Put it on your site
```
npm run build
```
Upload the contents of `dist/` (`index.html` plus `assets/`) to any static host or subfolder. Asset paths are relative, so you don't need any server config.

## Sound
Every sound is a recording from [Soundza](https://soundza.com): the jet ski engine and hull water loops (pitch and level follow speed, throttle, boost and air), an open-sea bed, landing and wipeout splashes, ramp launches, ski-to-ski bumps, ring and gate chimes, the 3-2-1 countdown and air horn, lap, best-lap and finish jingles, and menu clicks. The cue sheet with each sound's trigger, source id and gain is `artifacts/sound/cues.json`; `review/sounds.html` plays every pick. The audio code is `src/systems/AudioSystem.ts`.

Sound effects: soundza.com

## Testing
`npm run build:test` builds with deterministic test hooks (`window.__THREE_GAME_TEST_HOOKS__`). The production `build` has no hooks. The playtest sections are in `scripts/playtest/`.
