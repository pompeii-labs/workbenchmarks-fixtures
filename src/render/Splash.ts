import * as THREE from 'three';
import { waveHeight } from '../sim/waves';
import { createSeededRandom } from '../utils/random';

const MAX_SPRAY = 2200;
const MAX_FOAM = 420;

/**
 * Spray: camera-facing soft droplets with gravity. Foam: flat patches that lie
 * on the wave surface behind the ski and spread out (the wake).
 * FX randomness is seeded too, so captures are reproducible.
 */
export class Splash {
  readonly spray: THREE.Points;
  readonly foam: THREE.InstancedMesh;
  private rng = createSeededRandom(7);

  private readonly pos = new Float32Array(MAX_SPRAY * 3);
  private readonly vel = new Float32Array(MAX_SPRAY * 3);
  private readonly life = new Float32Array(MAX_SPRAY);
  private readonly maxLife = new Float32Array(MAX_SPRAY);
  private readonly size = new Float32Array(MAX_SPRAY);
  private readonly alpha = new Float32Array(MAX_SPRAY);
  private readonly sizeAttr: THREE.BufferAttribute;
  private readonly alphaAttr: THREE.BufferAttribute;
  private readonly posAttr: THREE.BufferAttribute;
  private cursor = 0;

  private readonly fx = new Float32Array(MAX_FOAM);
  private readonly fz = new Float32Array(MAX_FOAM);
  private readonly fyaw = new Float32Array(MAX_FOAM);
  private readonly fLife = new Float32Array(MAX_FOAM);
  private readonly fMax = new Float32Array(MAX_FOAM);
  private readonly fSize = new Float32Array(MAX_FOAM);
  private readonly fGrow = new Float32Array(MAX_FOAM);
  private fCursor = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor() {
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1);
    this.alphaAttr = new THREE.BufferAttribute(this.alpha, 1);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aSize', this.sizeAttr);
    geo.setAttribute('aAlpha', this.alphaAttr);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float depth = max(-mv.z, 0.5);
          gl_PointSize = min(aSize * uScale / depth, uScale * 0.05);
          // fade drops right in front of the lens so they never wall off the view
          vAlpha = aAlpha * smoothstep(1.5, 5.0, depth);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.15, d) * vAlpha;
          vec3 col = mix(vec3(0.78, 0.9, 0.97), vec3(1.0), smoothstep(0.4, 0.0, d));
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }
      `,
    });
    this.spray = new THREE.Points(geo, mat);
    this.spray.frustumCulled = false;
    this.spray.renderOrder = 2;
    this.spray.onBeforeRender = (renderer) => {
      const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
      // ~ (H/2) / tan(fov/2): world size -> pixels at depth 1
      mat.uniforms.uScale.value = h * 0.78;
    };

    // Foam patch texture: soft blotchy disc
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const rand = createSeededRandom(99);
    // Lacy ring of small blotches: wake foam is broken, not a solid sheet.
    for (let i = 0; i < 70; i += 1) {
      const a = rand() * Math.PI * 2;
      const r = 18 + rand() * 30;
      const x = 64 + Math.cos(a) * r;
      const y = 64 + Math.sin(a) * r;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 3 + rand() * 7);
      g.addColorStop(0, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const foamGeo = new THREE.PlaneGeometry(1, 1);
    foamGeo.rotateX(-Math.PI / 2);
    const foamMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.foam = new THREE.InstancedMesh(foamGeo, foamMat, MAX_FOAM);
    this.foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.foam.frustumCulled = false;
    this.foam.renderOrder = 1;
    for (let i = 0; i < MAX_FOAM; i += 1) {
      this.foam.setColorAt(i, this.color.setRGB(0, 0, 0));
      this.dummy.scale.setScalar(0.0001);
      this.dummy.updateMatrix();
      this.foam.setMatrixAt(i, this.dummy.matrix);
    }
  }

  reset(seed: number): void {
    this.rng = createSeededRandom(seed ^ 0x5a5a);
    this.life.fill(0);
    this.alpha.fill(0);
    this.fLife.fill(0);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, spread: number, size: number, life: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_SPRAY;
    const r = this.rng;
    this.pos[i * 3] = x + (r() - 0.5) * 0.2;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z + (r() - 0.5) * 0.2;
    this.vel[i * 3] = vx + (r() - 0.5) * spread;
    this.vel[i * 3 + 1] = vy + (r() - 0.5) * spread * 0.6;
    this.vel[i * 3 + 2] = vz + (r() - 0.5) * spread;
    this.maxLife[i] = life * (0.7 + r() * 0.6);
    this.life[i] = this.maxLife[i];
    this.size[i] = size * (0.6 + r() * 0.8);
  }

  emitFoam(x: number, z: number, yaw: number, size: number, grow: number, life: number): void {
    const i = this.fCursor;
    this.fCursor = (this.fCursor + 1) % MAX_FOAM;
    this.fx[i] = x;
    this.fz[i] = z;
    this.fyaw[i] = yaw + this.rng() * 6.28;
    this.fSize[i] = size;
    this.fGrow[i] = grow;
    this.fMax[i] = life;
    this.fLife[i] = life;
  }

  /** Burst ring of spray (landing, ring hit, wipeout). */
  burst(x: number, y: number, z: number, count: number, power: number, carry: THREE.Vector3): void {
    const r = this.rng;
    for (let n = 0; n < count; n += 1) {
      const a = r() * Math.PI * 2;
      const out = power * (0.3 + r() * 0.7);
      this.emit(
        x + Math.cos(a) * 0.8, y + 0.1, z + Math.sin(a) * 0.8,
        Math.cos(a) * out + carry.x * 0.4, power * (0.6 + r() * 0.9), Math.sin(a) * out + carry.z * 0.4,
        2, 0.32 + r() * 0.3, 1.1,
      );
    }
    for (let n = 0; n < 3; n += 1) {
      this.emitFoam(x + (r() - 0.5) * 3, z + (r() - 0.5) * 3, 0, 2 + power * 0.15, 1.4, 2.6);
    }
  }

  update(dt: number, t: number): void {
    const g = 13;
    for (let i = 0; i < MAX_SPRAY; i += 1) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j + 1] -= g * dt;
      const drag = 1 - 0.9 * dt;
      this.vel[j] *= drag;
      this.vel[j + 2] *= drag;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const k = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, k * 2.2) * 0.7;
      this.size[i] *= 1 + dt * 0.9;
      // Drops that fall back into the sea vanish (cheap check: only falling ones).
      if (this.vel[j + 1] < 0 && (i & 3) === (Math.floor(t * 60) & 3)) {
        if (this.pos[j + 1] < waveHeight(this.pos[j], this.pos[j + 2], t) - 0.1) this.life[i] = 0;
      }
    }
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  tickFoam(dt: number): void {
    for (let i = 0; i < MAX_FOAM; i += 1) if (this.fLife[i] > 0) this.fLife[i] -= dt;
  }

  /** Write foam instance transforms once per rendered frame. */
  syncFoam(t: number): void {
    for (let i = 0; i < MAX_FOAM; i += 1) {
      if (this.fLife[i] <= -1) continue;
      if (this.fLife[i] <= 0) this.fLife[i] = -1;
      const k = Math.max(0, this.fLife[i] / this.fMax[i]);
      const s = this.fSize[i] * (1 + (1 - k) * this.fGrow[i]);
      this.dummy.position.set(this.fx[i], waveHeight(this.fx[i], this.fz[i], t) + 0.06, this.fz[i]);
      this.dummy.rotation.set(0, this.fyaw[i], 0);
      this.dummy.scale.set(s, 1, s);
      this.dummy.updateMatrix();
      this.foam.setMatrixAt(i, this.dummy.matrix);
      const a = k < 0.001 ? 0 : Math.min(1, k * 1.4) * 0.42;
      this.foam.setColorAt(i, this.color.setRGB(a, a, a));
    }
    this.foam.instanceMatrix.needsUpdate = true;
    if (this.foam.instanceColor) this.foam.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.spray.geometry.dispose();
    (this.spray.material as THREE.Material).dispose();
    this.foam.geometry.dispose();
    const m = this.foam.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
  }
}
