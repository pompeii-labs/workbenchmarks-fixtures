// Procedural props and TSL materials shared by the craft scenes. Units are
// centimetres. Every animated node reads a per-scene clock uniform that the
// controller advances, never the renderer's own clock.
import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
  color,
  cos,
  exp,
  float,
  instancedBufferAttribute,
  length,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  mx_worley_noise_float,
  normalize,
  oneMinus,
  positionLocal,
  pow,
  saturate,
  sin,
  smoothstep,
  sqrt,
  step,
  transformNormalToView,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

// TSL node objects are loosely typed in @types/three; keep builders readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type N = any;

/** Colour node, loosely typed so it mixes with any float/vec3 expression. */
export const col = (hex: string): N => color(hex);
export const len = (v: N): N => length(v);

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const range = (a: number, b: number, x: number) => clamp01((x - a) / (b - a));

export function sceneClock() {
  return uniform(0);
}

// ---------------------------------------------------------------- materials

export function steelMaterial(tone = '#c9c6bd', roughness = 0.26) {
  const m = new THREE.MeshStandardNodeMaterial({ color: tone, metalness: 1, roughness });
  // Brushed variation: faint streaks along the lathe direction.
  const vy: N = uv().y;
  const streak: N = sin(vy.mul(260)).mul(sin(vy.mul(97).add(1.3))).mul(0.5).add(0.5);
  m.roughnessNode = float(roughness).add(streak.mul(0.05));
  m.colorNode = color(tone).mul(float(0.97).add(streak.mul(0.03)));
  return m;
}

export function handleMaterial() {
  return new THREE.MeshStandardNodeMaterial({ color: '#1d1b19', roughness: 0.42, metalness: 0 });
}

export function ceramicMaterial(tone: string, roughness = 0.32) {
  return new THREE.MeshStandardNodeMaterial({ color: tone, roughness: roughness * 0.7, metalness: 0 });
}

/** Soft, cheap contact shadow under an object (no shadow map). */
export function contactShadow(radius: number, strength = 0.42, tint = '#1b0d07') {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, toneMapped: false });
  const d = len(uv().sub(0.5)).mul(2);
  m.colorNode = color(tint);
  m.opacityNode = pow(oneMinus(smoothstep(0.0, 1.0, d)), 1.8).mul(strength);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -1;
  return mesh;
}

// ---------------------------------------------------------------- backdrop

/**
 * A flat, unlit backdrop parented to the camera so the composition holds at
 * every aspect. paint(p, aspect) receives centred coordinates, y in -0.5..0.5,
 * x scaled by aspect, and returns a colour node.
 */
export function cameraBackdrop(camera: THREE.PerspectiveCamera, paint: (p: N, aspect: N) => N, distance = 120) {
  const aspect = uniform(1);
  const m = new THREE.MeshBasicNodeMaterial({ toneMapped: false, depthWrite: false });
  const p = uv().sub(0.5).mul(vec2(aspect, 1));
  m.colorNode = paint(p, aspect);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  mesh.position.z = -distance;
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  camera.add(mesh);
  const fit = (nextAspect: number) => {
    const h = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.02;
    mesh.scale.set(h * nextAspect, h, 1);
    aspect.value = nextAspect;
  };
  return { mesh, fit };
}

/** Thin line ring helper for backdrops: 1 on a ring of radius r around c. */
export function ringLine(p: N, cx: number, cy: number, r: number, width = 0.0016) {
  const d = len(p.sub(vec2(cx, cy)));
  return oneMinus(smoothstep(width * 0.4, width, abs(d.sub(r))));
}

export function disc(p: N, cx: number, cy: number, r: number, soft = 0.002) {
  const d = len(p.sub(vec2(cx, cy)));
  return oneMinus(smoothstep(r - soft, r + soft, d));
}

// ---------------------------------------------------------------- vessels

export interface Vessel {
  group: THREE.Group;
  innerRadiusAt: (y: number) => number;
  bottomY: number;
  rimY: number;
}

function sampleProfile(points: THREE.Vector2[], y: number): number {
  // points ordered from rim down to bottom (descending y)
  if (y >= points[0].y) return points[0].x;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (y <= a.y && y >= b.y) return lerp(b.x, a.x, (y - b.y) / Math.max(1e-6, a.y - b.y));
  }
  return points[points.length - 1].x;
}

