import * as THREE from 'three';
import { waveHeight } from './waves.js';

const rand = (a, b) => a + Math.random() * (b - a);

// ---------- islands (fixed, far away, for orientation) ----------
const ISLANDS = [
  [520, 950, 110], [-1150, 380, 190], [1500, -700, 160], [-420, -1600, 140], [150, 2500, 260], [-2100, -1300, 230], [2300, 1700, 200],
];

export function createIslands() {
  const group = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: 0x4f8a3c, roughness: 0.95, flatShading: true });
  const sand = new THREE.MeshStandardMaterial({ color: 0xe9d6a4, roughness: 1, flatShading: true });
  const trunk = new THREE.MeshStandardMaterial({ color: 0x7a5432, roughness: 1, flatShading: true });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2f9e44, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
  const colliders = [];
  for (const [x, z, r] of ISLANDS) {
    const isl = new THREE.Group();
    isl.position.set(x, 0, z);
    const beach = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.25, 9, 28, 1), sand);
    beach.position.y = -1.5;
    isl.add(beach);
    const hill = new THREE.ConeGeometry(r * 0.85, r * 0.55, 18, 4);
    const p = hill.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < r * 0.27) {
        const j = 1 + (Math.sin(p.getX(i) * 0.09 + x) + Math.cos(p.getZ(i) * 0.07 + z)) * 0.08;
        p.setXYZ(i, p.getX(i) * j, y + Math.sin(p.getX(i) * 0.2) * r * 0.03, p.getZ(i) * j);
      }
    }
    hill.computeVertexNormals();
    const hm = new THREE.Mesh(hill, rock);
    hm.position.y = 2.5 + r * 0.27;
    isl.add(hm);
    // palms around the beach
    const n = Math.round(r / 12);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
      const rr = r * rand(0.88, 0.98);
      const palm = new THREE.Group();
      palm.position.set(Math.cos(a) * rr, 3, Math.sin(a) * rr);
      const h = rand(9, 14);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, h, 6), trunk);
      tr.position.y = h / 2;
      tr.rotation.z = rand(-0.2, 0.2);
      palm.add(tr);
      for (let k = 0; k < 6; k++) {
        const fr = new THREE.Mesh(new THREE.ConeGeometry(1.1, 6, 4, 1, true), leaf);
        fr.position.y = h;
        fr.rotation.set(Math.PI / 2 + 0.5, (k / 6) * Math.PI * 2, 0, 'YXZ');
        fr.translateY(3);
        palm.add(fr);
      }
      isl.add(palm);
    }
    group.add(isl);
    colliders.push({ x, z, r: r * 1.25 + 2 });
  }
  return { group, colliders };
}

// ---------- buoys (tiled infinitely around the player) ----------
const TILE = 520;
export class Buoys {
  constructor(count = 70) {
    this.group = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.5 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const bodyGeo = new THREE.CylinderGeometry(0.55, 0.7, 1.4, 12);
    const topGeo = new THREE.ConeGeometry(0.45, 0.9, 12);
    const bandGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.3, 12);
    this.items = [];
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const m = Math.random() < 0.5 ? red : yellow;
      const b = new THREE.Mesh(bodyGeo, m);
      b.position.y = 0.3;
      const t = new THREE.Mesh(topGeo, m);
      t.position.y = 1.45;
      const band = new THREE.Mesh(bandGeo, white);
      band.position.y = 0.6;
      g.add(b, t, band);
      this.group.add(g);
      this.items.push({ g, bx: rand(-TILE / 2, TILE / 2), bz: rand(-TILE / 2, TILE / 2), x: 0, z: 0, ph: rand(0, 6), spin: 0, tilt: 0 });
    }
  }

  update(dt, t, px, pz) {
    for (const it of this.items) {
      it.x = it.bx + Math.round((px - it.bx) / TILE) * TILE;
      it.z = it.bz + Math.round((pz - it.bz) / TILE) * TILE;
      const h = waveHeight(it.x, it.z, t);
      const hx = waveHeight(it.x + 0.8, it.z, t), hz = waveHeight(it.x, it.z + 0.8, t);
      it.tilt *= Math.exp(-2 * dt);
      it.g.position.set(it.x, h - 0.2 + Math.sin(t * 2 + it.ph) * 0.08, it.z);
      it.g.rotation.set((hz - h) * 0.8 + it.tilt, 0, -(hx - h) * 0.8 + Math.sin(t * 7) * it.tilt * 0.5);
    }
  }
}

// ---------- floating gold rings to jump through ----------
export class Rings {
  constructor(count = 10) {
    this.group = new THREE.Group();
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0xff9a00, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.6 });
    this.geo = new THREE.TorusGeometry(3.2, 0.28, 12, 48);
    this.items = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.geo, this.mat);
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(3.0, 32),
        new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
      );
      m.add(glow);
      this.group.add(m);
      this.items.push({ m, prevZ: 0, y0: 0, pop: 0, inited: false });
    }
    this.tmp = new THREE.Vector3();
  }

  place(it, px, pz, heading, near) {
    const a = heading + rand(-1.1, 1.1);
    const d = near ? rand(40, 220) : rand(160, 320);
    const x = px + Math.sin(a) * d, z = pz + Math.cos(a) * d;
    it.y0 = rand(4.5, 8.5);
    it.m.position.set(x, it.y0, z);
    it.m.rotation.set(0, a + rand(-0.6, 0.6), 0);
    it.m.scale.setScalar(1);
    it.pop = 0;
    it.inited = false;
  }

  reset(px, pz, heading) {
    for (const it of this.items) this.place(it, px, pz, heading, true);
  }

  // returns number of rings collected this frame (and their positions)
  update(dt, t, pos, heading) {
    const hits = [];
    for (const it of this.items) {
      const m = it.m;
      if (it.pop > 0) {
        it.pop -= dt;
        m.scale.setScalar(1 + (0.5 - it.pop) * 3);
        if (it.pop <= 0) this.place(it, pos.x, pos.z, heading, false);
        continue;
      }
      m.position.y = it.y0 + Math.sin(t * 1.3 + m.position.x) * 0.3;
      m.updateMatrixWorld();
      const local = m.worldToLocal(this.tmp.copy(pos).add({ x: 0, y: 1.0, z: 0 }));
      if (it.inited && Math.sign(local.z) !== Math.sign(it.prevZ) && Math.hypot(local.x, local.y) < 3.4) {
        hits.push(m.position.clone());
        it.pop = 0.5;
      }
      it.prevZ = local.z;
      it.inited = true;
      const dx = m.position.x - pos.x, dz = m.position.z - pos.z;
      if (dx * dx + dz * dz > 420 * 420) this.place(it, pos.x, pos.z, heading, false);
    }
    return hits;
  }
}
