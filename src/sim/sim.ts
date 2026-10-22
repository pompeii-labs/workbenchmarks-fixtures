// Fixed-step dolphin simulation. Plain serializable data, no Three.js, no DOM.
// Every input (keyboard, touch, bot) arrives as one Command per step.
import { sampleSurface, type SurfaceSample } from './waves';

export const STEP = 1 / 60;
export const SESSION_SECONDS = 90;
export const GRAVITY = 16;
export const BOUNDS = { minX: -24, maxX: 11, softMargin: 3 };
const FLOOR_Y = -8.5;
const CRUISE_DEPTH = 0.45;
const LAUNCH_VY = 2.6;

export interface Command {
  steer: number; // -1 left .. 1 right (in air: barrel spin)
  pitch: number; // -1 nose down .. 1 nose up (in air: flips)
  sprint: boolean;
}

export const IDLE: Command = { steer: 0, pitch: 0, sprint: false };

export type Phase = 'title' | 'playing' | 'paused' | 'results';
export type Grade = 'Perfect' | 'Clean' | 'Sloppy' | 'Belly flop';

export interface TrickResult {
  id: number;
  points: number;
  height: number;
  airtime: number;
  flips: number;
  spins: number;
  grade: Grade;
  heightMult: number;
  landMult: number;
  waveMult: number;
  comboMult: number;
  name: string;
}

export type SimEvent =
  | { id: number; type: 'launch'; x: number; y: number; z: number; boost: number; waveGrade: string }
  | { id: number; type: 'land'; x: number; y: number; z: number; trick: TrickResult }
  | { id: number; type: 'timeup' };

export interface Dolphin {
  x: number;
  y: number;
  z: number;
  yaw: number; // 0 faces -z; positive turns toward +x (shore)
  pitch: number; // radians, unbounded in the air (flips)
  roll: number; // radians, unbounded in the air (spins)
  speed: number; // swim speed along the body (underwater)
  vh: number; // horizontal speed (airborne)
  vy: number;
  airborne: boolean;
  stamina: number;
  stun: number;
  tailPhase: number;
}

export interface Jump {
  launchPitch: number;
  launchVelAngle: number;
  launchRoll: number;
  launchY: number;
  peak: number;
  airtime: number;
  waveBoost: number;
  // Inputs held through the breach must be released before they start tricks.
  pitchArmed: boolean;
  rollArmed: boolean;
}

export interface SimState {
  phase: Phase;
  time: number; // world clock (drives waves)
  remaining: number;
  score: number;
  best: number;
  combo: number;
  comboTimer: number;
  jumps: number;
  cleanLandings: number;
  bestTrick: TrickResult | null;
  lastTrick: TrickResult | null;
  dolphin: Dolphin;
  jump: Jump | null;
  surface: SurfaceSample;
  launchPotential: number; // what a launch right now would gain from the swell
  nextEventId: number;
  events: SimEvent[];
}

export function createDolphin(): Dolphin {
  return {
    x: -4,
    y: -CRUISE_DEPTH,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 11,
    vh: 0,
    vy: 0,
    airborne: false,
    stamina: 1,
    stun: 0,
    tailPhase: 0,
  };
}

export function createSim(best = 0): SimState {
  return {
    phase: 'title',
    time: 0,
    remaining: SESSION_SECONDS,
    score: 0,
    best,
    combo: 0,
    comboTimer: 0,
    jumps: 0,
    cleanLandings: 0,
    bestTrick: null,
    lastTrick: null,
    dolphin: createDolphin(),
    jump: null,
    surface: { h: 0, dhdt: 0, gx: 0, gz: 0 },
    launchPotential: 0,
    nextEventId: 1,
    events: [],
  };
}

export function startSession(s: SimState): void {
  s.phase = 'playing';
  s.remaining = SESSION_SECONDS;
  s.score = 0;
  s.combo = 0;
  s.comboTimer = 0;
  s.jumps = 0;
  s.cleanLandings = 0;
  s.bestTrick = null;
  s.lastTrick = null;
  s.jump = null;
  const keepZ = s.dolphin.z;
  s.dolphin = createDolphin();
  s.dolphin.z = keepZ;
}

