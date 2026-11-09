// Numerical checks on the choreography. Run with `npm test`.
// The act is a pure function of time, so its invariants can be checked
// without a browser by sampling it densely.
import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three';
import * as A from '../src/act.js';
import { ANKLE_LOCAL, HIP, SHIN, SHOULDER, THIGH, WING_FORE, WING_UPPER } from '../src/performer.js';

const DT = 1 / 240;
const SPANS = [
  [0, 90], // from the very first frame
  [3600, 3630], // an hour in: nothing drifts or loses precision
];
const results = [];
const ok = (name, detail) => results.push(`ok  ${name}${detail ? ` (${detail})` : ''}`);

function* times() {
  for (const [a, b] of SPANS) for (let t = a; t < b; t += DT) yield t;
}

// 1. The wheel rolls without slipping, and distance really is the integral of speed.
{
  let worst = 0;
  for (const t of times()) {
    const h = 1e-4;
    worst = Math.max(worst, Math.abs((A.distance(t + h) - A.distance(t - h)) / (2 * h) - A.speed(t)));
    const r = A.rig(t);
    assert.ok(Math.abs(r.wheelAngle * A.WHEEL_R - r.s) < 1e-9);
    assert.ok(r.v > 0.3, 'always rolling forward');
  }
  assert.ok(worst < 1e-5);
  ok('wheel angle = distance / radius; distance = ∫speed', `max error ${worst.toExponential(1)} m/s`);
}

// 2. Never perfectly still: the lean keeps changing, and stays modest.
{
  let maxLean = 0;
  let maxRoll = 0;
  let stillest = Infinity;
  for (const [a, b] of SPANS) {
    for (let t = a; t < b; t += 0.5) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let u = t; u < t + 0.5; u += DT) {
        const r = A.rig(u);
        lo = Math.min(lo, r.lean);
        hi = Math.max(hi, r.lean);
        maxLean = Math.max(maxLean, Math.abs(r.lean));
        maxRoll = Math.max(maxRoll, Math.abs(r.roll));
      }
      stillest = Math.min(stillest, hi - lo);
    }
  }
  assert.ok(stillest > 0.002, 'lean changes in every half second');
  assert.ok(maxLean < 0.3 && maxRoll < 0.2);
  ok('balance never settles', `fore/aft lean up to ${((maxLean * 180) / Math.PI).toFixed(1)}°, least change in any 0.5 s ${((stillest * 180) / Math.PI).toFixed(2)}°`);
}

// 3. Pins: continuous paths, true ballistic flight, never dropped.
{
  const cur = { pos: new Vector3(), quat: new Quaternion() };
  let maxStep = 0;
  let maxSpeed = 0;
  let minY = Infinity;
  let maxY = 0;
  let maxTurn = 0;
  let gErr = 0;
  for (let p = 0; p < 3; p++) {
    for (const [a, b] of SPANS) {
      const prev = { pos: new Vector3(), quat: new Quaternion() };
      const hist = [];
      for (let t = a; t < b; t += DT) {
        A.pinState(p, t, cur);
        if (t > a) {
          const d = cur.pos.distanceTo(prev.pos);
          maxStep = Math.max(maxStep, d);
          maxSpeed = Math.max(maxSpeed, d / DT);
          maxTurn = Math.max(maxTurn, cur.quat.angleTo(prev.quat));
        }
        minY = Math.min(minY, cur.pos.y);
        maxY = Math.max(maxY, cur.pos.y);
        hist.push({ y: cur.pos.y, x: cur.pos.x, z: cur.pos.z, held: cur.held });
        if (hist.length > 3) hist.shift();
        if (hist.length === 3 && hist.every((s) => !s.held)) {
          // Second difference in flight: -g vertically, nothing sideways.
          const ay = (hist[2].y - 2 * hist[1].y + hist[0].y) / (DT * DT);
          const ax = (hist[2].x - 2 * hist[1].x + hist[0].x) / (DT * DT);
          const az = (hist[2].z - 2 * hist[1].z + hist[0].z) / (DT * DT);
          gErr = Math.max(gErr, Math.abs(ay + A.G), Math.abs(ax), Math.abs(az));
        }
        prev.pos.copy(cur.pos);
        prev.quat.copy(cur.quat);
      }
    }
  }
  assert.ok(maxStep < 0.035, `pin jumped ${maxStep}`); // 8 m/s at 240 Hz would be 0.033
  assert.ok(maxTurn < 0.12, `pin snapped round ${maxTurn}`);
  assert.ok(gErr < 0.02, `flight is not ballistic: ${gErr}`);
  assert.ok(minY > 0.9, `pin too low: ${minY}`);
  ok('pins move continuously through throw, flight, catch and carry', `largest step at 240 Hz ${(maxStep * 1000).toFixed(1)} mm, top speed ${maxSpeed.toFixed(1)} m/s`);
  ok('flight is pure gravity', `max deviation ${gErr.toExponential(1)} m/s²`);
  ok('no pin is dropped', `pin centres stay between ${minY.toFixed(2)} and ${maxY.toFixed(2)} m`);
}

