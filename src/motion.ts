/**
 * The act as pure, closed-form functions of time.
 *
 * Every pose in the scene is derived from a single clock `t` (seconds). There
 * is no accumulated state, so the act can be evaluated at any instant, seeks
 * are exact, and it runs forever with no loop point and therefore no seam.
 *
 * Coordinates are "act space": origin on the ground under the wheel axle,
 * +y up, +z the direction of travel, +x the rider's left.
 */
import { createSeededRandom } from './utils/random';

export const G = 9.81;

// Unicycle geometry (metres).
export const WHEEL_R = 0.26;
export const CRANK_L = 0.11;
export const PEDAL_X = 0.1; // lateral offset of the pedal centre from the wheel plane
export const SEAT_H = 0.62; // saddle top above the ground
export const PATH_R = 2.6; // radius of the circle ridden around the ring

// Juggling: a three-pin cascade (siteswap 3). One throw per beat, alternating hands.
export const BEAT = 0.26;
export const FLIGHT = 1.8 * BEAT; // time in the air for each throw
export const DWELL = 3 * BEAT - FLIGHT; // time held in a hand (1.2 beats)
export const HAND_CYCLE = 2 * BEAT;
export const PIN_CYCLE = 6 * BEAT;
const EMPTY_FRAC = (HAND_CYCLE - DWELL) / HAND_CYCLE; // 0.4 of the hand cycle is empty

// Pattern placement in the pelvis-free act frame.
const HAND_Y = 0.84;
const HAND_Z = 0.54;
const HAND_CX = 0.21; // ellipse centre, |x|
const HAND_AX = 0.085; // inside throw point at 0.115, outside catch near 0.28
const HAND_AY = 0.045;
const HAND_AZ = 0.02;

/** Pin grip point (the neck) sits this far from the pin's centre of mass along +Y. */
export const PIN_GRIP = 0.1;

// End-over-end spin. The pin turns about the lateral axis (act x). In the hand it
// eases to a stop pointing up and slightly forward, then is flicked into the throw.
const PHI_MID = (7 * Math.PI) / 6; // body of the pin points up, tilted 30 degrees forward
// Rotation spent in the hand, chosen so the cubic ease comes exactly to rest mid-dwell
// when its end slopes equal the in-flight spin rate.
const DWELL_SPIN = (2 * Math.PI * (DWELL / (3 * FLIGHT))) / (1 + DWELL / (3 * FLIGHT));
const FLIGHT_SPIN = -(2 * Math.PI - DWELL_SPIN); // negative: the fat end tumbles back toward the bird
const SPIN_RATE = FLIGHT_SPIN / FLIGHT;
const PHI_THROW = PHI_MID - DWELL_SPIN / 2;
const PHI_CATCH = PHI_MID + DWELL_SPIN / 2;

export type Vec3 = { x: number; y: number; z: number };
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export type Side = -1 | 1; // -1 = right wing (rider's right, -x), +1 = left wing

export type PinPose = {
  com: Vec3; // centre of mass, act space
  phi: number; // rotation about act x
  roll: number; // small lean about the travel axis while crossing
  inHand: Side | 0;
  /** 0..1 progress through the current flight (0 when held). */
  flight: number;
};

export type HandPose = {
  side: Side;
  pos: Vec3; // wrist / grip point
  holding: boolean;
  /** Smooth 0..1 envelope peaking just after this hand throws. */
  throwKick: number;
  /** Smooth 0..1 envelope peaking just after this hand catches. */
  catchKick: number;
};

export type ActPose = {
  t: number;
  distance: number; // metres rolled along the path
  speed: number; // m/s along the path
  wheelAngle: number; // rad about act x; also the crank angle (direct drive)
  pathAngle: number; // angle around the ring centre
  position: Vec3; // world position of the contact point
  heading: number; // world yaw of the act frame (smooth path tangent)
  steer: number; // extra yaw wobble
  pitch: number; // fore-aft lean of the unicycle about the axle (+ = forward)
  roll: number; // sideways lean (+ = toward +x)
  bodyPitch: number;
  bodyRoll: number;
  bodyYaw: number;
  bodyBob: number;
  hands: [HandPose, HandPose]; // [right, left]
  pins: [PinPose, PinPose, PinPose];
  look: Vec3; // where the head watches, act space
  pouch: { sag: number; sway: number };
  blink: number; // 0 open .. 1 closed
  ankle: [number, number]; // foot pitch on the pedals [right, left]
};

