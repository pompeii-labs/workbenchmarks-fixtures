// Static table layout in table units: x right, y up the table (away from the
// player). Pure data so the simulation and the renderer share one source.

export interface Vec2 {
  x: number;
  y: number;
}

export type WallKind = 'wall' | 'sling' | 'gate';

export interface Wall {
  a: Vec2;
  b: Vec2;
  kind: WallKind;
  /** Slingshot index (0 left, 1 right) for kickers. */
  index?: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface FlipperSpec {
  side: 'left' | 'right';
  pivot: Vec2;
  length: number;
  baseRadius: number;
  tipRadius: number;
  /** Angle in radians, measured on the left flipper; mirrored for the right. */
  restAngle: number;
  upAngle: number;
}

export interface LaneSpec {
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
}

export const BALL_RADIUS = 0.25;
export const FIELD = { left: -4.5, right: 4.5, laneRight: 5.5, bottom: -10.5, top: 11.5 };
export const ARCH = { cx: 0.5, cy: 6.5, r: 5.0 };
export const PLUNGER = { x: 5.0, restY: -9.0, pullDepth: 0.9, laneLeft: 4.5, laneRight: 5.5 };
export const DRAIN_Y = -10.6;

const v = (x: number, y: number): Vec2 => ({ x, y });

function polyline(points: Vec2[], kind: WallKind = 'wall'): Wall[] {
  const out: Wall[] = [];
  for (let i = 0; i < points.length - 1; i++) out.push({ a: points[i], b: points[i + 1], kind });
  return out;
}

function archPoints(segments: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = Math.PI - (i / segments) * Math.PI;
    pts.push(v(ARCH.cx + ARCH.r * Math.cos(t), ARCH.cy + ARCH.r * Math.sin(t)));
  }
  return pts;
}

export const ARCH_POINTS = archPoints(28);

// Slingshot triangles: [upper, lower-outer, lower-inner]; the kicker face is
// upper -> lower-inner and faces the centre of the table.
export const SLINGS: Vec2[][] = [
  [v(-3.3, -3.3), v(-3.3, -5.3), v(-2.2, -6.1)],
  [v(3.3, -3.3), v(3.3, -5.3), v(2.2, -6.1)],
];

export const FLIPPERS: FlipperSpec[] = [
  {
    side: 'left',
    pivot: v(-2.35, -7.4),
    length: 1.85,
    baseRadius: 0.24,
    tipRadius: 0.12,
    restAngle: (-28 * Math.PI) / 180,
    upAngle: (30 * Math.PI) / 180,
  },
  {
    side: 'right',
    pivot: v(2.35, -7.4),
    length: 1.85,
    baseRadius: 0.24,
    tipRadius: 0.12,
    restAngle: (-28 * Math.PI) / 180,
    upAngle: (30 * Math.PI) / 180,
  },
];

export const BUMPERS: Circle[] = [
  { x: -1.6, y: 4.1, r: 0.55 },
  { x: 1.6, y: 4.1, r: 0.55 },
  { x: 0, y: 2.0, r: 0.55 },
];

export const POSTS: Circle[] = [
  // Top lane separators.
  { x: -2.4, y: 7.6, r: 0.14 },
  { x: -0.8, y: 7.6, r: 0.14 },
  { x: 0.8, y: 7.6, r: 0.14 },
  { x: 2.4, y: 7.6, r: 0.14 },
  // Flipper pivots double as posts for the inlane guides.
  { x: -2.35, y: -7.4, r: 0.24 },
  { x: 2.35, y: -7.4, r: 0.24 },
];

export const LANES: LaneSpec[] = [
  { x: -1.6, y: 7.6, halfWidth: 0.55, halfHeight: 0.45 },
  { x: 0, y: 7.6, halfWidth: 0.55, halfHeight: 0.45 },
  { x: 1.6, y: 7.6, halfWidth: 0.55, halfHeight: 0.45 },
];

function buildWalls(): Wall[] {
  const walls: Wall[] = [];
  // Left outer wall into the left inlane guide.
  walls.push(...polyline([v(-4.5, 6.5), v(-4.5, -5.0), v(-2.52, -7.2)]));
  // Top arch.
  walls.push(...polyline(ARCH_POINTS));
  // Right outer wall (plunger lane outside).
  walls.push(...polyline([v(5.5, 6.5), v(5.5, -9.9)]));
  // Plunger lane divider (field side doubles as right field wall).
  walls.push(...polyline([v(4.5, -9.9), v(4.5, 5.0)]));
  // Right inlane guide.
  walls.push(...polyline([v(4.5, -5.0), v(2.52, -7.2)]));
  // One-way gate at the top of the lane, sloped so a ball rolls into the field.
  walls.push({ a: v(5.5, 5.45), b: v(4.5, 5.0), kind: 'gate' });
  // Slingshots.
  SLINGS.forEach((tri, index) => {
    walls.push({ a: tri[0], b: tri[2], kind: 'sling', index });
    walls.push({ a: tri[0], b: tri[1], kind: 'wall' });
    walls.push({ a: tri[1], b: tri[2], kind: 'wall' });
  });
  return walls;
}

export const WALLS = buildWalls();
