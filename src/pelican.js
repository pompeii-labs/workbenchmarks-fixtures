// The pelican: an American white pelican, modelled entirely in code.
import * as THREE from 'three';
import { ellipsoid, DynTube, GridSurface, solveTwoBone, placeSegment, featherBump } from './geom.js';

const FEATHER_BUMP = featherBump();
import {
  handLocal,
  handSide,
  throwImpulse,
  catchImpulse,
  CRANK,
  PEDAL_X,
} from './motion.js';

const M = {
  feather: new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.88, bumpMap: FEATHER_BUMP, bumpScale: 0.9 }),
  featherWarm: new THREE.MeshStandardMaterial({ color: 0xeee6d6, roughness: 0.9, bumpMap: FEATHER_BUMP, bumpScale: 0.9 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1c1b20, roughness: 0.65 }),
  bill: new THREE.MeshStandardMaterial({ color: 0xf3a531, roughness: 0.4 }),
  nail: new THREE.MeshStandardMaterial({ color: 0xe0601e, roughness: 0.4 }),
  pouch: new THREE.MeshPhysicalMaterial({
    color: 0xee7a2c,
    roughness: 0.5,
    sheen: 0.6,
    sheenColor: new THREE.Color(0xffd0a0),
    side: THREE.DoubleSide,
  }),
  skin: new THREE.MeshStandardMaterial({ color: 0xf5a03c, roughness: 0.55 }),
  leg: new THREE.MeshStandardMaterial({ color: 0xee8423, roughness: 0.55 }),
  web: new THREE.MeshStandardMaterial({ color: 0xf08c2a, roughness: 0.6, side: THREE.DoubleSide }),
  claw: new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.5 }),
  iris: new THREE.MeshStandardMaterial({ color: 0xf7ecb0, roughness: 0.25 }),
  pupil: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1 }),
  crest: new THREE.MeshStandardMaterial({ color: 0xf3e2a8, roughness: 0.9 }),
};

const BILL_L = 0.5;
const ARM1 = 0.31;
const ARM2 = 0.34;
const THIGH = 0.36;
const SHIN = 0.42;

// ---------- bill ----------
function billCentreY(u) {
  // gentle droop, then the hooked nail at the tip
  return -0.03 * u * u - 0.03 * THREE.MathUtils.smoothstep(u, 0.9, 1.0);
}
function billWidth(u) {
  let w = 0.046 * (1 - 0.32 * u);
  if (u > 0.9) w *= Math.sqrt(Math.max(0, 1 - ((u - 0.9) / 0.1) ** 2));
  return w;
}

function makeUpperMandible() {
  const surf = new GridSurface(
    M.bill,
    40,
    20,
    (u, v, out) => {
      const a = v * Math.PI * 2;
      const w = billWidth(u);
      const top = (0.026 * (1 - 0.45 * u) + 0.004) * (u > 0.9 ? w / (0.046 * 0.7) : 1);
      const bot = 0.006 * (1 - u);
      const s = Math.sin(a);
      // slight central ridge
      const ridge = s > 0 ? 1 + 0.25 * Math.pow(Math.abs(Math.cos(a)), 6) * 0 : 1;
      out.set(w * Math.cos(a), billCentreY(u) + (s > 0 ? top * ridge : bot) * s, BILL_L * u);
    },
    true,
  );
  // the nail
  const nail = ellipsoid(0.012, 0.018, 0.016, M.nail, 12, 10);
  nail.position.set(0, billCentreY(0.985) - 0.004, BILL_L * 0.975);
  surf.mesh.add(nail);
  return surf.mesh;
}

function makeRami() {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const u = (i / 20) * 0.96;
      pts.push(new THREE.Vector3(sx * billWidth(u) * 0.9, billCentreY(u) - 0.009, BILL_L * u));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.0065, 6, false);
    const m = new THREE.Mesh(geo, M.bill);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

const POUCH_U0 = -0.32;
const POUCH_U1 = 0.92;
const DMAX = 0.165;
function pouchDepth(u) {
  const q = (u - POUCH_U0) / (POUCH_U1 - POUCH_U0);
  const bump = Math.pow(q, 0.85) * (1 - q) * 3.58;
  return 0.004 + DMAX * bump;
}
function pouchRimW(u) {
  return u >= 0 ? billWidth(u) * 0.9 : 0.0414 + 0.012 * (-u / -POUCH_U0);
}

