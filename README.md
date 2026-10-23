# Swell Rider

A small three.js jet ski game. You ride open water with choppy waves, hit swells to launch into big air, spin tricks, and fly through rings.

## Race course
A buoy course floats in the open water by the start: 8 gates (tall orange pylons, checkered START · FINISH banner) around a ~1.15 km loop with a sweeping right, a hairpin, an S-bend, and a bottom hairpin. Three floating kicker ramps sit on the straights for big jumps (1.5 to 2.5 s of air). Yellow buoys mark the bends only, so the straights stay open water.

- The lap clock starts when you cross the start line. Take the gates in order; the gate that counts next glows green, and the arrow under the timer points to it.
- The HUD shows the current lap time, gate count, **best lap** and last lap. A new best shows a banner and is saved in the browser (localStorage), so it survives restarts and reloads.
- If you miss a gate the HUD tells you to turn back; riding the course backwards shows WRONG WAY. You can leave the course and free-ride any time.

## Controls
- **W / ↑** throttle, **S / ↓** brake/reverse, **A D / ← →** steer
- **Space** pop jump, **Shift** boost
- **A / D in the air** spin (land facing your direction of travel or you wipe out)
- **P / Esc** pause, **R** restart, **M** mute
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

## Testing
`npm run build:test` builds with deterministic test hooks (`window.__THREE_GAME_TEST_HOOKS__`). The production `build` has no hooks. The playtest sections are in `scripts/playtest/`.
