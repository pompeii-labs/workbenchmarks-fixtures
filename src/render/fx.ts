import * as THREE from 'three';

// Cosmetic spray and droplets. Uses its own deterministic hash so it never
// touches the gameplay RNG.
const MAX = 260;

export class Fx {
  private readonly mesh: THREE.InstancedMesh;
  private readonly p = new Float32Array(MAX * 3);
  private readonly v = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly size = new Float32Array(MAX);
  private cursor = 0;
  private seed = 1;
  private readonly tmp = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#bfeff5', emissiveIntensity: 0.5, roughness: 0.3, transparent: true, opacity: 0.9 }),
      MAX,
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.clear();
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  clear(): void {
    this.life.fill(0);
    this.tmp.scale.setScalar(0);
    this.tmp.updateMatrix();
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, this.tmp.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  splash(x: number, y: number, z: number, count: number, power: number): void {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const a = this.rand() * Math.PI * 2;
      const r = this.rand();
      this.p.set([x + Math.cos(a) * r * 0.8, y, z + Math.sin(a) * r * 0.8], i * 3);
      const out = (1.5 + this.rand() * 3) * power * 0.5;
      this.v.set([Math.cos(a) * out, (3 + this.rand() * 6) * power * 0.5, Math.sin(a) * out], i * 3);
      this.life[i] = 0.6 + this.rand() * 0.7;
      this.size[i] = 0.08 + this.rand() * 0.16 * power;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      this.v[j + 1] -= 14 * dt;
      this.p[j] += this.v[j] * dt;
      this.p[j + 1] += this.v[j + 1] * dt;
      this.p[j + 2] += this.v[j + 2] * dt;
      const s = this.life[i] > 0 ? this.size[i] * Math.min(1, this.life[i] * 2) : 0;
      this.tmp.position.set(this.p[j], this.p[j + 1], this.p[j + 2]);
      this.tmp.scale.setScalar(s);
      this.tmp.updateMatrix();
      this.mesh.setMatrixAt(i, this.tmp.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
