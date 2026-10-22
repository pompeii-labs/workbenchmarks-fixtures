// Fixed-step pinball simulation. State is plain serializable data; one Command
// type drives it. Rendering reads the state and never writes it.
import { createSeededRandom } from '../utils/random';
import {
  BALL_R,
  BUMPERS,
  FIELD,
  FLIPPER_DOWN_SPEED,
  FLIPPER_REST,
  FLIPPER_UP,
  FLIPPER_UP_SPEED,
  FLIPPERS,
  GRAVITY,
  LANES,
  PLUNGER,
  SEGMENTS,
  type Seg,
} from './table';

export const STEP = 1 / 480;
export const BALLS_PER_GAME = 3;
export const BALL_SAVE_SECONDS = 4;
const MAX_SPEED = 48;
const PLUNGER_CHARGE_TIME = 0.9;
const LAUNCH_MIN = 18;
const LAUNCH_MAX = 40;
const BUMPER_KICK = 12;
const SLING_KICK = 10;
const DRAIN_DELAY = 1.1;

export interface Command {
  left: boolean;
  right: boolean;
  plunger: boolean;
  start: boolean;
}

export const EMPTY_COMMAND: Command = { left: false, right: false, plunger: false, start: false };

export type Mode = 'title' | 'plunger' | 'play' | 'drain' | 'over';

export type EventType =
  | 'bumper'
  | 'sling'
  | 'lane'
  | 'lanesComplete'
  | 'flipper'
  | 'launch'
  | 'drain'
  | 'save'
  | 'gameOver'
  | 'newBall'
  | 'start'
  | 'hit';

export interface SimEvent {
  id: number;
  type: EventType;
  index: number;
  x: number;
  y: number;
  strength: number;
}

export interface FlipperState {
  angle: number;
  /** World angular velocity (rad/s, CCW positive). */
  omega: number;
  held: boolean;
}

export interface SimState {
  time: number;
  mode: Mode;
  modeTime: number;
  ball: { x: number; y: number; vx: number; vy: number; spin: number };
  flippers: FlipperState[];
  plunger: { charge: number; pulling: boolean; latch: boolean; release: number };
  score: number;
  best: number;
  mult: number;
  ballsLeft: number;
  ballNumber: number;
  ballSaveUsed: boolean;
  launchTime: number;
  bumperFlash: number[];
  bumperCooldown: number[];
  slingFlash: number[];
  laneLit: boolean[];
  laneInside: boolean[];
  laneFlash: number;
  stillTime: number;
  newBest: boolean;
  stats: { bumperHits: number; slingHits: number; flips: number; launches: number; drains: number };
  rngState: number;
  nextEventId: number;
  events: SimEvent[];
  lastStart: boolean;
}

export function createState(best = 0, seed = 1): SimState {
  const s: SimState = {
    time: 0,
    mode: 'title',
    modeTime: 0,
    ball: { x: PLUNGER.x, y: PLUNGER.ballY, vx: 0, vy: 0, spin: 0 },
    flippers: FLIPPERS.map(() => ({ angle: FLIPPER_REST, omega: 0, held: false })),
    plunger: { charge: 0, pulling: false, latch: false, release: 0 },
    score: 0,
    best,
    mult: 1,
    ballsLeft: BALLS_PER_GAME,
    ballNumber: 1,
    ballSaveUsed: false,
    launchTime: -99,
    bumperFlash: BUMPERS.map(() => 0),
    bumperCooldown: BUMPERS.map(() => 0),
    slingFlash: [0, 0],
    laneLit: LANES.map(() => false),
    laneInside: LANES.map(() => false),
    laneFlash: 0,
    stillTime: 0,
    newBest: false,
    stats: { bumperHits: 0, slingHits: 0, flips: 0, launches: 0, drains: 0 },
    rngState: seed >>> 0,
    nextEventId: 1,
    events: [],
    lastStart: false,
  };
  return s;
}

function rand(s: SimState): number {
  const r = createSeededRandom(s.rngState);
  const v = r();
  s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
  return v;
}

function emit(s: SimState, type: EventType, index = 0, x = s.ball.x, y = s.ball.y, strength = 1): void {
  s.events.push({ id: s.nextEventId++, type, index, x, y, strength });
  if (s.events.length > 256) s.events.splice(0, s.events.length - 256);
}

function setMode(s: SimState, mode: Mode): void {
  s.mode = mode;
  s.modeTime = 0;
}

