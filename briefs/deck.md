# Pelican act, part: the boardwalk deck

This is an experiment outside Dead Acre. Twelve runs of this bench each build one part of one scene in parallel: a realistic pelican riding a unicycle on a seaside boardwalk while juggling three bowling pins. The parts are assembled and animated afterwards in three.js code. You build exactly one part and nothing else. No web page, no animation clips, no other parts.

Read `CONTRACT.md` in the repository root first. It holds the shared space, the joins, the budgets and the delivery rules, and it wins over your usual defaults. `reference/pelican-turnaround.png` is the bird all bird parts must match.

## Your part

One tile of a seaside boardwalk that the unicycle rides along. The assembler lays several end to end along Y and scrolls them, so it must tile.

- Origin: the centre of the top surface. The top surface is at Z = 0.
- 4.0 long along Y (Y from -2.0 to +2.0), 3.2 wide along X.
- Weathered grey-brown timber planks running across (along X), each about 0.14 wide with small gaps, nail heads, wear and a few paler replaced boards. Sun-bleached, dry, daylight.
- Tiles seamlessly along Y: the geometry and the texture at Y = -2.0 continue exactly into Y = +2.0. No unique landmark so large that the repeat is obvious.
- Visible structure at the two long edges: a thick edge beam, and joists and two pilings below reaching down to Z = -1.2 (the sea is below; the assembler adds water).
- Planks need real edges that catch light: bevels or a strong normal map, with a few boards slightly raised.
- A node named `deck`.
- No bird reference needed for this part.

## Budget

900 triangles. One 1024 texture set (colour, normal, roughness). One material. Projection from a turnaround suits this badly: a tiling plank texture you generate and bake is expected. Say what you did.

## Checkpoints

Nobody is available during this run:
- skip Concept: Build it
- No clips are made, so the Motion fork does not arise.

Do not ask questions. Make the best call yourself, write it in `part.json`, and keep going. Aim to finish inside 45 minutes: a clean part that meets the pivots and sizes beats a detailed one that does not.

## Done

- `/outbox` holds the files `CONTRACT.md` lists, under 15 MB.
- Report: what the gate said, the measured bounding box and node positions against the numbers above, the outbox size, and anything that falls short.
