# Pelican act, part: the boardwalk railing and lamp post

This is an experiment outside Dead Acre. Twelve runs of this bench each build one part of one scene in parallel: a realistic pelican riding a unicycle on a seaside boardwalk while juggling three bowling pins. The parts are assembled and animated afterwards in three.js code. You build exactly one part and nothing else. No web page, no animation clips, no other parts.

Read `CONTRACT.md` in the repository root first. It holds the shared space, the joins, the budgets and the delivery rules, and it wins over your usual defaults. `reference/pelican-turnaround.png` is the bird all bird parts must match.

## Your part

One module of the boardwalk's seaward railing, with a lamp post. It stands along one long edge of a 4.0 m deck tile and repeats along Y, so it must chain.

- Origin: at deck level (Z = 0), in the middle of the module's length, on the railing's centre line.
- 4.0 long along Y. Posts at Y = -2.0 and Y = 0 only (the next module supplies the post at +2.0). Posts 0.10 square, 1.05 tall, white-painted timber, weathered and chipped. A top rail and two lower rails, the top rail ending exactly at Y = -2.0 and Y = +2.0 so modules join.
- One old-fashioned seaside lamp post at Y = 0, just outside the railing: a cast-iron column painted dark green, 2.6 tall, with a single glass globe lantern.
- Nodes, named exactly: `railing` (everything except the glass) and `lamp_glass` (the globe alone, its own mesh and material, so the assembler can make it glow).
- A string of four or five festoon bulbs sagging from the lamp post top toward Y = +2.0 and Y = -2.0 at Z = 2.3 at the module ends, so the string chains across modules. Bulbs are part of `lamp_glass`.
- No bird reference needed for this part.

## Budget

1,500 triangles. One 1024 texture set for the railing and post; `lamp_glass` gets a plain second material.

## Checkpoints

Nobody is available during this run:
- skip Concept: Build it
- No clips are made, so the Motion fork does not arise.

Do not ask questions. Make the best call yourself, write it in `part.json`, and keep going. Aim to finish inside 45 minutes: a clean part that meets the pivots and sizes beats a detailed one that does not.

## Done

- `/outbox` holds the files `CONTRACT.md` lists, under 15 MB.
- Report: what the gate said, the measured bounding box and node positions against the numbers above, the outbox size, and anything that falls short.
