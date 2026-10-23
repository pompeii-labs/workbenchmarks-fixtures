import * as THREE from 'three';
import { waveHeight } from './waves.js';
import { NOISE_GLSL } from './water.js';

export const SPRAY = 0;
export const FOAM = 1;
export const MIST = 2;

/** Pooled spray / foam / mist particles rendered as soft round points. */
export class Particles {
  constructor(max, colors, fogDensity) {
    this.max = max;
    this.next = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.size0 = new Float32Array(max);
    this.type = new Uint8Array(max);
    this.sizeAttr = new Float32Array(max);
    this.alphaAttr = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    this.sAttr = new THREE.BufferAttribute(this.sizeAttr, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAttr = new THREE.BufferAttribute(this.alphaAttr, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSize', this.sAttr);
    geo.setAttribute('aAlpha', this.aAttr);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uScale: { value: 500 },
        uColor: { value: new THREE.Color(0xf2f8ff) },
        uFogColor: { value: colors.horizon.clone() },
        uFogDensity: { value: fogDensity },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        uniform float uFogDensity;
        varying float vAlpha;
        varying float vFog;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = max(-mv.z, 0.1);
          gl_PointSize = aAlpha > 0.0 ? aSize * uScale / d : 0.0;
          // don't let drops right in front of the lens white out the screen
          vAlpha = aAlpha * smoothstep(1.5, 6.0, d);
          vFog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uFogColor;
        varying float vAlpha;
        varying float vFog;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c);
          if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.15, r) * vAlpha;
          vec3 col = uColor * (0.85 + 0.25 * (0.5 - c.y));
          gl_FragColor = vec4(mix(col, uFogColor, vFog), a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  spawn(type, x, y, z, vx, vy, vz, life, size) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const j = i * 3;
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z;
    this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = size;
    this.type[i] = type;
  }

  update(dt, t, camera, viewportHeight) {
    this.material.uniforms.uScale.value = viewportHeight * 0.5 * camera.projectionMatrix.elements[5];
    const { p, v, life, maxLife, size0, type, sizeAttr, alphaAttr } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) {
        alphaAttr[i] = 0;
        continue;
      }
      life[i] -= dt;
      const j = i * 3;
      const k = 1 - life[i] / maxLife[i]; // 0 -> 1 over lifetime
      const ty = type[i];
      if (ty === FOAM) {
        const damp = Math.exp(-1.5 * dt);
        v[j] *= damp; v[j + 2] *= damp;
        p[j] += v[j] * dt;
        p[j + 2] += v[j + 2] * dt;
        p[j + 1] = waveHeight(p[j], p[j + 2], t) + 0.1;
        sizeAttr[i] = size0[i] * (1 + k * 2.2);
        alphaAttr[i] = 0.55 * Math.min(1, k * 8) * (1 - k);
      } else {
        const g = ty === MIST ? 3 : 15;
        const drag = Math.exp((ty === MIST ? -2.5 : -0.9) * dt);
        v[j] *= drag; v[j + 1] = v[j + 1] * drag - g * dt; v[j + 2] *= drag;
        p[j] += v[j] * dt;
        p[j + 1] += v[j + 1] * dt;
        p[j + 2] += v[j + 2] * dt;
        if (v[j + 1] < 0 && p[j + 1] < waveHeight(p[j], p[j + 2], t)) {
          // drop hits the water: turn into a bit of foam
          if (ty === SPRAY && Math.random() < 0.18) {
            type[i] = FOAM;
            life[i] = maxLife[i] = 1.2 + Math.random();
            size0[i] *= 0.8;
            v[j] *= 0.2; v[j + 2] *= 0.2;
          } else life[i] = 0;
        }
        if (ty === MIST) {
          sizeAttr[i] = size0[i] * (1 + k * 3);
          alphaAttr[i] = 0.35 * (1 - k);
        } else {
          sizeAttr[i] = size0[i] * (1 + k * 1.5);
          alphaAttr[i] = 0.9 * (1 - k * k);
        }
      }
    }
    this.posAttr.needsUpdate = true;
    this.sAttr.needsUpdate = true;
    this.aAttr.needsUpdate = true;
  }
}

