// Fixed-step pinball simulation. Plain serializable data, no Three.js. Every
// tick consumes one Command; one-shot effects go to an event log with ids.
import { createSeededRandom } from '../utils/random';
import {
  BALL_RADIUS,
  BUMPERS,
  DRAIN_Y,
  FLIPPERS,
  LANES,
  PLUNGER,
  POSTS,
  WALLS,
  type FlipperSpec,
  type Vec2,
} from './table';

export const STEP = 1 / 240;
const SUBSTEPS = 2;
const GRAVITY = 22;
const MAX_SPEED = 36;
const WALL_RESTITUTION = 0.42;
const POST_RESTITUTION = 0.55;
const FLIPPER_RESTITUTION = 0.22;
const SLING_KICK = 9;
const BUMPER_KICK = 12;
const FLIPPER_UP_SPEED = 30; // rad/s
const FLIPPER_DOWN_SPEED = 17;
const PLUNGER_CHARGE_TIME = 0.9; // seconds to full pull
const LAUNCH_MIN = 28;
const LAUNCH_RANGE = 8;
const BALL_SAVE_TIME = 4;
const DRAIN_PAUSE = 1.4;
export const BALLS_PER_GAME = 3;
export const MAX_MULTIPLIER = 5;

export interface Command {
  left: boolean;
  right: boolean;
  plunger: boolean;
  start: boolean;
}

export const IDLE_COMMAND: Command = { left: false, right: false, plunger: false, start: false };

export type Mode = 'attract' | 'play' | 'drained' | 'gameover';

export type EventType =
  | 'bumper'
  | 'sling'
  | 'lane'
  | 'multiplier'
  | 'flip'
  | 'launch'
  | 'drain'
  | 'save'
  | 'gameover'
  | 'start'
  | 'wall';

export interface SimEvent {
  id: number;
  type: EventType;
  x: number;
  y: number;
  points: number;
  index: number;
  strength: number;
}

export interface FlipperState {
  angle: number;
  angularVelocity: number;
  pressed: boolean;
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  inLane: boolean;
}

export interface SimState {
  tick: number;
  time: number;
  mode: Mode;
  score: number;
  highScore: number;
  ball: number; // 1-based current ball
  ballsLeft: number; // including the current ball
  multiplier: number;
  ball0: BallState;
  flippers: FlipperState[];
  plungerCharge: number; // 0..1 pull
  plungerOffset: number; // visual offset 0..pullDepth
  plungerHeld: boolean;
  lanes: boolean[];
  bumperLight: number[]; // seconds of glow left
  bumperCooldown: number[];
  slingLight: number[];
  ballSaveTimer: number; // >0 while the ball save is armed
  ballSaveUsed: boolean;
  drainTimer: number;
  modeTimer: number; // seconds since the mode last changed
  lastStart: boolean;
  newHighScore: boolean;
  bumperHits: number;
  launches: number;
  flipCount: number[];
  drains: number;
  events: SimEvent[];
  nextEventId: number;
  rngState: number;
}

export function createState(highScore = 0, seed = 1): SimState {
  const s: SimState = {
    tick: 0,
    time: 0,
    mode: 'attract',
    score: 0,
    highScore,
    ball: 1,
    ballsLeft: BALLS_PER_GAME,
    multiplier: 1,
    ball0: { x: PLUNGER.x, y: PLUNGER.restY + BALL_RADIUS, vx: 0, vy: 0, inLane: true },
    flippers: FLIPPERS.map((f) => ({ angle: f.restAngle, angularVelocity: 0, pressed: false })),
    plungerCharge: 0,
    plungerOffset: 0,
    plungerHeld: false,
    lanes: [false, false, false],
    bumperLight: BUMPERS.map(() => 0),
    bumperCooldown: BUMPERS.map(() => 0),
    slingLight: [0, 0],
    ballSaveTimer: 0,
    ballSaveUsed: false,
    drainTimer: 0,
    modeTimer: 0,
    lastStart: false,
    newHighScore: false,
    bumperHits: 0,
    launches: 0,
    flipCount: [0, 0],
    drains: 0,
    events: [],
    nextEventId: 1,
    rngState: seed >>> 0,
  };
  return s;
}

