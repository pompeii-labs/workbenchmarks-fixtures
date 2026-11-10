# Pelican act, part: the unicycle wheel

This is an experiment outside Dead Acre. Twelve runs of this bench each build one part of one scene in parallel: a realistic pelican riding a unicycle on a seaside boardwalk while juggling three bowling pins. The parts are assembled and animated afterwards in three.js code. You build exactly one part and nothing else. No web page, no animation clips, no other parts.

Read `CONTRACT.md` in the repository root first. It holds the shared space, the joins, the budgets and the delivery rules, and it wins over your usual defaults. `reference/pelican-turnaround.png` is the bird all bird parts must match.

## Your part

A circus unicycle wheel.

- Origin: the centre of the axle. The axle runs along X. The wheel spins about X.
- Radius 0.26 to the outside of the tyre. Tyre about 0.05 wide and round in section: black rubber, a white sidewall band so the spin is easy to see. Chrome rim, about 24 thin spokes, a hub 0.08 wide.
- One valve stem or one coloured spoke reflector, so rotation is readable from a distance.
- Node named `wheel`. No fork, no cranks, no axle stubs beyond X = -0.04 to +0.04.
- Spokes can be thin real geometry or cut-out transparency on a disc; choose what looks right spinning. Say which.
- No bird reference needed for this part. Make it look like a real, slightly worn performer's unicycle wheel.

## Budget

1,500 triangles. One 512 texture set. Up to two materials (rubber, metal).

## Checkpoints

Nobody is available during this run:
- skip Concept: Build it
- No clips are made, so the Motion fork does not arise.

Do not ask questions. Make the best call yourself, write it in `part.json`, and keep going. Aim to finish inside 45 minutes: a clean part that meets the pivots and sizes beats a detailed one that does not.

## Done

- `/outbox` holds the files `CONTRACT.md` lists, under 15 MB.
- Report: what the gate said, the measured bounding box and node positions against the numbers above, the outbox size, and anything that falls short.
