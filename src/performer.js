// The performer: a pelican, its unicycle and three bowling pins, all modelled
// from primitives and posed every frame from the pure functions in act.js.
import * as THREE from 'three';
import {
  CRANK,
  PEDAL_X,
  SEAT_H,
  WHEEL_R,
  handTarget,
  pinState,
  rig,
  solveJoint,
} from './act.js';

const V3 = THREE.Vector3;

// ---- proportions (torso frame: origin on the saddle, +Z forward, +X left) ----
export const SHOULDER = new V3(0.22, 0.44, 0.14);
export const HIP = new V3(0.12, 0.1, 0.03);
export const WING_UPPER = 0.47;
export const WING_FORE = 0.47;
export const THIGH = 0.33;
export const SHIN = 0.39;
export const ANKLE_LOCAL = new V3(0, 0.05, -0.02); // above the pedal centre
const NECK_BASE = new V3(0, 0.5, 0.12);
const HEAD_LOCAL = new V3(0, 0.45, 0.07); // relative to the neck base

// ---- materials -----------------------------------------------------------------
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
const M = {
  feather: mat(0xf6f1e6, { roughness: 0.85 }),
  featherShade: mat(0xe6dccb, { roughness: 0.9 }),
  flight: mat(0x26232a, { roughness: 0.7, side: THREE.DoubleSide }),
  covert: mat(0xf2ecdf, { roughness: 0.85, side: THREE.DoubleSide }),
  bill: mat(0xf2a23a, { roughness: 0.45 }),
  billTip: mat(0xd9482b, { roughness: 0.4 }),
  pouch: mat(0xf7b53c, { roughness: 0.5, side: THREE.DoubleSide }),
  leg: mat(0xf08a2c, { roughness: 0.55 }),
  web: mat(0xf59a3a, { roughness: 0.6, side: THREE.DoubleSide }),
  eye: mat(0x14110f, { roughness: 0.15 }),
  eyeRing: mat(0xf4c64a, { roughness: 0.5 }),
  tyre: mat(0x1b1b20, { roughness: 0.9 }),
  chrome: mat(0xc9ced6, { roughness: 0.25, metalness: 0.9 }),
  frame: mat(0xc8242e, { roughness: 0.35, metalness: 0.3 }),
  saddle: mat(0x1c1a22, { roughness: 0.6 }),
  pedal: mat(0x2b2b33, { roughness: 0.6 }),
  pin: mat(0xfbf8f1, { roughness: 0.28 }),
  pinStripe: mat(0xd3222c, { roughness: 0.3 }),
};

function mesh(geo, material, parent, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  parent?.add(m);
  return m;
}

// A unit-length cylinder along +Y, stretched between two points each frame.
const _dir = new V3();
const _up = new V3(0, 1, 0);
function placeLimb(m, a, b) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  m.position.copy(a).addScaledVector(_dir, 0.5);
  m.quaternion.setFromUnitVectors(_up, _dir.multiplyScalar(1 / len));
  m.scale.y = len;
}

// ---- bowling pin ---------------------------------------------------------------
// Real pin proportions (38 cm tall, 12 cm at the belly). The origin is the
// centre of mass; the neck, where a wing holds it, is toward -Y.
const PIN_SCALE = 1.25; // a touch oversized, so the pattern reads from the back row
function buildPin() {
  const prof = [
    [0.0, 0.0],
    [0.026, 0.0],
    [0.031, 0.012],
    [0.045, 0.055],
    [0.058, 0.1],
    [0.0605, 0.125],
    [0.057, 0.16],
    [0.045, 0.205],
    [0.03, 0.245],
    [0.0235, 0.275],
    [0.023, 0.295],
    [0.028, 0.325],
    [0.0325, 0.345],
    [0.03, 0.365],
    [0.02, 0.377],
    [0.0, 0.381],
  ];
  const COM = 0.15; // height of the centre of mass above the base
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y - COM));
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(PIN_SCALE);
  outer.add(inner);
  const g = inner;
  const body = mesh(new THREE.LatheGeometry(pts, 20), M.pin, g);
  body.rotation.x = Math.PI; // head (neck end) toward -Y
  for (const y of [0.262, 0.283]) {
    const stripe = mesh(new THREE.CylinderGeometry(0.0262, 0.0262, 0.011, 20, 1, true), M.pinStripe, g, false);
    stripe.position.y = -(y - COM);
  }
  return outer;
}

