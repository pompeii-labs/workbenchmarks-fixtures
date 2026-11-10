# Pelican act, part: the left leg and webbed foot

This is an experiment outside Dead Acre. Twelve runs of this bench each build one part of one scene in parallel: a realistic pelican riding a unicycle on a seaside boardwalk while juggling three bowling pins. The parts are assembled and animated afterwards in three.js code. You build exactly one part and nothing else. No web page, no animation clips, no other parts.

Read `CONTRACT.md` in the repository root first. It holds the shared space, the joins, the budgets and the delivery rules, and it wins over your usual defaults. `reference/pelican-turnaround.png` is the bird all bird parts must match.

## Your part

The pelican's LEFT leg, as three rigid segments. The assembler mirrors it for the right leg and bends it with inverse kinematics so the foot stays on a turning pedal.

- Origin: the hip.
- Rest pose: hanging straight down along -Z, toes pointing toward -Y.
- Nodes, named exactly, in a chain: `thigh` (origin at the hip, 0.24 long, feathered cream like the body, thick at the top, with a ruff reaching 4 cm above the origin), `shin` (origin at Z = -0.24, 0.32 long, bare grey scaly leg about 0.03 thick), `foot` (origin at the ankle, at Z = -0.56).
- The foot: a big webbed pelican foot, flat, sole at 0.03 below the ankle, 0.17 long toward -Y, about 0.13 wide at the toes, a short hind toe. Webbing between the toes, small claws. It rests on a 0.10 by 0.09 pedal, so the middle of the sole is flat.
- Each segment is its own rigid mesh; they overlap 2 to 3 cm at the joints so the knee can bend 120 degrees without a gap.
- Grey, scaly, slightly leathery, matching the reference's legs and feet.

## Budget

1,200 triangles. One 512 texture set (colour and normal).

## Checkpoints

Nobody is available during this run:
- skip Concept: Build it
- No clips are made, so the Motion fork does not arise.

Do not ask questions. Make the best call yourself, write it in `part.json`, and keep going. Aim to finish inside 45 minutes: a clean part that meets the pivots and sizes beats a detailed one that does not.

## Done

- `/outbox` holds the files `CONTRACT.md` lists, under 15 MB.
- Report: what the gate said, the measured bounding box and node positions against the numbers above, the outbox size, and anything that falls short.
