// Procedural geometry helpers
import * as THREE from 'three';

export function ellipsoid(rx, ry, rz, mat, ws = 24, hs = 16) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// A tube whose centreline and radius profile can be changed every frame.
export class DynTube {
  constructor(mat, samples = 24, radial = 14) {
    this.n = samples;
    this.r = radial;
    const pos = new Float32Array(samples * (radial + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx = [];
    for (let i = 0; i < samples - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this._t = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  // pointAt(u, outVec3), radiusAt(u) -> number
  update(pointAt, radiusAt) {
    const { n, r } = this;
    const pos = this.geo.attributes.position.array;
    const P = [];
    for (let i = 0; i < n; i++) P.push(pointAt(i / (n - 1), new THREE.Vector3()));
    const T = this._t,
      N = this._n,
      B = this._b;
    T.subVectors(P[1], P[0]).normalize();
    N.set(1, 0, 0);
    if (Math.abs(T.x) > 0.9) N.set(0, 0, 1);
    N.sub(T.clone().multiplyScalar(T.dot(N))).normalize();
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const nxt = P[Math.min(i + 1, n - 1)];
        const prv = P[i - 1];
        T.subVectors(nxt, prv).normalize();
        // parallel transport
        N.sub(this._b.copy(T).multiplyScalar(T.dot(N))).normalize();
      }
      B.crossVectors(T, N);
      const rad = radiusAt(i / (n - 1));
      for (let j = 0; j <= r; j++) {
        const a = (j / r) * Math.PI * 2;
        const c = Math.cos(a) * rad,
          s = Math.sin(a) * rad;
        pos[k++] = P[i].x + N.x * c + B.x * s;
        pos[k++] = P[i].y + N.y * c + B.y * s;
        pos[k++] = P[i].z + N.z * c + B.z * s;
      }
      B.crossVectors(T, N); // keep B valid for next iteration's temp use
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}

// Generic (u,v) grid surface with an updatable position function.
export class GridSurface {
  constructor(mat, nu, nv, fn, closedV = false) {
    this.nu = nu;
    this.nv = nv;
    this.fn = fn;
    const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx = [];
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = i * (nv + 1) + j;
        const b = a + nv + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.closedV = closedV;
    this.update();
  }
  update(param) {
    const { nu, nv } = this;
    const pos = this.geo.attributes.position.array;
    const v3 = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        this.fn(i / nu, (this.closedV && j === nv ? 0 : j / nv), v3, param);
        pos[k++] = v3.x;
        pos[k++] = v3.y;
        pos[k++] = v3.z;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}

// Two-bone IK. S: root, T: target, pole: bend direction hint. Writes elbow.
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
export function solveTwoBone(S, T, L1, L2, pole, outElbow, outEnd) {
  _d.subVectors(T, S);
  let d = _d.length();
  const maxD = (L1 + L2) * 0.999;
  const minD = Math.abs(L1 - L2) + 1e-3;
  _d.normalize();
  d = Math.min(maxD, Math.max(minD, d));
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  _p.copy(pole).addScaledVector(_d, -_d.dot(pole)).normalize();
  outElbow.copy(S).addScaledVector(_d, a).addScaledVector(_p, h);
  if (outEnd) outEnd.copy(S).addScaledVector(_d, d);
  return outElbow;
}

// Orient an object so its local +Y runs from `from` to `to`, with local +X
// leaning toward `xHint`.
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
export function placeSegment(obj, from, to, xHint) {
  obj.position.copy(from);
  _y.subVectors(to, from).normalize();
  _x.copy(xHint).addScaledVector(_y, -_y.dot(xHint)).normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  obj.quaternion.setFromRotationMatrix(_m);
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
