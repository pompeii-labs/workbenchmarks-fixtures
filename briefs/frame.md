# Pelican act, part: the unicycle frame and saddle

This is an experiment outside Dead Acre. Twelve runs of this bench each build one part of one scene in parallel: a realistic pelican riding a unicycle on a seaside boardwalk while juggling three bowling pins. The parts are assembled and animated afterwards in three.js code. You build exactly one part and nothing else. No web page, no animation clips, no other parts.

Read `CONTRACT.md` in the repository root first. It holds the shared space, the joins, the budgets and the delivery rules, and it wins over your usual defaults. `reference/pelican-turnaround.png` is the bird all bird parts must match.

## Your part

A circus unicycle's fork, seat post and saddle. No wheel, no cranks, no pedals.

- Origin: the centre of the wheel's axle. The axle runs along X.
- The wheel it must clear has radius 0.26 and a tyre 0.05 wide.
- Fork: two chrome legs from bearing holders at (+0.055, 0, 0) and (-0.055, 0, 0) up to a crown at Z = 0.29.
- Seat post from the crown up to Z = 0.37, with a clamp.
- Saddle: a classic curved unicycle saddle, its top at Z = 0.40 at the centre, rising a little at front and back, 0.24 long along Y, 0.13 wide, with a bumper at front and back. Red vinyl, a little worn (use `--keep-red` on concept images).
- An empty named `seat` at (0, 0, 0.40), where the rider sits.
- One node named `frame` holding everything. It rocks forward and back about the axle as the rider balances.
- No bird reference needed for this part.

## Budget

1,200 triangles. One 512 texture set. Up to two materials (chrome, vinyl).

## Checkpoints

Nobody is available during this run:
- skip Concept: Build it
- No clips are made, so the Motion fork does not arise.

Do not ask questions. Make the best call yourself, write it in `part.json`, and keep going. Aim to finish inside 45 minutes: a clean part that meets the pivots and sizes beats a detailed one that does not.

## Done

- `/outbox` holds the files `CONTRACT.md` lists, under 15 MB.
- Report: what the gate said, the measured bounding box and node positions against the numbers above, the outbox size, and anything that falls short.
