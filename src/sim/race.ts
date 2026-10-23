import { createSeededRandom } from '../utils/random';
import { COURSE_LENGTH, COURSE_SAMPLES, GATES, RAMPS, courseAt, nearestSample } from './course';
import { createState, fwdX, fwdZ, IDLE, step, TUNING, type Command, type SimState } from './sim';

/**
 * The race: the player and AI rivals are the same SimState, stepped by the
 * same `step()` with the same Command type. This module owns the grid,
 * countdown, the AI drivers, race positions, the finish, and ski-to-ski
 * contact (momentum-conserving impulses). Everything is plain data.
 */

export type RacePhase = 'free' | 'countdown' | 'racing';

export interface RivalProfile {
  name: string;
  color: string;
  /** throttle cap on straights (1 = full) */
  pace: number;
  /** 0..1 how eagerly it burns boost */
  boostUse: number;
  /** preferred lateral offset from the centre line, metres (+ right) */
  lane: number;
}

export const PLAYER_NAME = 'YOU';
export const PLAYER_COLOR = '#ec4a36';

export const RIVALS: RivalProfile[] = [
  { name: 'KAI', color: '#14b8a6', pace: 1.0, boostUse: 0.85, lane: -3 },
  { name: 'MARA', color: '#8b5cf6', pace: 0.99, boostUse: 0.7, lane: 3.5 },
  { name: 'RIO', color: '#f59e0b', pace: 0.975, boostUse: 0.8, lane: -5 },
  { name: 'JUNO', color: '#84cc16', pace: 0.96, boostUse: 0.55, lane: 5 },
  { name: 'SKYE', color: '#ec4899', pace: 0.95, boostUse: 0.65, lane: 0 },
];

export const RACE = {
  laps: 3,
  countdown: 3,
  /** ski collision capsule: half-length of the core segment and radius */
  capHalf: 0.78,
  capRadius: 0.62,
  /** vertical overlap needed for contact (jumping over someone misses) */
  capHeight: 1.3,
  restitution: 0.45,
  /** yaw response to an off-centre hit, rad per (m/s) of impulse, clamped */
  yawKick: 0.035,
  yawKickMax: 0.14,
  /** min impulse (m/s) that counts as a bump event */
  bumpEvent: 0.6,
};

export interface Brain {
  cursor: number;
  lane: number;
  laneTarget: number;
  laneTimer: number;
  /** missed-gate recovery: 0 off, 1 heading to the approach point, 2 driving through */
  recover: number;
  recoverTimer: number;
  recoverGate: number;
}

export interface Racer {
  id: number;
  name: string;
  color: string;
  bot: boolean;
  /** RIVALS index, -1 for the player */
  profile: number;
  s: SimState;
  brain: Brain;
  progCursor: number;
  /** metres of race distance covered (laps * length + arc in lap) */
  progress: number;
  finished: boolean;
  /** race time at the finish line (s since GO) */
  finishTime: number;
  /** 1-based current place */
  place: number;
  lastCmd: Command;
}

export type RaceEventType = 'countdown' | 'go' | 'finish' | 'bump';

export interface RaceEvent {
  id: number;
  type: RaceEventType;
  /** racer ids involved (bump: two) */
  a: number;
  b: number;
  x: number;
  y: number;
  z: number;
  value: number;
}

export interface RaceWorld {
  seed: number;
  rngState: number;
  phase: RacePhase;
  countdown: number;
  totalLaps: number;
  /** sim time of GO */
  startT: number;
  t: number;
  racers: Racer[];
  /** racer ids in finishing order */
  finishOrder: number[];
  /** pairs ("i-j") in contact last step: new contacts raise one event */
  contacts: string[];
  bumpsPlayerRival: number;
  bumpsRivalRival: number;
  /** last contact with an impulse: ids, impulse (m/s), speeds and normal momentum before/after */
  lastBump: { a: number; b: number; j: number; t: number; aBefore: number; bBefore: number; aAfter: number; bAfter: number; pnBefore: number; pnAfter: number } | null;
  /** test lever: rivals' engines idle (physics still runs) */
  holdRivals: boolean;
  events: RaceEvent[];
  nextEventId: number;
}

/** Grid: two columns behind the start line; the player starts on the third row. */
export function gridSlot(i: number): { x: number; z: number; heading: number } {
  const g = GATES[0];
  const row = Math.floor(i / 2);
  const col = i % 2;
  const back = 10 + row * 9 + col * 3;
  const side = col === 0 ? -4.5 : 4.5;
  // right of the start tangent is (-tz, tx)
  return {
    x: g.x - g.tx * back + -g.tz * side,
    z: g.z - g.tz * back + g.tx * side,
    heading: Math.atan2(-g.tx, -g.tz),
  };
}

