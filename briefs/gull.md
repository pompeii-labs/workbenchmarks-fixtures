# Pelican act, part: a seagull on a piling, watching

This is an experiment outside Dead Acre. Twelve runs of this bench each build one part of one scene in parallel: a realistic pelican riding a unicycle on a seaside boardwalk while juggling three bowling pins. The parts are assembled and animated afterwards in three.js code. You build exactly one part and nothing else. No web page, no animation clips, no other parts.

Read `CONTRACT.md` in the repository root first. It holds the shared space, the joins, the budgets and the delivery rules, and it wins over your usual defaults. `reference/pelican-turnaround.png` is the bird all bird parts must match.

## Your part

The act's only spectator: a herring gull standing on top of a weathered timber piling, watching the pelican.

- Origin: the base centre of the piling, at deck level (Z = 0).
- Piling: a round timber post 0.22 across and 1.10 tall, weathered, with a rope wrapped round the top and a rusted iron cap ring.
- Gull: realistic adult herring gull, about 0.40 tall standing, white head and body, pale grey back and folded wings with black tips, yellow bill with a spot near the tip (keep the spot orange rather than red), pale pink legs. Standing on the piling top, facing -Y, wings folded.
- Nodes, named exactly: `piling` (the post), `gull_body` (body, wings, legs; origin at the feet), `gull_head` (head and neck, a child of `gull_body`, origin at the base of the neck, so the assembler can turn the head to follow the pins). The neck base carries a small ruff that overlaps the body so the head can turn 70 degrees each way and tilt 25 degrees without a gap.
- Use the pelican reference only for the level of realism and feather treatment; this is a different bird.

## Budget

2,200 triangles total. One 1024 texture set shared by gull and piling.

## Checkpoints

Nobody is available during this run:
- skip Concept: Build it
- No clips are made, so the Motion fork does not arise.

Do not ask questions. Make the best call yourself, write it in `part.json`, and keep going. Aim to finish inside 45 minutes: a clean part that meets the pivots and sizes beats a detailed one that does not.

## Done

- `/outbox` holds the files `CONTRACT.md` lists, under 15 MB.
- Report: what the gate said, the measured bounding box and node positions against the numbers above, the outbox size, and anything that falls short.
