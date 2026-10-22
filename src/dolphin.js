import * as THREE from 'three';

// Procedural, slightly cartoony dolphin. Nose points to -Z, back is +Y.
const TOP = new THREE.Color('#2a64b0');
const MID = new THREE.Color('#4f90d4');
const BELLY = new THREE.Color('#f6ece6');

const PROF_T = [0, 0.05, 0.1, 0.17, 0.3, 0.45, 0.6, 0.75, 0.9, 1.0];
const PROF_R = [0.04, 0.08, 0.12, 0.27, 0.4, 0.42, 0.35, 0.21, 0.11, 0.07];
function radiusAt(t) {
  // t: 0 = tip of the beak, 1 = tail stock; cosine-interpolated profile
  for (let i = 0; i < PROF_T.length - 1; i++) {
    if (t <= PROF_T[i + 1]) {
      const u = (t - PROF_T[i]) / (PROF_T[i + 1] - PROF_T[i]);
      const w = (1 - Math.cos(u * Math.PI)) * 0.5;
      return PROF_R[i] + (PROF_R[i + 1] - PROF_R[i]) * w;
    }
  }
  return PROF_R[PROF_R.length - 1];
}

function colorize(geo, yMin, yMax) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = (pos.getY(i) - yMin) / (yMax - yMin);
    if (y > 0.55) c.copy(MID).lerp(TOP, Math.min(1, (y - 0.55) / 0.3));
    else c.copy(BELLY).lerp(MID, Math.max(0, (y - 0.32) / 0.23));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function latheSection(t0, t1, length, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    pts.push(new THREE.Vector2(Math.max(0.001, radiusAt(t)), -t * length));
  }
  // close caps
  pts.unshift(new THREE.Vector2(0.001, -t0 * length + 0.001));
  pts.push(new THREE.Vector2(0.001, -t1 * length - 0.001));
  const g = new THREE.LatheGeometry(pts, 28);
  // lathe runs along -Y from nose; rotate so it runs along +Z (nose at origin, tail toward +Z)
  g.rotateX(-Math.PI / 2);
  g.scale(0.92, 1, 1);
  return g;
}

function finShape(points) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 2) s.quadraticCurveTo(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
  return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 10 });
}

export function createDolphin() {
  const L = 3.0;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 });
  const finMat = new THREE.MeshStandardMaterial({ color: TOP, roughness: 0.4, side: THREE.DoubleSide });

  const root = new THREE.Group(); // positioned/rotated by the game, centre of mass
  const body = new THREE.Group();
  body.position.z = -L * 0.42; // so root sits near the middle
  root.add(body);

  const front = latheSection(0, 0.68, L, 40);
  colorize(front, -0.45, 0.45);
  const frontMesh = new THREE.Mesh(front, mat);
  body.add(frontMesh);

  // tail pivot for the up-down swimming motion
  const tail = new THREE.Group();
  tail.position.z = 0.66 * L;
  body.add(tail);
  const tailGeo = latheSection(0.66, 1.0, L, 16);
  tailGeo.translate(0, 0, -0.66 * L);
  colorize(tailGeo, -0.45, 0.45);
  tail.add(new THREE.Mesh(tailGeo, mat));

  const tail2 = new THREE.Group();
  tail2.position.z = 0.34 * L - 0.02;
  tail.add(tail2);
  const fluke = finShape([[0, 0], [0.35, 0.05], [0.62, 0.42], [0.35, 0.2], [0.0, 0.18], [-0.35, 0.2], [-0.62, 0.42], [-0.35, 0.05], [0, 0]]);
  fluke.rotateX(Math.PI / 2);
  fluke.translate(0, 0.025, -0.05);
  tail2.add(new THREE.Mesh(fluke, finMat));

  const dorsal = finShape([[0, 0], [0.15, 0.25], [0.45, 0.5], [0.35, 0.2], [0.6, 0], [0.3, 0], [0, 0]]);
  dorsal.rotateY(-Math.PI / 2);
  dorsal.translate(0.025, 0.36, 1.2);
  body.add(new THREE.Mesh(dorsal, finMat));

  for (const side of [-1, 1]) {
    const pec = finShape([[0, 0], [0.25, 0.0], [0.5, 0.25], [0.2, 0.2], [0.0, 0.2], [0, 0.1], [0, 0]]);
    pec.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(pec, finMat);
    m.scale.x = side;
    m.rotation.z = -side * 0.6;
    m.position.set(side * 0.26, -0.2, 0.8);
    body.add(m);
  }

  // eyes + a little shine, for charm
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#1b1b2a', roughness: 0.15 });
  const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), eyeMat);
    eye.position.set(side * 0.2, 0.05, 0.42);
    body.add(eye);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), shineMat);
    shine.position.set(side * 0.235, 0.075, 0.41);
    body.add(shine);
  }

  // soft blush cheeks (cozy!)
  const blush = new THREE.MeshBasicMaterial({ color: '#ff9fb0', transparent: true, opacity: 0.55, depthWrite: false });
  for (const side of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), blush);
    b.position.set(side * 0.215, -0.04, 0.36);
    b.rotation.y = side * Math.PI * 0.42;
    body.add(b);
  }

  let phase = 0;
  function animate(dt, speed, intensity = 1) {
    phase += dt * (3 + speed * 0.35);
    const a = Math.sin(phase) * 0.22 * intensity;
    tail.rotation.x = a;
    tail2.rotation.x = Math.sin(phase - 0.9) * 0.35 * intensity;
    frontMesh.rotation.x = -a * 0.15;
  }

  return { root, animate };
}
