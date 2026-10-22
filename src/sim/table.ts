// Table geometry in simulation units. x is right, y is up the table (away
// from the player). The renderer maps (x, y) -> world (x, 0, -y).

export const BALL_R = 0.27;
export const GRAVITY = 26;
export const DT = 1 / 480;
export const MAX_SPEED = 40;

export const TABLE_W = 10;
export const TABLE_TOP = 20; // top of the semicircle
export const ARC_CY = 15;
export const ARC_R = 5;

/** Centre of the playfield (left of the shooter lane). */
export const XC = -0.35;

export const LANE_X0 = 4.3;
export const LANE_X1 = 5;
export const LANE_CX = (LANE_X0 + LANE_X1) / 2;
export const LANE_WALL_TOP = 14.5;
export const PLUNGER_REST_Y = 1.0;
export const PLUNGER_TRAVEL = 0.75;

export const FLIPPER_LEN = 1.75;
export const FLIPPER_R0 = 0.26;
export const FLIPPER_R1 = 0.13;
export const FLIPPER_DOWN = (-28 * Math.PI) / 180;
export const FLIPPER_UP = (32 * Math.PI) / 180;
export const FLIPPER_UP_SPEED = 24; // rad/s, ~44 ms full swing
export const FLIPPER_DOWN_SPEED = 15;
export const FLIPPER_PIVOT_Y = 2.4;
export const FLIPPER_PIVOT_DX = 2.0;

export const DRAIN_Y = -0.8;
export const BALLS_PER_GAME = 3;

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Capsule radius (0 = thin wall). */
  r: number;
  e: number;
  /** One-way: only blocks a ball on the left-normal side moving against it. */
  oneWay?: boolean;
  kind: 'wall' | 'guide' | 'lane' | 'gate' | 'post';
}

export interface Circle {
  x: number;
  y: number;
  r: number;
  kind: 'bumper';
  index: number;
}

export interface FlipperDef {
  px: number;
  py: number;
  /** +1 left flipper (points +x), -1 right flipper (points -x). */
  side: 1 | -1;
}

export interface RolloverLane {
  x: number;
  y0: number;
  y1: number;
  halfW: number;
}

function seg(ax: number, ay: number, bx: number, by: number, kind: Segment['kind'], e = 0.5, r = 0): Segment {
  return { ax, ay, bx, by, r, e, kind };
}

export function buildTable() {
  const segments: Segment[] = [];

  // Outer walls.
  segments.push(seg(-5, -2, -5, ARC_CY, 'wall'));
  segments.push(seg(5, -2, 5, ARC_CY, 'wall'));
  const arcSteps = 28;
  for (let i = 0; i < arcSteps; i++) {
    const a0 = (i / arcSteps) * Math.PI;
    const a1 = ((i + 1) / arcSteps) * Math.PI;
    segments.push(
      seg(ARC_CY * 0 + Math.cos(a0) * ARC_R, ARC_CY + Math.sin(a0) * ARC_R, Math.cos(a1) * ARC_R, ARC_CY + Math.sin(a1) * ARC_R, 'wall', 0.45),
    );
  }

  // Shooter lane wall, floor and one-way exit gate.
  segments.push(seg(LANE_X0, -2, LANE_X0, LANE_WALL_TOP, 'lane', 0.4, 0.06));
  segments.push({ ax: LANE_X0, ay: LANE_WALL_TOP, bx: LANE_X1, by: LANE_WALL_TOP + 0.42, r: 0, e: 0.3, oneWay: true, kind: 'gate' });

  // Inlane guides that funnel the ball to the flippers.
  const lp = { x: XC - FLIPPER_PIVOT_DX, y: FLIPPER_PIVOT_Y };
  const rp = { x: XC + FLIPPER_PIVOT_DX, y: FLIPPER_PIVOT_Y };
  segments.push(seg(-5, 4.9, lp.x - 0.12, lp.y + 0.22, 'guide', 0.35, 0.08));
  segments.push(seg(LANE_X0, 4.9, rp.x + 0.12, rp.y + 0.22, 'guide', 0.35, 0.08));
  // Upper side deflectors so orbits feed back into the field.
  segments.push(seg(-5, 8.6, -4.25, 7.4, 'guide', 0.6, 0.08));
  segments.push(seg(LANE_X0, 8.6, LANE_X0 - 0.75, 7.4, 'guide', 0.6, 0.08));

  // Rollover lane separators (posts).
  const laneXs = [XC - 1.65, XC - 0.55, XC + 0.55, XC + 1.65];
  for (const x of laneXs) segments.push(seg(x, 16.3, x, 17.3, 'post', 0.5, 0.09));

  const rollovers: RolloverLane[] = [
    { x: XC - 1.1, y0: 16.4, y1: 17.2, halfW: 0.5 },
    { x: XC, y0: 16.4, y1: 17.2, halfW: 0.5 },
    { x: XC + 1.1, y0: 16.4, y1: 17.2, halfW: 0.5 },
  ];

  const bumpers: Circle[] = [
    { x: XC - 1.6, y: 12.5, r: 0.62, kind: 'bumper', index: 0 },
    { x: XC + 1.6, y: 12.5, r: 0.62, kind: 'bumper', index: 1 },
    { x: XC, y: 10.3, r: 0.62, kind: 'bumper', index: 2 },
  ];

  const flippers: FlipperDef[] = [
    { px: lp.x, py: lp.y, side: 1 },
    { px: rp.x, py: rp.y, side: -1 },
  ];

  return { segments, bumpers, flippers, rollovers, laneXs };
}

export type Table = ReturnType<typeof buildTable>;
export const TABLE: Table = buildTable();
