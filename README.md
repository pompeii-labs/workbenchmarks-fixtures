# Espresso

A real-time cup of espresso. Move the cursor across the cup, or drag a finger
on a phone. A slow drag leaves a gentle wake, and a fast swipe throws a wave
that bounces off the porcelain. The crema is carried and torn by the motion.

Three.js `WebGPURenderer` with TSL node materials. WebGPU where it is
available, the WebGL2 fallback everywhere else (`?backend=webgl` forces it).

```bash
npm install
npm run dev      # http://127.0.0.1:5188
npm run build    # production build in dist/
npm run preview  # serve dist/ on :4188
```

`npm run build:test` builds with the test hooks used by the automated checks
(`scripts/playtest/`). Production builds do not contain them.