export function placeBallOnPlunger(s: SimState): void {
  s.ball.x = PLUNGER.x;
  s.ball.y = PLUNGER.ballY;
  s.ball.vx = 0;
  s.ball.vy = 0;
  s.plunger.charge = 0;
  s.plunger.pulling = false;
}

export function startGame(s: SimState): void {
  s.score = 0;
  s.mult = 1;
  s.ballsLeft = BALLS_PER_GAME;
  s.ballNumber = 1;
  s.ballSaveUsed = false;
  s.launchTime = -99;
  s.laneLit = LANES.map(() => false);
  s.newBest = false;
  s.stats = { bumperHits: 0, slingHits: 0, flips: 0, launches: 0, drains: 0 };
  placeBallOnPlunger(s);
  // The key that started the game must be released before the plunger charges.
  s.plunger.latch = true;
  setMode(s, 'plunger');
  emit(s, 'start');
}

export function ballInShooter(s: SimState): boolean {
  return s.ball.x > FIELD.laneWall && s.ball.y < -8.3;
}

export function addScore(s: SimState, points: number): void {
  s.score += points * s.mult;
}

function flipperTip(i: number, angle: number): [number, number] {
  const f = FLIPPERS[i];
  const dx = Math.cos(angle) * f.len * (f.side === -1 ? 1 : -1);
  const dy = Math.sin(angle) * f.len;
  return [f.px + dx, f.py + dy];
}

export function flipperEndpoints(s: SimState, i: number): { px: number; py: number; tx: number; ty: number } {
  const f = FLIPPERS[i];
  const [tx, ty] = flipperTip(i, s.flippers[i].angle);
  return { px: f.px, py: f.py, tx, ty };
}

/** Closest point on segment ab to p; returns t in [0,1] and point. */
function closest(ax: number, ay: number, bx: number, by: number, px: number, py: number): [number, number, number] {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [t, ax + abx * t, ay + aby * t];
}

/** Resolve ball vs a contact. Returns incoming normal speed (>0) if it collided. */
function resolve(s: SimState, cx: number, cy: number, radius: number, e: number, svx = 0, svy = 0): number {
  const b = s.ball;
  let nx = b.x - cx;
  let ny = b.y - cy;
  const d = Math.hypot(nx, ny);
  const min = radius + BALL_R;
  if (d >= min) return 0;
  if (d < 1e-6) {
    nx = 0;
    ny = 1;
  } else {
    nx /= d;
    ny /= d;
  }
  b.x = cx + nx * min;
  b.y = cy + ny * min;
  const rvx = b.vx - svx;
  const rvy = b.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0.0001;
  const j = -(1 + e) * vn;
  b.vx = svx + rvx + j * nx;
  b.vy = svy + rvy + j * ny;
  return -vn;
}

function collideSegment(s: SimState, g: Seg): number {
  const b = s.ball;
  const [, qx, qy] = closest(g.ax, g.ay, g.bx, g.by, b.x, b.y);
  if (g.kind === 'gate') {
    // One-way: only blocks a ball above the gate that is moving down into it.
    const nx = -(g.by - g.ay);
    const ny = g.bx - g.ax;
    const side = (b.x - g.ax) * nx + (b.y - g.ay) * ny;
    if (side < 0 || b.vx * nx + b.vy * ny > 0) return 0;
  }
  return resolve(s, qx, qy, g.r, g.e);
}

function updateFlippers(s: SimState, cmd: Command, dt: number): void {
  const allowed = s.mode === 'play' || s.mode === 'plunger' || s.mode === 'title';
  FLIPPERS.forEach((def, i) => {
    const f = s.flippers[i];
    const held = allowed && (def.side === -1 ? cmd.left : cmd.right);
    if (held && !f.held) {
      s.stats.flips += 1;
      emit(s, 'flipper', i, def.px, def.py);
    }
    f.held = held;
    const target = held ? FLIPPER_UP : FLIPPER_REST;
    const speed = held ? FLIPPER_UP_SPEED : FLIPPER_DOWN_SPEED;
    const prev = f.angle;
    if (f.angle < target) f.angle = Math.min(target, f.angle + speed * dt);
    else if (f.angle > target) f.angle = Math.max(target, f.angle - speed * dt);
    const da = (f.angle - prev) / dt;
    // Left flipper rotates CCW as it rises; the mirrored right flipper rotates CW.
    f.omega = def.side === -1 ? da : -da;
  });
}