function makePouch() {
  return new GridSurface(M.pouch, 36, 18, (u, v, out, sway) => {
    const bu = POUCH_U0 + (POUCH_U1 - POUCH_U0) * u;
    const d = pouchDepth(bu);
    const w = pouchRimW(bu);
    const sv = Math.sin(Math.PI * v);
    const full = d / DMAX;
    const yRim = bu >= 0 ? billCentreY(bu) - 0.009 : -0.009 + 0.04 * bu;
    let x = -w * Math.cos(Math.PI * v) * (1 + 0.35 * sv * full);
    let y = yRim - d * Math.pow(sv, 0.8);
    let z = BILL_L * bu - 0.012 * sv * full;
    if (sway) {
      const k = sv * full;
      x += sway.x * k;
      y += sway.y * k;
      z += sway.z * k;
    }
    out.set(x, y, z);
  });
}

// ---------- head ----------
function makeHead() {
  const head = new THREE.Group();
  const skull = ellipsoid(0.07, 0.072, 0.098, M.feather);
  skull.position.set(0, 0.005, -0.015);
  head.add(skull);
  // forehead slopes into the bill
  const brow = ellipsoid(0.05, 0.045, 0.07, M.feather);
  brow.position.set(0, 0.012, 0.045);
  head.add(brow);
  // crest tuft at the nape
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.07, 6), M.crest);
    c.position.set((i - 2) * 0.012, 0.055, -0.08);
    c.rotation.set(-2.1 + Math.abs(i - 2) * 0.12, 0, (i - 2) * 0.15);
    c.castShadow = true;
    head.add(c);
  }
  // eyes with bare orange skin ring
  for (const sx of [-1, 1]) {
    const ring = ellipsoid(0.006, 0.022, 0.026, M.skin, 12, 10);
    ring.position.set(sx * 0.058, 0.018, 0.035);
    ring.rotation.y = sx * 0.35;
    head.add(ring);
    const eye = ellipsoid(0.0135, 0.0135, 0.0135, M.iris, 14, 12);
    eye.position.set(sx * 0.061, 0.019, 0.036);
    head.add(eye);
    const pupil = ellipsoid(0.006, 0.006, 0.006, M.pupil, 10, 8);
    pupil.position.set(sx * 0.0735, 0.019, 0.04);
    head.add(pupil);
  }
  // bill
  const bill = new THREE.Group();
  bill.position.set(0, -0.012, 0.035);
  bill.rotation.x = 0.05;
  head.add(bill);
  bill.add(makeUpperMandible());
  bill.add(makeRami());
  const pouch = makePouch();
  bill.add(pouch.mesh);
  // gape skin at the corner of the mouth
  const gape = ellipsoid(0.05, 0.03, 0.05, M.skin, 14, 10);
  gape.position.set(0, -0.018, 0.0);
  bill.add(gape);
  return { head, bill, pouch };
}

// ---------- webbed foot ----------
function makeFoot(sx) {
  const g = new THREE.Group();
  // four toes, all joined by web (totipalmate). Angles from forward.
  const toes = [
    [-0.62, 0.085],
    [-0.22, 0.135],
    [0.14, 0.15],
    [0.5, 0.125],
  ].map(([a, l]) => [a * sx, l]);
  const tip = ([a, l]) => new THREE.Vector2(Math.sin(a) * l, Math.cos(a) * l);
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.012);
  const tips = toes.map(tip);
  const sorted = [...tips].sort((p, q) => p.x - q.x);
  shape.lineTo(sorted[0].x, sorted[0].y);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1],
      b = sorted[i];
    // scalloped web edge between toe tips
    shape.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.035, b.x, b.y);
  }
  shape.lineTo(0, -0.012);
  const web = new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false, curveSegments: 8 });
  web.rotateX(Math.PI / 2);
  const webM = new THREE.Mesh(web, M.web);
  webM.position.y = 0.006;
  webM.castShadow = true;
  g.add(webM);
  for (const [a, l] of toes) {
    const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.011, l, 7), M.leg);
    toe.geometry.translate(0, l / 2, 0);
    toe.rotation.set(Math.PI / 2 - 0.08, 0, 0);
    const holder = new THREE.Group();
    holder.rotation.y = a;
    holder.add(toe);
    toe.position.y = 0.009;
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.02, 6), M.claw);
    claw.position.set(0, l + 0.006, 0);
    toe.add(claw);
    toe.castShadow = true;
    g.add(holder);
  }
  const heel = ellipsoid(0.02, 0.018, 0.026, M.leg, 10, 8);
  heel.position.set(0, 0.012, 0);
  g.add(heel);
  return g;
}