/** Foamy ribbon trailing behind the hull, draped on the waves. */
export class Wake {
  constructor(colors, fogDensity, maxPts = 180) {
    this.max = maxPts;
    this.pts = []; // {x, z, rx, rz, age, life, k}
    const vcount = maxPts * 2;
    this.pos = new Float32Array(vcount * 3);
    this.data = new Float32Array(vcount * 2); // across (-1..1), alpha
    const idx = [];
    for (let i = 0; i < maxPts - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.dataAttr = new THREE.BufferAttribute(this.data, 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aData', this.dataAttr);
    geo.setIndex(idx);
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: {
        uTime: { value: 0 },
        uFogColor: { value: colors.horizon.clone() },
        uFogDensity: { value: fogDensity },
      },
      vertexShader: /* glsl */ `
        attribute vec2 aData;
        varying vec2 vData;
        varying vec3 vWorld;
        void main() {
          vData = aData;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying vec2 vData;
        varying vec3 vWorld;
        ${NOISE_GLSL}
        void main() {
          float across = abs(vData.x);
          float edge = smoothstep(0.55, 0.95, across) * (1.0 - smoothstep(0.95, 1.0, across));
          float core = 1.0 - smoothstep(0.0, 0.45, across);
          float n = vnoise(vWorld.xz * 1.3) * 0.6 + vnoise(vWorld.xz * 3.1 + uTime) * 0.4;
          float a = (edge * 0.9 + core * 0.7) * smoothstep(0.25, 0.65, n + vData.y * 0.35);
          a *= vData.y;
          float d = length(cameraPosition - vWorld);
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
          gl_FragColor = vec4(mix(vec3(0.93, 0.97, 1.0), uFogColor, fog), a * 0.9);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mat = mat;
  }

  push(x, z, rx, rz, k) {
    this.pts.unshift({ x, z, rx, rz, age: 0, life: 5, k });
    if (this.pts.length > this.max) this.pts.pop();
  }

  update(dt, t) {
    this.mat.uniforms.uTime.value = t;
    const pts = this.pts;
    for (const p of pts) p.age += dt;
    while (pts.length && pts[pts.length - 1].age > pts[pts.length - 1].life) pts.pop();
    const n = pts.length;
    for (let i = 0; i < this.max; i++) {
      const j = i * 6, d = i * 4;
      if (i >= n) {
        // collapse unused vertices onto the last point
        const q = n ? pts[n - 1] : { x: 0, z: 0 };
        this.pos[j] = this.pos[j + 3] = q.x;
        this.pos[j + 1] = this.pos[j + 4] = -100;
        this.pos[j + 2] = this.pos[j + 5] = q.z;
        this.data[d + 1] = this.data[d + 3] = 0;
        continue;
      }
      const p = pts[i];
      const f = p.age / p.life;
      const w = 0.6 + p.age * 1.6;
      const lx = p.x + p.rx * w, lz = p.z + p.rz * w;
      const rx = p.x - p.rx * w, rz = p.z - p.rz * w;
      this.pos[j] = lx; this.pos[j + 1] = waveHeight(lx, lz, t) + 0.08; this.pos[j + 2] = lz;
      this.pos[j + 3] = rx; this.pos[j + 4] = waveHeight(rx, rz, t) + 0.08; this.pos[j + 5] = rz;
      const a = p.k * (1 - f) * Math.min(1, p.age * 6);
      this.data[d] = -1; this.data[d + 1] = a;
      this.data[d + 2] = 1; this.data[d + 3] = a;
    }
    this.posAttr.needsUpdate = true;
    this.dataAttr.needsUpdate = true;
  }
}
