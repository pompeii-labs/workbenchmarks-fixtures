// The act as a pure function of time.
//
// Nothing in here keeps state between frames: the ride, the balance, the
// juggling pattern and the hands are all closed-form in `t`. That is what makes
// the loop seamless (there is no loop point at all) and lets any instant be
// rendered as a still.
import { Matrix4, Quaternion, Vector3 } from 'three';

// ---- dimensions (metres) ---------------------------------------------------
export const PATH_R = 3.2; // radius of the circle ridden around the ring
export const WHEEL_R = 0.34; // rolling radius of the unicycle wheel
export const CRANK = 0.12; // crank length
export const PEDAL_X = 0.15; // lateral pedal offset from wheel plane
export const SEAT_H = 0.5; // seat top above the hub
export const G = 9.81;

// ---- ride --------------------------------------------------------------------
// Forward speed is a steady cruise plus incommensurate "corrections": the
// rider keeps catching its balance by surging and easing off, so it never
// repeats exactly and never settles.
const V0 = 1.05;
const WOB = [
  [0.36, 2.07, 0.0],
  [0.17, 3.31, 1.3],
  [0.07, 5.23, 4.1],
];
// Sideways balance wobble (roll), also never settling.
const ROLL_WOB = [
  [0.022, 1.73, 0.6],
  [0.012, 2.89, 2.2],
];

export function speed(t) {
  let v = V0;
  for (const [a, w, p] of WOB) v += a * Math.sin(w * t + p);
  return v;
}
/** Distance rolled along the path: the exact integral of speed(). */
export function distance(t) {
  let s = V0 * t;
  for (const [a, w, p] of WOB) s -= (a / w) * Math.cos(w * t + p);
  return s;
}
export function accel(t) {
  let a = 0;
  for (const [amp, w, p] of WOB) a += amp * w * Math.cos(w * t + p);
  return a;
}
/** Where the camera looks: the rider's average progress, without the surges. */
export function meanDistance(t) {
  return V0 * t;
}
export function pathPoint(s, out = new Vector3()) {
  const th = s / PATH_R;
  return out.set(PATH_R * Math.sin(th), 0, PATH_R * Math.cos(th));
}
export function headingAt(s) {
  return s / PATH_R + Math.PI / 2;
}

// ---- juggling pattern: three-pin cascade -----------------------------------
export const BEAT = 0.36; // time between throws (hands alternate)
export const FLIGHT = 0.7; // air time of each pin
export const DWELL = 3 * BEAT - FLIGHT; // time a pin rests in a wing
const EMPTY = 2 * BEAT - DWELL; // time a wing is empty between throw and catch
const SPIN = (2 * Math.PI) / FLIGHT; // one full end-over-end turn per flight
export const GRIP = 0.17; // wing holds the pin's neck this far from its centre of mass

const HAND_Z = 0.76; // the juggling plane, clear in front of the bill

const throwCache = new Map();
const sideOf = (hand) => (hand === 0 ? 1 : -1);
const handOf = (j) => ((j % 2) + 2) % 2;
const mod3 = (j) => ((j % 3) + 3) % 3;

// Throw from near the midline, catch out wide (that is what makes a cascade).
// These numbers were searched so that the tumbling pins always clear each
// other and the bird's head; test/act.test.js holds them to it.
export const TUNE = {
  tx: 0.1, // release point, in the torso frame
  ty: 0.85,
  cx: 0.65, // catch point
  cy: 0.76,
  tilt: -1.1, // pin tilt at release
  give: 0.25, // fraction of the incoming velocity the wing keeps at the catch
};
export const resetCache = () => throwCache.clear(); // only needed after editing TUNE
const throwLocal = (hand) => new Vector3(sideOf(hand) * TUNE.tx, TUNE.ty, HAND_Z);
const catchLocal = (hand) => new Vector3(sideOf(hand) * TUNE.cx, TUNE.cy, HAND_Z);

// ---- rig pose ----------------------------------------------------------------
const _m = new Matrix4();

/**
 * All the rigid frames of the act at time t.
 *   root  : wheel contact point, heading along the path, rolled sideways
 *   frame : the unicycle frame, pivoting about the hub (fore/aft lean)
 *   torso : the pelican's body on the seat, with its juggling sway
 */