// ---------- wing ----------
function feather(len, width, mat, thick = 0.006) {
  const m = ellipsoid(width, len / 2, thick, mat, 10, 8);
  m.geometry.translate(0, len / 2, 0);
  return m;
}

function makeWing(sx) {
  const upper = new THREE.Group();
  const ua = ellipsoid(0.058, ARM1 / 2 + 0.03, 0.04, M.feather);
  ua.position.set(0.01, ARM1 / 2, 0);
  upper.add(ua);
  for (let i = 0; i < 4; i++) {
    const f = feather(0.13, 0.032, M.featherWarm);
    f.position.set(0.02, 0.04 + i * 0.055, 0);
    f.rotation.z = -1.25 - i * 0.05;
    upper.add(f);
  }
  const fore = new THREE.Group();
  const fa = ellipsoid(0.06, ARM2 / 2 + 0.02, 0.032, M.feather);
  fa.position.set(0.025, ARM2 / 2, 0);
  fore.add(fa);
  const secondaries = [];
  for (let i = 0; i < 7; i++) {
    const f = feather(0.17 - i * 0.004, 0.028, i < 2 ? M.featherWarm : M.black);
    f.position.set(0.03, 0.02 + i * 0.042, sx * 0.004 * i);
    f.rotation.z = -1.2 + i * 0.06;
    fore.add(f);
    secondaries.push(f);
  }
  const hand = new THREE.Group();
  hand.position.y = ARM2;
  fore.add(hand);
  const knob = ellipsoid(0.04, 0.045, 0.03, M.feather);
  hand.add(knob);
  const primaries = [];
  for (let i = 0; i < 7; i++) {
    const f = feather(0.24 - i * 0.012, 0.024, M.black);
    hand.add(f);
    primaries.push(f);
  }
  return { upper, fore, hand, primaries, secondaries };
}

// ---------- leg ----------
function makeLeg() {
  const thigh = new THREE.Group();
  // feathered "trousers" end at mid-thigh; below that the bare orange leg
  const tm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.065, THIGH * 0.6, 12), M.feather);
  tm.geometry.translate(0, THIGH * 0.3, 0);
  tm.castShadow = true;
  thigh.add(tm);
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, THIGH * 0.5, 10), M.leg);
  tb.geometry.translate(0, THIGH * 0.75, 0);
  tb.castShadow = true;
  thigh.add(tb);
  const shin = new THREE.Group();
  const sm = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.022, SHIN, 10), M.leg);
  sm.geometry.translate(0, SHIN / 2, 0);
  sm.castShadow = true;
  shin.add(sm);
  const knee = ellipsoid(0.03, 0.03, 0.03, M.leg, 12, 10);
  shin.add(knee);

  return { thigh, shin };
}

