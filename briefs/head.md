# Pelican act, part: neck, head and bill

This is an experiment outside Dead Acre. Twelve runs of this bench each build one part of one scene in parallel: a realistic pelican riding a unicycle on a seaside boardwalk while juggling three bowling pins. The parts are assembled and animated afterwards in three.js code. You build exactly one part and nothing else. No web page, no animation clips, no other parts.

Read `CONTRACT.md` in the repository root first. It holds the shared space, the joins, the budgets and the delivery rules, and it wins over your usual defaults. `reference/pelican-turnaround.png` is the bird all bird parts must match.

## Your part

The pelican's neck, head, whole bill and throat pouch, as one skinned mesh.

- Origin: the neck base, where it meets the body. The neck leaves the body up and slightly forward.
- Rest pose: the relaxed S-curve of the side view in the reference, head carried high, bill angled about 50 degrees below horizontal toward -Y. Crown about 0.50 above the origin. Bill about 0.38 long from the gape to the hooked tip.
- Bones, named exactly, as one chain from the origin: `neck_01`, `neck_02`, `neck_03`, `neck_04`, `head`. On `head`: `jaw` (hinged at the gape; it carries the lower mandible and the pouch) and `pouch` (a child of `jaw` at the middle of the pouch, so the pouch can swing).
- Smooth skin weights along the neck so it bends without pinching. The upper bill is rigid on `head`.
- Eyes that read: dark, with a pale ring, modelled or painted.
- The neck base ends in a ruff of feathers that widens to about 0.16 across and reaches 5 cm below the origin, to overlap the body.
- The pouch is the feature people look for: full, yellow-orange, clearly hanging under the bill.

## Budget

2,500 triangles. One 1024 texture set (colour and normal).

## Checkpoints

Nobody is available during this run:
- skip Concept: Build it
- No clips are made, so the Motion fork does not arise.

Do not ask questions. Make the best call yourself, write it in `part.json`, and keep going. Aim to finish inside 45 minutes: a clean part that meets the pivots and sizes beats a detailed one that does not.

## Done

- `/outbox` holds the files `CONTRACT.md` lists, under 15 MB.
- Report: what the gate said, the measured bounding box and node positions against the numbers above, the outbox size, and anything that falls short.