const PLAYER_SLOT = 4;

export function createRace(seed: number, opts: { phase: RacePhase; laps?: number; rivals?: number; playerBest?: number }): RaceWorld {
  const racers: Racer[] = [];
  const nRivals = Math.max(0, Math.min(RIVALS.length, opts.rivals ?? RIVALS.length));
  const playerSlot = Math.min(PLAYER_SLOT, nRivals);
  const make = (id: number, slot: number, profile: number): Racer => {
    const spot = gridSlot(slot);
    const bot = profile >= 0;
    const s = createState(((seed >>> 0) + id * 7919) >>> 0 || 1, { ...spot, bot });
    const p = bot ? RIVALS[profile] : null;
    return {
      id,
      name: p ? p.name : PLAYER_NAME,
      color: p ? p.color : PLAYER_COLOR,
      bot,
      profile,
      s,
      brain: { cursor: -1, lane: p ? p.lane : 0, laneTarget: p ? p.lane : 0, laneTimer: 2 + id, recover: 0, recoverTimer: 0, recoverGate: -1 },
      progCursor: -1,
      progress: 0,
      finished: false,
      finishTime: 0,
      place: id + 1,
      lastCmd: IDLE,
    };
  };
  racers.push(make(0, playerSlot, -1));
  racers[0].s.race.bestLap = opts.playerBest ?? 0;
  let k = 0;
  for (let i = 0; i < nRivals + 1; i += 1) {
    if (i === playerSlot) continue;
    racers.push(make(racers.length, i, k));
    k += 1;
  }
  const w: RaceWorld = {
    seed,
    rngState: (seed ^ 0x5bd1e995) >>> 0,
    phase: opts.phase,
    countdown: opts.phase === 'countdown' ? RACE.countdown : 0,
    totalLaps: Math.max(1, opts.laps ?? RACE.laps),
    startT: 0,
    t: 0,
    racers,
    finishOrder: [],
    contacts: [],
    bumpsPlayerRival: 0,
    bumpsRivalRival: 0,
    holdRivals: false,
    lastBump: null,
    events: [],
    nextEventId: 1,
  };
  updatePlaces(w);
  return w;
}

export function player(w: RaceWorld): Racer {
  return w.racers[0];
}

function rngFrom(w: RaceWorld): () => number {
  const rand = createSeededRandom(w.rngState);
  return () => {
    const v = rand();
    w.rngState = (w.rngState + 0x9e3779b9 + Math.floor(v * 1e9)) >>> 0;
    return v;
  };
}

function emit(w: RaceWorld, type: RaceEventType, a: number, b: number, x: number, y: number, z: number, value: number): void {
  w.events.push({ id: w.nextEventId, type, a, b, x, y, z, value });
  w.nextEventId += 1;
  if (w.events.length > 48) w.events.splice(0, w.events.length - 48);
}

/** Race time since GO (0 before). */
export function raceClock(w: RaceWorld): number {
  return w.phase === 'racing' ? Math.max(0, w.t - w.startT) : 0;
}

// ------------------------------------------------------------------ AI

const RAMP_ARC = RAMPS.map((r) => COURSE_SAMPLES[nearestSample(r.x, r.z)].arc);