export function rig(t, out = {}) {
  const s = distance(t);
  const v = speed(t);
  const a = accel(t);
  // An inverted pendulum has to lean into its acceleration; leaning into the
  // turn does the same job sideways.
  const lean = Math.atan2(a, G) * 1.25;
  let roll = -Math.atan2(v * v, PATH_R * G) * 1.6;
  for (const [amp, w, p] of ROLL_WOB) roll += amp * Math.sin(w * t + p);

  const beat = t / BEAT;
  // The body answers the pattern: it rocks toward the throwing wing, twists a
  // little, and dips on every beat.
  const sway = 0.035 * Math.sin(Math.PI * beat + 0.5);
  const twist = 0.05 * Math.sin(Math.PI * beat - 0.4);
  const bob = -0.014 * Math.cos(2 * Math.PI * beat - 0.5);

  out.t = t;
  out.s = s;
  out.v = v;
  out.a = a;
  out.lean = lean;
  out.roll = roll;
  out.heading = headingAt(s);
  out.wheelAngle = s / WHEEL_R; // rolling without slipping
  out.beat = beat;
  out.bob = bob;

  const root = (out.root ||= new Matrix4());
  const frame = (out.frame ||= new Matrix4());
  const torso = (out.torso ||= new Matrix4());
  const p = pathPoint(s, (out.pos ||= new Vector3()));
  root.makeTranslation(p.x, 0, p.z);
  root.multiply(_m.makeRotationY(out.heading));
  root.multiply(_m.makeRotationZ(roll));
  frame.copy(root).multiply(_m.makeTranslation(0, WHEEL_R, 0)).multiply(_m.makeRotationX(lean));
  torso
    .copy(frame)
    .multiply(_m.makeTranslation(0, SEAT_H + bob, 0))
    .multiply(_m.makeRotationY(twist))
    .multiply(_m.makeRotationZ(sway));
  return out;
}

// Small scratch rigs so the helpers below do not disturb the caller's rig.
const _rigA = {};
function torsoPoint(t, local) {
  return local.applyMatrix4(rig(t, _rigA).torso);
}
function carrier(t, out) {
  return out.setFromMatrixPosition(rig(t, _rigA).torso);
}
const _c1 = new Vector3();
const _c2 = new Vector3();
function carrierVel(t, out) {
  const h = 1e-3;
  carrier(t + h, _c1);
  carrier(t - h, _c2);
  return out.subVectors(_c1, _c2).multiplyScalar(1 / (2 * h));
}

// ---- throws --------------------------------------------------------------------
// Throw j leaves hand (j mod 2) at t = j * BEAT carrying pin (j mod 3), and is
// caught by the other hand FLIGHT later. Both ends are wherever the pelican
// will actually be at those instants, so the arc is a true ballistic path in
// the world even though the rider keeps moving, turning and wobbling.
function getThrow(j) {
  let th = throwCache.get(j);
  if (th) return th;
  if (throwCache.size > 96) throwCache.clear();
  const hand = handOf(j);
  const t0 = j * BEAT;
  const t1 = t0 + FLIGHT;
  const p0 = torsoPoint(t0, throwLocal(hand));
  const p1 = torsoPoint(t1, catchLocal(1 - hand));
  const v0 = p1.clone().sub(p0).multiplyScalar(1 / FLIGHT);
  v0.y += 0.5 * G * FLIGHT;
  const v1 = v0.clone();
  v1.y -= G * FLIGHT;
  th = {
    j,
    hand,
    t0,
    t1,
    p0,
    p1,
    v0,
    v1,
    b0: carrier(t0, new Vector3()),
    b1: carrier(t1, new Vector3()),
    bv0: carrierVel(t0, new Vector3()),
    bv1: carrierVel(t1, new Vector3()),
  };
  throwCache.set(j, th);
  return th;
}

function hermite(out, p0, m0, p1, m1, s) {
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  return out.set(
    h00 * p0.x + h10 * m0.x + h01 * p1.x + h11 * m1.x,
    h00 * p0.y + h10 * m0.y + h01 * p1.y + h11 * m1.y,
    h00 * p0.z + h10 * m0.z + h01 * p1.z + h11 * m1.z,
  );
}
function hermite1(p0, m0, p1, m1, s) {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
}

const _q0 = new Vector3();
const _q1 = new Vector3();
const _m0 = new Vector3();
const _m1 = new Vector3();
const _b = new Vector3();
const _yAxis = new Vector3(0, 1, 0);
const _zAxis = new Vector3(0, 0, 1);
const _qa = new Quaternion();
const _qb = new Quaternion();

