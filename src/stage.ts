import * as THREE from 'three';
import { createSeededRandom } from './utils/random';

export const RING_R = 4.2;

function floorTexture(seed: number, size: number): THREE.CanvasTexture {
  const rng = createSeededRandom(seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const cx = size / 2;
  const scale = size / 2 / (RING_R + 0.4); // canvas pixels per metre; covers the ring
  // Sawdust-on-canvas base.
  const base = g.createRadialGradient(cx, cx, 0, cx, cx, size / 2);
  base.addColorStop(0, '#b98a55');
  base.addColorStop(0.85, '#a87843');
  base.addColorStop(1, '#8a5f33');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 30; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const l = 40 + rng() * 40;
    g.fillStyle = `hsla(${28 + rng() * 10}, 45%, ${l}%, ${0.08 + rng() * 0.12})`;
    g.fillRect(x, y, 1 + rng() * 2.5, 1 + rng() * 1.5);
  }
  // Painted rings and a star, scuffed by use.
  g.lineWidth = 0.06 * scale;
  g.strokeStyle = 'rgba(245, 232, 205, 0.55)';
  for (const r of [1.2, PATH_MARK, RING_R - 0.35]) {
    g.beginPath();
    g.arc(cx, cx, r * scale, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = 'rgba(176, 32, 40, 0.55)';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 ? 0.42 : 1.05) * scale;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  // Alternating tick marks around the riding circle.
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    g.fillStyle = i % 2 ? 'rgba(245,232,205,0.5)' : 'rgba(176,32,40,0.5)';
    g.save();
    g.translate(cx + Math.cos(a) * (RING_R - 0.75) * scale, cx + Math.sin(a) * (RING_R - 0.75) * scale);
    g.rotate(a);
    g.fillRect(-0.12 * scale, -0.04 * scale, 0.24 * scale, 0.08 * scale);
    g.restore();
  }
  // Scuffs.
  for (let i = 0; i < 260; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * RING_R * scale;
    g.fillStyle = `rgba(90, 60, 30, ${0.04 + rng() * 0.06})`;
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 4 + rng() * 14, 2 + rng() * 5, rng() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const PATH_MARK = 2.6 + 0.45;

function stripeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7a1620';
  g.fillRect(0, 0, 32, 4);
  g.fillStyle = '#d9c6a0';
  g.fillRect(32, 0, 32, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export type Stage = {
  group: THREE.Group;
  followSpot: THREE.SpotLight;
  rim: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
};

export function createStage(seed: number, compact: boolean): Stage {
  const group = new THREE.Group();

  // Ring floor.
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(seed, compact ? 1024 : 2048), roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(RING_R + 0.4, 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  // Outer floor, darker.
  const outer = new THREE.Mesh(
    new THREE.RingGeometry(RING_R + 0.4, 30, 96, 1),
    new THREE.MeshStandardMaterial({ color: '#3b2418', roughness: 1 }),
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.002;
  outer.receiveShadow = true;
  group.add(outer);

  // Ring curb: red and cream padded segments.
  const segs = 32;
  const red = new THREE.MeshStandardMaterial({ color: '#b51d2b', roughness: 0.5 });
  const cream = new THREE.MeshStandardMaterial({ color: '#efe1c0', roughness: 0.55 });
  const gold = new THREE.MeshStandardMaterial({ color: '#d9a640', roughness: 0.3, metalness: 0.8 });
  for (let i = 0; i < segs; i++) {
    const profile = [
      new THREE.Vector2(RING_R, 0),
      new THREE.Vector2(RING_R, 0.3),
      new THREE.Vector2(RING_R + 0.05, 0.36),
      new THREE.Vector2(RING_R + 0.4, 0.36),
      new THREE.Vector2(RING_R + 0.45, 0.3),
      new THREE.Vector2(RING_R + 0.45, 0),
    ];
    const len = (Math.PI * 2) / segs;
    const g = new THREE.LatheGeometry(profile, 6, i * len + 0.004, len - 0.008);
    const m = new THREE.Mesh(g, i % 2 ? cream : red);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  const trim = new THREE.Mesh(new THREE.TorusGeometry(RING_R + 0.225, 0.02, 6, 128), gold);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.365;
  group.add(trim);

  // Tiered seating in the dark beyond the ring.
  const steps: THREE.Vector2[] = [new THREE.Vector2(7, 0)];
  for (let i = 0; i < 7; i++) {
    steps.push(new THREE.Vector2(7 + i * 0.9, 0.5 + i * 0.5));
    steps.push(new THREE.Vector2(7 + (i + 1) * 0.9, 0.5 + i * 0.5));
  }
  steps.push(new THREE.Vector2(13.4, 0));
  const stands = new THREE.Mesh(
    new THREE.LatheGeometry(steps, 96),
    new THREE.MeshStandardMaterial({ color: '#3d1a1e', roughness: 0.9, side: THREE.DoubleSide }),
  );
  stands.receiveShadow = true;
  group.add(stands);
  // Barrier wall in front of the seats.
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(6.9, 6.9, 0.9, 96, 1, true),
    new THREE.MeshStandardMaterial({ color: '#5a1a22', roughness: 0.8, side: THREE.DoubleSide }),
  );
  wall.position.y = 0.45;
  group.add(wall);

  // Tent canvas: striped walls and a peaked roof.
  const stripes = stripeTexture();
  stripes.repeat.set(36, 1);
  const tentMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.95, side: THREE.BackSide });
  const tentWall = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 9, 72, 1, true), tentMat);
  tentWall.position.y = 4.5;
  group.add(tentWall);
  const roofStripes = stripes.clone();
  roofStripes.repeat.set(24, 1);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(15, 7, 72, 1, true),
    new THREE.MeshStandardMaterial({ map: roofStripes, roughness: 0.95, side: THREE.BackSide }),
  );
  roof.position.y = 9 + 3.5;
  group.add(roof);
  // Four king poles.
  const poleMat = new THREE.MeshStandardMaterial({ color: '#c9a464', roughness: 0.5, metalness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 15, 12), poleMat);
    pole.position.set(Math.cos(a) * 6.4, 7.5, Math.sin(a) * 6.4);
    group.add(pole);
  }

  // Garlands of warm bulbs swagged around the tent.
  const bulbs: THREE.Vector3[] = [];
  const swags = 28;
  for (let i = 0; i < swags; i++) {
    for (let k = 0; k < 9; k++) {
      const s = k / 9;
      const a = ((i + s) / swags) * Math.PI * 2;
      const y = 5.2 - Math.sin(Math.PI * s) * 0.9;
      bulbs.push(new THREE.Vector3(Math.cos(a) * 14.6, y, Math.sin(a) * 14.6));
    }
  }
  for (let i = 0; i < 4; i++) {
    // Strings from the poles up to the peak.
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    for (let k = 0; k < 22; k++) {
      const s = k / 22;
      const r = 6.4 * (1 - s) + 0.3 * s;
      bulbs.push(new THREE.Vector3(Math.cos(a) * r, 8 + s * 6 - Math.sin(Math.PI * s) * 0.8, Math.sin(a) * r));
    }
  }
  const bulbMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd58a').multiplyScalar(2.2) }),
    bulbs.length,
  );
  const m = new THREE.Matrix4();
  bulbs.forEach((p, i) => bulbMesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
  group.add(bulbMesh);

  // Lighting: dim house, a ring wash, a followspot with shadows, a cool back rim.
  group.add(new THREE.HemisphereLight('#7a5a6a', '#2a140c', 0.7));

  const wash = new THREE.SpotLight('#ffcf9a', 70, 0, 0.62, 0.8, 2);
  wash.position.set(0, 13, 0);
  wash.target.position.set(0, 0, 0);
  group.add(wash, wash.target);

  const followSpot = new THREE.SpotLight('#fff1d6', 750, 0, 0.19, 0.5, 2);
  followSpot.position.set(-5.5, 11.5, 7.5);
  followSpot.castShadow = true;
  followSpot.shadow.mapSize.set(compact ? 1024 : 2048, compact ? 1024 : 2048);
  followSpot.shadow.camera.near = 6;
  followSpot.shadow.camera.far = 22;
  followSpot.shadow.bias = -0.0002;
  followSpot.shadow.normalBias = 0.01;
  followSpot.shadow.radius = 3;
  group.add(followSpot, followSpot.target);

  const rim = new THREE.DirectionalLight('#9fc4ff', 1.8);
  group.add(rim, rim.target);
  // Soft key from the audience side of the viewer, so the act never falls into silhouette.
  const fill = new THREE.DirectionalLight('#ffe2c0', 1.1);
  group.add(fill, fill.target);

  // Bulb glow on the canvas.
  const glow = new THREE.PointLight('#ffb760', 120, 40, 2);
  glow.position.set(0, 6, 0);
  group.add(glow);

  return { group, followSpot, rim, fill };
}