function wrapArc(d: number): number {
  const L = COURSE_LENGTH;
  return ((d % L) + L * 1.5) % L - L / 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** One rival's command: follow the course on its lane, line up and hit the ramps, pass slower skis. */
export function botCommand(w: RaceWorld, r: Racer, rand: () => number): Command {
  const s = r.s;
  const b = r.brain;
  const p = r.profile >= 0 ? RIVALS[r.profile] : { pace: 0.95, boostUse: 0.5, lane: 0 };
  const dt = TUNING.dt;
  b.cursor = nearestSample(s.x, s.z, b.cursor, 40);
  const near = COURSE_SAMPLES[b.cursor];
  if (Math.hypot(near.x - s.x, near.z - s.z) > 30) b.cursor = nearestSample(s.x, s.z);
  const arcHere = COURSE_SAMPLES[b.cursor].arc;
  const speed = Math.hypot(s.vx, s.vz);
  const here = courseAt(arcHere);

  // Ramps: within ~85 m ahead, merge to the centre line and aim at the lip.
  let ramp = -1;
  let rampDa = 0;
  for (let i = 0; i < RAMPS.length; i += 1) {
    const da = wrapArc(RAMP_ARC[i] - arcHere);
    if (da > -RAMPS[i].len && da < 85) {
      ramp = i;
      rampDa = da;
    }
  }
  const cooling = r.finished;

  // Pass a slower ski in front by switching lanes for a while.
  b.laneTimer -= dt;
  const fx = fwdX(s.heading);
  const fz = fwdZ(s.heading);
  if (ramp < 0 && !cooling) {
    for (const o of w.racers) {
      if (o === r) continue;
      const dx = o.s.x - s.x;
      const dz = o.s.z - s.z;
      const ahead = dx * fx + dz * fz;
      const lat = dx * -fz + dz * fx;
      const oSpeed = Math.hypot(o.s.vx, o.s.vz);
      if (ahead > 1.5 && ahead < 12 && Math.abs(lat) < 2.6 && oSpeed < speed + 1) {
        const dir = lat > 0 ? -1 : 1;
        b.laneTarget = clamp(b.lane + dir * 4.5, -5.5, 5.5);
        b.laneTimer = 2.5 + rand() * 1.5;
        break;
      }
    }
  }
  if (b.laneTimer <= 0) {
    b.laneTarget = clamp(p.lane + (rand() - 0.5) * 4, -5.5, 5.5);
    b.laneTimer = 3 + rand() * 4;
  }
  const laneGoal = ramp >= 0 ? 0 : b.laneTarget;
  b.lane += clamp(laneGoal - b.lane, -3.2 * dt, 3.2 * dt);

  const look = 14 + speed * 0.55;
  const ahead = courseAt(arcHere + look);
  let aimX = ahead.x + -ahead.tz * b.lane;
  let aimZ = ahead.z + ahead.tx * b.lane;

  const g = GATES[s.race.nextGate];
  const gd = Math.hypot(g.x - s.x, g.z - s.z);
  const before = (s.x - g.x) * g.tx + (s.z - g.z) * g.tz;
  // Missed the gate that counts (pushed wide, or overshot): loop back for it.
  const gArcDa = wrapArc(arcHere - g.arc);
  if (b.recover > 0 && (b.recoverGate !== s.race.nextGate || b.recoverTimer <= 0)) b.recover = 0;
  if (b.recover === 0 && !cooling && gArcDa > 15 && gArcDa < 250) {
    b.recover = 1;
    b.recoverTimer = 25;
    b.recoverGate = s.race.nextGate;
  }
  if (b.recover > 0) {
    b.recoverTimer -= dt;
    const app = courseAt(g.arc - 28);
    if (b.recover === 1 && Math.hypot(app.x - s.x, app.z - s.z) < 10) b.recover = 2;
    if (b.recover === 1) {
      aimX = app.x;
      aimZ = app.z;
    } else {
      aimX = g.x + g.tx * 10;
      aimZ = g.z + g.tz * 10;
    }
  }
  const missed = b.recover > 0;
  if (missed) {
    // handled above
  } else if (ramp >= 0 && rampDa > -2) {
    const rp = RAMPS[ramp];
    // Line up behind the entry, then aim through the lip.
    const lipX = rp.x + rp.dx * (rp.len + 6);
    const lipZ = rp.z + rp.dz * (rp.len + 6);
    if (rampDa > look) {
      aimX = rp.x - rp.dx * 4;
      aimZ = rp.z - rp.dz * 4;
    } else {
      aimX = lipX;
      aimZ = lipZ;
    }
  } else if (gd < 50 && before < -4) {
    const lane = clamp(b.lane, -5, 5);
    aimX = g.x + g.tx * 6 + -g.tz * lane;
    aimZ = g.z + g.tz * 6 + g.tx * lane;
  }

  const want = Math.atan2(-(aimX - s.x), -(aimZ - s.z));
  const diff = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading));
  // Real air: hands off (steer would spin it). Chop hops still carve.
  const realAir = s.airborne && (s.airTime > 0.22 || s.y - s.surfaceY > 0.6);
  const steer = realAir ? 0 : clamp(-diff * 2.6, -1, 1);

  let bend = 0;
  for (const d of [15, 30, 45, 60]) {
    const a = courseAt(arcHere + d);
    bend = Math.max(bend, Math.abs(Math.atan2(here.tx * a.tz - here.tz * a.tx, here.tx * a.tx + here.tz * a.tz)));
  }
  // Mild catch-up: rivals far ahead of the player ease off a touch, far behind push harder.
  let band = 1;
  const pl = w.racers[0];
  if (w.phase === 'racing' && !pl.finished && r !== pl) {
    const gap = r.progress - pl.progress;
    band = 1 - clamp((gap - 40) / 1600, -0.04, 0.07) * (gap > 40 || gap < -40 ? 1 : 0);
  }
  const pace = cooling ? 0.55 : Math.min(1, p.pace * band);
  const target = Math.max(11, 26 - bend * 13) * (cooling ? 0.6 : band > 1 ? 1 : band);
  const turn = Math.abs(diff);
  let throttle = speed < target ? pace : speed > target + 4 ? -0.35 : 0.15;
  if (turn > 0.6) throttle = Math.min(throttle, 0.5);
  if (missed && turn > 0.9) throttle = Math.min(throttle, 0.6);
  const straight = bend < 0.25 && turn < 0.15;
  const eager = band > 1.01 ? 1 : p.boostUse;
  const rampRun = ramp >= 0 && rampDa > 0 && rampDa < 45 && turn < 0.2;
  const boost = !cooling && ((straight && s.boost > 1 - eager * 0.75) || (rampRun && s.boost > 0.15));
  return { throttle, steer, boost, jump: false };
}

