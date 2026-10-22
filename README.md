# Neon Pinball

A small 3D pinball table built with [Three.js](https://threejs.org/). It builds to a
plain static site (HTML/CSS/JS in `dist/`) that you can upload to any host.

## The game

- **Two flippers** — `◀`/`A` and `▶`/`D` (or the on-screen buttons on touch devices)
- **Spring plunger** — hold `SPACE` to charge, release to launch. Weak launches fall
  back into the shooter lane and can be re-plunged; a full-power launch sends the ball
  around the top orbit
- **3 pop bumpers** that flash, light the table and score 100 — **slingshots** (50),
  **stand-up targets** (150) and a **spinner** (10 per tick) fill out the table
- **N·E·O rollover lanes** at the top: light all three for +5,000 and +1 bonus
  multiplier (up to ×5, applied to every score)
- **Three balls per game**, a 9-second **ball save** after each launch, and a gentle
  nudge on `↑`/`W`
- **High score** kept in `localStorage` between visits

| Control | Action |
| --- | --- |
| `◀` / `A`, `▶` / `D` | Left / right flipper |
| `SPACE` (hold & release) | Plunger |
| `↑` / `W` | Nudge |
| `M` | Mute / unmute sound |
| `P` | Pause |
| `Enter` | Play again after game over |

Sound is synthesized with the Web Audio API — there are no audio files to ship.

## Develop

```sh
npm install
npm run dev
```

## Build & upload

```sh
npm run build
```

This produces a self-contained `dist/` folder (relative asset paths, so it works
from the domain root or any sub-path). Upload the contents of `dist/` to any
static host — GitHub Pages, Netlify, S3, a shared folder — and you're done.
No server-side code is needed.

## How it works

Physics is a small custom 2D solver running on the playfield plane (segment and
circle colliders with restitution, kickers for the bumpers/slingshots, and a
capsule-vs-ball flipper model that throws the ball from the flipper's angular
velocity). Three.js renders the cabinet, chrome rails, lit bumpers and the
canvas-painted playfield on top. The whole game is in `src/main.js`.

For quick automated checks the page exposes `window.__pinball`
(`state`, `ball`, `launch(power)`, `flip(side, down)`, `startGame()`).