export type Choreography = {
  seed: number;
  balance: { a: number; w: number; p: number }[];
  wobble: { a: number; w: number; p: number }[];
  blinkSeed: number;
};

export function createChoreography(seed: number): Choreography {
  const rng = createSeededRandom(seed);
  const phase = () => rng() * Math.PI * 2;
  return {
    seed,
    // Fore-aft balance: three incommensurate sways, a few degrees in total, never still.
    balance: [
      { a: 0.034, w: 1.13, p: phase() },
      { a: 0.019, w: 2.07 + rng() * 0.2, p: phase() },
      { a: 0.009, w: 3.71 + rng() * 0.3, p: phase() },
    ],
    // Side-to-side: smaller, slower.
    wobble: [
      { a: 0.016, w: 0.71, p: phase() },
      { a: 0.008, w: 1.63 + rng() * 0.2, p: phase() },
    ],
    blinkSeed: Math.floor(rng() * 1e6),
  };
}

const V0 = 0.5; // cruising speed, m/s
const K_LEAN = 2.6; // wheel acceleration per radian of lean (m/s^2 per rad)
const K_RATE = 0.55; // speed response to lean rate

function sumSin(terms: { a: number; w: number; p: number }[], t: number) {
  let s = 0;
  for (const k of terms) s += k.a * Math.sin(k.w * t + k.p);
  return s;
}
function sumCos(terms: { a: number; w: number; p: number }[], t: number) {
  let s = 0;
  for (const k of terms) s += k.a * k.w * Math.cos(k.w * t + k.p);
  return s;
}
function sumNegCosOverW(terms: { a: number; w: number; p: number }[], t: number) {
  let s = 0;
  for (const k of terms) s += (-k.a / k.w) * Math.cos(k.w * t + k.p);
  return s;
}

const frac = (x: number) => x - Math.floor(x);
const mod = (x: number, m: number) => x - Math.floor(x / m) * m;

/** Smooth bump that rises from 0, peaks at 1 when tau = tau0, and decays. */
function kick(tau: number, tau0: number) {
  if (tau <= 0) return 0;
  const r = tau / tau0;
  return r * Math.exp(1 - r);
}

/** Wrist path of one hand. u = 0 at the throw (inside, moving up), catch at u = 0.4 (outside). */
export function handPosition(side: Side, u: number): Vec3 {
  const psi = Math.PI - 2 * Math.PI * u;
  const x = side * (HAND_CX + HAND_AX * Math.cos(psi));
  const y = HAND_Y + HAND_AY * Math.sin(psi);
  const z = HAND_Z + HAND_AZ * Math.cos(psi);
  return v(x, y, z);
}

function hermite(p0: number, p1: number, m0: number, m1: number, s: number) {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
}

/** Spin angle of a pin held in a hand, q = 0 at the catch to 1 at the throw. */
function dwellPhi(q: number) {
  const m = SPIN_RATE * DWELL;
  return hermite(PHI_CATCH, PHI_THROW, m, m, q);
}

