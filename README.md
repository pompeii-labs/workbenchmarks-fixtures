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

## Sound
Sound effects, the ocean ambience and the music come from [Soundza](https://soundza.com). They live in `public/sfx/`, and `public/sfx/CREDITS.md` lists each source. The engine loop and the music track are AI-generated.

- Audio starts on the first click or key press, as browsers require. Samples load in the background, and until each one decodes (or if it fails) the old procedural sound plays in its place.
- The engine loop's pitch and filter follow your revs. Filtered noise under it follows hull speed. The nearest rival gets its own engine voice, quieter and panned to its side.
- Landings, wipeouts, bumps, ramp launches, rings, gates, tricks, boost, the 3-2-1-GO countdown, laps, best laps and the finish each have their own sound. Splashes and bumps from nearby rivals fade with distance and pan with position.
- Pausing turns the music and ambience down, and a hidden tab suspends audio. **M** mutes everything.

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

## Testing
`npm run build:test` builds with deterministic test hooks (`window.__THREE_GAME_TEST_HOOKS__`). The production `build` has no hooks. The playtest sections are in `scripts/playtest/`.
