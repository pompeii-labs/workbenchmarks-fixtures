# The Great Pelicano

A real-time three.js scene: a white pelican rides a unicycle around a circus ring while
juggling three bowling pins. Everything (models, textures, animation) is built in code.

```
npm install
npm run dev        # http://127.0.0.1:5188
npm run build      # static site in dist/ (relative paths, host anywhere)
npm run preview    # serve dist/ on http://127.0.0.1:4188
```

Drag with a mouse or finger to orbit; the camera drifts on its own otherwise.
With `prefers-reduced-motion: reduce` the page shows a still frame of the act.

## How the motion holds together

All motion is a closed-form function of one clock (`src/motion.ts`), so it never loops
and has no seam:

- **Balance:** fore-aft lean is a sum of three incommensurate sways. Like a real rider,
  the wheel accelerates under a forward lean and slows under a backward one; speed and
  distance are the exact integrals of that response.
- **Pedalling:** the wheel angle is distance / radius (rolling without slip). The cranks
  are fixed to the hub (direct drive), and the legs reach the pedals with two-bone IK.
- **Juggling:** a three-pin cascade. Each pin flies a true ballistic arc (g = 9.81) from
  one wing to the other, spinning end over end once per throw. In the wing it eases to rest
  and gets flicked into the next throw. Wings are IK chains to the grip point.
- **Reactions:** shoulders lift into each throw, the body twists, the head dips at
  catches and follows the highest pin, and the throat pouch wobbles after each catch.

`npm run build:test` makes a build with test hooks (`.env.test`). The production build
contains none of them.
