# Neon Orbit Pinball

A small 3D arcade pinball table built with three.js. It has two flippers, a spring plunger, three pop bumpers that light up when hit, slingshots, top rollover lanes, three balls per game, and a high score that is saved in the browser.

## Play

| Action | Keyboard | Touch |
| --- | --- | --- |
| Start / play again | `Enter` (or `Space`) | tap |
| Left flipper | `←` `Z` `A` `Left Shift` | tap and hold the left half of the screen |
| Right flipper | `→` `/` `D` `L` `Right Shift` | tap and hold the right half of the screen |
| Plunger | hold `Space` / `↓` / `S`, then release | hold **LAUNCH**, then release |
| Mute | `M` | ♫ button |

Scoring:

- Pop bumper: 100
- Slingshot: 10
- Unlit rollover lane: 500
- Lighting all 3 top lanes: +2,500 and the bonus multiplier goes up by one, to a maximum of 5×. The multiplier applies to all points.
- Flipper buttons rotate the lit lanes (lane change).
- Every 25 bumper pops: JACKPOT, 10,000.
- Reaching 100,000: one extra ball.
- For the first 7 seconds after each launch, a drained ball comes back (ball save, shown by the "SHOOT AGAIN" light).

## Develop

```sh
npm install
npm run dev      # local dev server
npm test         # headless physics checks (launch, cradle, flipper shot, no tunneling, full games)
npm run build    # static site -> dist/
npm run preview  # serve dist/ locally
```

## Deploy

`npm run build` writes a fully static site to `dist/`. It contains `index.html` and `assets/`, with no external requests. All paths are relative (`base: './'`), so you can upload the contents of `dist/` to any folder on any static host, such as `example.com/pinball/`, and it will work there. You can also embed it on another page with an `<iframe src="/pinball/index.html">`.

## How it works

- `src/table.js`: the table layout in 2D table units (walls, arc, slings, bumpers, lanes, flippers).
- `src/game.js`: the game rules and a custom fixed-step physics engine running at 480 Hz with no DOM dependencies. It handles ball against capsule and segment collisions, rotating tapered flippers that transfer their surface velocity to the ball, bumper and sling kicks, and a one-way gate on the shooter lane. A dedicated engine keeps the ball response tight and predictable instead of floaty.
- `src/main.js`: three.js rendering with a procedurally drawn playfield texture, bloom, shadows, lamp inserts, camera shake, the HUD, and input.
- `src/audio.js`: sound effects synthesized with WebAudio, so there are no audio files.
