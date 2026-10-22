# Neon Pinball

A small arcade-style 3D pinball table built with [three.js](https://threejs.org/).

- Two flippers, a spring plunger with a power meter, and a one-way gate at the top of the shooter lane
- Three pop bumpers that flash and score, two slingshots, four stand-up targets, and three top rollover lanes
- Three balls per game, a ball save at the start of each ball, an end-of-ball bonus, and a high score saved in `localStorage`
- Synthesized sound effects (WebAudio, no audio files) and bloom-lit neon visuals
- Keyboard and touch controls, with a layout that fits both desktop and phone screens

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Left flipper | `Z`, `←`, or Left Shift | Tap the left half of the screen |
| Right flipper | `/`, `→`, or Right Shift | Tap the right half of the screen |
| Plunger | Hold `Space` or `↓`, then release | Hold the **LAUNCH** button, then release |
| Start | `Enter` or `Space` | Start button |
| Mute / Pause | `M` / `P` | ♪ button |

## Rules

- Bumper 100, slingshot 10, rollover 250, target 500. All points are multiplied by the current multiplier.
- Light all three top lanes to raise the multiplier, up to x5. The flipper buttons rotate which lanes are lit.
- Light all four targets for 5,000.
- For the first 6 seconds of each ball, a drained ball is returned (the SHOOT AGAIN light is on).

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # headless physics checks (Node only, no browser needed)
npm run build    # writes the static site to dist/
npm run preview  # serves dist/ locally
```

## Deploying

`npm run build` writes a fully static site to `dist/`: an `index.html` file and an `assets/` folder. Upload the contents of `dist/` to any static host or web server folder (Netlify, GitHub Pages, S3, shared hosting, and so on). All asset paths are relative, so it works at a domain root or in a subfolder such as `https://example.com/games/pinball/`.

To embed it in an existing page:

```html
<iframe src="/games/pinball/" width="480" height="800" style="border:0" allow="autoplay"></iframe>
```

When the game is embedded in an iframe, the player needs to click or tap it once to give it keyboard focus.

## Code layout

- `src/physics.js`: the table layout and a fixed-step 2D physics simulation at 960 Hz. It has no three.js dependency.
- `src/main.js`: three.js scene, rendering, game rules, HUD, and input
- `src/audio.js`: WebAudio sound effects
- `test/physics.test.js`: checks for launch, cradling, flipper shots, draining, and a fuzz test that looks for tunneling and stuck balls