function collideFlippers(s: SimState): void {
  const b = s.ball;
  FLIPPERS.forEach((def, i) => {
    const f = s.flippers[i];
    const { px, py, tx, ty } = flipperEndpoints(s, i);
    const [t, qx, qy] = closest(px, py, tx, ty, b.x, b.y);
    const r = def.r0 + (def.r1 - def.r0) * t;
    const d = Math.hypot(b.x - qx, b.y - qy);
    if (d >= r + BALL_R) return;
    // Surface velocity of the contact point: omega x (contact - pivot).
    const nx = d > 1e-6 ? (b.x - qx) / d : 0;
    const ny = d > 1e-6 ? (b.y - qy) / d : 1;
    const cx = qx + nx * r;
    const cy = qy + ny * r;
    const svx = -f.omega * (cy - def.py);
    const svy = f.omega * (cx - def.px);
    const hit = resolve(s, qx, qy, r, 0.3, svx, svy);
    if (hit > 6) emit(s, 'hit', 10 + i, b.x, b.y, hit);
  });
}

function collideBumpers(s: SimState): void {
  const b = s.ball;
  BUMPERS.forEach((def, i) => {
    const dx = b.x - def.x;
    const dy = b.y - def.y;
    const d = Math.hypot(dx, dy);
    if (d >= def.r + BALL_R) return;
    resolve(s, def.x, def.y, def.r, 0.6);
    if (s.bumperCooldown[i] > 0) return;
    const nx = dx / (d || 1);
    const ny = dy / (d || 1);
    const vn = b.vx * nx + b.vy * ny;
    if (vn < BUMPER_KICK) {
      b.vx += nx * (BUMPER_KICK - vn);
      b.vy += ny * (BUMPER_KICK - vn);
    }
    s.bumperCooldown[i] = 0.08;
    s.bumperFlash[i] = 1;
    s.stats.bumperHits += 1;
    addScore(s, 100);
    emit(s, 'bumper', i, def.x, def.y);
  });
}

function stepPlunger(s: SimState, cmd: Command, dt: number): void {
  const p = s.plunger;
  if (!cmd.plunger) p.latch = false;
  p.release = Math.max(0, p.release - dt * 6);
  const canPull = (s.mode === 'plunger' || s.mode === 'play') && !p.latch && ballInShooter(s);
  if (cmd.plunger && canPull) {
    p.pulling = true;
    p.charge = Math.min(1, p.charge + dt / PLUNGER_CHARGE_TIME);
  } else if (p.pulling) {
    // Release: fire the ball if it is still resting on the plunger tip.
    if (ballInShooter(s)) {
      const jitter = 1 + (rand(s) - 0.5) * 0.02;
      s.ball.y = PLUNGER.ballY;
      s.ball.vx = 0;
      s.ball.vy = (LAUNCH_MIN + (LAUNCH_MAX - LAUNCH_MIN) * p.charge) * jitter;
      s.launchTime = s.time;
      s.stats.launches += 1;
      emit(s, 'launch', 0, s.ball.x, s.ball.y, p.charge);
    }
    p.release = p.charge;
    p.pulling = false;
    p.charge = 0;
  }
}

function plungerTipY(s: SimState): number {
  return PLUNGER.restY - PLUNGER.travel * s.plunger.charge;
}

function stepBall(s: SimState, dt: number): void {
  const b = s.ball;
  b.vy -= GRAVITY * dt;
  const damp = 1 - 0.12 * dt;
  b.vx *= damp;
  b.vy *= damp;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > MAX_SPEED) {
    b.vx *= MAX_SPEED / sp;
    b.vy *= MAX_SPEED / sp;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.spin += (sp * dt) / BALL_R;

  for (const g of SEGMENTS) {
    const hit = collideSegment(s, g);
    if (hit > 0 && g.kind === 'sling' && hit > 1.5 && g.index !== undefined) {
      // Kick away from the rubber face.
      const [, qx, qy] = closest(g.ax, g.ay, g.bx, g.by, b.x, b.y);
      const nx = b.x - qx;
      const ny = b.y - qy;
      const d = Math.hypot(nx, ny) || 1;
      b.vx += (nx / d) * SLING_KICK;
      b.vy += (ny / d) * SLING_KICK;
      s.slingFlash[g.index] = 1;
      s.stats.slingHits += 1;
      addScore(s, 10);
      emit(s, 'sling', g.index, qx, qy);
    } else if (hit > 5) {
      emit(s, 'hit', 0, b.x, b.y, hit);
    }
  }
  collideBumpers(s);
  collideFlippers(s);

  // Plunger tip: a floor in the shooter lane.
  if (b.x > FIELD.laneWall) {
    const tip = plungerTipY(s);
    if (b.y - BALL_R < tip && b.y > tip - 0.6) {
      b.y = tip + BALL_R;
      if (b.vy < 0) b.vy = -b.vy * 0.15;
      if (Math.abs(b.vy) < 0.4) b.vy = 0;
    }
  }

  // Top rollover lanes.
  LANES.forEach((lane, i) => {
    // Trigger on entering the rollover only, so a ball rocking in a lane counts once.
    const inside = Math.abs(b.x - lane.x) < 0.35 && Math.abs(b.y - lane.y) < 0.3;
    const entered = inside && !s.laneInside[i];
    s.laneInside[i] = inside;
    if (entered && !s.laneLit[i]) {
      s.laneLit[i] = true;
      addScore(s, 50);
      emit(s, 'lane', i, lane.x, lane.y);
      if (s.laneLit.every(Boolean)) {
        addScore(s, 1000);
        s.mult = Math.min(5, s.mult + 1);
        s.laneFlash = 1;
        emit(s, 'lanesComplete', s.mult, 0, 8);
        s.laneLit = LANES.map(() => false);
      }
    }
  });
}