/**
 * Position (centre of mass) and orientation of pin `p` at time t.
 * out: { pos: Vector3, quat: Quaternion, held: boolean, hand, tilt }
 */
export function pinState(p, t, out) {
  out ||= { pos: new Vector3(), quat: new Quaternion() };
  const k = t / BEAT;
  const j = 3 * Math.floor((k - p) / 3 + 1e-9) + p; // latest throw of this pin
  const th = getThrow(j);
  const u = t - th.t0;
  const dir = sideOf(th.hand); // spin sense follows the direction of travel
  let tilt;
  if (u <= FLIGHT) {
    // In the air: gravity only, tumbling at a constant rate.
    out.pos.copy(th.p0).addScaledVector(th.v0, u);
    out.pos.y -= 0.5 * G * u * u;
    tilt = dir * (TUNE.tilt + SPIN * u);
    out.held = false;
    out.hand = -1;
  } else {
    // In the wing: carried from the catch, down through a scoop, and up to
    // the next release with exactly the velocity that throw needs.
    const nx = getThrow(j + 3);
    const sN = (u - FLIGHT) / DWELL;
    _q0.subVectors(th.p1, th.b1);
    _m0.subVectors(th.v1, th.bv1).multiplyScalar(TUNE.give * DWELL);
    _q1.subVectors(nx.p0, nx.b0);
    _m1.subVectors(nx.v0, nx.bv0).multiplyScalar(DWELL);
    hermite(out.pos, _q0, _m0, _q1, _m1, sN);
    out.pos.add(carrier(t, _b));
    // Wind the pin back, then whip it over into the spin of the next flight.
    const a = hermite1(-TUNE.tilt, 0, TUNE.tilt, SPIN * DWELL, sN);
    tilt = -dir * a;
    out.held = true;
    out.hand = nx.hand;
  }
  out.tilt = tilt;
  const heading = headingAt(distance(t));
  _qa.setFromAxisAngle(_yAxis, heading);
  _qb.setFromAxisAngle(_zAxis, tilt);
  out.quat.copy(_qa).multiply(_qb);
  return out;
}

const _grip = new Vector3();
const _ps = { pos: new Vector3(), quat: new Quaternion() };
/** World position of the grip (the neck) of pin p at time t. */
export function gripPoint(p, t, out = new Vector3()) {
  pinState(p, t, _ps);
  return out.copy(_grip.set(0, -GRIP, 0).applyQuaternion(_ps.quat)).add(_ps.pos);
}

const _g0 = new Vector3();
const _g1 = new Vector3();
const _bb = new Vector3();
/**
 * Where the tip of wing `hand` is at time t: on the pin's neck while it holds
 * one, and otherwise following through from the release and reaching out to
 * meet the next pin exactly where and when it arrives.
 */
export function handTarget(hand, t, out = new Vector3()) {
  const k = t / BEAT;
  const j = 2 * Math.floor((k - hand) / 2 + 1e-9) + hand; // this hand's latest throw
  const u = t - j * BEAT;
  if (u >= EMPTY) return gripPoint(mod3(j + 2), t, out);
  const th = getThrow(j);
  const incoming = getThrow(j - 1); // lands in this hand at t0 + EMPTY
  const tc = incoming.t1;
  gripPoint(mod3(j), th.t0, _g0).sub(th.b0);
  gripPoint(mod3(j + 2), tc + 1e-6, _g1).sub(incoming.b1);
  _m0.subVectors(th.v0, th.bv0).multiplyScalar(0.45 * EMPTY);
  _m1.subVectors(incoming.v1, incoming.bv1).multiplyScalar(TUNE.give * EMPTY);
  hermite(out, _g0, _m0, _g1, _m1, u / EMPTY);
  return out.add(carrier(t, _bb));
}

/** Two-bone IK: returns the middle joint for a limb from a to b. */
export function solveJoint(a, b, l1, l2, pole, out = new Vector3()) {
  const dir = out.subVectors(b, a);
  let d = dir.length();
  dir.multiplyScalar(1 / Math.max(d, 1e-6));
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const perp = _perp.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (perp.lengthSq() < 1e-8) perp.set(0, 1, 0);
  perp.normalize();
  const ax = dir.x * l1 * cosA + perp.x * l1 * sinA;
  const ay = dir.y * l1 * cosA + perp.y * l1 * sinA;
  const az = dir.z * l1 * cosA + perp.z * l1 * sinA;
  return out.set(a.x + ax, a.y + ay, a.z + az);
}
const _perp = new Vector3();
