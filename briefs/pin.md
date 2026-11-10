# Pelican act, part: a juggling bowling pin

This is an experiment outside Dead Acre. Twelve runs of this bench each build one part of one scene in parallel: a realistic pelican riding a unicycle on a seaside boardwalk while juggling three bowling pins. The parts are assembled and animated afterwards in three.js code. You build exactly one part and nothing else. No web page, no animation clips, no other parts.

Read `CONTRACT.md` in the repository root first. It holds the shared space, the joins, the budgets and the delivery rules, and it wins over your usual defaults. `reference/pelican-turnaround.png` is the bird all bird parts must match.

## Your part

One bowling pin, the kind a circus juggler throws.

- Classic tenpin shape: 0.38 tall, 0.12 across at the belly, a narrow neck about 0.045 across, a rounded head.
- Stands along Z. Origin at the centre of mass: on the axis, 0.15 above the base. It tumbles end over end about this point.
- Glossy white with two red stripes round the neck (use `--keep-red` on concept images), and a few scuffs so the tumble reads. Add one small mark on one side only (a maker's crest in a plain invented shape, no real brand) so spin about the long axis reads too.
- A node named `pin`. An empty named `neck` on the axis at the narrowest point, where a wing grips it.
- No bird reference needed for this part.

## Budget

400 triangles. One 512 texture set (colour, normal, roughness if useful). One material.

## Checkpoints

Nobody is available during this run:
- skip Concept: Build it
- No clips are made, so the Motion fork does not arise.

Do not ask questions. Make the best call yourself, write it in `part.json`, and keep going. Aim to finish inside 45 minutes: a clean part that meets the pivots and sizes beats a detailed one that does not.

## Done

- `/outbox` holds the files `CONTRACT.md` lists, under 15 MB.
- Report: what the gate said, the measured bounding box and node positions against the numbers above, the outbox size, and anything that falls short.
