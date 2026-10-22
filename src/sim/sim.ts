import {
  BALL_R,
  BALLS_PER_GAME,
  DRAIN_Y,
  DT,
  FLIPPER_DOWN,
  FLIPPER_DOWN_SPEED,
  FLIPPER_LEN,
  FLIPPER_R0,
  FLIPPER_R1,
  FLIPPER_UP,
  FLIPPER_UP_SPEED,
  GRAVITY,
  LANE_CX,
  LANE_X0,
  LANE_WALL_TOP,
  MAX_SPEED,
  PLUNGER_REST_Y,
  PLUNGER_TRAVEL,
  TABLE,
  type Segment,
} from './table';

/** The one command type: every frame of player intent, human or bot. */
export interface Command {
  left: boolean;
  right: boolean;
  plunger: boolean;
  start: boolean;
}

export const NO_COMMAND: Command = { left: false, right: false, plunger: false, start: false };

export type Mode = 'title' | 'play' | 'drain' | 'gameover';

export type GameEventType =
  | 'start'
  | 'bumper'
  | 'flipper'
  | 'launch'
  | 'lane'
  | 'lanesComplete'
  | 'wall'
  | 'drain'
  | 'gameover'
  | 'newBall';

export interface GameEvent {
  id: number;
  type: GameEventType;
  index: number;
  strength: number;
}

export interface SimState {
  mode: Mode;
  time: number;
  score: number;
  highScore: number;
  newHigh: boolean;
  ball: number;
  multiplier: number;
  lanes: boolean[];
  bumperFlash: number[];
  bumperHits: number;
  bumperCount: number[];
  bumperCooldown: number[];
  ballPos: { x: number; y: number };
  ballVel: { x: number; y: number };
  flipperAngle: [number, number];
  flipperOmega: [number, number];
  plungerCharge: number;
  /** Plunger needs a fresh press after a game starts from the same key. */
  plungerArmed: boolean;
  drainTimer: number;
  /** Sim time when the current mode began. */
  modeAt: number;
  lastRollover: number;
  wallSoundCooldown: number;
  prev: Command;
  rng: number;
  eventSeq: number;
  events: GameEvent[];
}

export function createState(highScore = 0, seed = 1): SimState {
  return {
    mode: 'title',
    time: 0,
    score: 0,
    highScore,
    newHigh: false,
    ball: 1,
    multiplier: 1,
    lanes: [false, false, false],
    bumperFlash: [0, 0, 0],
    bumperHits: 0,
    bumperCount: [0, 0, 0],
    bumperCooldown: [0, 0, 0],
    ballPos: { x: LANE_CX, y: PLUNGER_REST_Y + BALL_R },
    ballVel: { x: 0, y: 0 },
    flipperAngle: [FLIPPER_DOWN, FLIPPER_DOWN],
    flipperOmega: [0, 0],
    plungerCharge: 0,
    plungerArmed: false,
    drainTimer: 0,
    modeAt: 0,
    lastRollover: -1,
    wallSoundCooldown: 0,
    prev: { ...NO_COMMAND },
    rng: seed >>> 0,
    eventSeq: 0,
    events: [],
  };
}

