// Pure functions of time that describe the whole act.
// Everything that has to agree (wheel, pedals, path, hands, pins) is derived
// from these, so the act is consistent at any instant and loops forever.
import * as THREE from 'three';

export const G = 9.81;
export const WHEEL_R = 0.3; // wheel radius (m)
export const CRANK = 0.12; // crank length (m)
export const PEDAL_X = 0.125; // lateral offset of pedal centres from the wheel plane
export const PATH_R = 2.0; // radius of the circle ridden around the ring
const V0 = 0.85; // mean riding speed (m/s)

// --- balance: frame pitch is a sum of incommensurate sines (never repeats,
// never still). The wheel accelerates in proportion to the lean, the way a
// unicyclist corrects: lean forward -> pedal harder -> come back upright.
const PITCH_BIAS = 0.02;
const PITCH = [
  [0.042, 1.13, 0.0],
  [0.021, 2.71, 1.3],
  [0.011, 4.37, 2.1],
];
const K_ACC = 5.5; // wheel acceleration per radian of lean (m/s^2)

export function pitchAt(t) {
  let p = PITCH_BIAS;
  for (const [a, w, ph] of PITCH) p += a * Math.sin(w * t + ph);
  return p;
}

// distance travelled: d2s/dt2 = K_ACC * (pitch - bias)
export function distAt(t) {
  let s = V0 * t;
  for (const [a, w, ph] of PITCH) s -= (K_ACC * a * Math.sin(w * t + ph)) / (w * w);
  return s;
}

export function speedAt(t) {
  let v = V0;
  for (const [a, w, ph] of PITCH) v -= (K_ACC * a * Math.cos(w * t + ph)) / w;
  return v;
}

export function rollAt(t) {
  const v = speedAt(t);
  // lean into the turn (towards +x local = ring centre) + small side wobble
  const turn = Math.atan((v * v) / (G * PATH_R));
  const wob = 0.018 * Math.sin(0.93 * t + 0.4) + 0.009 * Math.sin(2.31 * t + 1.7);
  return -(turn + wob);
}

// --- juggling: 3-pin cascade
export const BEAT = 0.45; // time between throws (alternating hands)
export const FLIGHT = 0.8; // airtime of each pin
export const DWELL = 3 * BEAT - FLIGHT; // time a pin rests in a hand
const CYCLE = 2 * BEAT; // each hand throws once per cycle
const CATCH_PHASE = CYCLE - DWELL; // hand phase at which it catches
export const SPINS = 1; // full end-over-end turns per throw
export const PIN_GRIP = 0.112; // grip point (neck) above the pin's centre of mass

const mod = (a, n) => ((a % n) + n) % n;

// Hand 0 = right wing (x < 0), hand 1 = left wing (x > 0). Throw k happens at
// k*BEAT from hand k mod 2 and carries pin k mod 3.
export function handSide(h) {
  return h === 0 ? -1 : 1;
}

// hand phase in [0, CYCLE): 0 = throw, CATCH_PHASE = catch
export function handPhase(h, t) {
  return mod(t - h * BEAT, CYCLE);
}

// Angle around the hand's scoop loop. 0 = outer (catch), -PI = inner (throw).
function handAngle(tau) {
  if (tau < CATCH_PHASE) {
    // empty: inner -> over the top -> outer
    const u = tau / CATCH_PHASE;
    return -Math.PI - Math.PI * u;
  }
  // holding: outer -> scoop down -> inner
  const u = (tau - CATCH_PHASE) / DWELL;
  return -Math.PI * u;
}

const HAND_C = { x: 0.215, y: 0.0, z: 0.68 };
const HAND_A = { x: 0.09, yTop: 0.05, yBot: 0.075 };

// Hand (grip) target in pelican-body local space.
export function handLocal(h, t, out) {
  const sx = handSide(h);
  const a = handAngle(handPhase(h, t));
  const s = Math.sin(a);
  const c = Math.cos(a);
  out.set(
    sx * (HAND_C.x + HAND_A.x * c),
    HAND_C.y + (s > 0 ? HAND_A.yTop : HAND_A.yBot) * s,
    HAND_C.z - 0.03 * c + 0.02 * s,
  );
  return out;
}

const _e = new THREE.Euler();
// Orientation of a held pin in body local space: pin head (+y) points down
// toward the wrist, the fat body points up and forward, rocking in the scoop.
export function handPinQuat(h, t, out) {
  const sx = handSide(h);
  const a = handAngle(handPhase(h, t));
  const rock = 0.25 * Math.sin(a); // cocks back while scooping
  _e.set(-Math.PI + 0.3 + rock, 0, sx * 0.22, 'XYZ');
  return out.setFromEuler(_e);
}