// 4. Exactly one pin in the air or two, each wing holds at most one, and the
//    wing tip is on the pin's neck for the whole carry.
{
  const st = { pos: new Vector3(), quat: new Quaternion() };
  const hand = new Vector3();
  const grip = new Vector3();
  const prev = [new Vector3(), new Vector3()];
  let maxGap = 0;
  let maxHandStep = 0;
  let maxReach = 0;
  let minReach = Infinity;
  const sh = new Vector3();
  const airCounts = new Set();
  for (const [a, b] of SPANS) {
    for (let t = a; t < b; t += DT) {
      const holding = [0, 0];
      let air = 0;
      for (let p = 0; p < 3; p++) {
        A.pinState(p, t, st);
        if (st.held) {
          holding[st.hand]++;
          A.handTarget(st.hand, t, hand);
          A.gripPoint(p, t, grip);
          maxGap = Math.max(maxGap, hand.distanceTo(grip));
        } else air++;
      }
      airCounts.add(air);
      assert.ok(holding[0] <= 1 && holding[1] <= 1, 'a wing never holds two pins');
      const torso = A.rig(t).torso;
      for (let h = 0; h < 2; h++) {
        A.handTarget(h, t, hand);
        if (t > a) maxHandStep = Math.max(maxHandStep, hand.distanceTo(prev[h]));
        prev[h].copy(hand);
        sh.set(SHOULDER.x * (h ? -1 : 1), SHOULDER.y, SHOULDER.z).applyMatrix4(torso);
        const d = sh.distanceTo(hand);
        maxReach = Math.max(maxReach, d);
        minReach = Math.min(minReach, d);
      }
    }
  }
  assert.ok(maxGap < 1e-9);
  assert.ok(maxHandStep < 0.035, `wing tip jumped ${maxHandStep}`);
  assert.ok(maxReach < WING_UPPER + WING_FORE - 0.01, `wing over-stretched: ${maxReach}`);
  assert.ok(minReach > 0.2, `wing folded into the body: ${minReach}`);
  assert.deepEqual([...airCounts].sort(), [1, 2]);
  ok('wing tips stay on the pins they hold and move continuously between them', `largest step ${(maxHandStep * 1000).toFixed(1)} mm`);
  ok('wings can always reach', `shoulder to tip ${minReach.toFixed(2)}–${maxReach.toFixed(2)} m of ${(WING_UPPER + WING_FORE).toFixed(2)} m`);
  ok('cascade pattern holds', 'always one or two pins in the air, never two in one wing');
}

// 5. Pins never hit each other, the head or the bill.
{
  const s = [0, 1, 2].map(() => ({ pos: new Vector3(), quat: new Quaternion() }));
  const ends = [0, 1, 2].map(() => [new Vector3(), new Vector3()]);
  const HALF_UP = 0.19; // belly-end and neck-end of the pin's axis, from its centre of mass
  const HALF_DOWN = 0.29;
  const segDist = (p1, q1, p2, q2) => {
    // closest distance between two segments (Ericson)
    const d1 = q1.clone().sub(p1);
    const d2 = q2.clone().sub(p2);
    const r = p1.clone().sub(p2);
    const a = d1.dot(d1);
    const e = d2.dot(d2);
    const f = d2.dot(r);
    const c = d1.dot(r);
    const b = d1.dot(d2);
    const den = a * e - b * b;
    let sN = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
    let tN = (b * sN + f) / e;
    if (tN < 0) {
      tN = 0;
      sN = Math.min(1, Math.max(0, -c / a));
    } else if (tN > 1) {
      tN = 1;
      sN = Math.min(1, Math.max(0, (b - c) / a));
    }
    return p1.clone().addScaledVector(d1, sN).distanceTo(p2.clone().addScaledVector(d2, tN));
  };
  let minPins = Infinity;
  let minHead = Infinity;
  const headA = new Vector3();
  const headB = new Vector3();
  for (const [a, b] of SPANS) {
    for (let t = a; t < b; t += DT * 2) {
      for (let p = 0; p < 3; p++) {
        A.pinState(p, t, s[p]);
        ends[p][0].set(0, HALF_UP, 0).applyQuaternion(s[p].quat).add(s[p].pos);
        ends[p][1].set(0, -HALF_DOWN, 0).applyQuaternion(s[p].quat).add(s[p].pos);
      }
      const torso = A.rig(t).torso;
      headA.set(0, 0.97, 0.19).applyMatrix4(torso); // head
      headB.set(0, 0.52, 0.54).applyMatrix4(torso); // bill tip
      for (let p = 0; p < 3; p++) {
        minHead = Math.min(minHead, segDist(ends[p][0], ends[p][1], headA, headB));
        for (let q = p + 1; q < 3; q++) minPins = Math.min(minPins, segDist(ends[p][0], ends[p][1], ends[q][0], ends[q][1]));
      }
    }
  }
  assert.ok(minPins > 0.15, `pins collide: axes come within ${minPins}`);
  assert.ok(minHead > 0.13, `pin hits the head or bill: ${minHead}`);
  ok('pins clear each other', `axes never closer than ${(minPins * 100).toFixed(0)} cm (belly diameter 15 cm)`);
  ok('pins clear the head and bill', `never closer than ${(minHead * 100).toFixed(0)} cm`);
}

// 6. The legs can always reach the pedals.
{
  const m = new Matrix4();
  const hip = new Vector3();
  const ankle = new Vector3();
  let lo = Infinity;
  let hi = 0;
  for (const t of times()) {
    const r = A.rig(t);
    for (const side of [1, -1]) {
      hip.set(HIP.x * side, HIP.y, HIP.z).applyMatrix4(r.torso);
      ankle
        .set(side * A.PEDAL_X, side * A.CRANK, 0)
        .applyMatrix4(m.makeRotationX(r.wheelAngle - r.lean))
        .add(ANKLE_LOCAL)
        .applyMatrix4(r.frame);
      const d = hip.distanceTo(ankle);
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
  }
  assert.ok(hi < THIGH + SHIN - 0.005, `leg over-stretched: ${hi}`);
  assert.ok(lo > 0.3);
  ok('feet stay on the pedals', `hip to ankle ${lo.toFixed(2)}–${hi.toFixed(2)} m of ${(THIGH + SHIN).toFixed(2)} m`);
}

console.log(results.join('\n'));
console.log(`\n${results.length} checks passed`);
