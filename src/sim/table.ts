// Table layout in sim units (2D table plane, +y toward the top of the table).
// Pure data: the simulation collides against it and the renderer builds meshes from it.

export type SegKind = 'wall' | 'sling' | 'post' | 'gate';

export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
  kind: SegKind;
  /** Restitution on contact. */
  e: number;
  /** Sling index for kickers. */
  index?: number;
  /** Rendered as a rail (true) or invisible helper. */
  visible: boolean;
}

export interface BumperDef {
  x: number;
  y: number;
  r: number;
}

export interface FlipperDef {
  px: number;
  py: number;
  len: number;
  r0: number;
  r1: number;
  /** -1 left flipper (tip points +x), +1 right flipper (tip points -x). */
  side: -1 | 1;
}

export interface LaneDef {
  x: number;
  y: number;
}

export const BALL_R = 0.25;
export const GRAVITY = 24;
export const FIELD = { left: -4.5, right: 4.5, laneWall: 4.55, outerRight: 5.35, bottom: -10.6, top: 10.45 };
export const ARC = { cx: 0.425, cy: 5.5, r: 4.925 };
export const PLUNGER = { x: 4.95, restY: -9.3, travel: 0.6, ballY: -9.0 };
export const FLIPPER_REST = -0.55;
export const FLIPPER_UP = 0.45;
export const FLIPPER_UP_SPEED = 28;
export const FLIPPER_DOWN_SPEED = 18;
export const LANE_GATE_Y = 4.4;

const WALL_R = 0.08;

function seg(ax: number, ay: number, bx: number, by: number, kind: SegKind = 'wall', e = 0.5, r = WALL_R, visible = true): Seg {
  return { ax, ay, bx, by, r, kind, e, visible };
}

function polyline(points: [number, number][], kind: SegKind = 'wall', e = 0.5, r = WALL_R): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    out.push(seg(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], kind, e, r));
  }
  return out;
}

export function arcPoints(steps = 28): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = Math.PI - (Math.PI * i) / steps;
    pts.push([ARC.cx + Math.cos(a) * ARC.r, ARC.cy + Math.sin(a) * ARC.r]);
  }
  return pts;
}

export const FLIPPERS: FlipperDef[] = [
  { px: -1.95, py: -7.55, len: 1.6, r0: 0.24, r1: 0.12, side: -1 },
  { px: 1.95, py: -7.55, len: 1.6, r0: 0.24, r1: 0.12, side: 1 },
];

export const BUMPERS: BumperDef[] = [
  { x: -1.45, y: 4.1, r: 0.55 },
  { x: 1.45, y: 4.1, r: 0.55 },
  { x: 0, y: 2.0, r: 0.55 },
];

export const LANES: LaneDef[] = [
  { x: -1.3, y: 8.0 },
  { x: 0, y: 8.0 },
  { x: 1.3, y: 8.0 },
];

// Slingshot triangles: [top, bottom-outer, bottom-inner]. Kick face is top -> bottom-inner.
export const SLINGS: [number, number][][] = [
  [
    [-3.55, -3.55],
    [-3.55, -5.1],
    [-2.6, -5.85],
  ],
  [
    [3.55, -3.55],
    [3.55, -5.1],
    [2.6, -5.85],
  ],
];

function buildSegments(): Seg[] {
  const s: Seg[] = [];
  // Outer shell: left wall, top arc, right outer wall.
  s.push(seg(FIELD.left, -5.4, FIELD.left, ARC.cy));
  s.push(...polyline(arcPoints(), 'wall', 0.5));
  s.push(seg(FIELD.outerRight, ARC.cy, FIELD.outerRight, -9.6));
  // Shooter lane wall and floor.
  s.push(seg(FIELD.laneWall, -9.6, FIELD.laneWall, LANE_GATE_Y));
  s.push(seg(FIELD.laneWall, -9.6, FIELD.outerRight, -9.6, 'wall', 0.2, WALL_R, false));
  // One-way gate at the top of the shooter lane: lets the launched ball out, stops returns.
  s.push(seg(FIELD.laneWall, LANE_GATE_Y, FIELD.outerRight - 0.02, LANE_GATE_Y + 0.35, 'gate', 0.3, 0.05, true));
  // Inlane guides that feed the flippers.
  s.push(seg(FIELD.left, -5.4, -2.17, -7.25));
  s.push(seg(FIELD.laneWall, -5.4, 2.17, -7.25));
  // Slingshots.
  SLINGS.forEach((tri, index) => {
    const [a, b, c] = tri;
    s.push(seg(a[0], a[1], b[0], b[1], 'wall', 0.5, 0.1));
    s.push(seg(b[0], b[1], c[0], c[1], 'wall', 0.5, 0.1));
    const kicker = seg(a[0], a[1], c[0], c[1], 'sling', 0.7, 0.1);
    kicker.index = index;
    s.push(kicker);
  });
  // Top lane separator posts.
  for (const x of [-1.95, -0.65, 0.65, 1.95]) {
    s.push(seg(x, 7.45, x, 8.55, 'post', 0.6, 0.09));
  }
  return s;
}

export const SEGMENTS: Seg[] = buildSegments();
