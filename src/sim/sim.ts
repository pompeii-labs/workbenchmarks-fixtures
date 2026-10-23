import { createSeededRandom } from '../utils/random';
import { waveHeight } from './waves';
import { GATES, RAMPS, SPAWN, rampLocal, rampTop, type Ramp } from './course';

/** The one input type that drives the ski (player or bot). */
export interface Command {
  /** -1 brake/reverse .. 1 full throttle */
  throttle: number;
  /** -1 left .. 1 right */
  steer: number;
  boost: boolean;
  /** one-shot: pop off the water this step */
  jump: boolean;
}

export const IDLE: Command = { throttle: 0, steer: 0, boost: false, jump: false };

export type SimEventType = 'launch' | 'land' | 'wipeout' | 'respawn' | 'ring' | 'trick' | 'pop' | 'gate' | 'lap' | 'race-start' | 'bump';

export interface SimEvent {
  id: number;
  type: SimEventType;
  x: number;
  y: number;
  z: number;
  /** generic magnitude: impact speed, points, etc. */
  value: number;
  label?: string;
}

export interface Ring {
  id: number;
  x: number;
  z: number;
  /** absolute height for air rings; surface rings float (y unused) */
  y: number;
  air: boolean;
  /** facing direction (yaw) */
  yaw: number;
}

export interface Island {
  x: number;
  z: number;
  r: number;
}

export type RideMode = 'ride' | 'wipeout';

export interface RaceState {
  /** lap clock running (start line crossed once) */
  started: boolean;
  /** index into GATES of the gate you must take next (0 = start/finish) */
  nextGate: number;
  /** completed laps this run */
  laps: number;
  /** sim time the current lap began */
  lapStart: number;
  lastLap: number;
  /** 0 = no lap set yet */
  bestLap: number;
  gatesPassed: number;
  /** most recent lap times, newest last */
  history: number[];
}


export interface SimState {
  t: number;
  step: number;
  rngState: number;
  mode: RideMode;
  modeTimer: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** yaw, radians; forward = (-sin, -cos). roll > 0 leans right. */
  heading: number;
  steerVisual: number;
  airborne: boolean;
  airTime: number;
  airMaxHeight: number;
  airSpin: number;
  airStartHeading: number;
  surfaceY: number;
  surfaceVy: number;
  pitch: number;
  roll: number;
  boost: number;
  boosting: boolean;
  jumpCooldown: number;
  score: number;
  combo: number;
  comboTimer: number;
  bestAir: number;
  bestCombo: number;
  jumps: number;
  wipeouts: number;
  ringsHit: number;
  rings: Ring[];
  nextRingId: number;
  /** RAMPS index the hull is riding on, -1 when on water */
  onRamp: number;
  /** current flight started off a ramp lip */
  airFromRamp: boolean;
  /** completed ramp jumps this run */
  rampJumps: number;
  /** airtime / peak height of the last landed ramp jump */
  lastRampAir: number;
  lastRampHeight: number;
  race: RaceState;
  /** AI rival: no personal ring field */
  bot: boolean;
  /** ski-to-ski contacts this run */
  bumps: number;
  /** steer direction held at takeoff: holding it through the air carves, it never spins (-1, 0, 1) */
  airSteerLatch: number;
  /** seconds of loosened side grip after a hit (the hull slides sideways) */
  knock: number;
  events: SimEvent[];
  nextEventId: number;
}

export const ISLANDS: Island[] = [
  { x: -260, z: -420, r: 70 },
  { x: 380, z: -180, r: 55 },
  { x: 120, z: 460, r: 85 },
  { x: -470, z: 220, r: 60 },
];

export const TUNING = {
  dt: 1 / 60,
  gravity: 17,
  maxSpeed: 25,
  boostSpeed: 35,
  accel: 15,
  boostAccel: 26,
  brake: 24,
  reverseMax: 6,
  coastDrag: 0.45,
  grip: 4.2,
  turnRate: 2.05,
  airSpinRate: 7.2,
  popVelocity: 6.2,
  launchKick: 1.25,
  hullHalf: 1.3,
  boostDrain: 0.3,
  boostRegen: 0.035,
  ringRadius: 3.2,
  wipeoutAngle: (70 * Math.PI) / 180,
  wipeoutTime: 1.7,
  comboWindow: 7,
  ringCount: 10,
  pylonRadius: 1.2,
  gateBoost: 0.12,
  lapPoints: 500,
};