// Throw / catch impulses for reactions (0..1, decaying)
// smooth pulse: 0 at the event, peaks at 1 after `rise` seconds, then decays
function pulse(tau, rise) {
  if (tau <= 0) return 0;
  const x = tau / rise;
  return x * Math.exp(1 - x);
}
export function throwImpulse(h, t) {
  return pulse(handPhase(h, t), 0.09);
}
export function catchImpulse(h, t) {
  return pulse(handPhase(h, t) - CATCH_PHASE, 0.08);
}

// --- rider pose
export function poseAt(t, out = {}) {
  const s = distAt(t);
  const alpha = s / PATH_R;
  out.t = t;
  out.dist = s;
  out.x = PATH_R * Math.sin(alpha);
  out.z = PATH_R * Math.cos(alpha);
  out.yaw = alpha + Math.PI / 2;
  out.roll = rollAt(t);
  out.pitch = pitchAt(t);
  out.wheel = s / WHEEL_R; // rolling without slipping
  // body on the saddle: pedal-stroke bob, counter-pitch, juggling twist
  const ph = out.wheel;
  const bob =
    0.006 * Math.cos(2 * ph) -
    0.01 * (catchImpulse(0, t) + catchImpulse(1, t)) +
    0.006 * (throwImpulse(0, t) + throwImpulse(1, t));
  out.bodyY = 0.88 + bob;
  out.bodyPitch = -0.45 * (out.pitch - PITCH_BIAS) + 0.02 * (catchImpulse(0, t) + catchImpulse(1, t));
  out.bodyRoll = 0.035 * Math.sin(ph) - 0.6 * (out.roll + 0.03) * 0.5;
  out.bodyYaw = 0.05 * (throwImpulse(1, t) - throwImpulse(0, t)) + 0.03 * Math.sin(ph);
  return out;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const _pose = {};

// World matrix of the pelican body group (must match the scene graph in main.js)
export function bodyMatrixAt(t, out, pose = poseAt(t, _pose)) {
  out.makeTranslation(pose.x, 0, pose.z);
  out.multiply(_m.makeRotationY(pose.yaw));
  out.multiply(_m.makeRotationZ(pose.roll));
  out.multiply(_m.makeTranslation(0, WHEEL_R, 0));
  out.multiply(_m.makeRotationX(pose.pitch));
  _q.setFromEuler(_e.set(pose.bodyPitch, pose.bodyYaw, pose.bodyRoll, 'YXZ'));
  out.multiply(_m.compose(_v.set(0, pose.bodyY, 0.02), _q, _one));
  return out;
}

// --- pins
const _bm = new THREE.Matrix4();
const _bq = new THREE.Quaternion();
const _hq = new THREE.Quaternion();
const _hp = new THREE.Vector3();
const _grip = new THREE.Vector3();

// Centre of mass + orientation of a pin held by hand h at time t (world)
export function heldPin(h, t, pos, quat) {
  bodyMatrixAt(t, _bm);
  handLocal(h, t, _hp).applyMatrix4(_bm);
  _bq.setFromRotationMatrix(_bm);
  handPinQuat(h, t, _hq);
  quat.multiplyQuaternions(_bq, _hq);
  _grip.set(0, PIN_GRIP, 0).applyQuaternion(quat);
  pos.copy(_hp).sub(_grip);
  return { pos, quat };
}

const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _spin = new THREE.Quaternion();

// Full state of pin i at time t. Returns {flying, s, hand}
const SPIN_AXIS = new THREE.Vector3(1, 0, 0);
export function pinState(i, t, pos, quat) {
  // most recent throw k <= t carrying this pin (k mod 3 == i)
  let k = Math.floor(t / BEAT);
  k -= mod(k - i, 3);
  const tk = k * BEAT;
  const tau = t - tk;
  const from = mod(k, 2);
  const to = 1 - from;
  if (tau < FLIGHT) {
    const s = tau / FLIGHT;
    heldPin(from, tk, _p0, _q0);
    heldPin(to, tk + FLIGHT, _p1, _q1);
    pos.lerpVectors(_p0, _p1, s);
    pos.y += 0.5 * G * FLIGHT * FLIGHT * s * (1 - s);
    quat.slerpQuaternions(_q0, _q1, s);
    // end over end in the juggling plane, the top leading toward the catch
    quat.multiply(_spin.setFromAxisAngle(SPIN_AXIS, -2 * Math.PI * SPINS * s));
    return { flying: true, s, hand: to };
  }
  heldPin(to, t, pos, quat);
  return { flying: false, s: 0, hand: to };
}

export { AX, AY, AZ };
