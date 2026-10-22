// Table layout in 2D "table space": x is across (left -, right +), y runs up the
// table away from the player. One unit is about 5 cm on a real table, so the
// ball (r = 0.25) is to scale.

export const BALL_R = 0.25;

export const PLAYFIELD = { left: -4.5, right: 4.5 };
export const LANE = { inner: 4.5, outer: 5.3, top: 13.5, plungerRest: 1.0, plungerPulled: 0.25 };
export const LANE_X = (LANE.inner + LANE.outer) / 2;

export const ARC = { cx: 0.4, cy: 15.5, r: 4.9, segments: 28 };

const walls = [];
const wall = (ax, ay, bx, by, opts = {}) =>
  walls.push({ ax, ay, bx, by, r: opts.r ?? 0.08, e: opts.e ?? 0.45, kind: opts.kind ?? 'wall', h: opts.h ?? 0.55 });

// Outer cabinet walls
wall(PLAYFIELD.left, -1, PLAYFIELD.left, ARC.cy);
wall(LANE.outer, -1, LANE.outer, ARC.cy);
// Top arc (right end -> left end, counter-clockwise)
for (let i = 0; i < ARC.segments; i++) {
  const a0 = (i / ARC.segments) * Math.PI;
  const a1 = ((i + 1) / ARC.segments) * Math.PI;
  wall(
    ARC.cx + Math.cos(a0) * ARC.r, ARC.cy + Math.sin(a0) * ARC.r,
    ARC.cx + Math.cos(a1) * ARC.r, ARC.cy + Math.sin(a1) * ARC.r,
    { kind: 'arc' }
  );
}
// Shooter lane divider
wall(LANE.inner, -1, LANE.inner, LANE.top);
// Bottom of shooter lane (under the plunger)
wall(LANE.inner, -0.2, LANE.outer, -0.2, { h: 0.3 });

// Flippers
export const FLIPPER = { len: 1.5, r0: 0.26, r1: 0.12, rest: 0.5, up: 0.5, upSpeed: 24, downSpeed: 15 };
export const FLIPPERS = [
  { side: 'L', px: -1.85, py: 2.2 },
  { side: 'R', px: 1.85, py: 2.2 },
];

// Inlane guides that funnel into the flipper pivots (mirrored)
const guide = { ax: -4.5, ay: 5.0, bx: -2.0, by: 2.55 };
wall(guide.ax, guide.ay, guide.bx, guide.by);
wall(-guide.ax, guide.ay, -guide.bx, guide.by);
// Close off the dead space under the guides
wall(-4.5, 0.6, -2.3, 0.6, { h: 0.2 });
wall(4.5, 0.6, 2.3, 0.6, { h: 0.2 });

// Slingshots: triangles A (bottom-left), B (top), C (tip near flipper)
const slingL = { A: [-3.7, 5.42], B: [-3.7, 7.3], C: [-2.26, 4.0] };
export const SLINGS = [
  slingL,
  { A: [3.7, 5.42], B: [3.7, 7.3], C: [2.26, 4.0] },
];
SLINGS.forEach((s, i) => {
  // passive edges
  wall(s.A[0], s.A[1], s.B[0], s.B[1], { r: 0.1, e: 0.4, kind: 'slingEdge' });
  wall(s.A[0], s.A[1], s.C[0], s.C[1], { r: 0.1, e: 0.4, kind: 'slingEdge' });
  // the kicking face
  walls.push({ ax: s.B[0], ay: s.B[1], bx: s.C[0], by: s.C[1], r: 0.12, e: 0.6, kind: 'sling', index: i, h: 0.5 });
});

// Top rollover lane posts
export const ROLLOVERS = [-1.2, 0, 1.2].map((x) => ({ x, y: 16.3 }));
for (const x of [-1.8, -0.6, 0.6, 1.8]) wall(x, 15.7, x, 16.8, { r: 0.12, e: 0.6, kind: 'post' });

// Side posts / deflectors in the upper field
wall(-3.3, 8.6, -3.3, 9.4, { r: 0.18, e: 0.75, kind: 'post' });
wall(3.3, 8.6, 3.3, 9.4, { r: 0.18, e: 0.75, kind: 'post' });

export const WALLS = walls;

// Pop bumpers
export const BUMPERS = [
  { x: -1.35, y: 13.1, r: 0.6 },
  { x: 1.35, y: 13.1, r: 0.6 },
  { x: 0, y: 11.2, r: 0.6 },
];

// One-way gate at top of shooter lane: blocks balls coming down from above.
export const GATE = { ax: LANE.inner, ay: LANE.top, bx: LANE.outer, by: LANE.top + 0.8 };

// Visible bounds (for camera fitting / playfield texture)
export const BOUNDS = { minX: -4.7, maxX: 5.5, minY: -1.0, maxY: ARC.cy + ARC.r + 0.2 };