function rand(s: SimState): number {
  // Advance the seeded generator stored in state so the sim stays serializable.
  const next = createSeededRandom(s.rngState);
  const value = next();
  s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
  return value;
}

function emit(s: SimState, type: EventType, x: number, y: number, points = 0, index = 0, strength = 1): void {
  s.events.push({ id: s.nextEventId++, type, x, y, points, index, strength });
  if (s.events.length > 64) s.events.splice(0, s.events.length - 64);
}

function award(s: SimState, base: number): number {
  const pts = base * s.multiplier;
  s.score += pts;
  if (s.score > s.highScore) {
    s.highScore = s.score;
    s.newHighScore = true;
  }
  return pts;
}

export function resetBallToLane(s: SimState): void {
  s.ball0 = { x: PLUNGER.x, y: PLUNGER.restY + BALL_RADIUS, vx: 0, vy: 0, inLane: true };
  s.plungerCharge = 0;
  s.plungerOffset = 0;
}

export function startGame(s: SimState): void {
  s.mode = 'play';
  s.score = 0;
  s.ball = 1;
  s.ballsLeft = BALLS_PER_GAME;
  s.multiplier = 1;
  s.lanes = [false, false, false];
  s.newHighScore = false;
  s.ballSaveUsed = false;
  s.ballSaveTimer = 0;
  s.bumperHits = 0;
  s.launches = 0;
  s.drains = 0;
  resetBallToLane(s);
  emit(s, 'start', 0, 0);
}

export function flipperTip(spec: FlipperSpec, angle: number): Vec2 {
  const dir = spec.side === 'left' ? 1 : -1;
  return {
    x: spec.pivot.x + dir * Math.cos(angle) * spec.length,
    y: spec.pivot.y + Math.sin(angle) * spec.length,
  };
}

function updateFlippers(s: SimState, cmd: Command, dt: number): void {
  const pressed = [cmd.left, cmd.right];
  FLIPPERS.forEach((spec, i) => {
    const f = s.flippers[i];
    const active = s.mode === 'play' && pressed[i];
    if (active && !f.pressed) {
      emit(s, 'flip', spec.pivot.x, spec.pivot.y, 0, i);
      s.flipCount[i] += 1;
      // Lane change: flippers rotate the lit top lanes.
      if (s.lanes.some(Boolean) && !s.lanes.every(Boolean)) {
        s.lanes = i === 0 ? [s.lanes[1], s.lanes[2], s.lanes[0]] : [s.lanes[2], s.lanes[0], s.lanes[1]];
      }
    }
    f.pressed = active;
    const target = active ? spec.upAngle : spec.restAngle;
    const speed = active ? FLIPPER_UP_SPEED : FLIPPER_DOWN_SPEED;
    const prev = f.angle;
    const delta = target - f.angle;
    const maxStep = speed * dt;
    f.angle += Math.abs(delta) <= maxStep ? delta : Math.sign(delta) * maxStep;
    // World angular velocity: the right flipper is mirrored, so it spins the other way.
    const local = (f.angle - prev) / dt;
    f.angularVelocity = spec.side === 'left' ? local : -local;
  });
}

function closestOnSegment(px: number, py: number, a: Vec2, b: Vec2): { x: number; y: number; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? ((px - a.x) * abx + (py - a.y) * aby) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + abx * t, y: a.y + aby * t, t };
}