const TAU = Math.PI * 2;
export function wrapAngle(a: number): number {
  return a - TAU * Math.round(a / TAU);
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function approach(v: number, target: number, rate: number): number {
  return v < target ? Math.min(target, v + rate) : Math.max(target, v - rate);
}

/** Boost the swell adds to a launch: rising water (timing) + climbing the face (angle). */
function swellBoost(d: Dolphin, surf: SurfaceSample): number {
  const hx = Math.sin(d.yaw);
  const hz = -Math.cos(d.yaw);
  const horiz = d.speed * Math.cos(d.pitch);
  const rising = Math.max(0, surf.dhdt) * 2.1;
  const faceClimb = Math.max(0, (hx * surf.gx + hz * surf.gz) * horiz) * 0.85;
  return rising + faceClimb;
}

function trickName(flips: number, flipDir: number, spins: number): string {
  const parts: string[] = [];
  if (flips > 0) {
    const n = flips === 1 ? '' : flips === 2 ? 'Double ' : flips === 3 ? 'Triple ' : `${flips}x `;
    parts.push(`${n}${flipDir > 0 ? 'Backflip' : 'Frontflip'}`);
  }
  if (spins > 0) parts.push(`${spins * 360} Spin`);
  if (!parts.length) return 'Breach';
  return parts.join(' + ');
}

export function step(s: SimState, cmd: Command, dt = STEP): void {
  if (s.phase === 'paused') return;
  s.time += dt;
  const d = s.dolphin;
  d.tailPhase += dt * (d.airborne ? 2 : 5 + d.speed * 0.45);
  sampleSurface(d.x, d.z, s.time, s.surface);

  if (s.phase === 'title' || s.phase === 'results') {
    // Attract mode: the dolphin cruises on its own.
    swimUnderwater(s, d, { steer: Math.sin(s.time * 0.3) * 0.3, pitch: 0, sprint: false }, dt);
    return;
  }

  if (s.remaining > 0) {
    s.remaining = Math.max(0, s.remaining - dt);
  }
  if (s.remaining <= 0 && !d.airborne) {
    s.phase = 'results';
    if (s.score > s.best) s.best = s.score;
    s.events.push({ id: s.nextEventId++, type: 'timeup' });
    return;
  }

  if (s.combo > 0 && !d.airborne) {
    s.comboTimer -= dt;
    if (s.comboTimer <= 0) s.combo = 0;
  }

  if (d.airborne) fly(s, d, cmd, dt);
  else swimUnderwater(s, d, cmd, dt);
}

function swimUnderwater(s: SimState, d: Dolphin, cmd: Command, dt: number): void {
  const surf = s.surface;
  d.stun = Math.max(0, d.stun - dt);
  const control = d.stun > 0 ? 0.25 : 1;

  // Steering: yaw rate with soft edges that push back but never trap.
  let steer = cmd.steer * control;
  const edgeHi = BOUNDS.maxX - BOUNDS.softMargin;
  const edgeLo = BOUNDS.minX + BOUNDS.softMargin;
  if (d.x > edgeHi) steer -= ((d.x - edgeHi) / BOUNDS.softMargin) * 1.2;
  if (d.x < edgeLo) steer += ((edgeLo - d.x) / BOUNDS.softMargin) * 1.2;
  d.yaw = clamp(d.yaw + steer * 1.5 * dt, -0.75, 0.75);
  if (Math.abs(cmd.steer) < 0.05) d.yaw = approach(d.yaw, 0, 0.25 * dt);
  d.roll = approach(d.roll, -cmd.steer * 0.45 * control, 3 * dt);

  // Pitch: player dives and rises; with no input the dolphin settles to cruise.
  const pIn = cmd.pitch * control;
  if (Math.abs(pIn) > 0.05) {
    d.pitch = clamp(d.pitch + pIn * 1.9 * dt, -1.1, 1.25);
  } else {
    const target = d.y < -1.5 ? 0.18 : 0;
    d.pitch = approach(d.pitch, target, 0.9 * dt);
  }
  if (d.y < FLOOR_Y + 1.2) d.pitch = Math.max(d.pitch, ((FLOOR_Y + 1.2 - d.y) / 1.2) * 0.6);

  // Speed: sprint costs stamina; diving converts depth into speed.
  const sprinting = cmd.sprint && d.stamina > 0.02 && d.stun <= 0;
  if (sprinting) d.stamina = Math.max(0, d.stamina - 0.38 * dt);
  else d.stamina = Math.min(1, d.stamina + 0.16 * dt);
  const target = sprinting ? 17 : 11;
  const sp = Math.sin(d.pitch);
  d.speed += -sp * (sp < 0 ? 9 : 3.2) * dt;
  d.speed += (target - d.speed) * (sprinting ? 1.4 : 0.35) * dt;
  d.speed = clamp(d.speed, 6, 25);

  const horiz = d.speed * Math.cos(d.pitch);
  d.vh = horiz;
  d.x = clamp(d.x + Math.sin(d.yaw) * horiz * dt, BOUNDS.minX, BOUNDS.maxX);
  d.z += -Math.cos(d.yaw) * horiz * dt;
  d.vy = d.speed * sp;
  d.y += d.vy * dt;
  d.y = Math.max(d.y, FLOOR_Y);

  s.launchPotential = swellBoost(d, surf);

  const surfaceY = surf.h;
  if (d.y >= surfaceY - 0.05) {
    if (d.vy > LAUNCH_VY && s.phase === 'playing' && d.stun <= 0) {
      launch(s, d);
      return;
    }
    // Not enough lift: ride just under the surface.
    d.y = surfaceY - CRUISE_DEPTH * 0.5;
    if (d.pitch > 0) d.pitch = approach(d.pitch, 0, 2 * dt);
  } else if (d.y > surfaceY - CRUISE_DEPTH && Math.abs(pIn) < 0.05 && d.pitch <= 0.05) {
    d.y += (surfaceY - CRUISE_DEPTH - d.y) * Math.min(1, 3 * dt);
  }
}

function launch(s: SimState, d: Dolphin): void {
  const boost = swellBoost(d, s.surface);
  // Angling: around 50° out of the water carries best; too steep bogs, too flat skims.
  const eff = clamp(1 - 0.55 * Math.abs(d.pitch - 0.85), 0.55, 1);
  d.vy = d.speed * Math.sin(d.pitch) * eff + boost;
  d.vh = Math.max(7, d.speed * Math.cos(d.pitch));
  d.airborne = true;
  d.y = s.surface.h;
  s.jump = {
    launchPitch: d.pitch,
    launchVelAngle: Math.atan2(d.vy, d.vh),
    launchRoll: d.roll,
    launchY: d.y,
    peak: d.y,
    airtime: 0,
    waveBoost: boost,
    pitchArmed: false,
    rollArmed: false,
  };
  s.jumps += 1;
  const waveGrade = boost > 5 ? 'Perfect swell!' : boost > 2.5 ? 'Good swell' : '';
  s.events.push({ id: s.nextEventId++, type: 'launch', x: d.x, y: d.y, z: d.z, boost, waveGrade });
}

function fly(s: SimState, d: Dolphin, cmd: Command, dt: number): void {
  const j = s.jump!;
  j.airtime += dt;
  d.vy -= GRAVITY * dt;
  d.x = clamp(d.x + Math.sin(d.yaw) * d.vh * dt, BOUNDS.minX, BOUNDS.maxX);
  d.z += -Math.cos(d.yaw) * d.vh * dt;
  d.y += d.vy * dt;
  j.peak = Math.max(j.peak, d.y);

  const velAngle = Math.atan2(d.vy, d.vh);
  if (Math.abs(cmd.pitch) <= 0.05) j.pitchArmed = true;
  if (Math.abs(cmd.steer) <= 0.05) j.rollArmed = true;
  if (j.pitchArmed && Math.abs(cmd.pitch) > 0.05) {
    d.pitch += cmd.pitch * 6.2 * dt;
  } else {
    // Assist: an untouched body follows its arc, so plain breaches land clean.
    const err = wrapAngle(velAngle - d.pitch);
    if (Math.abs(err) < 1.3) d.pitch += clamp(err, -2.6 * dt, 2.6 * dt);
  }
  if (j.rollArmed && Math.abs(cmd.steer) > 0.05) {
    d.roll += -cmd.steer * 7.5 * dt;
  } else {
    const err = wrapAngle(-d.roll);
    if (Math.abs(err) < 1.1) d.roll += clamp(err, -3.4 * dt, 3.4 * dt);
  }

  sampleSurface(d.x, d.z, s.time, s.surface);
  if (d.vy < 0 && d.y <= s.surface.h) land(s, d, velAngle);
}

function land(s: SimState, d: Dolphin, velAngle: number): void {
  const j = s.jump!;
  // Flips count rotation beyond the natural nose-over of the arc.
  const pitchNet = d.pitch - j.launchPitch - (velAngle - j.launchVelAngle);
  const rollNet = d.roll - j.launchRoll;
  const flips = Math.floor((Math.abs(pitchNet) + 0.9) / TAU);
  const spins = Math.floor((Math.abs(rollNet) + 0.9) / TAU);
  const pitchErr = Math.abs(wrapAngle(d.pitch - velAngle));
  const rollErr = Math.abs(wrapAngle(d.roll));
  const err = Math.max(pitchErr, rollErr * 0.85);

  let grade: Grade;
  let landMult: number;
  if (err < 0.3) {
    grade = 'Perfect';
    landMult = 2;
  } else if (err < 0.62) {
    grade = 'Clean';
    landMult = 1.5;
  } else if (err < 1.05) {
    grade = 'Sloppy';
    landMult = 1;
  } else {
    grade = 'Belly flop';
    landMult = 0;
  }

  const height = Math.max(0, j.peak);
  const heightMult = Math.min(3.5, 1 + height / 5);
  const waveMult = 1 + clamp(j.waveBoost / 10, 0, 0.6);
  const base = 100 + j.airtime * 60 + flips * 600 + spins * 450 + (flips > 0 && spins > 0 ? 400 : 0);

  if (landMult > 0) {
    if (landMult >= 1.5) s.combo += 1;
    s.comboTimer = 7;
  } else {
    s.combo = 0;
    s.comboTimer = 0;
  }
  const comboMult = 1 + 0.25 * Math.min(s.combo, 8);
  const points = Math.round(base * heightMult * landMult * waveMult * comboMult);
  s.score += points;
  if (landMult >= 1.5) s.cleanLandings += 1;

  const trick: TrickResult = {
    id: s.nextEventId,
    points,
    height,
    airtime: j.airtime,
    flips,
    spins,
    grade,
    heightMult,
    landMult,
    waveMult,
    comboMult,
    name: trickName(flips, Math.sign(pitchNet), spins),
  };
  s.lastTrick = trick;
  if (!s.bestTrick || points > s.bestTrick.points) s.bestTrick = trick;
  s.events.push({ id: s.nextEventId++, type: 'land', x: d.x, y: d.y, z: d.z, trick });

  // Back into the water.
  d.airborne = false;
  s.jump = null;
  const entrySpeed = Math.hypot(d.vh, d.vy);
  if (landMult === 0) {
    d.speed = 6.5;
    d.pitch = -0.15;
    d.roll = 0;
    d.stun = 0.7;
    d.y = s.surface.h - 0.3;
  } else {
    d.speed = clamp(entrySpeed * (0.55 + 0.15 * landMult), 9, 22);
    d.pitch = clamp(velAngle, -1.1, -0.2);
    d.roll = wrapAngle(d.roll);
    d.y = s.surface.h - 0.1;
  }
}
