# A Fine Balance

A full-screen, procedural Three.js performance: an ivory pelican pedals a unicycle along a quiet promenade while juggling three bowling pins. No downloaded models, textures, fonts, or animations.

## Run

Requires Node.js 20.19+, 22.12+, or a newer supported release, and npm.

```sh
npm install
npm run dev
```

Open the local address printed by Vite. Drag with a mouse or one finger to orbit; the focused canvas also supports the arrow keys. The camera otherwise drifts gently. The operating system's reduced-motion preference shows a composed still frame; manual orbit remains available.

## Build

```sh
npm run build
npm run preview
```

Deploy the contents of `dist/` to a static host. There is no backend or runtime network dependency. The production JavaScript is approximately 147 kB gzipped, including Three.js; Vite's default 500 kB uncompressed-chunk advisory is expected.

## How It Works

- The pelican is constructed from a shaped torso, a curved neck, custom bill and throat-pouch surfaces, layered feathers, and extruded webbed feet. Lighting, environment reflections, and shadows are computed locally.
- A three-pin cascade throws every 0.72 seconds. Each pin flies ballistically for 1.80 seconds and spends 0.36 seconds in a wing. The complete juggling pattern repeats every 4.32 seconds without wrapping global time.
- The two flight directions use shallow, parallel depth lanes, keeping the full-size pins clear of each other and the bill. Wings transfer the pins between lanes during their catch-and-throw scoop.
- Hermite curves match the rotating grip's position and velocity at catch and release. Pin rotation also has continuous angular velocity. Fixed-length, two-link wing and leg articulation reaches the grips and pedals without stretching. Wing targets are transformed into the leaning bird's local frame, so balance corrections do not steer airborne pins.
- Road movement, wheel rotation, and opposite cranks use one traveled-distance function. Frame-pitch compensation keeps the wheel's world rotation synchronized with the road; the webbed feet stay on the pedals.
- Pixel density is capped at 1.75. Paving joints and wheel spokes are instanced, geometry is reused, hidden tabs stop rendering, and a reduced-motion view stops requesting frames once interaction settles.

## Verify

```sh
npm test
npx playwright install chromium
npm run test:browser
```

To use an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when running browser tests.

The unit suite checks cycle continuity, exact beat boundaries across thousands of loops, grip attachment, catch/release velocities, ballistic motion, conservative pin collision bounds, wheel rotation, and pedal phase. Browser tests build and serve the production site, check four desktop/phone/landscape viewports, mouse and touch orbit, keyboard control, still reduced-motion frames, live preference changes, and WebGL context-loss recovery.

Desktop and phone frames were also visually inspected in Chromium. The development environment has software rendering and no GPU, so ordinary-laptop GPU frame rate and physical iOS/Android devices could not be measured directly.
