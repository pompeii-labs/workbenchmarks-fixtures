# Pelican act, part: the left wing

This is an experiment outside Dead Acre. Twelve runs of this bench each build one part of one scene in parallel: a realistic pelican riding a unicycle on a seaside boardwalk while juggling three bowling pins. The parts are assembled and animated afterwards in three.js code. You build exactly one part and nothing else. No web page, no animation clips, no other parts.

Read `CONTRACT.md` in the repository root first. It holds the shared space, the joins, the budgets and the delivery rules, and it wins over your usual defaults. `reference/pelican-turnaround.png` is the bird all bird parts must match.

## Your part

The pelican's LEFT wing, half spread, built as three rigid segments. The assembler mirrors it for the right wing and uses the wings as arms that throw and catch bowling pins.

- Origin: the shoulder.
- Rest pose: spread straight out along +X, flat in the XY plane, leading edge toward -Y, feathers trailing toward +Y.
- Nodes, named exactly, in a chain: `upper` (origin at the shoulder, 0.20 long), `fore` (origin at the elbow, at X = 0.20, 0.22 long), `hand` (origin at the wrist, at X = 0.42). The primaries on `hand` reach to about X = 0.78.
- Each segment is its own rigid mesh under its node. Segments overlap by 3 to 4 cm at elbow and wrist, with covert feathers hiding the joint so it can bend up to 110 degrees at the elbow and 60 at the wrist without a visible gap.
- An empty named `grip`, a child of `hand`, at 0.08 past the wrist on the underside: a bowling pin's neck is held there. Shape the first primaries so they can plausibly curl around a pin.
- Chord (front to back) about 0.26 at the elbow. Thickness: a real leading edge about 0.04 thick tapering to thin feathers. Not a flat slab: an earlier attempt failed on exactly that.
- The shoulder end carries a ruff of scapular feathers reaching 5 cm inward past the origin (toward -X) to overlap the body.
- Upper side: cream coverts, grey-brown flight feathers with pale edges. Underside: pale.
- Cut-out transparency is allowed on the trailing feather edges.

## Budget

1,600 triangles. One 1024 texture set (colour, with alpha for the feather edges, and normal). Double-sided where feathers are thin.

## Checkpoints

Nobody is available during this run:
- skip Concept: Build it
- No clips are made, so the Motion fork does not arise.

Do not ask questions. Make the best call yourself, write it in `part.json`, and keep going. Aim to finish inside 45 minutes: a clean part that meets the pivots and sizes beats a detailed one that does not.

## Done

- `/outbox` holds the files `CONTRACT.md` lists, under 15 MB.
- Report: what the gate said, the measured bounding box and node positions against the numbers above, the outbox size, and anything that falls short.