function drainBall(s: SimState): void {
  s.stats.drains += 1;
  const saved = !s.ballSaveUsed && s.time - s.launchTime < BALL_SAVE_SECONDS;
  if (saved) {
    s.ballSaveUsed = true;
    placeBallOnPlunger(s);
    setMode(s, 'plunger');
    emit(s, 'save');
    return;
  }
  emit(s, 'drain');
  s.ballsLeft -= 1;
  setMode(s, 'drain');
}

export function step(s: SimState, cmd: Command, dt = STEP): void {
  s.time += dt;
  s.modeTime += dt;
  const startEdge = cmd.start && !s.lastStart;
  s.lastStart = cmd.start;

  for (let i = 0; i < s.bumperFlash.length; i += 1) {
    s.bumperFlash[i] = Math.max(0, s.bumperFlash[i] - dt * 2.8);
    s.bumperCooldown[i] = Math.max(0, s.bumperCooldown[i] - dt);
  }
  for (let i = 0; i < s.slingFlash.length; i += 1) s.slingFlash[i] = Math.max(0, s.slingFlash[i] - dt * 3.5);
  s.laneFlash = Math.max(0, s.laneFlash - dt * 1.2);

  if (s.mode === 'title' || s.mode === 'over') {
    updateFlippers(s, cmd, dt);
    if (startEdge && (s.mode === 'title' || s.modeTime > 0.8)) startGame(s);
    else {
      // Attract mode: keep the ball parked on the plunger.
      placeBallOnPlunger(s);
      return;
    }
  }

  if (s.mode === 'drain') {
    updateFlippers(s, EMPTY_COMMAND, dt);
    if (s.modeTime >= DRAIN_DELAY) {
      if (s.ballsLeft <= 0) {
        s.ballsLeft = 0;
        if (s.score > s.best) {
          s.best = s.score;
          s.newBest = true;
        }
        placeBallOnPlunger(s);
        setMode(s, 'over');
        emit(s, 'gameOver');
      } else {
        s.ballNumber += 1;
        s.ballSaveUsed = false;
        s.launchTime = -99;
        placeBallOnPlunger(s);
        s.plunger.latch = cmd.plunger;
        setMode(s, 'plunger');
        emit(s, 'newBall');
      }
    }
    return;
  }

  updateFlippers(s, cmd, dt);
  stepPlunger(s, cmd, dt);
  stepBall(s, dt);

  const inShooter = ballInShooter(s);
  if (s.mode === 'plunger' && !inShooter && s.ball.y > -8) setMode(s, 'play');
  else if (s.mode === 'play' && inShooter && Math.abs(s.ball.vy) < 0.5) setMode(s, 'plunger');

  // Stuck-ball nudge (never while the player is cradling on a raised flipper).
  const speed = Math.hypot(s.ball.vx, s.ball.vy);
  const cradling = s.flippers.some((f) => f.held);
  if (s.mode === 'play' && speed < 0.3 && !cradling) s.stillTime += dt;
  else s.stillTime = 0;
  if (s.stillTime > 3) {
    s.ball.vx += (rand(s) - 0.5) * 4;
    s.ball.vy += 3;
    s.stillTime = 0;
  }

  if (s.ball.y < FIELD.bottom) drainBall(s);
}