/** Demitasse or cappuccino cup with a C handle, built from one lathe profile. */
export function buildCup(material: THREE.Material, scale = 1, widen = 1): Vessel {
  const s = (x: number, y: number) => new THREE.Vector2(x * scale * widen, y * scale);
  const outer = [
    s(0, 0), s(1.55, 0), s(1.72, 0.1), s(1.74, 0.32), s(2.05, 0.55), s(2.6, 1.15), s(3.0, 2.1),
    s(3.25, 3.2), s(3.38, 4.3), s(3.44, 5.1), s(3.42, 5.3), s(3.33, 5.37),
  ];
  const inner = [
    s(3.22, 5.29), s(3.2, 5.05), s(3.12, 4.25), s(2.98, 3.2), s(2.7, 2.2), s(2.15, 1.35), s(1.3, 0.92), s(0.4, 0.84), s(0, 0.83),
  ];
  // Outside from the foot up to the rim, then the inside back down.
  const lathe = new THREE.LatheGeometry([...outer, ...inner], 72);
  const body = new THREE.Mesh(lathe, material);
  const group = new THREE.Group();
  group.add(body);

  const handle = new THREE.Mesh(new THREE.TorusGeometry(1.05 * scale, 0.27 * scale, 14, 28, Math.PI * 1.25), material);
  handle.rotation.z = -Math.PI * 0.625;
  handle.position.set(3.25 * scale * widen + 0.55 * scale, 3.15 * scale, 0);
  handle.scale.set(1, 1.12, 1);
  group.add(handle);

  return {
    group,
    innerRadiusAt: (y: number) => sampleProfile(inner, y),
    bottomY: 0.83 * scale,
    rimY: 5.29 * scale,
  };
}

export function buildSaucer(material: THREE.Material, scale = 1) {
  const s = (x: number, y: number) => new THREE.Vector2(x * scale, y * scale);
  const pts = [
    s(0, 0.58), s(2.4, 0.6), s(2.65, 0.55), s(4.2, 0.62), s(5.5, 0.86), s(6.0, 1.06), s(6.15, 1.04),
    s(6.12, 0.92), s(5.6, 0.72), s(4.2, 0.44), s(2.6, 0.33), s(2.42, 0.14), s(2.2, 0), s(0, 0),
  ].reverse();
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), material);
  return { mesh, topY: 0.6 * scale };
}

/** Steel milk pitcher with a pulled spout pointing along +x. */
export function buildPitcher(material: THREE.Material, scale = 1): Vessel & { spoutTip: THREE.Object3D } {
  const s = (x: number, y: number) => new THREE.Vector2(x * scale, y * scale);
  const outer = [s(0, 0), s(3.45, 0), s(3.62, 0.18), s(3.78, 1.2), s(3.82, 3.0), s(3.7, 5.0), s(3.45, 7.0), s(3.38, 8.4), s(3.42, 9.0), s(3.46, 9.1)];
  const inner = [s(3.36, 9.06), s(3.3, 8.4), s(3.36, 7.0), s(3.6, 5.0), s(3.72, 3.0), s(3.68, 1.2), s(3.5, 0.32), s(0, 0.3)];
  const pts = [...outer, ...inner];
  // Seam at -x, hidden behind the handle; the spout is pulled at +x.
  const geometry = new THREE.LatheGeometry(pts, 96, -Math.PI * 0.5, Math.PI * 2);
  // Pull a spout out of the rim at +x: radial push and lift, strongest at the top.
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const theta = Math.atan2(v.z, v.x);
    const lift = smooth(5.6 * scale, 9.1 * scale, v.y);
    const w = Math.exp(-(theta * theta) / 0.11) * lift;
    const r = Math.hypot(v.x, v.z);
    const nr = r + w * 1.55 * scale;
    // Narrow the spout sideways so it reads as a pinched lip.
    const pinch = 1 - w * 0.35;
    v.x = Math.cos(theta) * nr;
    v.z = Math.sin(theta) * nr * pinch;
    v.y += w * 0.55 * scale;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  const body = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.add(body);

  // Handle on the opposite side.
  const handle = new THREE.Mesh(new THREE.TorusGeometry(2.1 * scale, 0.42 * scale, 12, 32, Math.PI * 1.1), material);
  handle.rotation.z = Math.PI - Math.PI * 0.55;
  handle.position.set(-3.6 * scale - 0.6 * scale, 5.3 * scale, 0);
  handle.scale.set(0.8, 1.15, 1);
  group.add(handle);

  const spoutTip = new THREE.Object3D();
  spoutTip.position.set((3.42 + 1.55) * scale, 9.6 * scale, 0);
  group.add(spoutTip);

  const innerDesc = inner.slice(0, -1);
  return { group, innerRadiusAt: (y: number) => sampleProfile(innerDesc, y), bottomY: 0.3 * scale, rimY: 9.06 * scale, spoutTip };
}

