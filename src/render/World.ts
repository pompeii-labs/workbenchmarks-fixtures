import * as THREE from 'three';
import { ISLANDS, ringCenterY, type Ring } from '../sim/sim';
import { distanceToCourse } from '../sim/course';
import { waveHeight } from '../sim/waves';
import { createSeededRandom } from '../utils/random';

const BUOY_CELL = 46;
const BUOY_SPAN = 4; // cells each side

function cellHash(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface RingView {
  group: THREE.Group;
  id: number;
  popT: number;
}

export class World {
  readonly group = new THREE.Group();
  private readonly ringViews = new Map<number, RingView>();
  private readonly popping: RingView[] = [];
  private readonly ringGeo = new THREE.TorusGeometry(2.6, 0.2, 10, 40);
  private readonly ringMat = new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff5a00', emissiveIntensity: 0.6, roughness: 0.4 });
  private readonly airRingMat = new THREE.MeshStandardMaterial({ color: '#ffd12a', emissive: '#ffb000', emissiveIntensity: 0.9, roughness: 0.35 });
  private readonly floatGeo = new THREE.SphereGeometry(0.42, 14, 10);
  private readonly floatMat = new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.6 });
  private readonly glowGeo = new THREE.RingGeometry(2.0, 2.9, 40);
  private readonly glowMat = new THREE.MeshBasicMaterial({ color: '#fff1a8', transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly buoys: THREE.InstancedMesh;
  private readonly buoyTops: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.disposables.push(this.ringGeo, this.ringMat, this.airRingMat, this.floatGeo, this.floatMat, this.glowGeo, this.glowMat);

    // Marker buoys on a recycling grid: speed reference while you cruise.
    const count = (BUOY_SPAN * 2 + 1) ** 2;
    const bodyGeo = new THREE.CylinderGeometry(0.32, 0.45, 1.3, 12);
    bodyGeo.translate(0, 0.35, 0);
    const topGeo = new THREE.ConeGeometry(0.3, 0.7, 12);
    topGeo.translate(0, 1.35, 0);
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#d8322a', roughness: 0.55 });
    const topMat = new THREE.MeshStandardMaterial({ color: '#f5f5f0', roughness: 0.5 });
    this.buoys = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
    this.buoyTops = new THREE.InstancedMesh(topGeo, topMat, count);
    this.buoys.frustumCulled = false;
    this.buoyTops.frustumCulled = false;
    this.group.add(this.buoys, this.buoyTops);
    this.disposables.push(bodyGeo, topGeo, bodyMat, topMat);

    for (const isl of ISLANDS) this.group.add(this.createIsland(isl.x, isl.z, isl.r));
  }

  private createIsland(x: number, z: number, r: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const rand = createSeededRandom(Math.floor(x * 7 + z * 13));
    // Sand shelf
    const sandGeo = new THREE.CylinderGeometry(r * 1.0, r * 1.12, 3, 40, 1);
    sandGeo.translate(0, -0.6, 0);
    const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ color: '#e9d3a2', roughness: 0.95 }));
    g.add(sand);
    // Hill: displaced lathe
    const pts: THREE.Vector2[] = [];
    const height = r * (0.55 + rand() * 0.35);
    for (let i = 0; i <= 12; i += 1) {
      const k = i / 12;
      pts.push(new THREE.Vector2(r * 0.86 * (1 - k) ** 0.8 + 0.01, 0.6 + height * Math.sin(k * Math.PI * 0.5) ** 1.4));
    }
    const hillGeo = new THREE.LatheGeometry(pts, 28);
    const pos = hillGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      const a = Math.atan2(pz, px);
      const n = 1 + 0.16 * Math.sin(a * 3 + x) + 0.1 * Math.sin(a * 7 + z);
      pos.setX(i, px * n);
      pos.setZ(i, pz * n);
      pos.setY(i, pos.getY(i) * (0.85 + 0.2 * Math.sin(a * 2 + x)));
    }
    hillGeo.computeVertexNormals();
    const hill = new THREE.Mesh(hillGeo, new THREE.MeshStandardMaterial({ color: '#3f8a4a', roughness: 0.9, flatShading: true }));
    g.add(hill);
    // Palms along the beach
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 9, 6);
    trunkGeo.translate(0, 4.5, 0);
    const leafGeo = new THREE.ConeGeometry(4.2, 2.2, 7);
    leafGeo.translate(0, 9.4, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#2f7d3a', roughness: 0.8, flatShading: true });
    const palms = 9;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palms);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, palms);
    for (let i = 0; i < palms; i += 1) {
      const a = rand() * Math.PI * 2;
      const d = r * (0.8 + rand() * 0.12);
      this.dummy.position.set(Math.cos(a) * d, 0.5, Math.sin(a) * d);
      this.dummy.rotation.set((rand() - 0.5) * 0.4, rand() * 6, (rand() - 0.5) * 0.4);
      this.dummy.scale.setScalar(0.8 + rand() * 0.5);
      this.dummy.updateMatrix();
      trunks.setMatrixAt(i, this.dummy.matrix);
      leaves.setMatrixAt(i, this.dummy.matrix);
    }
    g.add(trunks, leaves);
    this.disposables.push(sandGeo, hillGeo, trunkGeo, leafGeo, trunkMat, leafMat, sand.material as THREE.Material, hill.material as THREE.Material);
    return g;
  }

  private makeRing(r: Ring): RingView {
    const group = new THREE.Group();
    const torus = new THREE.Mesh(this.ringGeo, r.air ? this.airRingMat : this.ringMat);
    group.add(torus);
    if (r.air) {
      const glow = new THREE.Mesh(this.glowGeo, this.glowMat);
      group.add(glow);
    } else {
      for (const side of [-1, 1]) {
        const f = new THREE.Mesh(this.floatGeo, this.floatMat);
        f.position.set(side * 2.6, -0.1, 0);
        group.add(f);
      }
    }
    group.rotation.y = r.yaw;
    this.group.add(group);
    return { group, id: r.id, popT: 0 };
  }

  /** Called when the sim reports a ring hit. */
  popRing(id: number): void {
    const v = this.ringViews.get(id);
    if (!v) return;
    this.ringViews.delete(id);
    v.popT = 0.0001;
    this.popping.push(v);
  }

  update(rings: Ring[], t: number, px: number, pz: number, dt: number): void {
    const live = new Set<number>();
    for (const r of rings) {
      live.add(r.id);
      let v = this.ringViews.get(r.id);
      if (!v) {
        v = this.makeRing(r);
        this.ringViews.set(r.id, v);
      }
      const y = ringCenterY(r, t);
      v.group.position.set(r.x, y, r.z);
      v.group.rotation.z = r.air ? Math.sin(t * 1.3 + r.id) * 0.05 : (waveHeight(r.x + 2, r.z, t) - waveHeight(r.x - 2, r.z, t)) * 0.2;
      const s = 1 + Math.sin(t * 3 + r.id) * (r.air ? 0.04 : 0.015);
      v.group.scale.setScalar(s);
    }
    for (const [id, v] of this.ringViews) {
      if (!live.has(id)) {
        this.group.remove(v.group);
        this.ringViews.delete(id);
      }
    }
    for (let i = this.popping.length - 1; i >= 0; i -= 1) {
      const v = this.popping[i];
      v.popT += dt;
      v.group.scale.setScalar(1 + v.popT * 4);
      v.group.rotation.y += dt * 8;
      if (v.popT > 0.35) {
        this.group.remove(v.group);
        this.popping.splice(i, 1);
      }
    }

    // Buoys recycle around the player on a fixed hashed grid.
    const cx = Math.floor(px / BUOY_CELL);
    const cz = Math.floor(pz / BUOY_CELL);
    let n = 0;
    for (let ix = cx - BUOY_SPAN; ix <= cx + BUOY_SPAN; ix += 1) {
      for (let iz = cz - BUOY_SPAN; iz <= cz + BUOY_SPAN; iz += 1) {
        const h = cellHash(ix, iz);
        const present = h > 0.45;
        const bx = (ix + 0.2 + cellHash(ix + 91, iz) * 0.6) * BUOY_CELL;
        const bz = (iz + 0.2 + cellHash(ix, iz + 57) * 0.6) * BUOY_CELL;
        if (present && !this.insideIsland(bx, bz) && distanceToCourse(bx, bz) > 28) {
          const wy = waveHeight(bx, bz, t);
          this.dummy.position.set(bx, wy - 0.3, bz);
          const tilt = (waveHeight(bx + 1, bz, t) - waveHeight(bx - 1, bz, t)) * 0.5;
          const tiltZ = (waveHeight(bx, bz + 1, t) - waveHeight(bx, bz - 1, t)) * 0.5;
          this.dummy.rotation.set(tiltZ, h * 6, -tilt);
          this.dummy.scale.setScalar(1);
        } else {
          this.dummy.position.set(0, -50, 0);
          this.dummy.scale.setScalar(0.0001);
        }
        this.dummy.updateMatrix();
        this.buoys.setMatrixAt(n, this.dummy.matrix);
        this.buoyTops.setMatrixAt(n, this.dummy.matrix);
        n += 1;
      }
    }
    this.buoys.instanceMatrix.needsUpdate = true;
    this.buoyTops.instanceMatrix.needsUpdate = true;
  }

  private insideIsland(x: number, z: number): boolean {
    return ISLANDS.some((i) => Math.hypot(x - i.x, z - i.z) < i.r + 8);
  }

  clearRings(): void {
    for (const v of this.ringViews.values()) this.group.remove(v.group);
    for (const v of this.popping) this.group.remove(v.group);
    this.ringViews.clear();
    this.popping.length = 0;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.buoys.dispose();
    this.buoyTops.dispose();
  }
}
