import * as THREE from 'three';
import type { SimState } from '../sim/sim';
import { sampleWaves } from '../sim/waves';
import { Coast } from './Coast';
import { DolphinModel } from './Dolphin';
import { createWater } from './Water';

const FOG = new THREE.Color('#ffd9b8');
const SUN_DIR = new THREE.Vector3(-0.55, 0.32, -0.75).normalize();

function createSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uSun: { value: SUN_DIR } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 uSun; varying vec3 vDir;
      void main(){
        float y = clamp(vDir.y, -0.2, 1.0);
        vec3 horizon = vec3(1.0, 0.85, 0.72);
        vec3 mid = vec3(0.98, 0.72, 0.70);
        vec3 top = vec3(0.42, 0.66, 0.92);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.12, y));
        col = mix(col, top, smoothstep(0.1, 0.6, y));
        float s = max(dot(normalize(vDir), uSun), 0.0);
        col += vec3(1.0, 0.75, 0.45) * pow(s, 12.0) * 0.45 + vec3(1.0, 0.95, 0.8) * pow(s, 400.0) * 1.5;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

function createClouds(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#fff3ec', emissive: '#ffd1c4', emissiveIntensity: 0.35, roughness: 1, flatShading: true });
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const spots = [
    [-120, 48, -200, 1.4], [-40, 62, -260, 1.1], [60, 55, -230, 1.2], [-200, 40, -120, 1.6],
    [140, 46, -160, 1.0], [-90, 70, -300, 1.8], [10, 38, -320, 1.3],
  ];
  for (const [x, y, z, s] of spots) {
    const c = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(puff, mat);
      const r = (6 + ((i * 37) % 5)) * s;
      m.scale.set(r * 1.3, r * 0.75, r);
      m.position.set((i - 2.5) * 6 * s, Math.sin(i * 1.7) * 2.5 * s, Math.cos(i * 2.1) * 4 * s);
      c.add(m);
    }
    c.position.set(x, y, z);
    group.add(c);
  }
  return group;
}

function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Splash spray: a fixed pool of droplets advanced by the render clock. */
class Spray {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private next = 0;
  private readonly count = 500;
  constructor() {
    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count * 3);
    this.life = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this.pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.35, map: dotTexture(), transparent: true, depthWrite: false, color: '#f4fdff', opacity: 0.95 }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }
  burst(x: number, y: number, z: number, size: number, vx: number, vz: number, seed: number): void {
    const n = Math.floor(30 + size * 70);
    let r = seed * 9301 + 49297;
    const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      const a = rand() * Math.PI * 2;
      const sp = (1.5 + rand() * 3.5) * (0.6 + size * 0.5);
      this.pos.set([x + Math.cos(a) * 0.4, y + 0.1, z + Math.sin(a) * 0.4], i * 3);
      this.vel.set([Math.cos(a) * sp + vx * 0.25, 3 + rand() * 5 * size, Math.sin(a) * sp + vz * 0.25], i * 3);
      this.life[i] = 0.7 + rand() * 0.7;
    }
  }
  update(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 14 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -999;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Expanding foam rings where the dolphin breaks the surface. */
class Rings {
  readonly group = new THREE.Group();
  private readonly rings: { mesh: THREE.Mesh; age: number; size: number }[] = [];
  constructor() {
    const geo = new THREE.RingGeometry(0.7, 1, 40);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.rings.push({ mesh, age: 99, size: 1 });
    }
  }
  spawn(x: number, y: number, z: number, size: number): void {
    const r = this.rings.reduce((a, b) => (a.age > b.age ? a : b));
    r.age = 0;
    r.size = size;
    r.mesh.position.set(x, y + 0.08, z);
    r.mesh.visible = true;
  }
  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const t = r.age / 1.4;
      if (t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar(0.6 + t * 4 * r.size);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.8;
    }
  }
}