/** mulberry32 on the serializable state word. */
export function rand(s: SimState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function emit(s: SimState, type: GameEventType, index = 0, strength = 1): void {
  s.eventSeq += 1;
  s.events.push({ id: s.eventSeq, type, index, strength });
  if (s.events.length > 64) s.events.splice(0, s.events.length - 64);
}

function addScore(s: SimState, points: number): void {
  s.score += points * s.multiplier;
}

export function plungerY(s: SimState): number {
  return PLUNGER_REST_Y - PLUNGER_TRAVEL * s.plungerCharge;
}

export function ballOnPlunger(s: SimState): boolean {
  return (
    s.mode === 'play' &&
    s.ballPos.x > LANE_X0 &&
    s.ballPos.y < plungerY(s) + BALL_R + 0.3 &&
    Math.abs(s.ballVel.y) < 3
  );
}

export function startGame(s: SimState): void {
  s.mode = 'play';
  s.score = 0;
  s.newHigh = false;
  s.ball = 1;
  s.bumperHits = 0;
  s.bumperCount = [0, 0, 0];
  emit(s, 'start');
  serveBall(s);
}

export function serveBall(s: SimState): void {
  s.multiplier = 1;
  s.lanes = [false, false, false];
  s.ballPos = { x: LANE_CX, y: PLUNGER_REST_Y + BALL_R };
  s.ballVel = { x: 0, y: 0 };
  s.plungerCharge = 0;
  s.plungerArmed = false;
  s.lastRollover = -1;
  s.mode = 'play';
  s.modeAt = s.time;
  emit(s, 'newBall', s.ball);
}

export function flipperTip(def: { px: number; py: number; side: 1 | -1 }, angle: number) {
  return {
    x: def.px + def.side * Math.cos(angle) * FLIPPER_LEN,
    y: def.py + Math.sin(angle) * FLIPPER_LEN,
  };
}

export function step(s: SimState, cmd: Command): void {
  s.time += DT;
  const prev = s.prev;
  const pressedStart = cmd.start && !prev.start;

  for (let i = 0; i < 3; i++) {
    s.bumperFlash[i] = Math.max(0, s.bumperFlash[i] - DT);
    s.bumperCooldown[i] = Math.max(0, s.bumperCooldown[i] - DT);
  }
  s.wallSoundCooldown = Math.max(0, s.wallSoundCooldown - DT);

  if (s.mode === 'title' || s.mode === 'gameover') {
    if (pressedStart && (s.mode === 'title' || s.time - s.modeAt > 0.9)) startGame(s);
    stepFlippers(s, cmd, prev, false);
    s.prev = { ...cmd };
    return;
  }

  stepFlippers(s, cmd, prev, true);

  if (s.mode === 'drain') {
    s.drainTimer -= DT;
    if (s.drainTimer <= 0) {
      if (s.ball >= BALLS_PER_GAME) {
        s.mode = 'gameover';
        s.modeAt = s.time;
        if (s.score > s.highScore) {
          s.highScore = s.score;
          s.newHigh = true;
        }
        emit(s, 'gameover', s.newHigh ? 1 : 0);
      } else {
        s.ball += 1;
        serveBall(s);
      }
    }
    s.prev = { ...cmd };
    return;
  }

  // Plunger: charge while held, launch on release.
  if (!cmd.plunger) s.plungerArmed = true;
  if (cmd.plunger && s.plungerArmed) {
    s.plungerCharge = Math.min(1, s.plungerCharge + DT / 0.85);
  } else if (prev.plunger && s.plungerCharge > 0) {
    // The return stroke hits any ball resting within the plunger's travel.
    if (s.ballPos.x > LANE_X0 && s.ballPos.y - BALL_R < PLUNGER_REST_Y + 0.08) {
      const speed = 13 + 23 * s.plungerCharge + (rand(s) - 0.5) * 0.6;
      s.ballVel.y = speed;
      s.ballVel.x = 0;
      emit(s, 'launch', 0, s.plungerCharge);
    }
    s.plungerCharge = 0;
  } else {
    s.plungerCharge = Math.max(0, s.plungerCharge - DT * 6);
  }

  stepBall(s);

  if (s.ballPos.y < DRAIN_Y) {
    s.mode = 'drain';
    s.modeAt = s.time;
    s.drainTimer = 1.1;
    s.ballVel = { x: 0, y: 0 };
    emit(s, 'drain', s.ball);
  }

  s.prev = { ...cmd };
}

function stepFlippers(s: SimState, cmd: Command, prev: Command, live: boolean): void {
  const held = [cmd.left, cmd.right];
  const was = [prev.left, prev.right];
  for (let i = 0; i < 2; i++) {
    const before = s.flipperAngle[i];
    let a = before;
    if (held[i]) a = Math.min(FLIPPER_UP, a + FLIPPER_UP_SPEED * DT);
    else a = Math.max(FLIPPER_DOWN, a - FLIPPER_DOWN_SPEED * DT);
    s.flipperAngle[i] = a;
    s.flipperOmega[i] = (a - before) / DT;
    if (held[i] && !was[i]) {
      emit(s, 'flipper', i);
      // Classic lane change: flippers rotate the lit rollover lanes.
      if (live) {
        const l = s.lanes;
        s.lanes = i === 0 ? [l[1], l[2], l[0]] : [l[2], l[0], l[1]];
      }
    }
  }
}

function stepBall(s: SimState): void {
  const p = s.ballPos;
  const v = s.ballVel;
  v.y -= GRAVITY * DT;
  const speed = Math.hypot(v.x, v.y);
  if (speed > MAX_SPEED) {
    v.x *= MAX_SPEED / speed;
    v.y *= MAX_SPEED / speed;
  }
  p.x += v.x * DT;
  p.y += v.y * DT;

  for (const w of TABLE.segments) collideSegment(s, w);
  collidePlunger(s);
  for (const b of TABLE.bumpers) collideBumper(s, b.x, b.y, b.r, b.index);
  for (let i = 0; i < 2; i++) collideFlipper(s, i);
  rollovers(s);
}

function closestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + dx * t, y: ay + dy * t, t };
}

function resolve(s: SimState, nx: number, ny: number, e: number, svx = 0, svy = 0, friction = 0.015): number {
  const v = s.ballVel;
  const rvx = v.x - svx;
  const rvy = v.y - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  let tx = rvx - vn * nx;
  let ty = rvy - vn * ny;
  tx *= 1 - friction;
  ty *= 1 - friction;
  const outN = -vn * e;
  v.x = tx + nx * outN + svx;
  v.y = ty + ny * outN + svy;
  return -vn;
}