// ---- unicycle ----------------------------------------------------------------
function buildUnicycle() {
  const frame = new THREE.Group(); // origin at the hub
  frame.matrixAutoUpdate = false;
  const wheel = new THREE.Group();
  frame.add(wheel);

  const tyreR = 0.03;
  const tyre = mesh(new THREE.TorusGeometry(WHEEL_R - tyreR, tyreR, 12, 48), M.tyre, wheel);
  tyre.rotation.y = Math.PI / 2;
  const rim = mesh(new THREE.TorusGeometry(WHEEL_R - tyreR * 2.1, 0.012, 8, 48), M.chrome, wheel);
  rim.rotation.y = Math.PI / 2;
  // A white valve-side patch on the tyre makes the rolling easy to read.
  const patch = mesh(new THREE.BoxGeometry(0.066, 0.02, 0.09), mat(0xf4efe2), wheel, false);
  patch.position.y = -(WHEEL_R - 0.012);

  const hub = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 12), M.chrome, wheel);
  hub.rotation.z = Math.PI / 2;
  const spokeGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 1, 5);
  const SPOKES = 16;
  const a = new V3();
  const b = new V3();
  for (let i = 0; i < SPOKES; i++) {
    const ang = (i / SPOKES) * Math.PI * 2;
    const side = i % 2 ? 1 : -1;
    const sp = mesh(spokeGeo, M.chrome, wheel, false);
    a.set(side * 0.04, 0, 0);
    b.set(0, Math.cos(ang) * (WHEEL_R - 0.065), Math.sin(ang) * (WHEEL_R - 0.065));
    placeLimb(sp, a, b);
  }

  // Axle, cranks and pedals. Left crank points along the wheel's +Y.
  const axle = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), M.chrome, wheel);
  axle.rotation.z = Math.PI / 2;
  const pedals = [];
  for (const side of [1, -1]) {
    const crank = mesh(new THREE.BoxGeometry(0.016, CRANK + 0.03, 0.026), M.chrome, wheel);
    crank.position.set(side * 0.095, (side * CRANK) / 2, 0);
    const pedal = new THREE.Group();
    pedal.position.set(side * PEDAL_X, side * CRANK, 0);
    wheel.add(pedal);
    mesh(new THREE.BoxGeometry(0.1, 0.022, 0.085), M.pedal, pedal);
    const spindle = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.06, 6), M.chrome, pedal, false);
    spindle.rotation.z = Math.PI / 2;
    spindle.position.x = -side * 0.045;
    pedal.add(buildFoot(side));
    pedals.push(pedal);
  }

  // Fork, seat post and saddle (these lean with the rider).
  const tube = new THREE.CylinderGeometry(0.014, 0.014, 1, 10);
  const crownY = WHEEL_R + 0.045;
  for (const side of [1, -1]) {
    const leg = mesh(tube, M.frame, frame);
    placeLimb(leg, a.set(side * 0.062, 0, 0), b.set(side * 0.05, crownY, 0));
    const cap = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 12), M.frame, frame);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(side * 0.064, 0, 0);
  }
  const crown = mesh(new THREE.BoxGeometry(0.13, 0.03, 0.04), M.frame, frame);
  crown.position.y = crownY;
  const post = mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 10), M.chrome, frame);
  placeLimb(post, a.set(0, crownY, 0), b.set(0, SEAT_H - 0.03, 0));
  // Banana saddle: a bent, flattened capsule.
  const saddleGeo = new THREE.CapsuleGeometry(0.055, 0.17, 6, 14);
  saddleGeo.rotateX(Math.PI / 2);
  const pos = saddleGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    pos.setY(i, pos.getY(i) * 0.55 + z * z * 2.6);
    pos.setX(i, pos.getX(i) * (1.25 - z * 1.6));
  }
  saddleGeo.computeVertexNormals();
  const saddle = mesh(saddleGeo, M.saddle, frame);
  saddle.position.y = SEAT_H - 0.035;

  return { frame, wheel, pedals };
}

