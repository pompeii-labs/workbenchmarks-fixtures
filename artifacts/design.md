# Tidehopper — design brief

- Fantasy: a happy dolphin hopping swells along a sunset coast. Cozy, vibrant, low-stress.
- Camera: third person behind the travel heading (not the trick spin), lifts with jumps.
- Core loop (≈2–4 s): dive (S) to build speed → pull up (W) as a swell's front face rises → in air flip (W/S), spin (A/D), roll (Q/E) → release so the nose follows the arc → splash down → popup with multipliers.
- Wave lift: launch vy += 1.3·max(0, ∂h/∂t) + 0.75·max(0, v·∇h). Swells roll toward the shore (+x), so heading seaward up a rising face stacks both terms ("Perfect wave launch").
- Score per jump: (100 + 400/flip + 300/spin + 250/roll) × combo-variety × height mult (1 + peak/2.5) × landing (Silky 2, Clean 1.5, Splashy 1, Belly flop 0) × chain (+0.5 per clean trick, max 4, reset on belly flop).
- Landing smoothness: angular error between body and its own arc at entry (flip/spin residuals, roll weighted 0.6).
- Pressure: 90 s run; fail-ish outcome is belly flops (0 points, chain reset). Fast retry from the results card.
- Boundaries: soft steering push near the beach (x>24) and open sea (x<-54); heading eases back past ~70°.
- Sim: plain data, fixed 1/60 step, one DolphinCommand type, seeded RNG for wave phases and scenery.
