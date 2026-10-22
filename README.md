# Dolphin Coast

A small three.js browser game: swim along a sunny coast as a dolphin, leap off the swells and land tricks for points.

## Controls

- **Space**: hold to dive, release to leap
- **A / D**: steer. **W**: swim faster. **S**: slow down
- In the air: **W / S** to flip, **A / D** to barrel roll, **Q / E** to spin
- **M**: mute
- Touch devices get an on-screen stick and Dive/Spin buttons.

## Scoring

Each jump scores `(base + airtime + tricks) × multipliers`:

- **Height**: ×(1 + height/5)
- **Entry**: Perfect ×2, Great ×1.5, Good ×1.2, Sloppy ×0.6. A belly flop scores 0.
- **Combo**: ×1.5 per extra trick type (flip / roll / spin) in a single jump
- **Wave rider / Perfect wave**: ×1.3 / ×1.6 for leaping while a swell is lifting you
- **Hoops**: ×1.5 for each golden hoop you fly through
- **Chain**: ×0.25 more for each clean landing in a row (you have to jump again within 5 s)

The *Wave lift* meter shows how hard the water under you is pushing you up. Leap while you're climbing the face of a swell, heading into it, to get the most height.

## Develop / build

```sh
npm install
npm run dev      # local dev server
npm run build    # static site in dist/
```

Upload everything inside `dist/` to any static host. Asset paths are relative, so it also works from a subfolder (e.g. `yoursite.com/dolphin/`).
