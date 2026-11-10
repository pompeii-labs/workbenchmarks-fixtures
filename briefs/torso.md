# Pelican act, part: the torso

This is an experiment outside Dead Acre. Twelve runs of this bench each build one part of one scene in parallel: a realistic pelican riding a unicycle on a seaside boardwalk while juggling three bowling pins. The parts are assembled and animated afterwards in three.js code. You build exactly one part and nothing else. No web page, no animation clips, no other parts.

Read `CONTRACT.md` in the repository root first. It holds the shared space, the joins, the budgets and the delivery rules, and it wins over your usual defaults. `reference/pelican-turnaround.png` is the bird all bird parts must match.

## Your part

The pelican's body alone: the heavy feathered egg of breast, belly, back and rump. No neck, head, wings, legs or tail.

- Origin: the seat point, bottom centre of the belly, where the bird rests on the saddle.
- Posture: riding upright, breast high and forward, rump low and back, the body's long axis tilted about 40 degrees up from horizontal.
- Size: X from -0.18 to +0.18, Y from -0.20 (breast) to +0.30 (rump), Z from -0.02 to +0.46.
- The surface must pass through or just outside these sockets, because neighbours attach there:
  - neck base at (0, -0.10, 0.42), neck leaves up and slightly forward
  - left and right shoulder at (+0.16, -0.04, 0.36) and (-0.16, -0.04, 0.36)
  - left and right hip at (+0.08, 0.02, 0.06) and (-0.08, 0.02, 0.06)
  - tail root at (0, 0.28, 0.10)
- Add an empty object at each socket named `socket_neck`, `socket_shoulder_l`, `socket_shoulder_r`, `socket_hip_l`, `socket_hip_r`, `socket_tail`. If your surface forced a socket to move, move the empty and say so in `part.json`.
- A closed mesh. Feather detail comes from the texture and a normal map, with a little silhouette breakup on the breast and rump.
- The underside sits on a saddle: keep it plausible (belly feathers), not flat.

## Budget

2,000 triangles. One 1024 texture set (colour and normal).

## Checkpoints

Nobody is available during this run:
- skip Concept: Build it
- No clips are made, so the Motion fork does not arise.

Do not ask questions. Make the best call yourself, write it in `part.json`, and keep going. Aim to finish inside 45 minutes: a clean part that meets the pivots and sizes beats a detailed one that does not.

## Done

- `/outbox` holds the files `CONTRACT.md` lists, under 15 MB.
- Report: what the gate said, the measured bounding box and node positions against the numbers above, the outbox size, and anything that falls short.