// ---- pelican parts ---------------------------------------------------------------
// A big webbed foot: three toes joined by scalloped webbing, flat on the pedal.
function buildFoot(side) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  const toes = [
    [-0.085 * 1, 0.15],
    [0, 0.19],
    [0.085, 0.15],
  ];
  s.moveTo(-0.022, -0.04);
  s.lineTo(toes[0][0], toes[0][1]);
  s.quadraticCurveTo(-0.04, 0.135, toes[1][0], toes[1][1]);
  s.quadraticCurveTo(0.04, 0.135, toes[2][0], toes[2][1]);
  s.lineTo(0.022, -0.04);
  s.closePath();
  const webGeo = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false, curveSegments: 8 });
  webGeo.rotateX(Math.PI / 2); // shape XY -> XZ, toes toward +Z
  const web = mesh(webGeo, M.web, g);
  web.position.y = 0.022;
  const toeGeo = new THREE.CylinderGeometry(0.008, 0.012, 1, 6);
  const a = new V3(0, 0.024, -0.02);
  const b = new V3();
  for (const [x, z] of toes) {
    const toe = mesh(toeGeo, M.leg, g);
    placeLimb(toe, a, b.set(x, 0.022, z));
    const claw = mesh(new THREE.SphereGeometry(0.011, 6, 5), M.leg, g, false);
    claw.position.copy(b);
  }
  const ankle = mesh(new THREE.SphereGeometry(0.026, 10, 8), M.leg, g);
  ankle.position.copy(ANKLE_LOCAL);
  g.rotation.y = side * 0.22; // toes turned out a little
  return g;
}

