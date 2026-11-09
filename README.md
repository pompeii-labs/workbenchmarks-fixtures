# The Juggling Pelican

A real-time three.js scene: an American white pelican rides a unicycle around a
circus ring while juggling three bowling pins. Everything (models, textures,
animation) is generated in code.

```sh
npm install
npm run dev      # local dev server
npm run build    # static site in dist/ (relative paths, host anywhere)
npm run preview  # serve the built site
```

Drag (mouse or touch) to orbit; the camera otherwise drifts on its own.
With `prefers-reduced-motion: reduce` a single still frame is rendered.

How the motion holds together (`src/motion.js`): every pose is a pure function
of time. The frame's pitch is a sum of incommensurate sines and the wheel's
acceleration is proportional to that lean, so speed, distance and wheel angle
(`distance / radius`) follow analytically; the cranks are fixed to the wheel and
the legs are solved with IK onto the pedals. Pins fly true ballistic arcs in
world space from the throwing wing's grip at release to the catching wing's
grip at catch time, with one end-over-end turn per throw (3-pin cascade).

Debug URL params: `?t=5` freeze at a time, `?still` force the still frame,
`?cam=<radians>` / `?zoom=` / `?aim=` adjust the initial view.