// ---------------------------------------------------------------- portafilter

export function buildPortafilter(steel: THREE.Material, dark: THREE.Material) {
  const root = new THREE.Group();
  // `group` is the portafilter itself; it twists on the bayonet under the static group head.
  const group = new THREE.Group();
  root.add(group);
  const basket = [
    new THREE.Vector2(0, -2.8), new THREE.Vector2(1.1, -2.8), new THREE.Vector2(2.3, -2.6), new THREE.Vector2(3.0, -2.15),
    new THREE.Vector2(3.28, -1.4), new THREE.Vector2(3.32, -0.5), new THREE.Vector2(3.7, -0.32), new THREE.Vector2(3.72, 0),
    new THREE.Vector2(0, 0),
  ];
  group.add(new THREE.Mesh(new THREE.LatheGeometry(basket, 64), steel));
  // Bayonet lugs.
  for (const side of [-1, 1]) {
    const lug = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.34, 0.9), steel);
    lug.position.set(0, -0.17, side * 3.7);
    group.add(lug);
  }
  // Group head above, disappearing into the machine.
  const head = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.1, 2.2, 64), steel);
  head.position.y = 1.1;
  root.add(head);
  const headRing = new THREE.Mesh(new THREE.CylinderGeometry(4.25, 4.25, 0.5, 64), dark);
  headRing.position.y = 2.4;
  root.add(headRing);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 16, 48), steel);
  column.position.y = 10.6;
  root.add(column);

  // Handle: steel collar then a tapered dark grip along +x.
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 3.2, 24), steel);
  collar.rotation.z = Math.PI / 2;
  collar.position.set(4.6, -1.1, 0);
  group.add(collar);
  const gripProfile = [
    new THREE.Vector2(0, 0), new THREE.Vector2(0.95, 0.1), new THREE.Vector2(1.1, 2.5), new THREE.Vector2(1.25, 7.5),
    new THREE.Vector2(1.18, 9.6), new THREE.Vector2(0.8, 10.2), new THREE.Vector2(0, 10.3),
  ];
  const grip = new THREE.Mesh(new THREE.LatheGeometry(gripProfile, 28), dark);
  grip.rotation.z = -Math.PI / 2;
  grip.position.set(6.1, -1.1, 0);
  grip.rotation.y = 0;
  const gripPivot = new THREE.Group();
  gripPivot.add(grip);
  gripPivot.rotation.z = 0.12;
  group.add(gripPivot);

  // Twin spout.
  const block = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 1.0, 24), steel);
  block.position.y = -3.25;
  group.add(block);
  const tips: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const from = new THREE.Vector3(0, -3.55, 0);
    const to = new THREE.Vector3(side * 1.15, -4.55, 0);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, from.distanceTo(to), 16), steel);
    tube.position.copy(from).lerp(to, 0.5);
    tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    group.add(tube);
    const tip = new THREE.Object3D();
    tip.position.set(side * 1.22, -4.72, 0);
    group.add(tip);
    tips.push(tip);
  }
  return { root, body: group, tips };
}

// ---------------------------------------------------------------- liquid stream

export interface Stream {
  mesh: THREE.Mesh;
  head: N; // 0..1 leading front along the fall
  tail: N; // 0..1 trailing break
  radius: N; // cm at the spout
  amber: N; // 0 chestnut .. 1 blonde
  tiger: N; // stripe contrast
  wobble: N; // cm lateral oscillation
  set(from: THREE.Vector3, to: THREE.Vector3): void;
}