function rngFrom(state: SimState): () => number {
  // Draw from the RNG stored in the state so the whole sim stays serializable.
  const rand = createSeededRandom(state.rngState);
  return () => {
    const v = rand();
    state.rngState = (state.rngState + 0x9e3779b9 + Math.floor(v * 1e9)) >>> 0;
    return v;
  };
}

export interface SpawnOptions {
  x: number;
  z: number;
  heading: number;
  bot?: boolean;
}

export function createState(seed: number, spawn: SpawnOptions = SPAWN): SimState {
  const s: SimState = {
    t: 0,
    step: 0,
    rngState: seed >>> 0,
    mode: 'ride',
    modeTimer: 0,
    x: spawn.x,
    y: 0,
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: spawn.heading,
    steerVisual: 0,
    airborne: false,
    airTime: 0,
    airMaxHeight: 0,
    airSpin: 0,
    airStartHeading: 0,
    surfaceY: 0,
    surfaceVy: 0,
    pitch: 0,
    roll: 0,
    boost: 1,
    boosting: false,
    jumpCooldown: 0,
    score: 0,
    combo: 1,
    comboTimer: 0,
    bestAir: 0,
    bestCombo: 1,
    jumps: 0,
    wipeouts: 0,
    ringsHit: 0,
    rings: [],
    nextRingId: 1,
    onRamp: -1,
    airFromRamp: false,
    rampJumps: 0,
    lastRampAir: 0,
    lastRampHeight: 0,
    race: { started: false, nextGate: 0, laps: 0, lapStart: 0, lastLap: 0, bestLap: 0, gatesPassed: 0, history: [] },
    bot: spawn.bot ?? false,
    bumps: 0,
    knock: 0,
    airSteerLatch: 0,
    events: [],
    nextEventId: 1,
  };
  s.y = hullHeight(s.x, s.z, s.heading, s.t);
  s.surfaceY = s.y;
  const rand = rngFrom(s);
  if (!s.bot) for (let i = 0; i < TUNING.ringCount; i += 1) spawnRing(s, rand, i < 3 ? 40 + i * 35 : 50);
  return s;
}

export function fwdX(h: number): number {
  return -Math.sin(h);
}
export function fwdZ(h: number): number {
  return -Math.cos(h);
}

/** Hull-averaged surface height: the 2.6 m hull filters the finest chop. */
export function hullHeight(x: number, z: number, heading: number, t: number): number {
  const fx = fwdX(heading) * TUNING.hullHalf;
  const fz = fwdZ(heading) * TUNING.hullHalf;
  return (waveHeight(x + fx, z + fz, t) + 2 * waveHeight(x, z, t) + waveHeight(x - fx, z - fz, t)) * 0.25;
}

/** Riding surface under the hull: water, or the ramp deck while on a ramp. */
function groundAt(s: SimState, x: number, z: number, t: number, hull: boolean): number {
  const w = hull ? hullHeight(x, z, s.heading, t) : waveHeight(x, z, t);
  if (s.onRamp < 0) return w;
  const r = RAMPS[s.onRamp];
  const { u, v } = rampLocal(r, x, z);
  if (u < 0 || u > r.len || Math.abs(v) > r.halfWidth + 0.3) return w;
  return Math.max(w, rampTop(r, u, t));
}

/** Ramps: ride on from the low end (or drop onto the deck); the sides and lip are solid. */
function resolveRamps(s: SimState): void {
  if (s.onRamp >= 0) {
    const r = RAMPS[s.onRamp];
    const { u, v } = rampLocal(r, s.x, s.z);
    if (u < -0.5 || u > r.len || Math.abs(v) > r.halfWidth + 0.3) s.onRamp = -1;
  }
  if (s.onRamp >= 0) return;
  for (const r of RAMPS) {
    const { u, v } = rampLocal(r, s.x, s.z);
    if (u < 0 || u > r.len || Math.abs(v) > r.halfWidth) continue;
    const top = rampTop(r, u, s.t);
    const along = s.vx * r.dx + s.vz * r.dz;
    if ((u < 2.5 && along > 1) || s.y >= top - 0.25) {
      s.onRamp = r.index;
      return;
    }
    pushOutOfRamp(s, r, u, v);
  }
}

