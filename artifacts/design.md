# Espresso: design brief

**Intent.** One full-screen real-time scene: a shallow porcelain cup of
espresso with crema, three-quarter view from above. The liquid surface is the
product. The only text is a small title with a one-line hint.

**Core loop contract** (interaction, not a game):
- Input: the cursor over the cup (mouse/pen hover, or a finger while touching).
- Response: cursor *speed* is the force. Slow drag gives a gentle wake. A fast
  swipe throws a strong wave that travels, reflects off the wall and
  interferes with other waves.
- Release: when the cursor stops or leaves, the waves settle to calm in about
  3 s (5% rms) and reach full rest in about 7 s. The crema keeps the marks
  and relaxes back over about 25 s.
- Reduced motion: one composed still (a spiral stir, frozen), with no
  animation and no input.

**Simulation.** Linearised shallow-water equations on a 128x128 staggered
grid, fixed 200 Hz step, inside a circular reflecting wall. The cursor pulls
the liquid toward its own velocity; grip and footprint both grow with speed.
The crema is a material-coordinate field, advected semi-Lagrangian at 50 Hz.
Its thickness is the Jacobian of that map, so stretched crema thins and shows
the black espresso underneath. Plain typed arrays, no DOM; the only command
type is `{x, y, active}`.

**Rendering (TSL, WebGPU + WebGL2).** Liquid: a custom unlit node material.
Vertex height comes from the field. Per-pixel normals come from the gradient
texture plus the meniscus. Crema is sampled at the advected coordinate from a
pattern baked once on the GPU. Refraction: the deeper layer is seen through
the refracted view ray. Fresnel reflection is either an analytic studio
window with mullions or, where the reflected ray hits the cup, the porcelain
wall (ray-cylinder test). Also: an analytic wall shadow and key-light glints.
Porcelain, saucer and walnut table are lathed or procedural PBR, lit by a
PMREM bake of the same studio function. No downloaded assets.

**Budgets.** About 10 draw calls, 1 shadow map (1024), 2 small half-float
data textures uploaded per active frame, 1 baked 1024² pattern. The JS
bundle is about 233 kB gzip. Idle frames skip simulation and rendering.
