# Caffè Scavo scene handoff

The four stills below are the finished fallbacks and composition references. The real-time scenes that replace them are now built; see **Implementation** at the end of this file. The contract that follows is unchanged and the scenes follow it.

## Shared integration contract

### Mount anatomy

Each scene has one stable mount:

```html
<div
  id="scene-espresso"
  class="scene-mount ..."
  data-scene="espresso"
  data-scene-state="idle"
  data-progress="0"
>
  <div class="scene-fallback" data-scene-fallback>
    <img alt="..." />
  </div>
</div>
```

- Find mounts with `[data-scene]` or by the IDs listed below. Do not replace the mount itself; the scroll controller owns its attributes.
- Append the renderer canvas as a **direct child** of the mount. Existing CSS sizes direct child canvases to `position: absolute; inset: 0; width: 100%; height: 100%` at `z-index: 1`. Set the canvas to `aria-hidden="true"`.
- Keep `[data-scene-fallback]` in the DOM for accessibility and failure recovery. Add `.has-scene-renderer` to the mount **only after the first complete rendered frame**. That class fades the still to opacity zero. Remove it whenever the renderer stops or reduced motion becomes active.
- Existing hero labels and captions sit at `z-index: 2`; keep them legible. The craft scene names and specifications are outside the mount in the stage toolbar and footer.
- Use a `ResizeObserver` on each mount. The camera and renderer must follow its actual content box, not `window.innerWidth`. Craft mounts change from square to a wider crop on phones.

### Progress and activity attributes

The page updates these attributes in `src/scenes.ts`:

| Attribute | Values | Meaning |
| --- | --- | --- |
| `data-progress` | `0.000` to `1.000` | Normalized local scene progress. Read the current value when initializing. |
| `data-scene-state` | `idle`, `active`, `static` | `active` means visible and selected for animation. `idle` means retain the current frame but pause expensive work. `static` means reduced motion is active and the still must remain visible. |
| `data-autoplay` | `true` on the hero only | The hero may run its own visible physical extraction loop in addition to its scroll controlled camera. |

A renderer initialized after the first page update must read these attributes rather than assuming zero progress.

### Events

Every update dispatches a bubbling `scavo:scene` `CustomEvent` **from the affected mount**. Listen on the mount or on `document` and inspect `event.detail`:

```ts
type SceneProgressDetail = {
  scene: 'hero-extraction' | 'espresso' | 'milk' | 'latte';
  progress: number;                 // 0 to 1, rounded to three decimals
  active: boolean;                  // safe to animate while visible
  direction: -1 | 0 | 1;            // scroll up, stationary, scroll down
  reducedMotion: boolean;           // true requires the static fallback
  source: 'initial' | 'scroll' | 'resize' | 'preference' | 'request';
};
```

The exported TypeScript types are in `src/scenes.ts`.

After registering a renderer, request the latest state by dispatching:

```js
document.dispatchEvent(new CustomEvent('scavo:scene-ready', {
  detail: { scene: 'espresso' }
}));
```

The mount replies with a `scavo:scene` event whose `source` is `request`. This avoids a race with the page's initial update.

Updates are emitted on scroll and resize through one on-demand `requestAnimationFrame`; there is no perpetual page level animation loop. Repeated values below `0.002` and unchanged activity states are suppressed during scrolling. Renderers may smooth toward a new progress value, but they must stop their frame loop when settled, offscreen, hidden in another tab, or reduced motion is requested.

### Scroll geometry

For each craft chapter, the page computes a viewport focus line at **55% of the viewport height**. If the article's document top is `top` and its height is `height`:

```txt
focusY = window.scrollY + window.innerHeight × 0.55
progress = clamp((focusY - top) / height, 0, 1)
```

The chapter is selected when the focus line lies inside that article. Before chapter one, chapter one is selected at progress zero; after the final chapter, chapter three remains selected at progress one. A craft scene's event `active` value is true only when it is selected, its own mount intersects the viewport, **and** some of `#craft` intersects the viewport.

The hero uses a different calculation because it introduces the page:

