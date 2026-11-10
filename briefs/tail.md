# Pelican act, part: the tail fan

This is an experiment outside Dead Acre. Twelve runs of this bench each build one part of one scene in parallel: a realistic pelican riding a unicycle on a seaside boardwalk while juggling three bowling pins. The parts are assembled and animated afterwards in three.js code. You build exactly one part and nothing else. No web page, no animation clips, no other parts.

Read `CONTRACT.md` in the repository root first. It holds the shared space, the joins, the budgets and the delivery rules, and it wins over your usual defaults. `reference/pelican-turnaround.png` is the bird all bird parts must match.

## Your part

The pelican's short tail: a fan of stiff grey-brown feathers with pale edges, plus the soft cream coverts above and below its root.

- Origin: the tail root, where it joins the rump.
- Rest pose: extends toward +Y and slightly down (about 15 degrees below horizontal), 0.20 long, fanned to about 0.22 wide at the tip.
- One rigid mesh on a node named `tail`. The assembler wags and dips it as the bird balances.
- The root carries coverts reaching 5 cm past the origin toward -Y to overlap the body.
- Individual feather shapes should read at the tip. Cut-out transparency is allowed on the feather tips.

## Budget

400 triangles. One 512 texture set (colour with alpha, and normal). Double-sided.

## Checkpoints

Nobody is available during this run:
- skip Concept: Build it
- No clips are made, so the Motion fork does not arise.

Do not ask questions. Make the best call yourself, write it in `part.json`, and keep going. Aim to finish inside 45 minutes: a clean part that meets the pivots and sizes beats a detailed one that does not.

## Done

- `/outbox` holds the files `CONTRACT.md` lists, under 15 MB.
- Report: what the gate said, the measured bounding box and node positions against the numbers above, the outbox size, and anything that falls short.
