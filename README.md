# The Juggling Pelican

A single full-screen page: a pelican rides a unicycle round a circus ring while
juggling three bowling pins, rendered in real time with three.js. Everything is
modelled and animated in code; there are no model, texture or animation files.

## Run

```sh
npm install
npm run dev        # development server
npm run build      # static site in dist/
npm run preview    # serve dist/ locally
npm test           # numerical checks on the choreography
```

`dist/` is self-contained (relative asset paths) and can be put on any static host.

Drag with a mouse or a finger to orbit; scroll or pinch to zoom. Left alone, the
camera drifts slowly round the act. With `prefers-reduced-motion` the page shows
one still frame, which can still be turned by hand.

## How it holds together

The whole act is a pure function of time (`src/act.js`); no state is carried
from frame to frame, so there is no loop point and no seam.

- **Ride.** Forward speed is a cruise plus a few incommensurate surges; distance
  is its exact integral. The wheel angle is `distance / wheel radius`, the cranks
  are fixed to the wheel, and the feet are solved onto the pedals.
- **Balance.** The frame leans into its own acceleration, as an inverted
  pendulum has to, and into the turn. Because the surges never line up, it never
  settles.
- **Juggling.** A three-pin cascade. Each throw is a true ballistic arc in world
  space, aimed from where the releasing wing is to where the catching wing *will
  be* when the pin comes down. Pins turn exactly once end over end per flight.
  In the wing, a pin is carried down through a scoop and released with exactly
  the velocity and spin the next flight needs.
- **Reactions.** Wing tips are solved onto the pins (or reach for the next one);
  the body rocks and dips with each throw, the head follows the pins, and the
  pouch swings a beat behind.

`npm test` samples the act at 240 Hz and checks these properties, including
that the pins never touch each other or the bird's bill.

## Layout

- `src/act.js` – timing, ride, balance, pin and wing-tip trajectories
- `src/performer.js` – pelican, unicycle and pins, built from primitives
- `src/stage.js` – ring, tent, lights
- `src/main.js` – renderer, camera, input, reduced motion

Two query parameters exist for inspection: `?still&t=12.3` freezes the act at a
given time, and `?rel=0` keeps the camera at a fixed angle to the rider.
