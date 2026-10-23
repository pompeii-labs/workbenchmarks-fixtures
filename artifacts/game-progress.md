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

## Race track update (this run)
Intent: add a buoy race course with real turns, ramps for big jumps, lap timing with best lap; keep the open-water feel; still a static build.
- `src/sim/course.ts`: closed Catmull-Rom loop (1146 m), 8 gates, 3 floating ramps, spawn 40 m before the start line.
- Sim: ramp deck as a riding surface (entry from the low end, solid sides/lip, fall-off at low speed, surface-rate clamp so edges never rocket-launch), gate pylon collisions, ordered gate crossing with sub-step lap timing, best/last lap.
- Render `src/render/Course.ts`: instanced pylons, start banner (raised to 8.2 m and fades near the camera), turn-only marker buoys, procedural ramps (canvas chevron texture), next-gate light bar + beacons. Grid buoys are kept off the course.
- HUD: lap/gate/time/best/last panel, gate arrow + distance, start/wrong-way/missed-gate messages, lap banner. Best lap persists in localStorage.
- Autopilot drives the title attract mode and test states; it also publishes a steer hint used by the keyboard playtest bot.
- Playtest: new sections ramp, race-lap (full lap with real keys), race-guide. pass-17: tgcheck PASS, full playtest PASS.

Remaining: the gate arrow can overlap the rider's head during big air on mobile; the bot lap (~69 s) is slower than a good human line.
