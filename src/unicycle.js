import * as THREE from 'three';
import { WHEEL_R, CRANK, PEDAL_X, PIN_GRIP } from './motion.js';

const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8dc, metalness: 0.95, roughness: 0.22 });
const paint = new THREE.MeshStandardMaterial({ color: 0xc81e2c, metalness: 0.35, roughness: 0.3 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.85 });
const saddleMat = new THREE.MeshStandardMaterial({ color: 0x2a1c18, roughness: 0.55 });
const pedalMat = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.6, metalness: 0.4 });

function shadowed(m) {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// wheelSpin: rotates with the wheel. frameG: pitches about the hub.
export function buildUnicycle(wheelSpin, frameG) {
  const TUBE = 0.032;
  const tire = shadowed(new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - TUBE, TUBE, 14, 64), rubber));
  tire.rotation.y = Math.PI / 2;
  wheelSpin.add(tire);
  const rim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - TUBE - 0.018, 0.012, 8, 64), chrome));
  rim.rotation.y = Math.PI / 2;
  wheelSpin.add(rim);
  // painted rim band makes the rotation easy to read
  const band = shadowed(
    new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - TUBE - 0.03, 0.009, 6, 64, Math.PI * 0.6), paint),
  );
  band.rotation.y = Math.PI / 2;
  wheelSpin.add(band);
  const hub = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.09, 16), chrome));
  hub.rotation.z = Math.PI / 2;
  wheelSpin.add(hub);
  const axle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 8), chrome));
  axle.rotation.z = Math.PI / 2;
  wheelSpin.add(axle);
  // spokes from alternating flanges
  const spokeR = WHEEL_R - TUBE - 0.022;
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const fx = (i % 2 ? 1 : -1) * 0.035;
    const from = new THREE.Vector3(fx, 0.026 * Math.cos(a + 0.4), 0.026 * Math.sin(a + 0.4));
    const to = new THREE.Vector3(0, spokeR * Math.cos(a), spokeR * Math.sin(a));
    const len = from.distanceTo(to);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, len, 4), chrome);
    s.position.copy(from).add(to).multiplyScalar(0.5);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    s.castShadow = true;
    wheelSpin.add(s);
  }
  // cranks and pedals (pedals counter-rotate to stay level)
  const pedals = [];
  for (const sx of [-1, 1]) {
    const c0 = sx < 0 ? 0 : Math.PI;
    const crank = new THREE.Group();
    crank.rotation.x = c0;
    const arm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.018, CRANK + 0.03, 0.026), chrome));
    arm.position.set(sx * 0.085, -CRANK / 2, 0);
    crank.add(arm);
    wheelSpin.add(crank);
    const pedal = new THREE.Group();
    pedal.position.set(0, -CRANK, 0);
    crank.add(pedal);
    const spindle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 6), chrome));
    spindle.rotation.z = Math.PI / 2;
    spindle.position.x = sx * 0.1;
    pedal.add(spindle);
    const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 0.085), pedalMat));
    body.position.x = sx * PEDAL_X;
    pedal.add(body);
    pedals.push({ pedal, c0 });
  }

  // frame: fork legs, crown, seatpost, saddle
  for (const sx of [-1, 1]) {
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.37, 10), paint));
    leg.position.set(sx * 0.058, 0.185, 0);
    frameG.add(leg);
    const bearing = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 12), chrome));
    bearing.rotation.z = Math.PI / 2;
    bearing.position.set(sx * 0.058, 0, 0);
    frameG.add(bearing);
  }
  const crown = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.05), paint));
  crown.position.y = 0.375;
  frameG.add(crown);
  const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.24, 10), chrome));
  post.position.y = 0.49;
  frameG.add(post);
  const saddle = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), saddleMat));
  saddle.scale.set(0.075, 0.028, 0.14);
  saddle.position.set(0, 0.615, 0.0);
  frameG.add(saddle);
  const handle = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.008, 6, 12, Math.PI), saddleMat));
  handle.position.set(0, 0.62, 0.14);
  handle.rotation.y = Math.PI / 2;
  frameG.add(handle);

  return {
    update(wheelAngle) {
      for (const p of pedals) p.pedal.rotation.x = -wheelAngle - p.c0;
    },
  };
}

// Bowling pin (lathe), origin at its centre of mass, head towards +y.
export function buildPin() {
  const S = 0.9;
  const prof = [
    [0.0, 0],
    [0.026, 0.0],
    [0.04, 0.018],
    [0.054, 0.06],
    [0.06, 0.1],
    [0.058, 0.135],
    [0.05, 0.172],
    [0.036, 0.212],
    [0.025, 0.245],
    [0.0215, 0.268],
    [0.024, 0.292],
    [0.03, 0.322],
    [0.031, 0.345],
    [0.027, 0.364],
    [0.016, 0.377],
    [0.0, 0.381],
  ].map(([r, y]) => new THREE.Vector2(r * S, y * S));
  const pts = new THREE.SplineCurve(prof).getPoints(60);
  pts[0].set(0, 0);
  pts[pts.length - 1].set(0, prof[prof.length - 1].y);
  const geo = new THREE.LatheGeometry(pts, 28);
  const comY = 0.13 * S;
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const white = new THREE.Color(0xfbfaf5);
  const red = new THREE.Color(0xd0142a);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / S;
    const isRed = (y > 0.25 && y < 0.262) || (y > 0.274 && y < 0.286);
    const c = isRed ? red : white;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.translate(0, -comY, 0);
  // sanity: the grip (neck) sits PIN_GRIP above the centre of mass
  void PIN_GRIP;
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
