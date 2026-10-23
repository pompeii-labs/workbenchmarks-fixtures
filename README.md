# Tideline

A small, self-contained Three.js jet ski racer. Race three AI rivals over two laps of an eight-gate buoy circuit, trade physical bumps, and hit two floating ramps for big jumps. The endless procedural ocean is still open to explore. No server, accounts, API keys, or external asset requests are needed.

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
| Fresh race     | R                  | Start a fresh ride in pause menu |
| Toggle audio   | Speaker button     | Speaker button                   |

Hold throttle to build speed. Hit the rising face of a swell or a striped ramp to launch; boost makes the jumps larger. Release boost to recharge it. Steering works in the air, too. `AIR TIME` is cumulative for the current ride; `BEST JUMP` measures height gained above the launch point. Your personal-best height is stored locally to recognize new records. The game pauses if the tab loses focus.

## Race the Circuit

Start a ride to race **Reef, Sunny, and Riptide over two laps**. Everyone starts together, with total race time beginning when you press LET'S RIDE. Cross **between the two checkered buoys** ahead of the starting position to begin your first timed lap. Pass numbered gates **1 through 7 in order**, then cross the checkered start / finish gate again to complete the lap. Each gate is a pair of buoys, not a collectible: cross the space between them in the course direction. Jumping through a gate counts, too. Missing a gate or crossing it backwards does not advance the race. The direction arrow and orange map marker always point to the next required gate.

The circuit includes a fast opening straight, sweeping bends, a tighter chicane, and a return run. Sparse edge floats suggest the route without walls or invisible boundaries. Two striped floating ramps sit on the opening and back straights. Approach their low ends at speed and ride up to the lip for takeoff. You can also steer around them without invalidating your lap.

Rivals steer, brake, boost, ride ramps, and jump using the same handling and wave physics as you. They have different cruising paces and racing lines, and circle back if knocked past a required gate. There is no teleporting or rubber-band catch-up. Hull collisions exchange equal-mass momentum, including sideways push that water gradually damps. Closely matched airborne hulls can collide, while a rider flying above another can pass over safely.

The HUD shows your position out of four, current lap, live lap time, last lap, and best lap. Rival colors match their hulls, map dots, and the desktop leaderboard. Position uses ordered gates and progress along the current course leg, so cutting straight to the finish does not earn places. Lap timing begins at the actual start crossing, excludes pauses, and rolls straight into the final lap. Pausing freezes every racer and all timers.

After your second lap, the finish screen shows your place, total race time (including the run to the start line), and standings. Finished racers are ordered by their interpolated finish times; rivals still on course are labeled with their lap and ranked by progress at your finish. Choose **RACE AGAIN** for a clean rematch, or **KEEP EXPLORING** to return to the ocean. You can also press R to restart.

Best lap persists in this browser on this device, even after a fresh race or reload; changing browsers or clearing site data clears the record. If browser storage is unavailable, the record still works for the current page session. A fresh race resets every rider, course progress, and timers, but keeps your best lap.

Leave the circuit whenever you like and enjoy the open water. Your rivals will keep racing. If you return before finishing, the next required gate stays highlighted and the running lap time includes your detour.

## Implementation

- GPU-displaced water with matching CPU wave functions for buoyancy and launch physics, foam crests, sun glitter, and atmospheric haze.
- Fixed-timestep arcade handling, ballistic jumps, leaning rider, speed-sensitive chase camera, and landing shake.
- Three autonomous racers with ramp approach waypoints, ordered-gate recovery, shared physics, individual wakes, and color-matched hulls and map markers.
- Hull-shaped collision proxies, equal-mass normal impulses, penetration correction, persistent lateral momentum, and height-aware airborne contact.
- Pooled spray and wake particles, procedural rider, craft, paired numbered buoys, islands, and seabirds.
- Ordered directional gate crossings, interpolated lap timing, local best-lap storage, and a live course chart.
- Two-lap race standings, interpolated finish ordering, keyboard-accessible results, rematches, and post-race free riding.
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

The 40 unit tests cover wave continuity, handling, boost, swell and ramp launches, deck/apron surface alignment, landings, simulation-rate consistency, ordered directional gates, lap timing, and record selection. They also verify collision momentum, side pushes and damping, hull separation, airborne clearance, full AI races and both ramp takeoffs across different wave phases, missed-gate recovery, standings, finish timing, and reset state.

Six Chromium tests run against the production build and cover desktop gameplay, a complete keyboard-driven lap with ramp takeoff, a full two-lap race against live rivals, paused opponents and timing, accessible results, rematches and post-race exploring, record persistence after reset/reload, unavailable storage, sound, no external requests, mobile multitouch controls, phone rotation, and deployment to a nested static directory. The full race test can take several minutes on software-rendered Chromium.

## Customize

- `src/physics.js`: wave parameters, top speed, boost, gravity, and jump behavior.
- `src/course.js`: gate and ramp positions, race progression, and lap timing.
- `src/racers.js`: opponent personalities, racing lines, ramp approach logic, standings, and the race lap count.
- `src/ramps.js`: floating ramp models and wave-conforming aprons.
- `src/world.js`: ocean shader, procedural models, buoys, and spray.
- `src/style.css` and `index.html`: visual identity and interface.
- `src/audio.js`: synthesized sound.

Keep the swell expression in `waveHeight` and the GLSL `waveFunction` synchronized when changing the large swell. The smaller wave terms are shared automatically.
