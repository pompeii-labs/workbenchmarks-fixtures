# The pelican act: parts contract

Twelve runs each build one part of a single scene: a pelican riding a unicycle on a seaside boardwalk while juggling three bowling pins. The parts are assembled and animated afterwards, in three.js code, by someone who cannot ask you anything. Your part only works if it meets this contract exactly.

## The bird everyone is building

`reference/pelican-turnaround.png` is the pelican (front, side, back). Every bird part matches its plumage, colours and level of realism: cream-white body feathers, grey-brown flight feathers with pale edges, a long grey-and-orange bill with a yellow-orange pouch, grey scaly legs and webbed feet. Realistic, never cartoon. Daylight. No grime, no decay, no undead look.

## Space (Blender)

- Metres. Z up. The bird faces -Y. The bird's left is +X.
- Export GLB with the default axis conversion (Y up in the file). Apply all scale and rotation before export, so every node has scale 1 and the rest rotations stated in your brief.
- Your part's origin is the pivot named in your brief. This is what the assembler rotates the part around, so it matters more than anything else.
- Where the brief names nodes, they must exist in the GLB under exactly those names, each with its origin at the joint it turns on. A node can be a bone of a skinned mesh or a plain object holding a rigid mesh; either is fine, but the names and origins are fixed.

## Scene dimensions (for scale sense)

- Pelican: about 1.15 m from seat to crown when riding. Body about 0.60 m long, 0.36 m wide.
- Unicycle: wheel radius 0.26 m, saddle top 0.66 m above the ground.
- Bowling pin: 0.38 m tall.

## Joins

Parts made by different runs meet at sockets. Nobody will blend your part into its neighbour, so:
- Extend your part 3 to 5 cm past each socket into the neighbour, closed (no open holes), so the neighbour's surface hides the join.
- Feathered parts end in a soft ruff of feather shapes at a join, never a hard cut ring.
- Do not model any neighbour. The torso has no neck, wings, legs or tail. The wing has no body.

## Budgets

Your brief gives triangles and texture size. One material per part unless the brief says otherwise. Use JPEG textures in the GLB wherever there is no transparency. GLB at most 700 KB. Cut-out transparency (alpha mask) is allowed only on feather edges, and only where the brief says so.

## What applies from your usual method, and what does not

- Applies: concept turnaround of your part on magenta (three figures, wide gaps, checked with `cf-compare`), modelling in Blender, projected texture from the turnaround, `cf-check`, `cf-render`, `cf-gate` planned around this contract's budgets and your turnaround's silhouette and colour.
- Does not apply: MPFB human bodies, the shared human skeleton, Dead Acre's night game camera and 85 px read, arm angles. Where a gate check cannot apply, say so in the report; do not bend the part to pass it.
- For hard, symmetric props (wheel, frame, crank, pin, deck, railing) a clean baked or painted material can beat projection. Choose, and say which you used.
- Pass the bird reference to `cf-concept` with `--ref reference/pelican-turnaround.png` for bird parts.

## Delivery

This repository cannot be pushed to. Do not push, do not open a pull request; commit locally only. Everything is collected from `/outbox`, and an outbox over 50 MB is discarded whole. Keep it under 15 MB and put there exactly:

- `/outbox/part.glb` the final part.
- `/outbox/part.json` name, triangle count, texture sizes, GLB bytes, the bounding box in Blender coordinates, every named node with its rest position, and any place you deviated from the contract and why.
- `/outbox/turnaround.png` your part's concept sheet.
- `/outbox/preview.png` the `cf-render` contact sheet of the final part.
- `/outbox/gate-sheet.png` the gate sheet.
- `/outbox/scripts/` the Blender scripts you wrote.

Copy each file there as soon as it exists. Leave out `.blend` files, `artifacts/`, intermediate renders and archives. Run `du -sh /outbox` before finishing and report the number.