function pushOutOfRamp(s: SimState, r: Ramp, u: number, v: number): void {
  const rx = -r.dz;
  const rz = r.dx;
  const side = r.halfWidth - Math.abs(v);
  const back = r.len - u;
  const front = u;
  let nx: number;
  let nz: number;
  let push: number;
  if (side <= back && side <= front) {
    const sg = v >= 0 ? 1 : -1;
    nx = rx * sg;
    nz = rz * sg;
    push = side;
  } else if (back <= front) {
    nx = r.dx;
    nz = r.dz;
    push = back;
  } else {
    nx = -r.dx;
    nz = -r.dz;
    push = front;
  }
  s.x += nx * (push + 0.05);
  s.z += nz * (push + 0.05);
  const vn = s.vx * nx + s.vz * nz;
  if (vn < 0) {
    s.vx -= vn * nx * 1.3;
    s.vz -= vn * nz * 1.3;
  }
}

/** Gate pylons are solid buoys: soft push-out, keep tangential speed. */
function resolvePylons(s: SimState): void {
  const R = TUNING.pylonRadius + 0.5;
  for (const g of GATES) {
    for (const sg of [-1, 1]) {
      const px = g.x + -g.tz * g.halfWidth * sg;
      const pz = g.z + g.tx * g.halfWidth * sg;
      const dx = s.x - px;
      const dz = s.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < R && d > 0.001 && s.y < 3.5 + s.surfaceY) {
        const nx = dx / d;
        const nz = dz / d;
        s.x = px + nx * R;
        s.z = pz + nz * R;
        const vn = s.vx * nx + s.vz * nz;
        if (vn < 0) {
          s.vx -= vn * nx * 1.4;
          s.vz -= vn * nz * 1.4;
        }
      }
    }
  }
}

/** Lap logic: only the next gate counts, crossed forward between its buoys. */
function updateRace(s: SimState, px: number, pz: number): void {
  const race = s.race;
  const g = GATES[race.nextGate];
  const dPrev = (px - g.x) * g.tx + (pz - g.z) * g.tz;
  const dNow = (s.x - g.x) * g.tx + (s.z - g.z) * g.tz;
  if (!(dPrev < 0 && dNow >= 0)) return;
  const f = dPrev / (dPrev - dNow);
  const cx = px + (s.x - px) * f;
  const cz = pz + (s.z - pz) * f;
  const lat = (cx - g.x) * -g.tz + (cz - g.z) * g.tx;
  if (Math.abs(lat) > g.halfWidth) return;
  const crossT = s.t - TUNING.dt + f * TUNING.dt;
  if (g.start) {
    if (!race.started) {
      race.started = true;
      race.lapStart = crossT;
      race.nextGate = 1;
      emit(s, 'race-start', 0);
      return;
    }
    const lap = crossT - race.lapStart;
    const best = race.bestLap <= 0 || lap < race.bestLap;
    race.lastLap = lap;
    if (best) race.bestLap = lap;
    race.laps += 1;
    race.history.push(lap);
    if (race.history.length > 5) race.history.shift();
    race.lapStart = crossT;
    race.nextGate = 1;
    emit(s, 'lap', lap, best ? 'best' : 'lap');
    s.score += Math.round(TUNING.lapPoints * s.combo);
    return;
  }
  race.gatesPassed += 1;
  race.nextGate = (race.nextGate + 1) % GATES.length;
  s.boost = Math.min(1, s.boost + TUNING.gateBoost);
  emit(s, 'gate', g.index);
}

/** Current lap clock (0 before the start line). */
export function lapClock(s: SimState): number {
  return s.race.started ? s.t - s.race.lapStart : 0;
}

