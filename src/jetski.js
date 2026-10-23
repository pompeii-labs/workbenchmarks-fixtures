import * as THREE from 'three';

// Box deformed into a pointed, V-bottomed hull. Local +Z is forward.
function hullGeometry(w, h, L, { vee = 0, rise = 0, topDrop = 0, taperStart = 0.55, tip = 0.92 } = {}) {
  const g = new THREE.BoxGeometry(w, h, L, 4, 2, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    const z = p.getZ(i);
    const t = (z + L / 2) / L; // 0 = stern, 1 = bow
    const xn = x / (w / 2);
    let ws = 1;
    if (t > taperStart) ws = 1 - Math.pow((t - taperStart) / (1 - taperStart), 1.6) * tip;
    if (t < 0.05) ws *= 0.94;
    x *= ws;
    if (y < 0) {
      y -= (1 - Math.abs(xn)) * vee;
      if (t > 0.45) y += Math.pow((t - 0.45) / 0.55, 2) * rise;
    } else if (t > 0.6) {
      y -= Math.pow((t - 0.6) / 0.4, 1.3) * topDrop;
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function limb(a, b, r, mat) {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len), 4, 10);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  return m;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function createJetSki() {
  const root = new THREE.Group();
  const body = new THREE.Group(); // bob / draft offset
  root.add(body);

  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.35, metalness: 0.05, flatShading: true });
  const paint = new THREE.MeshStandardMaterial({ color: 0xff2d6f, roughness: 0.25, metalness: 0.2, flatShading: true });
  const paint2 = new THREE.MeshStandardMaterial({ color: 0x1ad1c8, roughness: 0.3, metalness: 0.2, flatShading: true });
  const black = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd6dd, roughness: 0.15, metalness: 0.9 });

  const hull = new THREE.Mesh(hullGeometry(1.2, 0.5, 3.2, { vee: 0.18, rise: 0.4, taperStart: 0.5 }), white);
  hull.position.y = 0.3;
  body.add(hull);

  const stripeL = new THREE.Mesh(hullGeometry(1.24, 0.08, 3.0, { taperStart: 0.5 }), paint2);
  stripeL.position.set(0, 0.5, 0.02);
  body.add(stripeL);

  const deck = new THREE.Mesh(hullGeometry(1.12, 0.32, 3.05, { topDrop: 0.18, taperStart: 0.45, tip: 0.85 }), paint);
  deck.position.set(0, 0.7, 0.05);
  body.add(deck);

  const hood = new THREE.Mesh(hullGeometry(0.8, 0.3, 1.1, { topDrop: 0.2, taperStart: 0.2, tip: 0.7 }), paint);
  hood.position.set(0, 0.95, 0.85);
  hood.rotation.x = 0.12;
  body.add(hood);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.05), new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.75 }));
  visor.position.set(0, 1.2, 0.55);
  visor.rotation.x = -0.6;
  body.add(visor);

  const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.0, 4, 12), black);
  seat.rotation.x = Math.PI / 2;
  seat.scale.set(1.0, 1, 0.55);
  seat.position.set(0, 0.95, -0.55);
  body.add(seat);

  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.3, 12), chrome);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0.25, -1.65);
  body.add(nozzle);

  // handlebars
  const bars = new THREE.Group();
  bars.position.set(0, 1.12, 0.38);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 8), black);
  column.position.y = -0.1;
  bars.add(column);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), chrome);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 0.05;
  bars.add(bar);
  for (const s of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8), black);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(s * 0.36, 0.05, 0);
    bars.add(grip);
  }
  body.add(bars);

  // rider
  const rider = new THREE.Group();
  rider.position.set(0, 0.95, -0.55);
  body.add(rider);
  const vest = new THREE.MeshStandardMaterial({ color: 0xffa31a, roughness: 0.7 });
  const suit = new THREE.MeshStandardMaterial({ color: 0x1b2a4a, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a07a, roughness: 0.7 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.1 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.05, metalness: 0.8 });

  // positions relative to rider origin (on the seat)
  const hipL = V(0.17, 0.12, 0), hipR = V(-0.17, 0.12, 0);
  const kneeL = V(0.3, 0.2, 0.5), kneeR = V(-0.3, 0.2, 0.5);
  const footL = V(0.36, -0.35, 0.35), footR = V(-0.36, -0.35, 0.35);
  for (const [a, b, c] of [[hipL, kneeL, footL], [hipR, kneeR, footR]]) {
    rider.add(limb(a, b, 0.1, suit));
    rider.add(limb(b, c, 0.085, suit));
  }
  const torso = limb(V(0, 0.2, 0.02), V(0, 0.68, 0.22), 0.2, vest);
  torso.scale.set(1.15, 1, 0.85);
  rider.add(torso);
  const upper = new THREE.Group();
  rider.add(upper);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), helmetMat);
  head.position.set(0, 1.0, 0.36);
  upper.add(head);
  const hv = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 8, Math.PI / 2 - 1.0, 2.0, 1.15, 0.8), visorMat);
  hv.position.copy(head.position).add(V(0, 0.0, 0.04));
  upper.add(hv);
  const shoulderL = V(0.24, 0.78, 0.26), shoulderR = V(-0.24, 0.78, 0.26);
  const handL = V(0.36, 0.22 + 0.05, 0.93), handR = V(-0.36, 0.22 + 0.05, 0.93);
  const elbowL = V(0.36, 0.5, 0.62), elbowR = V(-0.36, 0.5, 0.62);
  upper.add(limb(shoulderL, elbowL, 0.075, vest));
  upper.add(limb(shoulderR, elbowR, 0.075, vest));
  upper.add(limb(elbowL, handL, 0.06, skin));
  upper.add(limb(elbowR, handR, 0.06, skin));

  body.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  root.userData = { body, bars, rider, upper };
  return root;
}