// The throat pouch: a deep, sagging sac slung under the whole length of the bill.
function buildPouch(len) {
  const NU = 22;
  const NV = 12;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    // Deepest about a third of the way out, tapering to nothing at the tip.
    const depth = 0.155 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.85) + 0.004;
    const half = 0.052 * (1 - u) + 0.008;
    for (let j = 0; j <= NV; j++) {
      const a = (j / NV) * Math.PI;
      const bulge = 1 + 0.5 * Math.sin(a) * Math.sin(Math.PI * u);
      pos.push(-Math.cos(a) * half * bulge, -Math.sin(a) * depth, u * len);
    }
  }
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const p = i * (NV + 1) + j;
      idx.push(p, p + NV + 1, p + 1, p + 1, p + NV + 1, p + NV + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function buildHead() {
  const head = new THREE.Group();
  const skull = mesh(new THREE.SphereGeometry(0.1, 24, 18), M.feather, head);
  skull.scale.set(0.92, 0.95, 1.12);
  // Shaggy little crest at the back of the head.
  for (let i = 0; i < 5; i++) {
    const tuft = mesh(new THREE.ConeGeometry(0.02, 0.1, 6), M.feather, head);
    tuft.position.set((i - 2) * 0.016, 0.055 - Math.abs(i - 2) * 0.008, -0.095);
    tuft.rotation.x = -2.05 + Math.abs(i - 2) * 0.12;
    tuft.rotation.z = (i - 2) * -0.16;
  }
  for (const side of [1, -1]) {
    const ring = mesh(new THREE.SphereGeometry(0.03, 12, 10), M.eyeRing, head, false);
    ring.position.set(side * 0.072, 0.03, 0.055);
    ring.scale.set(0.5, 1, 1);
    const eye = mesh(new THREE.SphereGeometry(0.017, 12, 10), M.eye, head, false);
    eye.position.set(side * 0.083, 0.032, 0.058);
  }

  // Bill: pitched well down, the way a pelican carries it.
  const BILL = 0.5;
  const bill = new THREE.Group();
  bill.position.set(0, -0.012, 0.075);
  bill.rotation.x = 1.0;
  head.add(bill);

  // Upper mandible: long, flat, tapering, with the hooked nail at the tip.
  const upperGeo = new THREE.CylinderGeometry(0.4, 1, BILL, 14, 6);
  upperGeo.translate(0, BILL / 2, 0);
  upperGeo.rotateX(Math.PI / 2); // along +Z, base at the face
  const up = upperGeo.attributes.position;
  for (let i = 0; i < up.count; i++) {
    const y = up.getY(i);
    up.setX(i, up.getX(i) * 0.05);
    up.setY(i, y > 0 ? y * 0.03 : y * 0.012); // domed above, flat below
  }
  upperGeo.computeVertexNormals();
  mesh(upperGeo, M.bill, bill);
  const nail = mesh(new THREE.ConeGeometry(0.02, 0.06, 8), M.billTip, bill);
  nail.position.set(0, -0.012, BILL + 0.004);
  nail.rotation.x = 2.5;
  const ridge = mesh(new THREE.CylinderGeometry(0.006, 0.011, BILL * 0.96, 6), M.billTip, bill, false);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.set(0, 0.02, BILL * 0.48);
  ridge.scale.x = 1.3;

  // Lower jaw: two thin rami along the pouch's edge, hinged at the face.
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.014, 0);
  bill.add(jaw);
  const ramusGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 1, 6);
  for (const side of [1, -1]) {
    const r = mesh(ramusGeo, M.bill, jaw);
    placeLimb(r, new V3(side * 0.058, 0, 0), new V3(side * 0.008, 0, BILL * 0.985));
  }
  const pouch = mesh(buildPouch(BILL * 0.985), M.pouch, jaw);
  return { head, jaw, pouch, bill };
}

// A wing segment: white coverts along the bone, black flight feathers trailing.
function buildWingPanel(len, chord, tipChord, feathers) {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  const flight = new THREE.Shape();
  flight.moveTo(0, 0.01);
  flight.lineTo(len, 0.01);
  for (let i = feathers; i > 0; i--) {
    const x1 = (i / feathers) * len;
    const x0 = ((i - 1) / feathers) * len;
    const c1 = THREE.MathUtils.lerp(chord, tipChord, i / feathers);
    const c0 = THREE.MathUtils.lerp(chord, tipChord, (i - 1) / feathers);
    flight.lineTo(x1, -c1 * 0.86);
    flight.quadraticCurveTo(x1 - (x1 - x0) * 0.2, -c1 * 1.04, (x0 + x1) / 2, -(c0 + c1) / 2);
    flight.quadraticCurveTo(x0 + (x1 - x0) * 0.1, -c0 * 0.98, x0, -c0 * 0.86);
  }
  flight.closePath();
  const flightGeo = new THREE.ExtrudeGeometry(flight, { depth: 0.006, bevelEnabled: false, curveSegments: 4 });
  mesh(flightGeo, M.flight, g);
  // Two more, splayed either side: layered feathers give the wing some depth,
  // so it never thins to a line when seen edge-on.
  for (const tiltX of [0.75, -0.75]) {
    const layer = mesh(flightGeo, tiltX > 0 ? M.covert : M.flight, g);
    layer.rotation.x = tiltX;
    layer.scale.y = 0.62;
  }

  const cov = new THREE.Shape();
  cov.moveTo(-0.02, 0.02);
  cov.lineTo(len + 0.01, 0.02);
  const n = feathers;
  for (let i = n; i > 0; i--) {
    const x1 = (i / n) * len;
    const x0 = ((i - 1) / n) * len;
    const c = THREE.MathUtils.lerp(chord, tipChord, (i - 0.5) / n) * 0.52;
    cov.quadraticCurveTo((x0 + x1) / 2, -c * 1.25, x0, -c);
  }
  cov.closePath();
  const covert = mesh(new THREE.ExtrudeGeometry(cov, { depth: 0.014, bevelEnabled: false, curveSegments: 4 }), M.covert, g);
  covert.position.z = -0.004;
  // The bone itself, as a soft feathered roll along the leading edge.
  const roll = mesh(new THREE.CapsuleGeometry(0.046, len, 4, 10), M.feather, g);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(len / 2, 0.012, 0.003);
  roll.scale.z = 0.7;
  return g;
}

