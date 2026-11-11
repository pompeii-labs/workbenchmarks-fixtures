# From sunlight to current

A single interactive page that explains how a solar cell works, following one photon from the Sun to the current in a wire.

```sh
npm install
npm run build      # type-checks, then builds the static site into dist/
```

Open `dist/index.html` straight from disk (no server needed) or host `dist/` anywhere.
`npm run dev` starts a live-reload dev server. `npm run check:physics` prints the model's key numbers next to published reference values.

- `src/physics.ts`: spectrum, band-gap budget, Shockley–Queisser limit, silicon absorption, single-diode cell model
- `src/charts.ts`, `src/widgets.ts`, `src/junction.ts`, `src/iv.ts`: SVG and canvas figures (no chart library)
- `src/three/index.ts`: the two three.js scenes, built as a separate classic script that loads only when a 3D figure nears the viewport