function rotX(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return v(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
}

/** Centre of mass of a pin whose neck is at `grip` with spin angle `phi`. */
function comFromGrip(grip: Vec3, phi: number): Vec3 {
  const off = rotX(v(0, PIN_GRIP, 0), phi);
  return v(grip.x - off.x, grip.y - off.y, grip.z - off.z);
}

const throwSide = (beatIndex: number): Side => (mod(beatIndex, 2) === 0 ? -1 : 1);

function handPhase(side: Side, t: number) {
  // Right hand throws on even beats, left on odd beats.
  return frac((side === -1 ? t : t - BEAT) / HAND_CYCLE);
}

function pinPose(i: number, t: number): PinPose {
  const tau = mod(t - i * BEAT, PIN_CYCLE);
  const first: Side = i % 2 === 0 ? -1 : 1; // the hand that throws at tau = 0
  const second: Side = first === -1 ? 1 : -1;
  const half = 3 * BEAT;
  const inSecondHalf = tau >= half;
  const local = inSecondHalf ? tau - half : tau;
  const from = inSecondHalf ? second : first;
  const to = inSecondHalf ? first : second;

  if (local < FLIGHT) {
    const com0 = comFromGrip(handPosition(from, 0), PHI_THROW);
    const com1 = comFromGrip(handPosition(to, EMPTY_FRAC), PHI_CATCH);
    const vx = (com1.x - com0.x) / FLIGHT;
    const vy = (com1.y - com0.y) / FLIGHT + 0.5 * G * FLIGHT;
    const vz = (com1.z - com0.z) / FLIGHT;
    const s = local;
    const p = local / FLIGHT;
    return {
      com: v(com0.x + vx * s, com0.y + vy * s - 0.5 * G * s * s, com0.z + vz * s),
      phi: PHI_THROW + SPIN_RATE * s,
      roll: -from * 0.18 * Math.sin(Math.PI * p),
      inHand: 0,
      flight: p,
    };
  }
  // Held in `to` from its catch (hand phase 0.4) to its throw (hand phase 1).
  const q = (local - FLIGHT) / DWELL;
  const u = EMPTY_FRAC + q * (1 - EMPTY_FRAC);
  const grip = handPosition(to, u);
  const phi = dwellPhi(q);
  return { com: comFromGrip(grip, phi), phi, roll: 0, inHand: to, flight: 0 };
}

function hashUnit(n: number, seed: number) {
  let h = (n * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function blinkAt(t: number, seed: number) {
  // Blinks every 3.5 s on average with hashed jitter; each lasts 0.16 s.
  const slot = 3.5;
  const n = Math.floor(t / slot);
  let closed = 0;
  for (const k of [n - 1, n]) {
    const start = k * slot + hashUnit(k, seed) * (slot - 0.3);
    const d = t - start;
    if (d > 0 && d < 0.16) closed = Math.max(closed, Math.sin((Math.PI * d) / 0.16));
  }
  return closed;
}

export function evaluateAct(c: Choreography, t: number): ActPose {
  // --- Balance and pedalling -------------------------------------------------
  // Like a unicyclist, the wheel is driven under the falling body: leaning forward
  // accelerates the wheel, leaning back slows it. Speed is the closed-form integral
  // of that response, so distance, wheel angle and crank angle all agree exactly.
  const pitch = sumSin(c.balance, t);
  const pitchRate = sumCos(c.balance, t);
  const speed = V0 + leanSpeed(c, t, pitchRate);
  const distance = V0 * t + K_LEAN * integratedLeanSpeed(c, t) + K_RATE * pitch;
  const wheelAngle = distance / WHEEL_R;
  const pathAngle = distance / PATH_R;
  const position = v(PATH_R * Math.sin(pathAngle), 0, PATH_R * Math.cos(pathAngle));
  const heading = pathAngle + Math.PI / 2;
  const wob = sumSin(c.wobble, t);
  // Lean into the turn (centre is at +x) plus the side-to-side correction.
  const turnLean = Math.atan((speed * speed) / (G * PATH_R));
  const roll = turnLean + wob;
  // The wheel cannot scrub sideways, so the frame stays tangent to the path; the
  // rider's twist on the saddle carries the side-to-side corrections instead.
  const steer = 0;
  const twistWob = -0.6 * wob + 0.04 * Math.sin(t * 0.83 + 1.3);

  // --- Juggling --------------------------------------------------------------
  const hands = ([-1, 1] as Side[]).map((side) => {
    const u = handPhase(side, t);
    const sinceThrow = u * HAND_CYCLE;
    const sinceCatch = mod(u - EMPTY_FRAC, 1) * HAND_CYCLE;
    return {
      side,
      pos: handPosition(side, u),
      holding: u >= EMPTY_FRAC,
      throwKick: kick(sinceThrow, 0.07) + kick(sinceThrow + HAND_CYCLE, 0.07),
      catchKick: kick(sinceCatch, 0.06) + kick(sinceCatch + HAND_CYCLE, 0.06),
    } as HandPose;
  }) as [HandPose, HandPose];
  const pins = [0, 1, 2].map((i) => pinPose(i, t)) as [PinPose, PinPose, PinPose];

  // Reactions summed over the last few throws and catches (periodic, so seamless).
  const beatNow = Math.floor(t / BEAT);
  let twist = 0;
  let dip = 0;
  let jig = 0;
  let sway = 0;
  for (let k = 0; k < 6; k++) {
    const n = beatNow - k;
    const side = throwSide(n);
    const sinceThrow = t - n * BEAT;
    twist += side * 0.035 * kick(sinceThrow, 0.09);
    const sinceCatch = t - (n * BEAT + FLIGHT);
    // A throw from `side` is caught by the opposite wing.
    dip += kick(sinceCatch, 0.07);
    if (sinceCatch > 0) {
      const e = Math.exp(-sinceCatch / 0.22) * Math.sin(2 * Math.PI * 4.2 * sinceCatch);
      jig += e;
      sway += -side * e;
    }
  }

  // The head follows whichever pin is highest in its arc, weighted smoothly.
  let wx = 0;
  let wy = 0;
  let wz = 0;
  let ws = 0;
  for (const p of pins) {
    if (p.inHand) continue;
    const w = Math.sin(Math.PI * p.flight) ** 2 + 1e-4;
    wx += p.com.x * w;
    wy += p.com.y * w;
    wz += p.com.z * w;
    ws += w;
  }
  const look = ws > 0 ? v(wx / ws, wy / ws, wz / ws) : v(0, 1.2, 0.45);

  const crank = wheelAngle;
  return {
    t,
    distance,
    speed,
    wheelAngle,
    pathAngle,
    position,
    heading,
    steer,
    pitch,
    roll,
    bodyPitch: -0.35 * pitch + 0.012 * dip - 0.01 * Math.cos(2 * crank),
    bodyRoll: 0.4 * twist - 0.3 * wob + 0.012 * Math.sin(crank),
    bodyYaw: 0.6 * twist + 0.025 * Math.sin(crank) + 0.5 * twistWob,
    bodyBob: -0.006 * dip + 0.004 * Math.cos(2 * crank),
    hands,
    pins,
    look,
    pouch: { sag: 0.12 * jig + 0.05 * Math.sin(2 * crank + 0.6), sway: 0.25 * sway },
    blink: blinkAt(t, c.blinkSeed),
    // Ankling: heel drops on the downstroke, toes point at the bottom of the stroke.
    ankle: [0.18 * Math.sin(crank + 0.4), 0.18 * Math.sin(crank + Math.PI + 0.4)],
  };
}

// Speed from lean: v = V0 + K_LEAN * integral(pitch) + K_RATE * d(pitch)/dt.
function leanSpeed(c: Choreography, t: number, pitchRate: number) {
  return K_LEAN * integratedLean(c, t) + K_RATE * pitchRate;
}
function integratedLean(c: Choreography, t: number) {
  return sumNegCosOverW(c.balance, t);
}
// Distance contribution of the K_LEAN term: integral of integral(pitch).
function integratedLeanSpeed(c: Choreography, t: number) {
  let s = 0;
  for (const k of c.balance) s += (-k.a / (k.w * k.w)) * Math.sin(k.w * t + k.p);
  return s;
}

export const STILL_TIME = 28 * BEAT + 0.9 * BEAT; // a frame with one pin at the top and one in each wing
export { PHI_MID, SPIN_RATE };
