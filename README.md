# Swell Rider

A small three.js jet ski game. You ride across choppy open water and launch off the swells.

## Controls

| Input | Action |
| --- | --- |
| W / ↑ | Throttle |
| S / ↓ | Brake / reverse (in the air: backflip) |
| A D / ← → | Steer (in the air: spin) |
| Shift | Boost (refills over time, plus a bonus for tricks and rings) |
| Space | Hop |
| M | Mute |
| R | Reset |

On touch devices you get an on-screen stick and HOP / BOOST buttons.

Hit a swell at speed to get air. Fly through the gold rings, and land clean (nose level, facing forward) to build your combo.

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # static site -> dist/
npm run preview  # serve dist/ locally
```

## Deploy

`npm run build` writes a fully static site to `dist/` (`index.html` plus `assets/`). Every path is relative, so you can upload the contents of `dist/` to any static host, at the site root or in a sub-folder (e.g. `yoursite.com/games/swell-rider/`). It needs no server code.

## How it works

- `src/waves.js` holds the single wave definition. The same sum of sharpened sine swells is compiled to GLSL for the water mesh and evaluated in JS for the physics, so the ski rides exactly the surface you see.
- `src/player.js` handles the arcade physics. The ski sticks to the water while the water's vertical acceleration is weaker than gravity. When a crest falls away faster than that, you're airborne, with a little extra launch.
- `src/particles.js` has the pooled spray, mist and foam particles, plus a foam wake ribbon draped on the waves.
- `src/audio.js` synthesizes the engine, water, wind, splash and chime sounds with WebAudio, so there are no audio files.