/** A falling liquid stream from `from` to `to`, necking as gravity accelerates it. */
export function createStream(clock: N, palette: { dark: string; light: string; stripe?: boolean }, seed = 0): Stream {
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 14, 64, true);
  geometry.translate(0, -0.5, 0); // top at 0, bottom at -1
  const head = uniform(1);
  const tail = uniform(0);
  const radius = uniform(0.14);
  const amber = uniform(0.5);
  const tiger = uniform(0.5);
  const wobble = uniform(0.03);
  const streamLen = uniform(10);

  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0 });
  const s = positionLocal.y.negate(); // 0 at the source, 1 at the surface
  const neck = float(1).div(sqrt(float(1).add(s.mul(streamLen).mul(0.35))));
  const front = sqrt(smoothstep(0, 0.035, head.sub(s)));
  const back = sqrt(smoothstep(0, 0.035, s.sub(tail)));
  const r = radius.mul(neck).mul(front).mul(back).max(0.0001);
  const zl = s.mul(streamLen);
  const wobX = sin(zl.mul(0.9).sub(clock.mul(7.0)).add(seed)).mul(wobble).mul(smoothstep(0, 0.3, s));
  const wobZ = cos(zl.mul(0.7).sub(clock.mul(5.3)).add(seed * 1.7)).mul(wobble).mul(0.6).mul(smoothstep(0, 0.3, s));
  m.positionNode = vec3(positionLocal.x.mul(r).add(wobX), positionLocal.y, positionLocal.z.mul(r).add(wobZ));
  m.opacityNode = step(tail, s).mul(step(s, head));
  m.alphaTestNode = float(0.5);

  const base = mix(color(palette.dark), color(palette.light), amber);
  let tone: N = base;
  if (palette.stripe !== false) {
    const ang = atan(positionLocal.z, positionLocal.x);
    const n = mx_noise_float(vec3(sin(ang).mul(0.9), zl.mul(0.55).sub(clock.mul(9.0)), cos(ang).mul(0.9).add(seed)));
    const stripes = smoothstep(-0.25, 0.45, n);
    tone = mix(base.mul(float(1).sub(tiger.mul(0.45))), mix(base, color(palette.light), 0.5), stripes.mul(tiger));
  }
  m.colorNode = tone;
  // Backlit translucency: thin liquid glows a little where light passes through it.
  m.emissiveNode = tone.mul(0.28);

  const mesh = new THREE.Mesh(geometry, m);
  mesh.frustumCulled = false;
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  return {
    mesh,
    head,
    tail,
    radius,
    amber,
    tiger,
    wobble,
    set(from: THREE.Vector3, to: THREE.Vector3) {
      mesh.position.copy(from);
      dir.copy(from).sub(to);
      const l = Math.max(0.01, dir.length());
      mesh.quaternion.setFromUnitVectors(up, dir.normalize());
      mesh.scale.set(1, l, 1);
      streamLen.value = l;
    },
  };
}

// ---------------------------------------------------------------- liquid surfaces

export interface SurfaceSpec {
  height: (p: N) => N; // cm, p in unit-disc local coordinates
  paint: (p: N) => N;
  roughness?: N;
  clearcoat?: number;
}

/**
 * A liquid surface disc (unit radius in local xy, lies flat after rotation).
 * The height field drives displacement and per-pixel normals (central
 * differences). `radius` is a uniform holding the disc radius in cm so height
 * and paint can work in physical distances.
 */
export function liquidSurface(build: (radius: N) => SurfaceSpec) {
  const radius = uniform(3);
  const spec = build(radius);
  const geometry = new THREE.RingGeometry(0.0005, 1, 128, 40);
  const m = new THREE.MeshPhysicalNodeMaterial({ metalness: 0, roughness: 0.3, clearcoat: spec.clearcoat ?? 0.7, clearcoatRoughness: 0.1 });
  const p = positionLocal.xy;
  m.positionNode = vec3(positionLocal.x, positionLocal.y, spec.height(p));
  const e = 0.006;
  const hx = spec.height(p.add(vec2(e, 0))).sub(spec.height(p.sub(vec2(e, 0)))).div(2 * e);
  const hy = spec.height(p.add(vec2(0, e))).sub(spec.height(p.sub(vec2(0, e)))).div(2 * e);
  // Gradient per local unit; the normal matrix carries the disc's xy scale.
  m.normalNode = transformNormalToView(normalize(vec3(hx.negate(), hy.negate(), 1)));
  m.colorNode = spec.paint(p);
  if (spec.roughness) m.roughnessNode = spec.roughness;
  const mesh = new THREE.Mesh(geometry, m);
  mesh.rotation.x = -Math.PI / 2;
  return {
    mesh,
    radius,
    material: m,
    place(y: number, r: number) {
      mesh.position.y = y;
      mesh.scale.set(r, r, 1);
      radius.value = r;
    },
  };
}