// =================================================================
export class Pelican {
  constructor(bodyG, hubG) {
    this.bodyG = bodyG;
    this.hubG = hubG;

    // body: an egg tilted forward, plus a full breast
    const prof = [
      [0.0, -0.3],
      [0.1, -0.285],
      [0.185, -0.235],
      [0.235, -0.15],
      [0.252, -0.04],
      [0.24, 0.06],
      [0.21, 0.14],
      [0.16, 0.215],
      [0.1, 0.27],
      [0.0, 0.3],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const bodyGeo = new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(32), 32);
    bodyGeo.scale(1, 1, 0.95);
    const body = new THREE.Mesh(bodyGeo, M.feather);
    body.rotation.x = 0.32;
    body.castShadow = body.receiveShadow = true;
    bodyG.add(body);
    const breast = ellipsoid(0.19, 0.22, 0.16, M.feather);
    breast.position.set(0, 0.03, 0.11);
    bodyG.add(breast);
    // tail
    const tail = ellipsoid(0.12, 0.03, 0.16, M.featherWarm);
    tail.position.set(0, -0.2, -0.24);
    tail.rotation.x = -0.5;
    bodyG.add(tail);
    // shoulders
    for (const sx of [-1, 1]) {
      const sh = ellipsoid(0.07, 0.085, 0.09, M.feather);
      sh.position.set(sx * 0.16, 0.1, 0.04);
      bodyG.add(sh);
    }

    // neck
    this.neck = new DynTube(M.feather, 26, 16);
    bodyG.add(this.neck.mesh);
    this.neckBase = new THREE.Vector3(0, 0.2, 0.1);

    const { head, bill, pouch } = makeHead();
    this.head = head;
    this.bill = bill;
    this.pouch = pouch;
    bodyG.add(head);
    this.headRest = new THREE.Vector3(0, 0.6, -0.08);

    // wings
    this.wings = [0, 1].map((h) => {
      const sx = handSide(h);
      const w = makeWing(sx);
      bodyG.add(w.upper, w.fore);
      w.sx = sx;
      w.shoulder = new THREE.Vector3(sx * 0.19, 0.12, 0.1);
      return w;
    });

    // legs live in hub space (pedals are there)
    this.legs = [0, 1].map((h) => {
      const sx = handSide(h);
      const l = makeLeg();
      const foot = makeFoot(sx);
      hubG.add(l.thigh, l.shin, foot);
      return { ...l, foot, sx, hip: new THREE.Vector3(sx * 0.105, -0.2, -0.03) };
    });

    // smoothed state
    this.look = { yaw: 0, pitch: 0, vy: 0, vp: 0 };
    this.sway = new THREE.Vector3();
    this.swayV = new THREE.Vector3();
    this.prevHeadW = null;
    this.prevHeadV = new THREE.Vector3();

    this._v = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3());
    this._q = new THREE.Quaternion();
  }

  // lookTarget: body-local point the pelican watches (or null)
  update(t, dt, pose, lookTarget) {
    const [S, T, E, W, tmp, hint, a, b] = this._v;
    dt = Math.max(0, Math.min(dt, 1 / 20));

    // ---- head look with a critically damped spring
    const L = this.look;
    let tyaw = 0,
      tpitch = 0.25;
    if (lookTarget) {
      tmp.subVectors(lookTarget, this.headRest);
      tyaw = Math.atan2(tmp.x, tmp.z) * 0.35;
      tpitch = -Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)) * 0.5 + 0.05;
    }
    tyaw = THREE.MathUtils.clamp(tyaw, -0.7, 0.7);
    tpitch = THREE.MathUtils.clamp(tpitch, -0.3, 0.4);
    const w = 9;
    const nSub = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / nSub;
    for (let i = 0; i < nSub; i++) {
      L.vy += (w * w * (tyaw - L.yaw) - 2 * w * L.vy) * h;
      L.vp += (w * w * (tpitch - L.pitch) - 2 * w * L.vp) * h;
      L.yaw += L.vy * h;
      L.pitch += L.vp * h;
    }

    // head nods with each catch, bobs with the pedal stroke
    const catchK = catchImpulse(0, t) + catchImpulse(1, t);
    const headPos = tmp
      .copy(this.headRest)
      .add(a.set(Math.sin(L.yaw) * 0.04, -0.035 * L.pitch - 0.012 * catchK, 0.03 - 0.06 * L.pitch));
    this.head.position.copy(headPos);
    this.head.rotation.set(L.pitch + 0.05 * catchK, L.yaw, -0.25 * L.yaw + 0.04 * Math.sin(t * 1.7), 'YXZ');

    // ---- neck: S-curve from shoulders up to the back of the head
    const p0 = this.neckBase;
    const p3 = b.set(0, -0.045, -0.045).applyEuler(this.head.rotation).add(headPos);
    const p1 = new THREE.Vector3(0, 0.33, 0.25);
    const p2 = new THREE.Vector3(p3.x * 0.6, p3.y - 0.18, p3.z - 0.12);
    const bez = new THREE.CubicBezierCurve3(p0.clone(), p1, p2, p3.clone());
    this.neck.update(
      (u, out) => bez.getPoint(u, out),
      (u) => 0.105 * (1 - u) + 0.056 * u + 0.012 * Math.sin(Math.PI * u),
    );

    // ---- pouch jiggle: driven by the head's acceleration (in head space)
    this.head.updateWorldMatrix(true, false);
    const hw = a.setFromMatrixPosition(this.head.matrixWorld);
    if (this.prevHeadW && dt > 0) {
      const v = hint.subVectors(hw, this.prevHeadW).divideScalar(dt);
      const acc = E.subVectors(v, this.prevHeadV).divideScalar(dt);
      this.prevHeadV.copy(v);
      this._q.setFromRotationMatrix(this.head.matrixWorld).invert();
      acc.applyQuaternion(this._q).clampLength(0, 25);
      const k = 160,
        c = 9;
      for (let i = 0; i < nSub; i++) {
        this.swayV.x += (-k * this.sway.x - c * this.swayV.x - acc.x * 0.3) * h;
        this.swayV.y += (-k * this.sway.y - c * this.swayV.y - acc.y * 0.22) * h;
        this.swayV.z += (-k * this.sway.z - c * this.swayV.z - acc.z * 0.22) * h;
        this.sway.addScaledVector(this.swayV, h).clampLength(0, 0.025);
      }
    }
    if (!this.prevHeadW) this.prevHeadW = new THREE.Vector3();
    this.prevHeadW.copy(hw);
    this.pouch.update(this.sway);

    // ---- wings: two-bone IK from shoulder to the grip in each hand
    for (let h = 0; h < 2; h++) {
      const wg = this.wings[h];
      const sx = wg.sx;
      handLocal(h, t, T);
      S.copy(wg.shoulder);
      const thr = throwImpulse(h, t);
      const cat = catchImpulse(h, t);
      hint.set(sx * 1.0, -0.7, -0.35);
      solveTwoBone(S, T, ARM1, ARM2, hint, E, W);
      // trailing feathers hang down and back from the arm
      const trail = tmp.set(sx * 0.25, -1, -0.5);
      placeSegment(wg.upper, S, E, trail);
      placeSegment(wg.fore, E, W, trail);
      // hand feathers fan like fingers round the pin's neck; flare on a throw
      const spread = 0.13 + 0.12 * thr;
      for (let i = 0; i < wg.primaries.length; i++) {
        const f = wg.primaries[i];
        const ang = 0.25 + i * spread - 0.5 * thr + 0.25 * cat;
        f.rotation.set(0.1 * sx * (i - 3) * (0.3 + thr), 0, -ang, 'XYZ');
        f.position.set(0.012 * i, -0.01 * i, 0);
      }
      for (let i = 0; i < wg.secondaries.length; i++) {
        wg.secondaries[i].rotation.x = 0.25 * thr * Math.sin(i);
      }
    }

    // ---- legs: hips (body space) to the pedals (hub space)
    this.bodyG.updateWorldMatrix(true, false);
    this.hubG.updateWorldMatrix(true, false);
    for (let h = 0; h < 2; h++) {
      const lg = this.legs[h];
      const sx = lg.sx;
      const c0 = sx < 0 ? 0 : Math.PI;
      const c = pose.wheel + c0;
      // pedal centre in hub space
      const px = sx * (PEDAL_X + 0.005),
        py = -CRANK * Math.cos(c),
        pz = -CRANK * Math.sin(c);
      // ankling: toes dip a little through the down stroke
      const ank = 0.18 * Math.sin(c) - 0.05;
      lg.foot.position.set(px, py + 0.014, pz - 0.045);
      lg.foot.rotation.set(ank, sx * -0.12, 0, 'YXZ');
      const ankle = T.set(0, 0.035, 0.0).applyEuler(lg.foot.rotation).add(lg.foot.position);
      const hip = S.copy(lg.hip);
      this.bodyG.localToWorld(hip);
      this.hubG.worldToLocal(hip);
      hint.set(sx * 0.25, 0.1, 1);
      solveTwoBone(hip, ankle, THIGH, SHIN, hint, E, W);
      placeSegment(lg.thigh, hip, E, a.set(sx, 0, 0));
      placeSegment(lg.shin, E, W, a.set(sx, 0, 0));
    }
  }
}