function createGulls(): { group: THREE.Group; update: (t: number, z: number) => void } {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#fdfdfd', side: THREE.DoubleSide });
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.9, 0.15, -0.15, 0.9, 0.12, 0.2], 3));
  const birds: { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; phase: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const l = new THREE.Mesh(wing, mat);
    const r = new THREE.Mesh(wing, mat);
    r.scale.x = -1;
    g.add(l, r);
    group.add(g);
    birds.push({ g, l, r, phase: i * 1.3 });
  }
  return {
    group,
    update: (t, z) => {
      birds.forEach((b, i) => {
        const a = t * 0.25 + b.phase;
        b.g.position.set(10 + Math.cos(a) * (14 + i * 3), 10 + Math.sin(a * 1.7) * 1.5 + i, z - 40 + Math.sin(a) * 18);
        b.g.rotation.y = -a;
        const flap = Math.sin(t * 6 + b.phase * 3) * 0.5;
        b.l.rotation.z = flap;
        b.r.rotation.z = -flap;
      });
    },
  };
}

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
  readonly dolphin = new DolphinModel();
  private readonly water: ReturnType<typeof createWater>;
  private readonly coast = new Coast();
  private readonly spray = new Spray();
  private readonly rings = new Rings();
  private readonly gulls = createGulls();
  private readonly clouds = createClouds();
  private readonly sky = createSky();
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private camYaw = 0;
  private seenEvent = 0;

  constructor(sim: SimState) {
    this.scene.background = FOG.clone();
    this.scene.fog = new THREE.Fog(FOG, 60, 260);
    this.scene.add(new THREE.HemisphereLight('#cfe8ff', '#f3c9a0', 1.6));
    const sun = new THREE.DirectionalLight('#ffe2b8', 2.4);
    sun.position.copy(SUN_DIR).multiplyScalar(50);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#ffb98a', 0.8);
    rim.position.set(30, 20, 40);
    this.scene.add(rim);
    this.water = createWater(sim.waves);
    this.scene.add(this.sky, this.clouds, this.coast.group, this.water.mesh, this.dolphin.group, this.spray.points, this.rings.group, this.gulls.group);
    this.update(sim, 0, true);
  }

  /** Sync visuals from the simulation. dt is render time; snap resets the camera. */
  update(sim: SimState, dt: number, snap = false, frozen = false): void {
    const d = sim.dolphin;
    this.dolphin.group.position.set(d.x, d.y, d.z);
    this.dolphin.pose(d.yaw + d.spin, d.pitch, d.roll, d.tailPhase, d.airborne);
    this.water.uniforms.uTime.value = sim.time;
    this.water.mesh.position.set(Math.round(d.x / 2) * 2 - 40, 0, Math.round(d.z / 2) * 2 - 120);
    this.coast.update(d.z);
    this.clouds.position.set(d.x * 0.6, 0, d.z);
    this.sky.position.set(d.x, 0, d.z);

    for (const e of sim.events) {
      if (e.id <= this.seenEvent) continue;
      this.seenEvent = e.id;
      if (e.type === 'end') continue;
      this.spray.burst(e.x, e.y, e.z, e.size, d.vx, d.vz, e.id);
      this.rings.spawn(e.x, sampleWaves(sim.waves, e.x, e.z, sim.time).h, e.z, e.size);
    }
    if (!frozen) {
      this.spray.update(dt);
      this.rings.update(dt);
    }
    this.gulls.update(sim.time, d.z);

    // Third-person chase camera behind the travel heading (not trick spin).
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
    this.camYaw += (d.yaw - this.camYaw) * (snap ? 1 : 1 - Math.exp(-dt * 2.5));
    const back = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const surf = sampleWaves(sim.waves, d.x, d.z, sim.time).h;
    const followY = d.airborne ? surf + (d.y - surf) * 0.65 : Math.max(d.y, surf - 0.5);
    const desired = new THREE.Vector3(d.x, followY, d.z).addScaledVector(back, 10).add(new THREE.Vector3(0, 3.6, 0));
    const camSurf = sampleWaves(sim.waves, desired.x, desired.z, sim.time).h;
    desired.y = Math.max(desired.y, camSurf + 1.8);
    const look = new THREE.Vector3(d.x, followY + 1.2, d.z).addScaledVector(back, -6);
    if (snap) {
      this.camPos.copy(desired);
      this.camLook.copy(look);
    } else {
      this.camPos.lerp(desired, k);
      this.camLook.lerp(look, k * 1.3 > 1 ? 1 : k * 1.3);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.water.uniforms.uCamPos.value.copy(this.camPos);
  }

  resetEvents(sim: SimState): void {
    this.seenEvent = sim.nextEventId - 1;
  }
}
