import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createSeededRandom } from '../utils/random';

// Recycled coastline: beach, dunes, pastel cottages, palms, umbrellas and a
// lighthouse, laid out per chunk from a deterministic per-chunk seed.
const CHUNK = 120;
const CHUNKS = 5;

const mat = (color: string, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });

const M = {
  sand: new THREE.MeshStandardMaterial({ color: '#f3d9a4', roughness: 0.95 }),
  wetSand: new THREE.MeshStandardMaterial({ color: '#d9b886', roughness: 0.7 }),
  grass: mat('#8cc46a'),
  grassDark: mat('#6aa956'),
  trunk: mat('#a77b52'),
  leaf: mat('#4fa95a'),
  roofs: ['#e46a5a', '#f29e4c', '#5b8fd6', '#d9607f', '#4ab3a3'].map((c) => mat(c, 0.7)),
  walls: ['#fff4e2', '#ffe1c7', '#e8f4f0', '#fbe9f0', '#fff7c9'].map((c) => mat(c, 0.9)),
  window: new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb347', emissiveIntensity: 0.6 }),
  white: mat('#fbfbf6', 0.6),
  red: mat('#e0484c', 0.6),
  rock: mat('#b9a693'),
  umbrellas: ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#f78fb3'].map((c) => mat(c, 0.6)),
  island: mat('#7fb07a'),
  islandSand: mat('#f0d6a0'),
};

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  roof: (() => {
    const g = new THREE.ConeGeometry(0.78, 0.7, 4);
    g.rotateY(Math.PI / 4);
    return g;
  })(),
  trunkSeg: new THREE.CylinderGeometry(0.14, 0.18, 1, 6),
  leaf: (() => {
    const g = new THREE.ConeGeometry(0.35, 2.4, 4);
    g.rotateZ(Math.PI / 2);
    g.translate(1.2, 0, 0);
    g.scale(1, 0.35, 1);
    return g;
  })(),
  pole: new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5),
  canopy: new THREE.ConeGeometry(1.3, 0.55, 8, 1, true),
  hill: new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  rock: new THREE.DodecahedronGeometry(1, 0),
  tower: new THREE.CylinderGeometry(0.9, 1.3, 1, 12),
};

function palm(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const lean = (rng() - 0.3) * 0.5;
  let x = 0;
  let y = 0;
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const s = new THREE.Mesh(G.trunkSeg, M.trunk);
    const a = lean * (i / segs);
    s.position.set(x, y + 0.5, 0);
    s.rotation.z = -a;
    g.add(s);
    x += Math.sin(a) * 0.9;
    y += Math.cos(a) * 0.9;
  }
  const crown = new THREE.Group();
  crown.position.set(x, y + 0.2, 0);
  for (let i = 0; i < 7; i++) {
    const l = new THREE.Mesh(G.leaf, M.leaf);
    l.rotation.y = (i / 7) * Math.PI * 2 + rng();
    l.rotation.z = -0.35 - rng() * 0.25;
    crown.add(l);
  }
  g.add(crown);
  const sc = 1 + rng() * 0.4;
  g.scale.setScalar(sc);
  return g;
}

function cottage(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const w = 2.4 + rng() * 1.4;
  const d = 2.2 + rng() * 1.2;
  const h = 1.8 + rng() * 0.8;
  const wall = new THREE.Mesh(G.box, M.walls[Math.floor(rng() * M.walls.length)]);
  wall.scale.set(w, h, d);
  wall.position.y = h / 2;
  const roof = new THREE.Mesh(G.roof, M.roofs[Math.floor(rng() * M.roofs.length)]);
  roof.scale.set(w * 0.95, 1.6, d * 0.95);
  roof.position.y = h + 0.55;
  const win = new THREE.Mesh(G.box, M.window);
  win.scale.set(0.05, 0.55, 0.6);
  win.position.set(-w / 2 - 0.01, h * 0.55, 0);
  const door = new THREE.Mesh(G.box, M.roofs[0]);
  door.scale.set(0.05, 0.9, 0.55);
  door.position.set(-w / 2 - 0.01, 0.45, d * 0.28);
  g.add(wall, roof, win, door);
  return g;
}

function umbrella(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(G.pole, M.white);
  pole.position.y = 1.1;
  const canopy = new THREE.Mesh(G.canopy, M.umbrellas[Math.floor(rng() * M.umbrellas.length)]);
  canopy.position.y = 2.2;
  (canopy.material as THREE.Material).side = THREE.DoubleSide;
  g.add(pole, canopy);
  g.rotation.z = (rng() - 0.5) * 0.3;
  return g;
}

function lighthouse(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const t = new THREE.Mesh(G.tower, i % 2 ? M.red : M.white);
    const s = 1 - i * 0.08;
    t.scale.set(s, 1.6, s);
    t.position.y = 0.8 + i * 1.6;
    g.add(t);
  }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 8), new THREE.MeshStandardMaterial({ color: '#fff1b8', emissive: '#ffd36b', emissiveIntensity: 1.2 }));
  lamp.position.y = 10.2;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.9, 8), M.red);
  cap.position.y = 11.1;
  g.add(lamp, cap);
  return g;
}

