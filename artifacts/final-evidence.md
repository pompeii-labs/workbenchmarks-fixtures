# Tidehopper — final evidence

- Gate: `tgcheck . --next --playtest scripts/playtest.mjs` → PASS (full playtest on this build), run pass-8, 7 captures, 20/20 playtest checks.
- Screenshots: artifacts/pass-8/{desktop-title,desktop-active-play,mobile-active-play,desktop-airborne-trick,mobile-airborne-trick,desktop-results,mobile-paused}.png
- Renderer (active play, desktop): 137 draw calls, ~77k triangles, 93 geometries, 2 textures. FPS not measured (software rendering).
- Playtest sections (real keyboard / CDP touch input): jump-trick, belly-flop, pause-end-retry, boundary, mobile.
- Production bundle grep: no test-hook or diagnostics names.
- Unverified: GPU frame rate, audio output, real touch hardware.
