# Espresso

A real-time WebGL scene of a cup of espresso. Move the cursor (or a finger) across the
cup: the cursor's speed is the force on the liquid. Waves travel, reflect off the cup wall
and interfere; the crema is carried, stretched and parted by the motion, then everything
settles over a few seconds. With `prefers-reduced-motion: reduce` a single still frame is shown.

```sh
npm install
npm run dev      # development server
npm run build    # production build in dist/
npm run preview  # serve the production build
```

How it works (all on the GPU, `src/sim.js`):

- **Waves**: height field on a 256² grid, integrated at a fixed 240 Hz with a 9-point
  Laplacian; reflective (Neumann) boundary at the circular wall.
- **Surface current**: a 128² incompressible flow (semi-Lagrangian advection + Jacobi
  pressure projection) dragged by the cursor.
- **Crema**: a coordinate map advected by current + wave orbital motion, so the
  procedural crema pattern (`src/liquidShader.js`) is carried and stretched; a "parting"
  channel lets fast strokes reveal the dark coffee beneath.
- **Shading**: normals from the height field, Fresnel reflection of a procedural studio
  environment (cube map), refraction offset of the crema, key-light glints.

`?fixeddt` forces a 1/60 s step per frame (used for deterministic headless testing).
