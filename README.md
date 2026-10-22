# Neon Pinball

A small 3D pinball table built with three.js. It has two flippers, a spring plunger, three pop bumpers that flash and score, slingshots, stand-up targets, top rollover lanes, a multiplier, ball save, a skill shot, three balls per game, and a high score saved in `localStorage`.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Left flipper | `Z`, `A`, `←`, Left Shift | hold left half of the screen |
| Right flipper | `/`, `L`, `→`, Right Shift | hold right half of the screen |
| Plunger (hold, then release) | `Space`, `Enter`, `↓` | hold right half while the ball is in the lane |
| Start game | `Space` / `Enter` | tap |
| Mute | `M` | SOUND button |

## Scoring

- Bumper: 100. Slingshot: 10.
- Stand-up target: 250. Lighting all three gives 2,500 and +1X multiplier.
- Top rollover: 100. Lighting all three gives 1,000 and +1X. Each flipper press shifts the lit lanes.
- Skill shot: 5,000 if the plunged ball's first contact is a top rollover. A plunge of about 3/4 power does it.
- The multiplier goes up to 5X and resets on each new ball.
- Ball save lasts 6 seconds after the ball enters the playfield.

## Develop

```sh
npm install
npm run dev      # local dev server
npm test         # headless physics + rules checks
npm run build    # static site -> dist/
npm run preview  # serve dist/ locally
```

## Deploy

Run `npm run build` and upload everything inside `dist/` to any static host or folder on your site, for example `https://example.com/pinball/`. Asset paths are relative, so it works from a subfolder with no extra configuration. You don't need a server or any external requests.

To embed it in an existing page:

```html
<iframe src="/pinball/index.html" width="480" height="800" style="border:0" allow="autoplay"></iframe>
```

When the game runs in an iframe, players need to click it once before the keyboard works.

## How it works

- `src/physics.js` is a custom 2D simulation in table space, stepped at a fixed 1200 Hz. Flippers are tapered capsules that transfer their surface velocity to the ball. Bumpers and slingshots add a kick, and the shooter-lane gate is one-way.
- `src/game.js` holds the rules, scoring, ball save, multiplier and high score.
- `src/main.js` handles three.js rendering (bloom, shadows, environment reflections), input, the HUD and camera fitting. On slow devices it lowers the resolution and then turns off bloom.
- `src/audio.js` makes the sound effects with WebAudio, so there are no audio files.