/** Resolve ball against a static contact point; returns approach speed (>0) on a hit. */
function resolveStatic(
  ball: BallState,
  cx: number,
  cy: number,
  radius: number,
  restitution: number,
): { hit: boolean; nx: number; ny: number; speed: number } {
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  const dist2 = dx * dx + dy * dy;
  const minDist = radius + BALL_RADIUS;
  if (dist2 >= minDist * minDist) return { hit: false, nx: 0, ny: 0, speed: 0 };
  const dist = Math.sqrt(dist2) || 1e-6;
  const nx = dx / dist;
  const ny = dy / dist;
  ball.x = cx + nx * minDist;
  ball.y = cy + ny * minDist;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    ball.vx -= (1 + restitution) * vn * nx;
    ball.vy -= (1 + restitution) * vn * ny;
    // A little tangential damping keeps wall rides from feeling icy.
    const tx = -ny;
    const ty = nx;
    const vt = ball.vx * tx + ball.vy * ty;
    ball.vx -= vt * 0.015 * tx;
    ball.vy -= vt * 0.015 * ty;
  }
  return { hit: true, nx, ny, speed: Math.max(0, -vn) };
}

function collideFlipper(s: SimState, i: number): void {
  const spec = FLIPPERS[i];
  const f = s.flippers[i];
  const ball = s.ball0;
  const tip = flipperTip(spec, f.angle);
  const c = closestOnSegment(ball.x, ball.y, spec.pivot, tip);
  const radius = spec.baseRadius + (spec.tipRadius - spec.baseRadius) * c.t;
  const dx = ball.x - c.x;
  const dy = ball.y - c.y;
  const minDist = radius + BALL_RADIUS;
  const dist2 = dx * dx + dy * dy;
  if (dist2 >= minDist * minDist) return;
  const dist = Math.sqrt(dist2) || 1e-6;
  const nx = dx / dist;
  const ny = dy / dist;
  ball.x = c.x + nx * minDist;
  ball.y = c.y + ny * minDist;
  // Surface velocity of the flipper at the contact point: w x r.
  const rx = c.x + nx * radius - spec.pivot.x;
  const ry = c.y + ny * radius - spec.pivot.y;
  const w = f.angularVelocity;
  const svx = -w * ry;
  const svy = w * rx;
  const rvx = ball.vx - svx;
  const rvy = ball.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    ball.vx -= (1 + FLIPPER_RESTITUTION) * vn * nx;
    ball.vy -= (1 + FLIPPER_RESTITUTION) * vn * ny;
  }
}