```txt
progress = clamp(-hero.getBoundingClientRect().top / (hero.offsetHeight × 0.85), 0, 1)
```

Its event `active` value is true whenever the hero intersects the viewport.

### Responsive layouts

- **Desktop, 1024px and wider:** every chapter is a two column grid. Its own scene sits in the left column and sticks at `top: 96px` while that chapter progresses. The scene viewport is square and the chapter copy scrolls on the right.
- **Phone and tablet below 1024px:** each scene sits directly above its own copy in normal document flow, with no sticky positioning and no overlap. The scene viewport has a `4 / 3` aspect ratio. Compose with extra horizontal clearance and fit to the mount so the cup, pitcher, pour, and steam are not cropped.
- **Reduced motion at every width:** the same mounts keep their finished stills, but sticky positioning and all progress animation are disabled. Chapters remain in reading order. Do not initialize renderers or GPU work in this mode.

## Scene 1: hero extraction

**Mount:** `#scene-hero-extraction`

**Scene key:** `hero-extraction`

**File:** `public/images/hero-extraction-1200.webp` with a `720.webp` responsive alternative

**Source illustration:** `art/hero-extraction.svg`

**Placement:** square hero visual on the right at desktop, below the hero copy on phones

**What to build:** a tactile three quarter view of a steel bottomless portafilter above a warm cream ceramic cup and saucer. Two viscous espresso streams fall from the spouts. The stream colour moves from deep chestnut to tiger striped amber as the shot develops. Crema blooms in the cup, with fine bubbles gathering around the perimeter and a gentle swirl beneath the impact points. Keep the dark handle, worn steel, oxblood background, and broad circular composition of the still.

**Motion and scroll:** `data-autoplay="true"` permits a slow, physically timed extraction loop while `active` is true. Suggested cycle: a brief preinfusion pause, first dark drops, continuous twin streams, then crema bloom and settling. Avoid an obvious reset; begin the next cycle with a freshly engaged portafilter only after the settled frame has held. Scroll progress should mainly direct a restrained camera move from the portafilter toward the cup and a small change in viewing angle. Do not tie liquid viscosity to scroll speed. Pause the internal loop when `active` is false or `document.hidden` is true.

**Reduced motion:** retain the supplied still, do not start a renderer loop, and do not hide the fallback. If the preference changes while the scene is running, stop and reveal this still.

## Scene 2: espresso chapter

**Mount:** `#scene-espresso`

**Scene key:** `espresso`

**Files:** `public/images/espresso-1200.webp`, `public/images/espresso-720.webp`

**Source illustration:** `art/espresso.svg`

**Placement:** scene mount inside `.craft-step-scene` within `[data-craft-step="0"]`

**What to build:** a closer, more analytical companion to the hero, using the terracotta cup and warm plaster background in the reference still. Show a locked in portafilter, two continuous streams, and the cup filling. The important detail is the extraction itself: slight stream oscillation, changing colour and flow rate, tiny crema bubbles, and concentric movement where the streams strike the surface.

**Progress direction:**

| Progress | Physical state |
| --- | --- |
| `0.00` to `0.12` | Tamped coffee is locked in; the cup is empty; first drops gather at the spouts. |
| `0.12` to `0.70` | Twin streams develop and remain continuous. Ease from dark, slow drops to a balanced amber flow. |
| `0.70` to `0.90` | Flow lightens and slows naturally; the liquid level reaches its final height. |
| `0.90` to `1.00` | Streams stop without popping; crema closes over the impact points and large bubbles dissipate. |

Scrub this physical sequence from `data-progress`. The user should be able to reverse it by scrolling up without discontinuities in cup level or crema coverage.

**Reduced motion:** retain the espresso still inside the same chapter mount with sticky positioning disabled. No canvas, particles, or animated progress updates are needed in this mode.

## Scene 3: milk texture chapter

**Mount:** `#scene-milk`

**Scene key:** `milk`

**Files:** `public/images/milk-1200.webp`, `public/images/milk-720.webp`

**Source illustration:** `art/milk.svg`

**Placement:** scene mount inside `.craft-step-scene` within `[data-craft-step="1"]`

