import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Place `obj` so its local +Y runs from `from` along `dir`, with local +Z as close
 * as possible to `hint`. All vectors are in the parent's space.
 */
export function orientBone(obj: THREE.Object3D, from: THREE.Vector3, dir: THREE.Vector3, hint: THREE.Vector3) {
  const y = _a.copy(dir).normalize();
  const z = _b.copy(hint).addScaledVector(y, -hint.dot(y));
  if (z.lengthSq() < 1e-8) z.set(0, 0, 1).addScaledVector(y, -y.z);
  z.normalize();
  const x = _c.crossVectors(y, z).normalize();
  _m.makeBasis(x, y, z);
  obj.quaternion.setFromRotationMatrix(_m);
  obj.position.copy(from);
}

/**
 * Two-bone IK. Returns the joint (elbow/knee) position for a chain rooted at
 * `root` reaching `target`, bending toward `pole`. Writes into `out`.
 * Returns the remaining distance error (0 when the target is reachable).
 */
export function solveTwoBone(
  root: THREE.Vector3,
  target: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
  out: THREE.Vector3,
  reachedTarget: THREE.Vector3,
): number {
  const d = new THREE.Vector3().subVectors(target, root);
  const dist = d.length();
  const minD = Math.abs(l1 - l2) + 1e-4;
  const maxD = l1 + l2 - 1e-4;
  const dc = THREE.MathUtils.clamp(dist, minD, maxD);
  d.normalize();
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = pole.clone().addScaledVector(d, -pole.dot(d));
  if (perp.lengthSq() < 1e-8) perp.set(0, 1, 0).addScaledVector(d, -d.y);
  perp.normalize();
  out.copy(root).addScaledVector(d, a).addScaledVector(perp, h);
  reachedTarget.copy(root).addScaledVector(d, dc);
  return Math.abs(dist - dc);
}

/** A tube whose centre line and radius are rebuilt every frame (neck). */
export class DynamicTube {
  readonly geometry: THREE.BufferGeometry;
  private readonly positions: Float32Array;
  private readonly rings: number;
  private readonly sides: number;

  constructor(rings: number, sides: number) {
    this.rings = rings;
    this.sides = sides;
    const count = (rings + 1) * (sides + 1);
    this.positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const index: number[] = [];
    for (let i = 0; i <= rings; i++) {
      for (let j = 0; j <= sides; j++) {
        const k = i * (sides + 1) + j;
        uvs[k * 2] = j / sides;
        uvs[k * 2 + 1] = i / rings;
        if (i < rings && j < sides) {
          const a = k;
          const b = k + sides + 1;
          index.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(index);
  }

  /**
   * Rebuild along a cubic Bezier p0..p3. `radius(s)` returns [rx, ry] for the
   * cross-section at s in 0..1; `up` seeds the frame so the section can be oval.
   */
  update(
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    radius: (s: number) => [number, number],
    up: THREE.Vector3,
  ) {
    const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
    const tangent = new THREE.Vector3();
    const n = new THREE.Vector3();
    const bn = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i <= this.rings; i++) {
      const s = i / this.rings;
      curve.getPoint(s, p);
      curve.getTangent(s, tangent);
      n.copy(up).addScaledVector(tangent, -up.dot(tangent)).normalize();
      bn.crossVectors(tangent, n).normalize();
      const [rx, ry] = radius(s);
      for (let j = 0; j <= this.sides; j++) {
        const ang = (j / this.sides) * Math.PI * 2;
        const cx = Math.cos(ang) * rx;
        const cy = Math.sin(ang) * ry;
        const k = (i * (this.sides + 1) + j) * 3;
        this.positions[k] = p.x + bn.x * cx + n.x * cy;
        this.positions[k + 1] = p.y + bn.y * cx + n.y * cy;
        this.positions[k + 2] = p.z + bn.z * cx + n.z * cy;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }
}

/** A grid surface (u along, v across) whose vertices are recomputed each frame. */
export class DynamicSurface {
  readonly geometry: THREE.BufferGeometry;
  private readonly positions: Float32Array;

  constructor(
    private readonly nu: number,
    private readonly nv: number,
  ) {
    const count = (nu + 1) * (nv + 1);
    this.positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const index: number[] = [];
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const k = i * (nv + 1) + j;
        uvs[k * 2] = i / nu;
        uvs[k * 2 + 1] = j / nv;
        if (i < nu && j < nv) {
          const a = k;
          const b = k + nv + 1;
          index.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(index);
  }

  update(fn: (u: number, v: number, out: THREE.Vector3) => void) {
    const p = new THREE.Vector3();
    for (let i = 0; i <= this.nu; i++) {
      for (let j = 0; j <= this.nv; j++) {
        fn(i / this.nu, j / this.nv, p);
        const k = (i * (this.nv + 1) + j) * 3;
        this.positions[k] = p.x;
        this.positions[k + 1] = p.y;
        this.positions[k + 2] = p.z;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }
}

/** Static parametric surface helper. */
export function surface(nu: number, nv: number, fn: (u: number, v: number, out: THREE.Vector3) => void) {
  const s = new DynamicSurface(nu, nv);
  s.update(fn);
  return s.geometry;
}

/** A flat feather lying in the local YZ plane: quill at the origin, extending along +Z. */
export function featherGeometry(length: number, width: number, curl = 0.0): THREE.BufferGeometry {
  return surface(10, 4, (u, v, o) => {
    const z = u * length;
    // Rounded, slightly asymmetric vane, widest at 60% of the length.
    const env = Math.sin(Math.PI * Math.min(1, u * 0.85 + 0.08)) ** 0.7 * (u < 0.95 ? 1 : (1 - u) / 0.05);
    const across = (v - 0.4) * width * env;
    o.set(curl * u * u * length + Math.abs(across) * 0.12, across, z);
  });
}

export function mergeInto(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Minimal merge for non-indexed or indexed geometries sharing position/normal/uv.
  const nonIndexed = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of nonIndexed) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of nonIndexed) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