function stepBall(s: SimState, dt: number): void {
  const ball = s.ball0;
  ball.vy -= GRAVITY * dt;
  // Light rolling drag.
  const drag = 1 - 0.04 * dt;
  ball.vx *= drag;
  ball.vy *= drag;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > MAX_SPEED) {
    ball.vx *= MAX_SPEED / speed;
    ball.vy *= MAX_SPEED / speed;
  }
  const prevX = ball.x;
  const prevY = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Plunger tip acts as the floor of the shooter lane.
  if (ball.x > PLUNGER.laneLeft && ball.y < -7) {
    const floor = PLUNGER.restY - s.plungerOffset + BALL_RADIUS;
    if (ball.y < floor) {
      ball.y = floor;
      if (ball.vy < 0) ball.vy = -ball.vy * 0.15;
      if (Math.abs(ball.vy) < 0.4) ball.vy = 0;
      ball.vx *= 0.9;
    }
  }

  for (const wall of WALLS) {
    if (wall.kind === 'gate') {
      // One way: only blocks a ball coming down from above the gate line.
      const ex = wall.b.x - wall.a.x;
      const ey = wall.b.y - wall.a.y;
      const prevSide = (prevX - wall.a.x) * ey - (prevY - wall.a.y) * ex;
      // With a -> b running right to left, "above" the gate is side > 0.
      if (ball.vy > 0 || prevSide < 0) continue;
    }
    const c = closestOnSegment(ball.x, ball.y, wall.a, wall.b);
    const hit = resolveStatic(ball, c.x, c.y, 0.06, WALL_RESTITUTION);
    if (!hit.hit) continue;
    if (wall.kind === 'sling' && hit.speed > 1.5 && wall.index !== undefined) {
      // Kicker face: fire the ball away along the face normal.
      // Kick away along the face, biased up-table, with seeded jitter and a
      // fixed outgoing speed so slings punch without building an endless rally.
      const jitter = (rand(s) - 0.5) * 0.5;
      const bx = hit.nx;
      const by = hit.ny + 0.5;
      const bl = Math.hypot(bx, by);
      const kx = (bx / bl) * Math.cos(jitter) - (by / bl) * Math.sin(jitter);
      const ky = (bx / bl) * Math.sin(jitter) + (by / bl) * Math.cos(jitter);
      const tx = -ky;
      const ty = kx;
      const vt = (ball.vx * tx + ball.vy * ty) * 0.5;
      ball.vx = kx * SLING_KICK + tx * vt;
      ball.vy = ky * SLING_KICK + ty * vt;
      if (s.slingLight[wall.index] <= 0.05) {
        const pts = award(s, 10);
        emit(s, 'sling', c.x, c.y, pts, wall.index, hit.speed);
      }
      s.slingLight[wall.index] = 0.15;
    } else if (hit.speed > 6) {
      emit(s, 'wall', c.x, c.y, 0, 0, hit.speed);
    }
  }

  for (const post of POSTS) resolveStatic(ball, post.x, post.y, post.r, POST_RESTITUTION);

  BUMPERS.forEach((b, i) => {
    const hit = resolveStatic(ball, b.x, b.y, b.r, 0.6);
    if (!hit.hit) return;
    // Pop: always leave at a punchy speed, with a small seeded angle jitter.
    const jitter = (rand(s) - 0.5) * 0.12;
    const cos = Math.cos(jitter);
    const sin = Math.sin(jitter);
    const nx = hit.nx * cos - hit.ny * sin;
    const ny = hit.nx * sin + hit.ny * cos;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < BUMPER_KICK) {
      ball.vx += (BUMPER_KICK - vn) * nx;
      ball.vy += (BUMPER_KICK - vn) * ny;
    }
    if (s.bumperCooldown[i] <= 0) {
      const pts = award(s, 100);
      s.bumperHits += 1;
      emit(s, 'bumper', b.x, b.y, pts, i, hit.speed);
      s.bumperCooldown[i] = 0.06;
    }
    s.bumperLight[i] = 0.22;
  });

  for (let i = 0; i < FLIPPERS.length; i++) collideFlipper(s, i);

  // Top rollover lanes.
  LANES.forEach((lane, i) => {
    const inside = Math.abs(ball.x - lane.x) < lane.halfWidth - 0.1 && Math.abs(ball.y - lane.y) < lane.halfHeight;
    const wasInside =
      Math.abs(prevX - lane.x) < lane.halfWidth - 0.1 && Math.abs(prevY - lane.y) < lane.halfHeight;
    if (inside && !wasInside && !s.lanes[i]) {
      s.lanes[i] = true;
      const pts = award(s, 50);
      emit(s, 'lane', lane.x, lane.y, pts, i);
      if (s.lanes.every(Boolean)) {
        s.multiplier = Math.min(MAX_MULTIPLIER, s.multiplier + 1);
        const bonus = award(s, 1000);
        emit(s, 'multiplier', 0, 6, bonus, s.multiplier);
        s.lanes = [false, false, false];
      }
    }
  });

  ball.inLane = ball.x > PLUNGER.laneLeft && ball.y < 5.2;
  if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y) || Math.abs(ball.x) > 7 || ball.y > 13) {
    resetBallToLane(s);
  }
}

