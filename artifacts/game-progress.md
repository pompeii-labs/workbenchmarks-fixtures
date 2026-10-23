# Progress

## Intent / constraints
Small 3D jet-ski game (three.js): choppy open water, third-person, launch off swells.
Fast, splashy, fun free-roam. Must build to an uploadable static site. No user input available.

## Decisions
- Scaffold via tgnew (Vite + TS + three). `base: './'` for any static host/subfolder.
- Unbounded ocean with recycling content (no trap boundaries).
- Fail state = wipeout on a sideways landing after real air (>0.3 s); auto respawn. Hands-off in the air auto-straightens the nose within ~63°.
- Short chop hops (<0.25 s) carve instead of spin, so casual turning never wipes out.
- Test hooks only in `build:test` (vite `--mode test`), gated inside method bodies so prod drops them.
- All visuals procedural (no asset generators in this bench).

## Done
- Design brief, sim, render, UI, touch, audio, hooks, evidence manifest, 7 playtest sections.
- pass-7: tgcheck PASS with full playtest.

## Remaining defects / ideas
- Jet ski reads a bit boxy from directly behind; rooster tail is modest at 1:1 camera distance.
- No real-GPU / phone perf measurement.