function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export function emit(s: SimState, type: SimEventType, value: number, label?: string): void {
  s.events.push({ id: s.nextEventId, type, x: s.x, y: s.y, z: s.z, value, label });
  s.nextEventId += 1;
  if (s.events.length > 48) s.events.splice(0, s.events.length - 48);
}

function award(s: SimState, base: number, label: string): void {
  const pts = Math.round(base * s.combo);
  s.score += pts;
  emit(s, 'trick', pts, label);
}

function bumpCombo(s: SimState): void {
  s.combo = Math.min(8, s.combo + 1);
  s.bestCombo = Math.max(s.bestCombo, s.combo);
  s.comboTimer = TUNING.comboWindow;
}

function spawnRing(s: SimState, rand: () => number, minDist = 60): void {
  const speed = Math.hypot(s.vx, s.vz);
  const travel = speed > 3 ? Math.atan2(-s.vx, -s.vz) : s.heading;
  const ang = travel + (rand() - 0.5) * 2.2;
  const dist = minDist + rand() * 110;
  let x = s.x + fwdX(ang) * dist;
  let z = s.z + fwdZ(ang) * dist;
  for (const isl of ISLANDS) {
    const d = Math.hypot(x - isl.x, z - isl.z);
    if (d < isl.r + 20) {
      const k = (isl.r + 20) / Math.max(d, 1);
      x = isl.x + (x - isl.x) * k;
      z = isl.z + (z - isl.z) * k;
    }
  }
  const air = rand() < 0.35;
  s.rings.push({
    id: s.nextRingId,
    x,
    z,
    y: air ? 4.2 + rand() * 2.2 : 0,
    air,
    yaw: ang + (rand() - 0.5) * 0.6,
  });
  s.nextRingId += 1;
}

export function ringCenterY(r: Ring, t: number): number {
  return r.air ? r.y : waveHeight(r.x, r.z, t) + 1.5;
}

/** Test helper: put a ring straight ahead of the ski (removes spawn luck). */
export function placeRingAhead(s: SimState, dist: number, air: boolean): Ring {
  const r: Ring = {
    id: s.nextRingId,
    x: s.x + fwdX(s.heading) * dist,
    z: s.z + fwdZ(s.heading) * dist,
    y: air ? 4.5 : 0,
    air,
    yaw: s.heading,
  };
  s.nextRingId += 1;
  s.rings.push(r);
  return r;
}