/** Rotate p by angle a. */
export function rotate2(p: N, a: N) {
  const c = cos(a);
  const s = sin(a);
  return vec2(p.x.mul(c).sub(p.y.mul(s)), p.x.mul(s).add(p.y.mul(c)));
}

/** Espresso in a cup: crema development, tiger mottling, impact rings, perimeter bubbles. */
export function createEspressoSurface(clock: N) {
  const crema = uniform(0); // 0 dark liquid .. 1 full crema
  const flow = uniform(0); // impact strength
  const settle = uniform(0); // 0 lively .. 1 closed and calm
  const swirl = uniform(0); // accumulated swirl angle (radians)
  const impactA = uniform(new THREE.Vector2(-0.3, 0));
  const impactB = uniform(new THREE.Vector2(0.3, 0));
  const level = uniform(0); // 0..1 for meniscus prominence

  const impactTerm = (p: N, imp: N, rad: N) => {
    const d = len(p.sub(imp)).mul(rad);
    const ripple = sin(d.mul(9.0).sub(clock.mul(15.0))).mul(exp(d.mul(-0.9))).mul(0.014);
    const dimple = exp(d.mul(d).mul(-5.0)).mul(-0.05);
    return ripple.add(dimple).mul(flow);
  };

  const height = (p: N, radiusNode: N) => {
    const r = len(p);
    const men = smoothstep(0.8, 1.0, r).mul(0.07).mul(level);
    const calm = sin(r.mul(radiusNode).mul(4.0).sub(clock.mul(3.0))).mul(0.004).mul(oneMinus(settle)).mul(oneMinus(flow));
    return men.add(impactTerm(p, impactA, radiusNode)).add(impactTerm(p, impactB, radiusNode)).add(calm);
  };

  const paint = (p: N, radiusNode: N) => {
    const r = len(p);
    const q = rotate2(p, swirl.mul(oneMinus(r).mul(0.9).add(0.1)));
    const mott = mx_fractal_noise_float(vec3(q.mul(6.5), clock.mul(0.04)), 2, 2.2, 0.55);
    const dark = col('#2a1307');
    const mid = col('#93521f');
    const light = col('#c88a48');
    const rim = col('#4e230c');
    const base = mix(dark, mid, crema);
    const tigerLight = mix(base, light, crema.mul(0.55));
    let c: N = mix(base.mul(0.9), tigerLight, smoothstep(-0.5, 0.6, mott).mul(0.75).add(0.15));
    c = mix(c, rim, smoothstep(0.72, 1.0, r).mul(0.6).mul(crema));
    const dA = len(p.sub(impactA)).mul(radiusNode);
    const dB = len(p.sub(impactB)).mul(radiusNode);
    const foam = exp(dA.mul(dA).mul(-1.6)).add(exp(dB.mul(dB).mul(-1.6))).mul(flow);
    c = mix(c, light, saturate(foam).mul(0.55));
    // Fine bubbles, gathering at the perimeter; large ones dissipate as it settles.
    const w = mx_worley_noise_float(q.mul(24).add(2.1));
    const fineMask = smoothstep(0.55, 0.98, r).mul(0.6).add(0.05).mul(crema);
    const fineRing = smoothstep(0.06, 0.1, w).mul(oneMinus(smoothstep(0.1, 0.15, w)));
    c = mix(c, light.mul(1.05), fineRing.mul(fineMask).mul(0.22));
    const wl = mx_worley_noise_float(q.mul(11).add(5.3));
    const largeMask = oneMinus(settle).mul(crema).mul(smoothstep(0.2, 0.9, r));
    const largeCore = oneMinus(smoothstep(0.05, 0.11, wl));
    const largeRing = smoothstep(0.1, 0.13, wl).mul(oneMinus(smoothstep(0.13, 0.17, wl)));
    c = mix(c, c.mul(0.7), largeCore.mul(largeMask).mul(0.6));
    c = mix(c, light.mul(1.25), largeRing.mul(largeMask).mul(0.7));
    return c;
  };

  const surface = liquidSurface((radius) => ({
    height: (p) => height(p, radius),
    paint: (p) => paint(p, radius),
    roughness: mix(float(0.42), float(0.24), settle),
    clearcoat: 0.55,
  }));

  return { ...surface, crema, flow, settle, swirl, impactA, impactB, level };
}


