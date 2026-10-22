// Fixed-step dolphin simulation. Plain serializable data; no Three.js, no DOM.
// Every input (keyboard, touch, bot) becomes one DolphinCommand per step.
import { createSeededRandom } from '../utils/random';
import { createWaves, sampleWaves, type WaveComponent } from './waves';

export const STEP = 1 / 60;
export const RUN_SECONDS = 90;
const AIR_GRAVITY = 14;
const CRUISE_SPEED = 14;
const MIN_SPEED = 9;
const MAX_SPEED = 23;
const CRUISE_DEPTH = -0.9;
const SEA_FLOOR = -6.5;
const SHORE_X = 30; // soft boundary toward the beach
const SEA_X = -60; // soft boundary toward open sea
const TAU = Math.PI * 2;

export interface DolphinCommand {
  steer: number; // -1 left .. 1 right (in air: spin)
  pitch: number; // -1 dive .. 1 rise (in air: front/back flip)
  roll: number; // -1 .. 1 (in air: barrel roll)
}

export const NO_COMMAND: DolphinCommand = { steer: 0, pitch: 0, roll: 0 };

export type Phase = 'title' | 'play' | 'results';

export interface AirState {
  time: number;
  exitY: number;
  peak: number; // height above launch surface
  boost: number; // m/s of vertical speed gained from the wave
  launchLabel: string;
  flip: number; // radians of flip rotation added by input (relative to travel)
  spin: number;
  roll: number;
}

export interface LandingResult {
  id: number;
  tricks: string[];
  trickPoints: number;
  height: number;
  heightMult: number;
  smooth: number;
  quality: 'Silky' | 'Clean' | 'Splashy' | 'Belly flop';
  landingMult: number;
  chainMult: number;
  points: number;
  launchLabel: string;
}

export interface SimEvent {
  id: number;
  type: 'launch' | 'land' | 'end';
  x: number;
  y: number;
  z: number;
  size: number;
  label?: string;
}

export interface DolphinState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  yaw: number; // travel heading; 0 = -z (along the coast), + = toward open sea (-x)
  pitch: number; // body pitch (absolute)
  spin: number; // body yaw offset from travel heading (air tricks)
  roll: number;
  airborne: boolean;
  air: AirState | null;
  tailPhase: number;
}

export interface SimState {
  seed: number;
  time: number; // world time (waves)
  phase: Phase;
  runTime: number;
  score: number;
  chain: number;
  jumps: number;
  cleanLandings: number;
  bestJump: number;
  bestTrick: string;
  dolphin: DolphinState;
  lastLanding: LandingResult | null;
  events: SimEvent[];
  nextEventId: number;
  waves: WaveComponent[];
}

export function createSim(seed: number): SimState {
  const rng = createSeededRandom(seed);
  const waves = createWaves(rng);
  const s: SimState = {
    seed,
    time: rng() * 20,
    phase: 'title',
    runTime: 0,
    score: 0,
    chain: 1,
    jumps: 0,
    cleanLandings: 0,
    bestJump: 0,
    bestTrick: '',
    dolphin: freshDolphin(),
    lastLanding: null,
    events: [],
    nextEventId: 1,
    waves,
  };
  return s;
}

function freshDolphin(): DolphinState {
  return {
    x: 0,
    y: CRUISE_DEPTH,
    z: 0,
    vx: 0,
    vy: 0,
    vz: -CRUISE_SPEED,
    speed: CRUISE_SPEED,
    yaw: 0,
    pitch: 0,
    spin: 0,
    roll: 0,
    airborne: false,
    air: null,
    tailPhase: 0,
  };
}

export function startRun(s: SimState): void {
  s.phase = 'play';
  s.runTime = 0;
  s.score = 0;
  s.chain = 1;
  s.jumps = 0;
  s.cleanLandings = 0;
  s.bestJump = 0;
  s.bestTrick = '';
  s.lastLanding = null;
  s.events.length = 0;
  const z = s.dolphin.z;
  s.dolphin = freshDolphin();
  s.dolphin.z = z;
}

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const approach = (v: number, target: number, rate: number) =>
  v < target ? Math.min(v + rate, target) : Math.max(v - rate, target);
const wrapPi = (a: number) => a - TAU * Math.round(a / TAU);

function emit(s: SimState, type: SimEvent['type'], size: number, label?: string): void {
  const d = s.dolphin;
  s.events.push({ id: s.nextEventId++, type, x: d.x, y: d.y, z: d.z, size, label });
  if (s.events.length > 32) s.events.shift();
}

/** Advance the world one fixed step. */
export function stepSim(s: SimState, cmd: DolphinCommand): void {
  s.time += STEP;
  if (s.phase === 'play') {
    s.runTime += STEP;
    if (s.runTime >= RUN_SECONDS && !s.dolphin.airborne) {
      s.runTime = RUN_SECONDS;
      s.phase = 'results';
      emit(s, 'end', 0);
    }
  }
  const input = s.phase === 'play' ? cmd : autopilot(s);
  if (s.dolphin.airborne) stepAir(s, input);
  else stepWater(s, input);
  s.dolphin.tailPhase += STEP * (s.dolphin.airborne ? 3 : 4 + s.dolphin.speed * 0.45);
}