// The "hand": a fan of primaries that curls round the neck of the pin.
function buildHand() {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  const s = new THREE.Shape();
  s.moveTo(0, -0.014);
  s.quadraticCurveTo(0.07, -0.024, 0.15, 0);
  s.quadraticCurveTo(0.07, 0.024, 0, 0.014);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.005, bevelEnabled: false, curveSegments: 5 });
  for (let i = 0; i < 5; i++) {
    const f = mesh(geo, M.flight, g);
    f.rotation.z = -0.95 + i * 0.42;
    f.rotation.y = -0.5 + (i - 2) * 0.1;
    f.position.z = i * 0.004 - 0.01;
    f.scale.setScalar(1 - Math.abs(i - 1.5) * 0.1);
  }
  const palm = mesh(new THREE.SphereGeometry(0.036, 10, 8), M.feather, g);
  palm.scale.set(1, 1, 0.75);
  return g;
}

function buildPelican() {
  const torso = new THREE.Group();
  torso.matrixAutoUpdate = false;

  // Heavy body: a deep, broad egg sitting upright on the saddle.
  const bodyGeo = new THREE.SphereGeometry(1, 32, 24);
  const bp = bodyGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i);
    const fat = 1 + 0.2 * Math.max(0, -y) - 0.16 * Math.max(0, y); // pear: heavy below
    bp.setX(i, bp.getX(i) * fat);
    bp.setZ(i, bp.getZ(i) * fat);
  }
  bodyGeo.computeVertexNormals();
  const body = mesh(bodyGeo, M.feather, torso);
  body.scale.set(0.275, 0.315, 0.355);
  body.position.set(0, 0.3, -0.03);
  body.rotation.x = -0.5; // chest up and forward, rump down and back

  // Chest: a soft bulge where the neck rises.
  const chest = mesh(new THREE.SphereGeometry(0.17, 20, 16), M.feather, torso);
  chest.position.set(0, 0.42, 0.12);
  chest.scale.set(1.05, 1, 0.9);

  // Tail: a short fan of feathers.
  for (let i = -2; i <= 2; i++) {
    const tf = mesh(new THREE.ConeGeometry(0.045, 0.24, 6), i % 2 ? M.featherShade : M.feather, torso);
    tf.scale.z = 0.3;
    tf.position.set(i * 0.035, 0.11, -0.33 - (2 - Math.abs(i)) * 0.012);
    tf.rotation.x = -2.0;
    tf.rotation.z = i * 0.2;
  }

  // Neck: an S-curve, thick at the base, carried by a group that sways.
  const neck = new THREE.Group();
  neck.position.copy(NECK_BASE);
  torso.add(neck);
  const curve = new THREE.CatmullRomCurve3([
    new V3(0, -0.1, -0.05),
    new V3(0, 0.03, 0.03),
    new V3(0, 0.15, -0.03),
    new V3(0, 0.29, -0.075),
    new V3(0, 0.4, -0.02),
    HEAD_LOCAL.clone(),
  ]);
  const neckGeo = new THREE.TubeGeometry(curve, 28, 1, 14);
  // Taper the tube: recover each ring's centre and scale the radius.
  const np = neckGeo.attributes.position;
  const c = new V3();
  const p = new V3();
  for (let i = 0; i <= 28; i++) {
    curve.getPointAt(i / 28, c);
    const r = THREE.MathUtils.lerp(0.098, 0.05, Math.pow(i / 28, 0.7));
    for (let j = 0; j <= 14; j++) {
      const k = i * 15 + j;
      p.fromBufferAttribute(np, k).sub(c).multiplyScalar(r).add(c);
      np.setXYZ(k, p.x, p.y, p.z);
    }
  }
  neckGeo.computeVertexNormals();
  mesh(neckGeo, M.feather, neck);

  const { head, jaw, pouch } = buildHead();
  head.position.copy(HEAD_LOCAL);
  neck.add(head);

  return { torso, neck, head, jaw, pouch };
}

