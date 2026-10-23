# Tideline

A small, self-contained Three.js jet ski playground. Ride an endless procedural ocean, launch off swells, hold boost for bigger air, and follow an optional eight-buoy loop. No server, accounts, API keys, or external asset requests are needed.

## Run Locally

Requires Node.js 20.19+ or 22.12+ (Node 24 is supported).

```sh
npm ci
npm run dev
```

Open the address Vite prints. The development server also accepts connections from other devices on your network.

## Build and Upload

```sh
npm run build
```

Upload **the contents of `dist/`**, including its `assets/` and `fonts/` directories, to any static web host. For example, uploading to your site's `/games/tideline/` directory makes the game available at `https://your-site.example/games/tideline/`. Relative asset paths support both domain-root and subdirectory hosting. No routing rules or server-side runtime are required.

To check the production build locally:

```sh
npm run preview
```

Use an HTTP(S) server; double-clicking `index.html` as a `file://` URL is not supported by browser JavaScript module security. The provided `tideline-static.zip` contains the upload-ready contents of `dist/`, with `index.html` at the archive root.

To embed it in an existing page after uploading:

```html
<iframe
  src="/games/tideline/"
  title="Tideline jet ski game"
  style="width:100%;height:75vh;min-height:420px;border:0"
  allow="autoplay; fullscreen"
  allowfullscreen
></iframe>
```

Click inside the game to use keyboard controls. It also works as a standalone full-browser page. Sound starts muted and can only be enabled by a user gesture.

## Controls

| Action         | Keyboard           | Touch                            |
| -------------- | ------------------ | -------------------------------- |
| Accelerate     | W / Up             | Hold GO                          |
| Brake          | S / Down           | Hold SLOW                        |
| Steer          | A, D / Left, Right | Hold left/right arrows           |
| Boost          | Hold Space         | Hold BOOST                       |
| Pause / resume | Escape             | Pause button                     |
| Fresh ride     | R                  | Start a fresh ride in pause menu |
| Toggle audio   | Speaker button     | Speaker button                   |

Hold throttle to build speed. Hit the rising face of a swell to automatically launch; boost makes the jumps larger. Release boost to recharge it. Steering works in the air, too. Reach the highlighted orange buoy, then follow the direction arrow toward the next one, or ignore the loop and free-roam. `AIR TIME` is cumulative for the current ride; `BEST JUMP` measures height gained above the launch point. Your personal-best height is stored locally to recognize new records. The game pauses if the tab loses focus.

## Implementation

- GPU-displaced water with matching CPU wave functions for buoyancy and launch physics, foam crests, sun glitter, and atmospheric haze.
- Fixed-timestep arcade handling, ballistic jumps, leaning rider, speed-sensitive chase camera, and landing shake.
- Pooled spray and wake particles, procedural rider, craft, buoys, islands, and seabirds.
- Synthesized engine, rushing water, splashes, and buoy chimes using Web Audio; no audio downloads.
- Responsive keyboard/touch interface, focus-trapped pause dialog, adaptive rendering resolution, and WebGL error screen.
- All fonts are bundled locally; their SIL Open Font License notices are in `public/fonts/` and are included in the build.

The game requires a current browser with WebGL 2 and hardware acceleration. Desktop or landscape mobile gives the widest view. It also supports portrait mobile. There are no external services or analytics.

## Tests

```sh
npm test
npm run build
npx playwright install chromium  # once, if Chromium is not already installed
npm run test:browser
```

The eight unit tests cover wave continuity, throttle, braking, boost depletion/recharge, steering, swell launches, splashdowns, and simulation-rate consistency. Three Chromium tests run against the production build and cover desktop gameplay and jumps, buoy collection, pause/resume, reset, sound toggling, no external requests, mobile multitouch controls, phone rotation, and deployment to a nested static directory.

## Customize

- `src/physics.js`: wave parameters, top speed, boost, gravity, and jump behavior.
- `src/world.js`: ocean shader, procedural models, course positions, and spray.
- `src/style.css` and `index.html`: visual identity and interface.
- `src/audio.js`: synthesized sound.

Keep the swell expression in `waveHeight` and the GLSL `waveFunction` synchronized when changing the large swell. The smaller wave terms are shared automatically.