/** Gentle idle swim used behind the title and results screens. */
function autopilot(s: SimState): DolphinCommand {
  const d = s.dolphin;
  return { steer: clamp(d.x * 0.05 + d.yaw * 1.5, -1, 1), pitch: 0, roll: 0 };
}

function stepWater(s: SimState, cmd: DolphinCommand): void {
  const d = s.dolphin;
  const w = sampleWaves(s.waves, d.x, d.z, s.time);
  const depth = d.y - w.h;

  // Steering, with soft edges that turn the dolphin back without stopping it.
  let steer = clamp(cmd.steer, -1, 1);
  if (d.x > SHORE_X - 6) steer = Math.min(steer, 1 - (d.x - (SHORE_X - 6)) * 0.35);
  if (d.x < SEA_X + 6) steer = Math.max(steer, -1 + (SEA_X + 6 - d.x) * 0.35);
  d.yaw -= steer * 1.7 * STEP;
  if (d.x > SHORE_X) d.yaw += (d.x - SHORE_X) * 0.04 * STEP * 10;
  if (d.x < SEA_X) d.yaw -= (SEA_X - d.x) * 0.04 * STEP * 10;
  // Keep travelling along the coast: headings past ~70° ease back.
  if (Math.abs(d.yaw) > 1.2) d.yaw = approach(d.yaw, Math.sign(d.yaw) * 1.2, 1.5 * STEP);

  // Pitch: input dives/rises; with no input the dolphin settles at cruise depth.
  let targetPitch: number;
  if (Math.abs(cmd.pitch) > 0.05) targetPitch = cmd.pitch * 0.78;
  else targetPitch = clamp((CRUISE_DEPTH - depth) * 0.35, -0.35, 0.35);
  if (d.y < SEA_FLOOR + 1) targetPitch = Math.max(targetPitch, 0.4);
  d.pitch = approach(d.pitch, targetPitch, 2.6 * STEP);
  d.roll = approach(d.roll, -steer * 0.45, 3 * STEP);
  d.spin = approach(d.spin, 0, 4 * STEP);

  // Diving trades depth for speed; rising spends it.
  d.speed += (-Math.sin(d.pitch) * 10 - (d.speed - CRUISE_SPEED) * 0.35) * STEP;
  d.speed = clamp(d.speed, MIN_SPEED, MAX_SPEED);

  const cp = Math.cos(d.pitch);
  d.vx = -Math.sin(d.yaw) * cp * d.speed;
  d.vz = -Math.cos(d.yaw) * cp * d.speed;
  d.vy = Math.sin(d.pitch) * d.speed;
  d.x += d.vx * STEP;
  d.y += d.vy * STEP;
  d.z += d.vz * STEP;
  if (d.y < SEA_FLOOR) d.y = SEA_FLOOR;

  const surface = sampleWaves(s.waves, d.x, d.z, s.time);
  const relRise = d.vy - surface.dhdt;
  if (d.y > surface.h - 0.05) {
    if (relRise > 3 && d.pitch > 0.2) {
      launch(s, surface.h, surface.dhdt, surface.gx, surface.gz);
    } else {
      d.y = surface.h - 0.05;
      d.pitch = Math.min(d.pitch, 0.1);
    }
  }
}

function launch(s: SimState, surfaceH: number, dhdt: number, gx: number, gz: number): void {
  const d = s.dolphin;
  // Wave lift: the surface's own rise plus the ramp of the face along the path.
  const ramp = d.vx * gx + d.vz * gz;
  const boost = Math.max(0, dhdt) * 1.3 + Math.max(0, ramp) * 0.75;
  d.vy += boost;
  d.airborne = true;
  const label = boost > 4.2 ? 'Perfect wave launch!' : boost > 2.2 ? 'Wave boost' : boost > 0.8 ? 'Small lift' : 'Flat launch';
  d.air = { time: 0, exitY: surfaceH, peak: 0, boost, launchLabel: label, flip: 0, spin: 0, roll: 0 };
  d.spin = 0;
  d.roll = 0;
  s.jumps += 1;
  emit(s, 'launch', 0.6 + d.speed / 20, label);
}

function stepAir(s: SimState, cmd: DolphinCommand): void {
  const d = s.dolphin;
  const air = d.air!;
  air.time += STEP;
  d.vy -= AIR_GRAVITY * STEP;
  d.x += d.vx * STEP;
  d.y += d.vy * STEP;
  d.z += d.vz * STEP;
  air.peak = Math.max(air.peak, d.y - air.exitY);

  const hs = Math.hypot(d.vx, d.vz);
  const travelPitch = Math.atan2(d.vy, hs);

  // Flip: input rotates freely; released, the nose follows the arc to the
  // nearest whole rotation, so a near-complete flip finishes itself.
  if (Math.abs(cmd.pitch) > 0.05) {
    air.flip += cmd.pitch * 9 * STEP;
  } else {
    const nearest = TAU * Math.round(air.flip / TAU);
    air.flip = approach(air.flip, nearest, 3.2 * STEP);
  }
  if (Math.abs(cmd.steer) > 0.05) {
    air.spin -= cmd.steer * 8 * STEP;
  } else {
    air.spin = approach(air.spin, TAU * Math.round(air.spin / TAU), 3.2 * STEP);
  }
  if (Math.abs(cmd.roll) > 0.05) {
    air.roll += cmd.roll * 8.5 * STEP;
  } else {
    air.roll = approach(air.roll, TAU * Math.round(air.roll / TAU), 3.6 * STEP);
  }
  d.pitch = travelPitch + air.flip;
  d.spin = air.spin;
  d.roll = air.roll;

  const surface = sampleWaves(s.waves, d.x, d.z, s.time);
  if (d.vy < 0 && d.y <= surface.h) land(s, surface.h);
}