export function step(s: SimState, cmd: Command): void {
  const T = TUNING;
  const dt = T.dt;
  const rand = rngFrom(s);
  s.t += dt;
  s.step += 1;
  s.jumpCooldown = Math.max(0, s.jumpCooldown - dt);
  s.knock = Math.max(0, s.knock - dt);

  if (s.comboTimer > 0) {
    s.comboTimer -= dt;
    if (s.comboTimer <= 0 && !s.airborne) s.combo = 1;
  }

  const wiped = s.mode === 'wipeout';
  const throttle = wiped ? 0 : Math.max(-1, Math.min(1, cmd.throttle));
  const steer = wiped ? 0 : Math.max(-1, Math.min(1, cmd.steer));
  s.steerVisual += (steer - s.steerVisual) * Math.min(1, dt * 10);

  const fx = fwdX(s.heading);
  const fz = fwdZ(s.heading);
  let forward = s.vx * fx + s.vz * fz;
  // Right vector for forward (fx, fz) is (-fz, fx): forward -Z gives right +X.
  let lateral = s.vx * -fz + s.vz * fx;

  s.boosting = false;
  if (!s.airborne && !wiped) {
    // Throttle, boost, brake
    const wantBoost = cmd.boost && s.boost > 0.02 && throttle > 0.1;
    s.boosting = wantBoost;
    const top = wantBoost ? T.boostSpeed : T.maxSpeed;
    if (throttle > 0) {
      const a = wantBoost ? T.boostAccel : T.accel;
      if (forward < top * throttle) forward = Math.min(top * throttle, forward + a * throttle * dt);
      else forward -= (forward - top * throttle) * Math.min(1, dt * 0.8);
    } else if (throttle < 0) {
      if (forward > 0) forward = Math.max(-0.0, forward - T.brake * -throttle * dt);
      else forward = Math.max(-T.reverseMax, forward - 8 * -throttle * dt);
    } else {
      forward -= forward * T.coastDrag * dt;
    }
    if (wantBoost) s.boost = Math.max(0, s.boost - T.boostDrain * dt);

    // Lateral grip: the hull bites and kills slip, leaving a carve.
    // A fresh hit knocks the hull loose so the shove carries before it bites again.
    const grip = s.knock > 0 ? T.grip * 0.2 : T.grip;
    lateral -= lateral * Math.min(1, grip * dt);

    // Steering: works best at mid speed, needs some speed to bite.
    const speedAbs = Math.abs(forward);
    const bite = Math.min(1, 0.25 + speedAbs / 9) * (1 - 0.3 * Math.min(1, speedAbs / T.boostSpeed));
    const dir = forward >= -0.5 ? 1 : -1;
    s.heading -= steer * T.turnRate * bite * dir * dt;

    // Rebuild velocity in the (new) heading frame so turning carries momentum
    // partly sideways: that slip is what throws the carve spray.
    const nfx = fwdX(s.heading);
    const nfz = fwdZ(s.heading);
    s.vx = nfx * forward + -nfz * lateral;
    s.vz = nfz * forward + nfx * lateral;
  } else if (s.airborne && !wiped) {
    const realAir = s.airTime > 0.25 || s.y - s.surfaceY > 0.7;
    // A turn held through takeoff is not a trick request: release or re-press to spin.
    const dirNow = Math.abs(steer) < 0.1 ? 0 : Math.sign(steer);
    if (s.airSteerLatch !== 0 && dirNow !== s.airSteerLatch) s.airSteerLatch = 0;
    const airSteer = s.airSteerLatch !== 0 ? 0 : steer;
    if (realAir) {
      // In real air steer spins the ski: that's the trick input.
      let spin = -airSteer * T.airSpinRate * dt;
      if (Math.abs(airSteer) < 0.1) {
        // Hands off: the nose drifts back to the direction of travel when it
        // is close, so casual riders land clean and tricksters must commit.
        const travel = Math.atan2(-s.vx, -s.vz);
        const off = wrapAngle(s.heading - travel);
        if (Math.abs(off) < 1.1) spin = -off * Math.min(1, dt * 5);
      }
      s.heading += spin;
      s.airSpin += spin;
    } else {
      // Skipping over chop: keep carving, velocity follows the nose.
      const turn = -steer * T.turnRate * 0.8 * dt;
      s.heading += turn;
      const c = Math.cos(turn);
      const sn = Math.sin(turn);
      const vx = s.vx * c + s.vz * sn;
      s.vz = -s.vx * sn + s.vz * c;
      s.vx = vx;
    }
    s.vx *= 1 - 0.05 * dt;
    s.vz *= 1 - 0.05 * dt;
  } else {
    // Wiped out: tumble to a stop.
    s.vx *= 1 - Math.min(1, 2.4 * dt);
    s.vz *= 1 - Math.min(1, 2.4 * dt);
  }
  s.boost = Math.min(1, s.boost + T.boostRegen * dt);

  // Horizontal integrate
  const px = s.x;
  const pz = s.z;
  s.x += s.vx * dt;
  s.z += s.vz * dt;

  // Islands: soft push out, keep tangential speed, never trap.
  for (const isl of ISLANDS) {
    const dx = s.x - isl.x;
    const dz = s.z - isl.z;
    const d = Math.hypot(dx, dz);
    if (d < isl.r && d > 0.001) {
      const nx = dx / d;
      const nz = dz / d;
      const push = isl.r - d;
      s.x += nx * Math.min(push, 12 * dt + push * 0.25);
      s.z += nz * Math.min(push, 12 * dt + push * 0.25);
      const vn = s.vx * nx + s.vz * nz;
      if (vn < 0) {
        s.vx -= vn * nx * 1.3;
        s.vz -= vn * nz * 1.3;
      }
    }
  }

  resolvePylons(s);
  resolveRamps(s);
  updateRace(s, px, pz);

  // Vertical: ballistic against a moving surface. Leaving the water (or a
  // ramp lip) happens naturally when the surface drops away faster than
  // gravity can follow.
  const prevSurface = s.surfaceY;
  const surface = groundAt(s, s.x, s.z, s.t, true);
  // Clamp the rate so a discontinuity (ramp edge) can never fire a rocket launch.
  const surfaceVy = Math.max(-30, Math.min(22, (surface - prevSurface) / dt));
  s.surfaceY = surface;
  s.surfaceVy = surfaceVy;

  // Riding off a ramp edge too slowly to launch: fall off it, don't teleport down.
  const fellOff = !s.airborne && surface < prevSurface - 0.3;
  if (!s.airborne) {
    // Riding: glued to the surface; jump pops off it.
    const prevVy = s.vy;
    s.y = fellOff ? prevSurface : surface;
    s.vy = fellOff ? Math.max(0, prevVy) : surfaceVy;
    const wantsPop = cmd.jump && !wiped && s.jumpCooldown <= 0;
    // Predict next step: does the surface fall away faster than gravity?
    const nextSurface = groundAt(s, s.x + s.vx * dt, s.z + s.vz * dt, s.t + dt, true);
    const ballistic = s.y + (s.vy - T.gravity * dt) * dt;
    const crestLaunch = ballistic > nextSurface + 0.004 && s.vy > 1.6 && !wiped;
    if (wantsPop || crestLaunch || fellOff) {
      s.airborne = true;
      s.vy = Math.max(s.vy, 0) * T.launchKick;
      if (wantsPop) {
        s.vy += T.popVelocity;
        s.jumpCooldown = 0.45;
        emit(s, 'pop', s.vy);
      }
      s.airTime = 0;
      s.airMaxHeight = 0;
      s.airSpin = 0;
      s.airStartHeading = s.heading;
      s.airSteerLatch = Math.abs(steer) < 0.1 ? 0 : Math.sign(steer);
      s.airFromRamp = s.onRamp >= 0 && !wantsPop;
      s.jumps += 1;
      emit(s, 'launch', s.vy);
    }
  } else {
    s.vy -= T.gravity * dt;
    s.y += s.vy * dt;
    s.airTime += dt;
    s.airMaxHeight = Math.max(s.airMaxHeight, s.y - surface);
    if (s.y <= surface) {
      // Touchdown
      const impact = surfaceVy - s.vy;
      s.y = surface;
      s.vy = surfaceVy;
      s.airborne = false;
      land(s, impact);
    }
  }

  // Attitude (for rendering; also defines landing pitch)
  if (!s.airborne) {
    const hx = fwdX(s.heading) * T.hullHalf;
    const hz = fwdZ(s.heading) * T.hullHalf;
    const front = groundAt(s, s.x + hx, s.z + hz, s.t, false);
    const back = groundAt(s, s.x - hx, s.z - hz, s.t, false);
    const left = waveHeight(s.x + hz * 0.45, s.z - hx * 0.45, s.t);
    const right = waveHeight(s.x - hz * 0.45, s.z + hx * 0.45, s.t);
    const targetPitch = Math.atan2(front - back, T.hullHalf * 2) + Math.min(0.12, Math.abs(forward) * 0.004);
    const lean = s.steerVisual * Math.min(1, Math.abs(forward) / 12) * 0.42;
    const targetRoll = Math.atan2(left - right, T.hullHalf * 0.9) * 0.6 + lean;
    s.pitch += (targetPitch - s.pitch) * Math.min(1, dt * 14);
    s.roll += (targetRoll - s.roll) * Math.min(1, dt * 9);
  } else if (!wiped) {
    const horiz = Math.hypot(s.vx, s.vz);
    const targetPitch = Math.atan2(s.vy, Math.max(horiz, 6)) * 0.7;
    s.pitch += (targetPitch - s.pitch) * Math.min(1, dt * 3);
    s.roll += (s.steerVisual * 0.3 - s.roll) * Math.min(1, dt * 4);
  }

  // Wipeout timer → respawn
  if (wiped) {
    s.modeTimer -= dt;
    s.roll += dt * 9;
    s.pitch = Math.sin(s.modeTimer * 7) * 0.4;
    if (s.modeTimer <= 0 && !s.airborne) {
      s.mode = 'ride';
      s.roll = 0;
      s.pitch = 0;
      const sp = Math.hypot(s.vx, s.vz);
      if (sp > 0.5) s.heading = Math.atan2(-s.vx, -s.vz);
      s.vx = fwdX(s.heading) * 4;
      s.vz = fwdZ(s.heading) * 4;
      s.jumpCooldown = 0.6;
      emit(s, 'respawn', 0);
    }
  }

  // Rings
  if (!wiped) {
    for (let i = s.rings.length - 1; i >= 0; i -= 1) {
      const r = s.rings[i];
      const cy = ringCenterY(r, s.t);
      const dx = s.x - r.x;
      const dz = s.z - r.z;
      const dy = s.y + 0.8 - cy;
      if (dx * dx + dz * dz + dy * dy < T.ringRadius * T.ringRadius) {
        s.rings.splice(i, 1);
        s.ringsHit += 1;
        s.boost = Math.min(1, s.boost + (r.air ? 0.5 : 0.3));
        emit(s, 'ring', r.id, r.air ? 'air' : 'surface');
        const ev = s.events[s.events.length - 1];
        ev.x = r.x;
        ev.y = cy;
        ev.z = r.z;
        award(s, r.air ? 300 : 150, r.air ? 'SKY RING' : 'RING');
        bumpCombo(s);
        spawnRing(s, rand);
      }
    }
  }
  // Recycle rings that fell far behind
  for (let i = s.rings.length - 1; i >= 0; i -= 1) {
    const r = s.rings[i];
    if (Math.hypot(r.x - s.x, r.z - s.z) > 240) {
      s.rings.splice(i, 1);
      spawnRing(s, rand);
    }
  }

}

