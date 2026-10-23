# WAKE RUN

A static Three.js jet ski game about chasing the swell. Free ride across open
water, build speed, and launch naturally off wave faces. Land jumps for points
and chase your session's best air. The blue gates are optional: follow them for
another challenge, or ignore them and explore. There is no mandatory race route.

## Run Locally

Use a current Node.js version supported by Vite (Node 22.12+ recommended) and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, then select **LET'S RIDE**.

## Controls

| Action             | Keyboard                      |
| ------------------ | ----------------------------- |
| Accelerate         | W or Up arrow                 |
| Brake              | S or Down arrow               |
| Steer left / right | A / D or Left / Right arrows  |
| Boost              | Hold Space while accelerating |
| Pause / resume     | P or Esc                      |
| Toggle sound       | M                             |
| Reset position     | R                             |

Boost requires acceleration and some forward speed. It consumes reserve while
active and regenerates when inactive. Braking stops the ski; it does not reverse.
Jumping is automatic when you hit a suitable swell at speed, not a separate key.

Position reset retains your session rather than starting a new one. Use
**START A FRESH SESSION** in the pause menu when you want to clear session progress.
The on-screen pause and sound buttons are also available.

On mobile, use the touch steering arrows and **GAS**, **BRAKE**, and **BOOST**
buttons. Hold **GAS** and **BOOST** together to boost. Use the on-screen settings
buttons to pause or toggle sound.

## Test

```sh
npm test
```

The physics tests use Node's built-in `node:test` runner without a browser. They
cover deterministic water and its spatial derivatives, acceleration and speed
limits, boost prerequisites and reserve management, braking, steering, natural
swell launches, landing scores and best air, and ordinary frame-step sizes.
For the browser smoke tests, install Playwright's Chromium and run:

```sh
npx playwright install chromium
npm run test:browser
```

These test the production build: rendering without errors, keyboard driving,
boost, jumps and landings, gate scoring, pause/resume, sound, session resets,
and mobile layout and touch controls. Set `CHROMIUM_PATH` to use an existing
Chromium executable instead of the Playwright-managed browser.

## Build And Deploy

```sh
npm run build
npm run preview
```

The production build is written to `dist/`. Preview serves that build locally;
it is not a production backend. Deploy the contents of `dist/` to any static
HTTP(S) host. Vite uses a relative base (`./`), so the game can live at the root
or in a subfolder without changing asset URLs. Serve it over HTTP(S), rather
than opening `index.html` directly with `file://`.

No backend, account, or CDN-hosted external assets are needed at runtime.
Three.js is installed through npm and bundled into the build. The game's
visual assets are generated in code; no separate art downloads are required.

## Browser Requirements

Use a current desktop or mobile browser with WebGL support and hardware
acceleration enabled. Rendering performance depends on the device and GPU.
Sound may require a user gesture before the browser permits audio playback.