// ------------------------------------------------------------------ positions

function computeProgress(r: Racer): number {
  const s = r.s;
  r.progCursor = nearestSample(s.x, s.z, r.progCursor, 40);
  const smp = COURSE_SAMPLES[r.progCursor];
  if (Math.hypot(smp.x - s.x, smp.z - s.z) > 30) r.progCursor = nearestSample(s.x, s.z);
  const arc = COURSE_SAMPLES[r.progCursor].arc;
  const L = COURSE_LENGTH;
  const race = s.race;
  if (!race.started) {
    // On the grid / approaching the start line: just behind 0.
    const a = arc > L / 2 ? arc - L : Math.min(arc, 0);
    return a;
  }
  const ng = race.nextGate;
  const lo = ng === 0 ? GATES[GATES.length - 1].arc : GATES[ng - 1].arc;
  const hi = ng === 0 ? L : GATES[ng].arc;
  const a = clamp(arc < lo - L / 2 ? arc + L : arc, lo, hi);
  return race.laps * L + a;
}

export function updatePlaces(w: RaceWorld): void {
  for (const r of w.racers) if (!r.finished) r.progress = computeProgress(r);
  const order = [...w.racers].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress || a.id - b.id;
  });
  order.forEach((r, i) => {
    r.place = i + 1;
  });
}

// ------------------------------------------------------------------ contact

function closestSegSeg(
  p1x: number, p1z: number, q1x: number, q1z: number,
  p2x: number, p2z: number, q2x: number, q2z: number,
): [number, number, number, number] {
  const d1x = q1x - p1x;
  const d1z = q1z - p1z;
  const d2x = q2x - p2x;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const rz = p1z - p2z;
  const a = d1x * d1x + d1z * d1z;
  const e = d2x * d2x + d2z * d2z;
  const f = d2x * rx + d2z * rz;
  const c = d1x * rx + d1z * rz;
  const b = d1x * d2x + d1z * d2z;
  const denom = a * e - b * b;
  let s = denom > 1e-9 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = clamp(-c / a, 0, 1);
  } else if (t > 1) {
    t = 1;
    s = clamp((b - c) / a, 0, 1);
  }
  return [p1x + d1x * s, p1z + d1z * s, p2x + d2x * t, p2z + d2z * t];
}

/**
 * Ski-to-ski contact: each hull is a capsule along its heading. Overlap is
 * split evenly, then an impulse along the contact normal (equal masses,
 * restitution RACE.restitution) exchanges momentum. Off-centre hits yaw the
 * hull a little. Total momentum along the normal is conserved.
 */