// ---------------------------------------------------------------- steam

/**
 * Pooled steam wisps: camera-facing soft cards on one InstancedMesh (one draw
 * call). Each wisp follows a deterministic life from the scene clock and its
 * own hash, so the same clock always yields the same plume. `amount` (0..1)
 * gates how many wisps are visible and how dense they are.
 */
export function createSteam(clock: N, count: number, opts: { spread: number; rise: number; size: number; tint?: string }) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const alpha = new Float32Array(count);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) seeds[i] = hash1(i * 7.13 + 1.7);
  const alphaAttr = new THREE.InstancedBufferAttribute(alpha, 1);
  alphaAttr.setUsage(THREE.DynamicDrawUsage);
  const seedAttr = new THREE.InstancedBufferAttribute(seeds, 1);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, toneMapped: false });
  const a = instancedBufferAttribute(alphaAttr) as N;
  const sd = instancedBufferAttribute(seedAttr) as N;
  const q: N = uv().sub(0.5);
  const soft = pow(oneMinus(smoothstep(0.0, 0.5, len(q))), 1.6);
  const wisps = mx_fractal_noise_float(vec3(q.mul(2.6).add(sd.mul(17)), clock.mul(0.35).add(sd.mul(9))), 2, 2.1, 0.55);
  m.colorNode = col(opts.tint ?? '#fbf7f0');
  m.opacityNode = soft.mul(smoothstep(-0.25, 0.55, wisps)).mul(a);
  const mesh = new THREE.InstancedMesh(geometry, m, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;

  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  return {
    mesh,
    /**
     * origin: emitter centre (world). amount: 0..1. heat lifts and thickens the plume.
     * emitter(i, h) may override a wisp's spawn point.
     */
    update(time: number, camera: THREE.Camera, origin: THREE.Vector3, amount: number, heat = 0.5) {
      camera.getWorldQuaternion(quat);
      for (let i = 0; i < count; i += 1) {
        const h1 = seeds[i];
        const h2 = hash1(i * 3.31 + 9.2);
        const h3 = hash1(i * 5.77 + 2.1);
        const h4 = hash1(i * 1.93 + 4.4);
        const life = 3.0 + h2 * 2.2;
        const age = (((time + h1 * life * 3) % life) + life) % life;
        const n = age / life;
        const ang = h3 * Math.PI * 2;
        const rr = Math.sqrt(h4) * opts.spread;
        const rise = opts.rise * (0.75 + heat * 0.5);
        const curl = Math.sin(age * (0.9 + h2) + h1 * 6.3) * (0.3 + n * 1.3);
        pos.set(
          origin.x + Math.cos(ang) * rr + curl + n * 0.5,
          origin.y + age * rise * (1 - n * 0.35),
          origin.z + Math.sin(ang) * rr + Math.cos(age * 0.7 + h3 * 5) * n * 1.1,
        );
        const s = opts.size * (0.6 + n * 2.2) * (0.8 + h2 * 0.5);
        scl.set(s, s * 1.25, s);
        matrix.compose(pos, quat, scl);
        mesh.setMatrixAt(i, matrix);
        const gate = h1 < amount ? 1 : 0;
        alpha[i] = gate * Math.pow(Math.sin(Math.PI * n), 1.4) * (0.28 + 0.3 * heat) * Math.min(1, amount * 1.6);
      }
      mesh.instanceMatrix.needsUpdate = true;
      alphaAttr.needsUpdate = true;
    },
  };
}

export function hash1(x: number): number {
  const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