**What to build:** an open stainless steel pitcher viewed from above at a slight angle, with a steam wand entering from the upper left and the shaped pouring spout on the right. Cold milk becomes a controlled vortex. Steam must be visibly warm and humid, rising in irregular soft curls rather than a repeated ribbon. The surface should show microfoam forming: fine bubbles, a glossy highlight, and a slow spiral that closes into a smooth finish. Preserve the sage and oxblood colour blocking of the still.

**Progress direction:**

| Progress | Physical state |
| --- | --- |
| `0.00` to `0.15` | Cold, still milk sits below the spout line; the wand engages; the first wisp of steam appears. |
| `0.15` to `0.55` | A stable vortex forms. Introduce air with a subtle surface tremor and sparse fine bubbles, not large soap foam. |
| `0.55` to `0.85` | Stop adding air and fold the microfoam through the milk. Steam thickens modestly as temperature rises. |
| `0.85` to `1.00` | The vortex relaxes into a glossy spiral at the specified 55°C finish; a final swirl catches the light. |

Keep steam and bubbles coupled to the same progress so reverse scrolling remains coherent. If particles are used, pool them and update only while this scene is active.

**Reduced motion:** retain the milk still with its visible steam and finished microfoam inside the same mount. The chapter receives no GPU work or animated progress updates.

## Scene 4: latte art and settling crema

**Mount:** `#scene-latte`

**Scene key:** `latte`

**Files:** `public/images/latte-1200.webp`, `public/images/latte-720.webp`

**Source illustration:** `art/latte.svg`

**Placement:** scene mount inside `.craft-step-scene` within `[data-craft-step="2"]`

**What to build:** a nearly overhead view of a cream cup on a saucer over an oxblood circular table. A steel pitcher enters from the upper left and pours milk into golden crema. Build a recognizable rosetta through the interaction of pour position and liquid surface, not by fading in a finished PNG. The white pattern should emerge leaf by leaf, followed by a thin draw through. Around it, the crema should settle from disturbed rings to a calm, even meniscus with a few small bubbles.

**Progress direction:**

| Progress | Physical state |
| --- | --- |
| `0.00` to `0.28` | Start with a high, thin pour. Milk dives below the crema and the surface turns without revealing a pattern. |
| `0.28` to `0.76` | Lower and widen the pour. White microfoam returns to the surface and alternating rosetta leaves form from the base upward. |
| `0.76` to `0.90` | Lift slightly and draw a narrow stream through the centre to complete the stem and top heart. |
| `0.90` to `1.00` | Stop the pour, let impact rings decay, and hold on the glossy finished drink. Crema remains visible around the art. |

Use restrained pitcher movement and real fluid depth cues. The final drink should read as appetizing coffee, not white paint floating on a flat disc.

**Reduced motion:** retain the latte still showing the completed rosetta and surrounding crema inside the same mount. Do not animate the pour or initialize a renderer.

## Loading, failure, and performance requirements

- Keep the current stills as the instant first paint. Dynamically import the 3D runtime after first paint, behind an idle callback and/or an intersection trigger. Below the fold scenes should not download their renderer or assets on the initial hero request.
- Prefer procedural geometry and small compressed textures. Do not add multi megabyte model files for objects that can be built from lathed or primitive geometry.
- Cap device pixel ratio around `1.5` on phones and `2` on desktop, then tune from measured GPU time. Pause offscreen scenes and when `document.hidden` is true.
- Do not create multiple independent animation frameworks. A shared engine is welcome, but each mount must preserve its own camera, progress, and still fallback.
- On WebGL failure, context loss, or asset error, keep the still visible and the page fully readable. Never leave an empty dark mount.
- The scene must not intercept page scrolling, text selection, or CTA clicks. Set canvas pointer behavior deliberately; every `.craft-step-scene` already uses `pointer-events: none`.
- Test at `390px` and with `prefers-reduced-motion: reduce` after integration. The reduced experience is complete without any scene renderer.

## Existing motion outside the 3D contract

