# Neon Pinball

A small 3D arcade pinball table built with Three.js, Vite and TypeScript.
It has two flippers, a spring plunger, three pop bumpers that light up and
score, slingshots, top rollover lanes that raise a multiplier, three balls per
game with a short ball save, and a high score kept in `localStorage`.

## Controls

| Action | Keyboard | Touch / mouse |
| --- | --- | --- |
| Left flipper | `Z`, `Left Arrow`, `Left Shift` | tap or hold the left half |
| Right flipper | `/`, `Right Arrow`, `Right Shift` | tap or hold the right half |
| Plunger | hold `Space` / `Down` / `Enter`, release to fire | hold the LAUNCH button |
| Start / restart | `Space` | tap |
| Pause | `P` / `Esc` | pause button |

The longer you hold the plunger, the harder the launch.

## Develop

```sh
npm install
npm run dev        # http://127.0.0.1:5188
```

## Put it on your site

```sh
npm run build      # writes dist/
```

Upload the **contents** of `dist/` (`index.html` plus the `assets/` folder) to
any static host or any subfolder of your site, for example
`https://example.com/pinball/`. Asset paths are relative (`base: './'`), so it
works without any server config. Test it locally with `npm run preview`.

`npm run build:test` makes a test build with automation hooks for the
playtest scripts. Never upload that one. The normal `npm run build` leaves
the hooks out.
