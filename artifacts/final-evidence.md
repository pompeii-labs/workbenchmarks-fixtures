# Final evidence

Build: `npm run build` (production) and `npm run build:test` (adds the test hooks).

## Gate
- `tgcheck` pass-10: PASS. The tsl lint, typecheck and build passed. Five
  captures came out non-blank with no browser errors and within budget.
  WebGPU vs WebGL2 parity passed for all four states compared (wake, calm,
  settled, still): mean diff 0.04 to 0.05, 0% of pixels far off.
- Full playtest on the final build: PASS (`tgcheck: PASS (full playtest on this build)`).

## Screenshots (WebGL2 path, full pipeline)
- artifacts/pass-10/desktop-calm.png: calm crema with the window and mullion reflection
- artifacts/pass-10/desktop-wake.png, mobile-wake.png: 0.12 s after a fast S-swipe. Bow waves, glints and torn crema
- artifacts/pass-10/desktop-settled.png: 5 s later. The surface is flat and the crema keeps the stretched marks
- artifacts/pass-10/mobile-still.png: the reduced-motion still (frozen spiral stir)
- WebGPU frames: artifacts/pass-10/webgpu/*-webgpu.png (linear, no tone mapping)

## Playtest (real mouse, CDP touch, emulated media)
- force: the same path driven slow (20 moves) and fast (3 moves). The fast
  swipe was measured as faster and threw a much stronger wave (>3x the peak
  height). The crema was carried.
- settle: rms fell to 5% in 3.2 s of sim time after the cursor stopped, and
  the sim reached full rest (idle) after 7.0 s.
- reflection: a drop at the centre; the centre stays quiet, then the
  wall-reflected ring refocuses there (echo more than 3x the quiet level).
- touch (390x844, hasTouch): a finger swipe makes waves (peak 0.036) and
  carries the crema. Lifting the finger releases the liquid.
- reduced-motion: the still frame shows stirred crema. No sim steps and no
  re-renders while the pointer moves.

## Bundle
- Production JS: 838 kB raw / 233 kB gzip, single file. No other downloads (all procedural).
- `grep` of the production bundle for the hook and diagnostics globals: no matches.

## Not verified
- Real-GPU frame rate. Everything here ran on SwiftShader; sim CPU cost was
  measured in Node: about 0.57 ms per 200 Hz step, plus about 1 ms per frame to pack.
- WebGPU on real GPUs and browsers, real touch hardware, Safari/iOS.