// ---- the whole act -----------------------------------------------------------------
export function buildAct(scene) {
  const uni = buildUnicycle();
  const bird = buildPelican();
  scene.add(uni.frame, bird.torso);

  const pins = [0, 1, 2].map(() => {
    const p = buildPin();
    scene.add(p);
    return p;
  });

  // Legs and wings live in world space and are solved every frame.
  const legs = [1, -1].map((side) => {
    const thigh = mesh(new THREE.CylinderGeometry(0.034, 0.1, 1, 14), M.feather, scene);
    const shin = mesh(new THREE.CylinderGeometry(0.024, 0.02, 1, 10), M.leg, scene);
    const knee = mesh(new THREE.SphereGeometry(0.036, 12, 10), M.leg, scene);
    return { side, thigh, shin, knee };
  });
  const wings = [1, -1].map((side) => {
    const upper = buildWingPanel(WING_UPPER, 0.27, 0.25, 6);
    const fore = buildWingPanel(WING_FORE, 0.25, 0.13, 7);
    const hand = buildHand();
    const shoulder = mesh(new THREE.SphereGeometry(0.075, 14, 10), M.feather, scene);
    scene.add(upper, fore, hand);
    return { side, upper, fore, hand, shoulder };
  });

  const R = {};
  const pin = { pos: new V3(), quat: new THREE.Quaternion() };
  const a = new V3();
  const b = new V3();
  const j = new V3();
  const pole = new V3();
  const ex = new V3();
  const ey = new V3();
  const ez = new V3();
  const ref = new V3();
  const look = new V3();
  const inv = new THREE.Matrix4();
  const torsoQ = new THREE.Quaternion();

  // Place a wing panel: origin at `from`, bone along +X, feathers trailing -Y.
  function placePanel(g, from, to, trail) {
    ex.subVectors(to, from).normalize();
    ey.copy(trail).addScaledVector(ex, -trail.dot(ex)).normalize().negate();
    ez.crossVectors(ex, ey);
    g.matrix.makeBasis(ex, ey, ez).setPosition(from);
    g.matrixWorldNeedsUpdate = true;
  }

  function update(t) {
    rig(t, R);
    uni.frame.matrix.copy(R.frame);
    bird.torso.matrix.copy(R.torso);
    torsoQ.setFromRotationMatrix(R.torso);

    // Wheel: rolls without slipping; the frame's own lean is taken back out
    // so the wheel's rotation in the world is exactly distance / radius.
    const wheelRot = R.wheelAngle - R.lean;
    uni.wheel.rotation.x = wheelRot;
    for (let i = 0; i < 2; i++) {
      // Pedals stay roughly level, with a little ankling through the stroke.
      const phase = R.wheelAngle + (i ? Math.PI : 0);
      uni.pedals[i].rotation.x = -wheelRot + 0.3 * Math.sin(phase + 0.6) - 0.08;
    }
    uni.frame.updateMatrixWorld(true);
    bird.torso.updateMatrixWorld(true);

    // Legs: hip on the body, ankle on the pedal, knee out front.
    for (let i = 0; i < 2; i++) {
      const L = legs[i];
      a.set(HIP.x * L.side, HIP.y, HIP.z).applyMatrix4(R.torso);
      b.copy(ANKLE_LOCAL).applyMatrix4(uni.pedals[i].matrixWorld);
      pole.set(L.side * 0.45, 0.25, 1).applyQuaternion(torsoQ);
      solveJoint(a, b, THIGH, SHIN, pole, j);
      placeLimb(L.thigh, a, j);
      placeLimb(L.shin, j, b);
      L.knee.position.copy(j);
    }

    // Pins.
    let wx = 0;
    let wy = 0;
    let wz = 0;
    let wsum = 0;
    for (let p = 0; p < 3; p++) {
      pinState(p, t, pin);
      pins[p].position.copy(pin.pos);
      pins[p].quaternion.copy(pin.quat);
      // The bird watches the pins, mostly whichever is highest.
      const w = Math.exp(3.2 * pin.pos.y);
      wx += pin.pos.x * w;
      wy += pin.pos.y * w;
      wz += pin.pos.z * w;
      wsum += w;
    }

    // Wings: tip on the pin's neck, or reaching for the next one.
    for (let i = 0; i < 2; i++) {
      const W = wings[i];
      a.set(SHOULDER.x * W.side, SHOULDER.y, SHOULDER.z).applyMatrix4(R.torso);
      handTarget(i, t, b);
      pole.set(W.side * 1.0, -0.75, -0.35).applyQuaternion(torsoQ);
      solveJoint(a, b, WING_UPPER, WING_FORE, pole, j);
      ref.set(W.side * 1.0, -0.7, -0.25).applyQuaternion(torsoQ);
      placePanel(W.upper, a, j, ref);
      placePanel(W.fore, j, b, ref);
      // Hand feathers continue the forearm and tip up with it.
      ex.subVectors(b, j).normalize();
      ref.set(0, -1, 0.0).applyQuaternion(torsoQ);
      ey.copy(ref).addScaledVector(ex, -ref.dot(ex)).normalize().negate();
      ez.crossVectors(ex, ey);
      W.hand.matrix.makeBasis(ex, ey, ez).setPosition(b);
      W.hand.matrixWorldNeedsUpdate = true;
      W.shoulder.position.copy(a);
    }

    // Head and neck: follow the pins, counter the body's sway, nod with the
    // throws; the pouch swings a beat behind.
    look.set(wx / wsum, wy / wsum, wz / wsum);
    inv.copy(R.torso).invert();
    look.applyMatrix4(inv);
    const yaw = THREE.MathUtils.clamp(Math.atan2(look.x, look.z + 0.1), -0.6, 0.6);
    const lift = THREE.MathUtils.clamp((look.y - 1.0) * 0.5, -0.2, 0.25);
    const beat = R.beat * Math.PI * 2;
    bird.neck.rotation.set(
      -R.lean * 0.7 - lift * 0.35 + 0.035 * Math.sin(beat - 1.2),
      yaw * 0.25,
      -R.roll * 0.6 - 0.05 * Math.sin(beat / 2 + 0.5),
    );
    bird.head.rotation.set(-lift * 0.9 + 0.045 * Math.sin(beat - 2.0), yaw * 0.75, 0.04 * Math.sin(beat / 2 - 0.3));
    bird.jaw.rotation.x = 0.05 + 0.035 * Math.sin(beat - 2.6);
    bird.pouch.scale.set(1 + 0.07 * Math.sin(beat - 2.9), 1 + 0.09 * Math.sin(beat - 2.4), 1);
    bird.pouch.rotation.z = 0.1 * Math.sin(beat / 2 - 0.6) + R.roll * 1.5;
    return R;
  }

  return { update };
}
