# How a solar cell works

A single interactive page that follows sunlight from the surface of the sun, into a
slice of silicon, and out through a wire as electric current. Written for a curious
adult with no physics background.

## Run it

```sh
npm install
npm run build      # writes the static site to dist/
```

Then open `dist/index.html` in a browser. No server is needed: the build emits plain
scripts with relative URLs, so the page works straight from disk (`file://`) or from
any static host.

Other commands:

```sh
npm run dev        # rebuild on change and serve at http://localhost:5173
npm test           # unit tests for the physics (Node 22.6+; uses built-in TypeScript support)
npm run typecheck  # tsc --noEmit
```

## What is on the page

| Chapter | Told with | Why that form |
| --- | --- | --- |
| A photon leaves the sun | Illustration: random walk inside the sun, then a to-scale strip to Earth with a clock | The contrast between "staggering" and "straight line", and the emptiness of space, are visual ideas |
| Not all photons are equal | Chart: measured solar spectrum with a scrubber giving photon energy | It is data; the shape of the curve is the point |
| Silicon and its rule | 3D crystal; then a 2D energy diagram you fire photons at | The lattice is a 3D shape; the band gap is a one-dimensional idea (energy), so it is flat |
| What the rule costs | Chart: stacked energy budget against band gap, computed live | A trade-off between two losses is best seen as areas |
| Building a one-way street | 3D crystal with dopant atoms; then a 2D particle simulation of the junction | Doping is about where atoms sit; the junction is a process in a cross-section |
| The whole cell | 3D exploded model with photons, carriers, wire and lamp | A layered object is best understood by taking it apart |
| Volts, amps and the sweet spot | Chart: current–voltage curve with a draggable load | Power as the area of a rectangle only works on a chart |
| From one cell to a rooftop | Diagram: 60-cell panel you can shade | A wiring layout, so a flat schematic |

## How it is built

- No framework. TypeScript, bundled with esbuild (`build.mjs`).
- `src/physics.ts` holds all the physics with no DOM code: photon energy, the
  ASTM G173-03 reference spectra (`src/data/am15.ts`), a Shockley–Queisser
  detailed-balance calculation, and a single-diode cell model. `test/physics.test.ts`
  checks it against published values.
- Charts are hand-written SVG, redrawn at the real pixel width so text stays sharp
  on phones. Simulations are 2D canvas.
- The 3D scenes use three.js. They are a separate bundle (`dist/assets/scene3d.js`,
  about 145 kB gzipped) that is only fetched when a 3D figure approaches the
  viewport. Before that the page needs about 25 kB of script, 4 kB of CSS and
  130 kB of fonts (all gzipped or already compressed).
- Animations pause when off screen or when the tab is hidden. With "reduce motion"
  set, the decorative animation and auto-rotation are off.

The simplifications made for the reader, and the sources of the numbers, are listed
at the end of the page itself under "What was simplified".