function collideSegment(s: SimState, w: Segment): void {
  const p = s.ballPos;
  const c = closestOnSegment(p.x, p.y, w.ax, w.ay, w.bx, w.by);
  let dx = p.x - c.x;
  let dy = p.y - c.y;
  const minD = BALL_R + w.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return;
  let dist = Math.sqrt(d2);
  if (w.oneWay) {
    const sx = w.bx - w.ax;
    const sy = w.by - w.ay;
    const l = Math.hypot(sx, sy);
    const nx = -sy / l;
    const ny = sx / l;
    const side = (p.x - w.ax) * nx + (p.y - w.ay) * ny;
    if (side <= 0 || s.ballVel.x * nx + s.ballVel.y * ny > 0) return;
    if (c.t > 0 && c.t < 1) {
      dx = nx * side;
      dy = ny * side;
      dist = side;
    }
  }
  if (dist < 1e-6) return;
  const nx = dx / dist;
  const ny = dy / dist;
  p.x = c.x + nx * minD;
  p.y = c.y + ny * minD;
  const impact = resolve(s, nx, ny, w.e);
  if (impact > 6 && s.wallSoundCooldown <= 0) {
    s.wallSoundCooldown = 0.06;
    emit(s, 'wall', 0, Math.min(1, impact / 30));
  }
}

function collidePlunger(s: SimState): void {
  const p = s.ballPos;
  if (p.x < LANE_X0) return;
  const top = plungerY(s);
  if (p.y - BALL_R < top) {
    p.y = top + BALL_R;
    if (s.ballVel.y < 0) s.ballVel.y = -s.ballVel.y * 0.15;
    if (Math.abs(s.ballVel.y) < 0.4) s.ballVel.y = 0;
    s.ballVel.x = 0;
    p.x = LANE_CX;
  }
}

function collideBumper(s: SimState, bx: number, by: number, br: number, index: number): void {
  const p = s.ballPos;
  const dx = p.x - bx;
  const dy = p.y - by;
  const minD = BALL_R + br;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return;
  const dist = Math.sqrt(d2) || 1e-6;
  const nx = dx / dist;
  const ny = dy / dist;
  p.x = bx + nx * minD;
  p.y = by + ny * minD;
  const v = s.ballVel;
  const vn = v.x * nx + v.y * ny;
  const tx = v.x - vn * nx;
  const ty = v.y - vn * ny;
  // Hard arcade kick: outgoing normal speed is at least the kick.
  const kick = 15 + rand(s) * 2;
  const outN = Math.max(-vn * 0.7, 0) + kick;
  v.x = tx * 0.9 + nx * outN;
  v.y = ty * 0.9 + ny * outN;
  if (s.bumperCooldown[index] <= 0) {
    s.bumperCooldown[index] = 0.08;
    s.bumperFlash[index] = 0.22;
    s.bumperHits += 1;
    s.bumperCount[index] += 1;
    addScore(s, 100);
    emit(s, 'bumper', index, Math.min(1, outN / 25));
  }
}

function collideFlipper(s: SimState, i: number): void {
  const def = TABLE.flippers[i];
  const a = s.flipperAngle[i];
  const tip = flipperTip(def, a);
  const p = s.ballPos;
  const c = closestOnSegment(p.x, p.y, def.px, def.py, tip.x, tip.y);
  const rr = FLIPPER_R0 + (FLIPPER_R1 - FLIPPER_R0) * c.t;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const minD = BALL_R + rr;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return;
  const dist = Math.sqrt(d2) || 1e-6;
  const nx = dx / dist;
  const ny = dy / dist;
  p.x = c.x + nx * minD;
  p.y = c.y + ny * minD;
  // Surface velocity of the flipper at the contact point (omega x r).
  const wz = def.side * s.flipperOmega[i];
  const rx = c.x + nx * rr - def.px;
  const ry = c.y + ny * rr - def.py;
  const svx = -wz * ry;
  const svy = wz * rx;
  resolve(s, nx, ny, 0.3, svx, svy, 0.01);
}

function rollovers(s: SimState): void {
  const p = s.ballPos;
  let inside = -1;
  TABLE.rollovers.forEach((r, i) => {
    if (Math.abs(p.x - r.x) < r.halfW && p.y > r.y0 && p.y < r.y1) inside = i;
  });
  if (inside >= 0 && inside !== s.lastRollover) {
    if (!s.lanes[inside]) {
      s.lanes[inside] = true;
      addScore(s, 50);
      emit(s, 'lane', inside);
      if (s.lanes.every(Boolean)) {
        addScore(s, 1000);
        s.multiplier = Math.min(5, s.multiplier + 1);
        s.lanes = [false, false, false];
        emit(s, 'lanesComplete', s.multiplier);
      }
    } else {
      addScore(s, 10);
    }
  }
  s.lastRollover = inside;
}

export function isBallInLane(s: SimState): boolean {
  return s.ballPos.x > LANE_X0 && s.ballPos.y < LANE_WALL_TOP;
}
