# Pelican act, part: the left crank and pedal

This is an experiment outside Dead Acre. Twelve runs of this bench each build one part of one scene in parallel: a realistic pelican riding a unicycle on a seaside boardwalk while juggling three bowling pins. The parts are assembled and animated afterwards in three.js code. You build exactly one part and nothing else. No web page, no animation clips, no other parts.

Read `CONTRACT.md` in the repository root first. It holds the shared space, the joins, the budgets and the delivery rules, and it wins over your usual defaults. `reference/pelican-turnaround.png` is the bird all bird parts must match.

## Your part

A unicycle's LEFT crank arm and pedal. The assembler mirrors it for the right side.

- Origin: on the wheel's axle line, at the inner face of the crank. The axle runs along X; this part sits on the +X side.
- Nodes, named exactly: `crank` (origin at the axle; a forged chrome arm hanging straight down along -Z, 0.11 from the axle to the pedal spindle, about 0.02 thick, occupying X from 0 to 0.02) and `pedal`, a child of `crank` with its origin on the spindle at (0.07, 0, -0.11).
- The pedal: a flat platform pedal 0.10 along X, 0.09 along Y, 0.025 thick, centred on its origin, black with a grippy top, small orange reflectors front and back. It spins freely on the spindle, so the assembler counter-rotates it to stay level under the foot.
- A short spindle joins the two.
- No bird reference needed for this part.

## Budget

500 triangles. One 512 texture set. Up to two materials.

## Checkpoints

Nobody is available during this run:
- skip Concept: Build it
- No clips are made, so the Motion fork does not arise.

Do not ask questions. Make the best call yourself, write it in `part.json`, and keep going. Aim to finish inside 45 minutes: a clean part that meets the pivots and sizes beats a detailed one that does not.

## Done

- `/outbox` holds the files `CONTRACT.md` lists, under 15 MB.
- Report: what the gate said, the measured bounding box and node positions against the numbers above, the outbox size, and anything that falls short.