function rotationNames(count: number, single: string, double: string): string | null {
  const n = Math.abs(count);
  if (n === 0) return null;
  if (n === 1) return single;
  if (n === 2) return double;
  return `${n}x ${single}`;
}

function land(s: SimState, surfaceH: number): void {
  const d = s.dolphin;
  const air = d.air!;
  const flips = Math.round(air.flip / TAU);
  const spins = Math.round(air.spin / TAU);
  const rolls = Math.round(air.roll / TAU);

  const tricks: string[] = [];
  const back = flips > 0;
  const flipName = rotationNames(flips, back ? 'Backflip' : 'Frontflip', back ? 'Double Backflip' : 'Double Frontflip');
  if (flipName) tricks.push(flipName);
  const spinName = spins !== 0 ? `Spin ${Math.abs(spins) * 360}` : null;
  if (spinName) tricks.push(spinName);
  const rollName = rotationNames(rolls, 'Barrel Roll', 'Double Barrel Roll');
  if (rollName) tricks.push(rollName);
  const trickPoints = Math.abs(flips) * 400 + Math.abs(spins) * 300 + Math.abs(rolls) * 250;
  const kinds = (flips ? 1 : 0) + (spins ? 1 : 0) + (rolls ? 1 : 0);
  const comboBonus = kinds >= 2 ? 1 + (kinds - 1) * 0.25 : 1;

  // Smoothness: how far the body is from pointing along its own arc at entry.
  const e1 = wrapPi(air.flip);
  const e2 = wrapPi(air.spin);
  const e3 = wrapPi(air.roll) * 0.6;
  const err = Math.sqrt(e1 * e1 + e2 * e2 + e3 * e3);
  const smooth = clamp(1 - err / 1.25, 0, 1);
  const quality: LandingResult['quality'] =
    smooth > 0.85 ? 'Silky' : smooth > 0.6 ? 'Clean' : smooth > 0.3 ? 'Splashy' : 'Belly flop';
  const landingMult = quality === 'Silky' ? 2 : quality === 'Clean' ? 1.5 : quality === 'Splashy' ? 1 : 0;

  const height = air.peak;
  const heightMult = Math.round((1 + height / 2.5) * 10) / 10;
  const chainMult = s.chain;
  const base = 100 + trickPoints;
  const points = Math.round((base * comboBonus * heightMult * landingMult * chainMult) / 10) * 10;

  if (s.phase === 'play') {
    s.score += points;
    if (quality === 'Belly flop') s.chain = 1;
    else {
      s.cleanLandings += 1;
      if (trickPoints > 0) s.chain = Math.min(4, s.chain + 0.5);
    }
    if (points > s.bestJump) {
      s.bestJump = points;
      s.bestTrick = tricks.length ? tricks.join(' + ') : 'Clean leap';
    }
  }

  s.lastLanding = {
    id: s.nextEventId,
    tricks,
    trickPoints,
    height,
    heightMult,
    smooth,
    quality,
    landingMult,
    chainMult,
    points: s.phase === 'play' ? points : 0,
    launchLabel: air.launchLabel,
  };
  emit(s, 'land', 0.5 + (1 - smooth) * 1.8 + Math.min(height, 8) * 0.08, quality);

  // Back under: keep the arc's momentum, settle the body upright.
  const total = Math.hypot(d.vx, d.vy, d.vz);
  d.airborne = false;
  d.air = null;
  d.y = surfaceH - 0.1;
  d.pitch = clamp(Math.atan2(d.vy, Math.hypot(d.vx, d.vz)), -0.8, -0.1);
  d.speed = clamp(total * (0.6 + smooth * 0.3), MIN_SPEED, MAX_SPEED);
  d.spin = 0;
  d.roll = 0;
}

/** Test/setup helper: put the dolphin at the surface and launch it. */
export function forceLaunch(s: SimState, speed: number, pitch: number): void {
  const d = s.dolphin;
  const w = sampleWaves(s.waves, d.x, d.z, s.time);
  d.speed = speed;
  d.pitch = pitch;
  const cp = Math.cos(pitch);
  d.vx = -Math.sin(d.yaw) * cp * speed;
  d.vz = -Math.cos(d.yaw) * cp * speed;
  d.vy = Math.sin(pitch) * speed;
  d.y = w.h;
  launch(s, w.h, w.dhdt, w.gx, w.gz);
}