export function resolveContacts(w: RaceWorld): void {
  const R = w.racers;
  const h = RACE.capHalf;
  const rad = RACE.capRadius * 2;
  const now: string[] = [];
  for (let i = 0; i < R.length; i += 1) {
    const A = R[i].s;
    const ax = fwdX(A.heading) * h;
    const az = fwdZ(A.heading) * h;
    for (let j = i + 1; j < R.length; j += 1) {
      const B = R[j].s;
      const dxc = B.x - A.x;
      const dzc = B.z - A.z;
      if (dxc * dxc + dzc * dzc > 16) continue;
      if (Math.abs(A.y - B.y) > RACE.capHeight) continue;
      const bx = fwdX(B.heading) * h;
      const bz = fwdZ(B.heading) * h;
      const [cax, caz, cbx, cbz] = closestSegSeg(A.x - ax, A.z - az, A.x + ax, A.z + az, B.x - bx, B.z - bz, B.x + bx, B.z + bz);
      let nx = cbx - cax;
      let nz = cbz - caz;
      let d = Math.hypot(nx, nz);
      if (d >= rad) continue;
      if (d < 1e-4) {
        nx = dxc || 1;
        nz = dzc;
        d = 0;
        const l = Math.hypot(nx, nz);
        nx /= l;
        nz /= l;
      } else {
        nx /= d;
        nz /= d;
      }
      const pen = rad - d;
      A.x -= nx * pen * 0.5;
      A.z -= nz * pen * 0.5;
      B.x += nx * pen * 0.5;
      B.z += nz * pen * 0.5;
      const vn = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
      let J = 0;
      if (vn < 0) {
        const aBefore = Math.hypot(A.vx, A.vz);
        const bBefore = Math.hypot(B.vx, B.vz);
        const pnBefore = A.vx * nx + A.vz * nz + B.vx * nx + B.vz * nz;
        // equal masses: J = -(1+e) vn / (1/m + 1/m)
        J = (-(1 + RACE.restitution) * vn) / 2;
        A.vx -= J * nx;
        A.vz -= J * nz;
        B.vx += J * nx;
        B.vz += J * nz;
        // Yaw: torque_y = r_z * F_x - r_x * F_z, heading is rotation about +Y.
        const cx = (cax + cbx) / 2;
        const cz = (caz + cbz) / 2;
        const kick = (s: SimState, fx: number, fz: number) => {
          if (s.airborne) return;
          const rx = cx - s.x;
          const rz = cz - s.z;
          const tq = rz * fx - rx * fz;
          s.heading += clamp(tq * RACE.yawKick, -RACE.yawKickMax, RACE.yawKickMax);
        };
        kick(A, -J * nx, -J * nz);
        kick(B, J * nx, J * nz);
        const knock = Math.min(0.8, J * 0.12);
        A.knock = Math.max(A.knock, knock);
        B.knock = Math.max(B.knock, knock);
        if (J >= RACE.bumpEvent) {
          w.lastBump = {
            a: R[i].id, b: R[j].id, j: J, t: w.t, aBefore, bBefore,
            aAfter: Math.hypot(A.vx, A.vz), bAfter: Math.hypot(B.vx, B.vz),
            pnBefore, pnAfter: A.vx * nx + A.vz * nz + B.vx * nx + B.vz * nz,
          };
        }
      }
      const key = `${i}-${j}`;
      now.push(key);
      if (!w.contacts.includes(key) && J >= RACE.bumpEvent) {
        A.bumps += 1;
        B.bumps += 1;
        if (i === 0) w.bumpsPlayerRival += 1;
        else w.bumpsRivalRival += 1;
        emit(w, 'bump', R[i].id, R[j].id, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2, J);
      }
    }
  }
  w.contacts = now;
}

// ------------------------------------------------------------------ step

/** Advance the whole field one fixed step. `playerCmd` drives racer 0 unless it has finished. */
export function stepRace(w: RaceWorld, playerCmd: Command, autoPlayer = false): void {
  const rand = rngFrom(w);
  w.t += TUNING.dt;
  if (w.phase === 'countdown') {
    const before = Math.ceil(w.countdown);
    w.countdown -= TUNING.dt;
    const after = Math.ceil(w.countdown);
    if (after !== before && after > 0) emit(w, 'countdown', 0, 0, 0, 0, 0, after);
    if (w.countdown <= 0) {
      w.countdown = 0;
      w.phase = 'racing';
      w.startT = w.t;
      emit(w, 'go', 0, 0, 0, 0, 0, 0);
    }
  }
  const locked = w.phase === 'countdown';
  for (const r of w.racers) {
    let cmd: Command;
    if (locked) cmd = IDLE;
    else if (r.bot) cmd = w.holdRivals ? IDLE : botCommand(w, r, rand);
    else cmd = autoPlayer || r.finished ? botCommand(w, r, rand) : playerCmd;
    r.lastCmd = cmd;
    step(r.s, cmd);
  }
  resolveContacts(w);
  if (w.phase === 'racing') {
    for (const r of w.racers) {
      if (r.finished || r.s.race.laps < w.totalLaps) continue;
      r.finished = true;
      r.finishTime = r.s.race.lapStart - w.startT;
      w.finishOrder.push(r.id);
      emit(w, 'finish', r.id, w.finishOrder.length, r.s.x, r.s.y, r.s.z, r.finishTime);
    }
  }
  updatePlaces(w);
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
