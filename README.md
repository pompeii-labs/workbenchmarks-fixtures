# Tideline

A small, self-contained Three.js jet ski playground. Ride an endless procedural ocean, race an optional eight-gate buoy circuit, and hit two floating ramps for big jumps. No server, accounts, API keys, or external asset requests are needed.

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

Hold throttle to build speed. Hit the rising face of a swell or a striped ramp to launch; boost makes the jumps larger. Release boost to recharge it. Steering works in the air, too. `AIR TIME` is cumulative for the current ride; `BEST JUMP` measures height gained above the launch point. Your personal-best height is stored locally to recognize new records. The game pauses if the tab loses focus.

## Race the Circuit

Cross **between the two checkered buoys** ahead of the starting position to begin your first timed lap. Pass numbered gates **1 through 7 in order**, then cross the checkered start / finish gate again to complete the lap. Each gate is a pair of buoys, not a collectible: cross the space between them in the course direction. Jumping through a gate counts, too. Missing a gate or crossing it backwards does not advance the race. The direction arrow and orange map marker always point to the next required gate.

The circuit includes a fast opening straight, sweeping bends, a tighter chicane, and a return run. Sparse edge floats suggest the route without walls or invisible boundaries. Two striped floating ramps sit on the opening and back straights. Approach their low ends at speed and ride up to the lip for takeoff. You can also steer around them without invalidating your lap.

The HUD shows current lap, live time, last lap, and best lap. Timing begins at the actual start crossing, excludes pauses, and rolls straight into the next lap after a valid finish. Best lap persists in this browser on this device, even after a fresh ride or reload; changing browsers or clearing site data clears the record. If browser storage is unavailable, the record still works for the current page session. A fresh ride resets course progress and the current timer, but keeps your best lap.

Racing is completely optional. Leave the circuit whenever you like and enjoy the open water. If you return, the next required gate stays highlighted and the running lap time includes your detour.

## Implementation

- GPU-displaced water with matching CPU wave functions for buoyancy and launch physics, foam crests, sun glitter, and atmospheric haze.
- Fixed-timestep arcade handling, ballistic jumps, leaning rider, speed-sensitive chase camera, and landing shake.
- Pooled spray and wake particles, procedural rider, craft, paired numbered buoys, islands, and seabirds.
- Ordered directional gate crossings, interpolated lap timing, local best-lap storage, and a live course chart.
- Floating jump ramps with wave-conforming entry aprons, speed-dependent lip launches, and one-way deck landings.
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

The 29 unit tests cover wave continuity, handling, boost, swell and ramp launches, deck/apron surface alignment, landings, simulation-rate consistency, ordered directional gates, lap timing, and record selection. Five Chromium tests run against the production build and cover desktop gameplay, a complete keyboard-driven lap with ramp takeoff, paused timing, record persistence after reset/reload, unavailable storage, sound, no external requests, mobile multitouch controls, phone rotation, and deployment to a nested static directory.

## Customize

- `src/physics.js`: wave parameters, top speed, boost, gravity, and jump behavior.
- `src/course.js`: gate and ramp positions, race progression, and lap timing.
- `src/ramps.js`: floating ramp models and wave-conforming aprons.
- `src/world.js`: ocean shader, procedural models, buoys, and spray.
- `src/style.css` and `index.html`: visual identity and interface.
- `src/audio.js`: synthesized sound.

Keep the swell expression in `waveHeight` and the GLSL `waveFunction` synchronized when changing the large swell. The smaller wave terms are shared automatically.