`src/main.ts` owns navigation, viewport reveals, icons, and opening status. `src/scenes.ts` owns tagline word activation and all scene progress. Section reveals use `IntersectionObserver`; scroll work is batched into one animation frame and only requested by scroll, resize, initialization, renderer requests, or preference changes. Do not add a second global scroll listener for individual scene components.

## Implementation (3D pass)

All four scenes are procedural three.js r184 on `WebGPURenderer` (WebGPU first, automatic WebGL2 fallback), with every shader written in TSL node materials. There are no model or texture downloads: cups, saucers, pitcher and portafilter are lathed or primitive geometry; crema, microfoam, the rosetta, streams and steam are shader fields.

| File | Role |
| --- | --- |
| `src/three/boot.ts` | In the main bundle; imports nothing from three. Skips everything under reduced motion or with no WebGPU/WebGL2. Hero starts on idle after first paint; craft mounts preload within 30% of the viewport and are promoted when actually in view. |
| `src/three/engine.ts` | Lazy chunk (~225 kB gzip, the three.js runtime). One `SceneController` per mount: own renderer, camera, `ResizeObserver` on the mount, progress easing, on-demand frame loop, `scavo:scene` listener and `scavo:scene-ready` handshake. Starts are serialized by priority so one scene's shader build never stalls the one in view. The canvas is attached only after the GPU has finished the first frame; then `.has-scene-renderer` is added. Device or context loss, a render exception, or a reduced-motion event disposes the renderer and brings the still back. |
| `src/three/kit.ts` | Props and TSL materials: lathe cup/saucer/pitcher (spout pulled from the rim), portafilter with twin spouts, necking liquid stream, liquid surface whose height field drives displacement and per-pixel normals, espresso crema field, pooled steam (one instanced draw). |
| `src/three/extraction.ts` | The extraction rig shared by hero and espresso: one phase value `e` drives drops, stream head/tail, flow radius, colour, cup level, crema and settling, so scrubbing backward retraces the same states. |
| `src/three/scenes/*.ts` | `hero`, `espresso`, `milk`, `latte`. |
| `src/three/testHooks.ts` | Test build only (`npm run build:test`, Vite `--mode test`). Not present in `npm run build`. |

Frame loop rules: frames are drawn while progress is easing, while the hero's loop plays, or for 18 s of ambient liquid motion (stream oscillation, ripples, steam) after the last scroll change; never when the mount is offscreen, the scene is `idle`, or the tab is hidden. Settled end states (an empty cup at 0, a finished drink at 1) draw nothing. DPR is capped at 1.5 below 1024 px or on coarse pointers and 2 otherwise. Animation reads a per-scene clock uniform advanced by the controller, never the renderer clock.

Scene notes:

- **Hero**: a 27 s cycle: portafilter twists into the group head, preinfusion, first drops, twin streams from chestnut to tiger striped amber, taper, break, crema closes and holds, then the served cup glides out on its saucer while a fresh one slides in. Scroll only moves the camera from the portafilter toward the cup.
- **Espresso**: the same rig on a terracotta cup, scrubbed by `data-progress` per the table above.
- **Milk**: the pitcher rises to a fixed wand (first purge wisp), rides the tip near the surface (vortex, tremor, sparse fine bubbles, volume grows), sinks it to fold (bubbles fold away, gloss and warmth rise, steam thickens), then lowers away with a glossy spiral.
- **Latte**: the pour point and pitcher height follow progress. Phase one dives (crema turns and lightens), then each side-to-side wiggle surfaces a new milk front that pushes older fronts outward with a thin crema line between them, a small heart, and a draw-through that drags every line into a chevron and leaves the stem. Impact rings decay and the pitcher exits.

Rendering uses `NoToneMapping`: `WebGPURenderer` applies tone mapping to the whole frame in its output pass, which shifted the flat brand backdrops, so lights are balanced to stay in range instead.

Verification tools: `npm run verify` (page contract, production build), `npm run verify:scenes` (wheel-scroll through every chapter, reverse, live reduced-motion switch), `scripts/scene-shots.mjs` and `scripts/scene-sequence.mjs` (test build: mount screenshots and progress contact strips), and the bench gate `tgcheck` with `artifacts/evidence.json`.