function updatePlunger(s: SimState, cmd: Command, dt: number): void {
  const held = s.mode === 'play' && cmd.plunger;
  if (held) {
    s.plungerCharge = Math.min(1, s.plungerCharge + dt / PLUNGER_CHARGE_TIME);
    s.plungerOffset = s.plungerCharge * PLUNGER.pullDepth;
  } else if (s.plungerHeld) {
    // Released: fire if the ball sits on the plunger tip.
    const ball = s.ball0;
    const floor = PLUNGER.restY - s.plungerOffset + BALL_RADIUS;
    if (ball.x > PLUNGER.laneLeft && Math.abs(ball.y - floor) < 0.2) {
      const jitter = (rand(s) - 0.5) * 0.6;
      const speed = LAUNCH_MIN + LAUNCH_RANGE * s.plungerCharge + jitter;
      ball.y = PLUNGER.restY + BALL_RADIUS + 0.02;
      ball.vy = speed;
      ball.vx = 0;
      s.launches += 1;
      emit(s, 'launch', ball.x, ball.y, 0, 0, s.plungerCharge);
      if (!s.ballSaveUsed) s.ballSaveTimer = BALL_SAVE_TIME;
    }
    s.plungerCharge = 0;
  } else {
    // Spring back quickly.
    s.plungerOffset = Math.max(0, s.plungerOffset - dt * 12);
  }
  s.plungerHeld = held;
}

function handleDrain(s: SimState): void {
  const ball = s.ball0;
  if (ball.y > DRAIN_Y) return;
  if (s.ballSaveTimer > 0 && !s.ballSaveUsed) {
    s.ballSaveUsed = true;
    s.ballSaveTimer = 0;
    emit(s, 'save', ball.x, ball.y);
    resetBallToLane(s);
    return;
  }
  s.drains += 1;
  emit(s, 'drain', ball.x, ball.y);
  s.mode = 'drained';
  s.modeTimer = 0;
  s.drainTimer = DRAIN_PAUSE;
  ball.vx = 0;
  ball.vy = 0;
}

export function step(s: SimState, cmd: Command): void {
  const dt = STEP;
  s.tick += 1;
  s.time += dt;

  const startEdge = cmd.start && !s.lastStart;
  s.lastStart = cmd.start;

  for (let i = 0; i < s.bumperLight.length; i++) {
    s.bumperLight[i] = Math.max(0, s.bumperLight[i] - dt);
    s.bumperCooldown[i] = Math.max(0, s.bumperCooldown[i] - dt);
  }
  for (let i = 0; i < 2; i++) s.slingLight[i] = Math.max(0, s.slingLight[i] - dt);

  const prevMode = s.mode;
  s.modeTimer += dt;
  if (s.mode === 'attract' || s.mode === 'gameover') {
    // A short lockout on game over so flipper mashing doesn't skip the result.
    if (startEdge && (s.mode === 'attract' || s.modeTimer > 1.0)) startGame(s);
    if (s.mode !== prevMode) s.modeTimer = 0;
    updateFlippers(s, IDLE_COMMAND, dt);
    return;
  }

  if (s.mode === 'drained') {
    updateFlippers(s, IDLE_COMMAND, dt);
    s.drainTimer -= dt;
    if (s.drainTimer <= 0) {
      s.ballsLeft -= 1;
      if (s.ballsLeft <= 0) {
        s.mode = 'gameover';
        s.modeTimer = 0;
        s.ballsLeft = 0;
        emit(s, 'gameover', 0, 0, s.score);
      } else {
        s.ball += 1;
        s.mode = 'play';
        s.modeTimer = 0;
        s.ballSaveUsed = false;
        resetBallToLane(s);
      }
    }
    return;
  }

  // play
  if (s.ballSaveTimer > 0) s.ballSaveTimer = Math.max(0, s.ballSaveTimer - dt);
  updatePlunger(s, cmd, dt);
  const sub = dt / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) {
    updateFlippers(s, cmd, sub);
    stepBall(s, sub);
  }
  handleDrain(s);
}