function land(s: SimState, impact: number): void {
  const T = TUNING;
  const horiz = Math.hypot(s.vx, s.vz);
  const travel = horiz > 3 ? Math.atan2(-s.vx, -s.vz) : s.heading;
  const off = Math.abs(wrapAngle(s.heading - travel));
  const big = s.airTime > 0.45;
  emit(s, 'land', impact);

  if (off > T.wipeoutAngle && horiz > 5 && s.airTime > 0.3) {
    s.mode = 'wipeout';
    s.modeTimer = T.wipeoutTime;
    s.combo = 1;
    s.comboTimer = 0;
    s.wipeouts += 1;
    emit(s, 'wipeout', impact);
    return;
  }

  // Clean landing: snap velocity onto the nose, small speed loss.
  const keep = big ? 0.9 : 0.97;
  s.vx = fwdX(s.heading) * horiz * keep;
  s.vz = fwdZ(s.heading) * horiz * keep;

  if (big) {
    s.bestAir = Math.max(s.bestAir, s.airTime);
    const base = s.airTime * 120 + s.airMaxHeight * 45;
    const kind = s.airTime > 1.5 ? 'HUGE' : s.airTime > 1.0 ? 'BIG' : '';
    const label = s.airFromRamp ? `${kind ? `${kind} ` : ''}RAMP JUMP` : `${kind ? `${kind} ` : ''}AIR`;
    if (s.airFromRamp) {
      s.rampJumps += 1;
      s.lastRampAir = s.airTime;
      s.lastRampHeight = s.airMaxHeight;
    }
    const spins = Math.floor((Math.abs(s.airSpin) + 0.9) / (Math.PI * 2));
    award(s, base * (s.airFromRamp ? 1.5 : 1), `${label} ${s.airTime.toFixed(1)}s`);
    if (spins > 0) award(s, 260 * spins, `${spins * 360} SPIN`);
    s.boost = Math.min(1, s.boost + 0.12 + spins * 0.15);
    bumpCombo(s);
  }
}

/** Read-only clone for tests and serialization. */
export function snapshot(s: SimState): SimState {
  return JSON.parse(JSON.stringify(s)) as SimState;
}