function buildChunk(index: number): THREE.Group {
  const rng = createSeededRandom(9137 + index * 7919);
  const g = new THREE.Group();
  // Beach: gently rising sand from the waterline.
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(30, CHUNK + 0.5, 6, 1), M.sand);
  beach.rotation.x = -Math.PI / 2;
  beach.rotation.y = 0.11;
  beach.position.set(49, 0.4, 0);
  g.add(beach);
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(8, CHUNK + 0.5), M.wetSand);
  wet.rotation.x = -Math.PI / 2;
  wet.rotation.y = 0.14;
  wet.position.set(37.5, -0.75, 0);
  g.add(wet);
  // Grassy dunes behind the beach.
  for (let i = 0; i < 7; i++) {
    const h = new THREE.Mesh(G.hill, i % 2 ? M.grass : M.grassDark);
    h.scale.set(10 + rng() * 10, 3 + rng() * 6, 12 + rng() * 10);
    h.position.set(66 + rng() * 22, 1.2, -CHUNK / 2 + (i + rng()) * (CHUNK / 7));
    g.add(h);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, CHUNK + 0.5), M.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(90, 2.2, 0);
  g.add(ground);
  // Cottages along the dune line.
  const houses = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < houses; i++) {
    const c = cottage(rng);
    c.position.set(60 + rng() * 6, 2.4 + rng() * 0.6, -CHUNK / 2 + (i + 0.5 + (rng() - 0.5) * 0.5) * (CHUNK / houses));
    c.rotation.y = (rng() - 0.5) * 0.4;
    g.add(c);
  }
  for (let i = 0; i < 9; i++) {
    const p = palm(rng);
    p.position.set(44 + rng() * 14, 0.8 + rng() * 0.8, -CHUNK / 2 + rng() * CHUNK);
    p.rotation.y = Math.PI + (rng() - 0.5) * 1.2;
    g.add(p);
  }
  for (let i = 0; i < 5; i++) {
    const u = umbrella(rng);
    u.position.set(41 + rng() * 6, 0.1, -CHUNK / 2 + rng() * CHUNK);
    g.add(u);
  }
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(G.rock, M.rock);
    r.scale.set(1 + rng() * 2, 0.8 + rng() * 1.4, 1 + rng() * 2);
    r.position.set(34 + rng() * 4, -0.6, -CHUNK / 2 + rng() * CHUNK);
    r.rotation.set(rng(), rng(), rng());
    g.add(r);
  }
  if (index % 3 === 0) {
    const lh = lighthouse();
    lh.position.set(52, 1.6, 10);
    const rocks = new THREE.Mesh(G.rock, M.rock);
    rocks.scale.set(4, 2, 4);
    rocks.position.set(52, 0.4, 10);
    g.add(rocks, lh);
  }
  // Distant islands out to sea for depth.
  if (rng() > 0.35) {
    const isl = new THREE.Group();
    const hill = new THREE.Mesh(G.hill, M.island);
    hill.scale.set(28 + rng() * 30, 8 + rng() * 14, 20 + rng() * 20);
    const sand = new THREE.Mesh(G.hill, M.islandSand);
    sand.scale.set(hill.scale.x * 1.15, 2, hill.scale.z * 1.15);
    isl.add(sand, hill);
    isl.position.set(-170 - rng() * 60, -0.5, (rng() - 0.5) * CHUNK);
    g.add(isl);
  }
  return mergeByMaterial(g);
}

/** Bake a chunk into one mesh per material to keep draw calls low. */
function mergeByMaterial(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    let geo = (o.geometry as THREE.BufferGeometry).clone();
    if (geo.index) geo = geo.toNonIndexed();
    for (const key of Object.keys(geo.attributes)) if (key !== 'position' && key !== 'normal') geo.deleteAttribute(key);
    geo.applyMatrix4(o.matrixWorld);
    const list = buckets.get(o.material as THREE.Material) ?? [];
    list.push(geo);
    buckets.set(o.material as THREE.Material, list);
  });
  const out = new THREE.Group();
  for (const [material, list] of buckets) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (merged) out.add(new THREE.Mesh(merged, material));
  }
  return out;
}

export class Coast {
  readonly group = new THREE.Group();
  private readonly chunks = new Map<number, THREE.Group>();

  update(playerZ: number): void {
    // Chunk i covers z in [-(i+1)*CHUNK, -i*CHUNK]; keep one behind, rest ahead.
    const current = Math.floor(-playerZ / CHUNK);
    const wanted = new Set<number>();
    for (let i = current - 1; i < current - 1 + CHUNKS; i++) wanted.add(i);
    for (const [i, g] of this.chunks) {
      if (!wanted.has(i)) {
        this.group.remove(g);
        g.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
        this.chunks.delete(i);
      }
    }
    for (const i of wanted) {
      if (this.chunks.has(i)) continue;
      const g = buildChunk(i);
      g.position.z = -(i + 0.5) * CHUNK;
      this.chunks.set(i, g);
      this.group.add(g);
    }
  }
}
