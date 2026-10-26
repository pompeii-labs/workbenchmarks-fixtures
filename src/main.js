import * as THREE from 'three';
import { LiquidSim } from './sim.js';
import { liquidVert, liquidFrag } from './liquidShader.js';

const canvas = document.getElementById('stage');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  const div = document.createElement('div');
  div.className = 'fallback';
  div.textContent = 'This page needs WebGL 2 to show the espresso.';
  document.body.appendChild(div);
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120c09);

// ------------------------------------------------------------------
// Environment: a small procedural "studio" (warm room + window softbox).
// Used both as PMREM (for the ceramic) and as a raw cube map (for the
// liquid, which needs crisp, moving reflections).
// ------------------------------------------------------------------
// placed so the window reflects in the far part of the liquid
const KEY_DIR = new THREE.Vector3(0.36, 0.643, -0.675).normalize();

function buildEnvScene() {
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `varying vec3 vD; void main(){
        float y = vD.y;
        vec3 top = vec3(0.30, 0.27, 0.24);
        vec3 hor = vec3(0.16, 0.11, 0.08);
        vec3 bot = vec3(0.025, 0.017, 0.012);
        vec3 c = y > 0.0 ? mix(hor, top, smoothstep(0.0, 0.8, y)) : mix(hor, bot, smoothstep(0.0, 0.25, -y));
        gl_FragColor = vec4(c, 1.0);
      }`,
    })
  );
  env.add(sky);
  const panel = (w, h, color, intensity, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.copy(pos);
    m.lookAt(0, 0, 0);
    env.add(m);
    return m;
  };
  // main window softbox (with mullions so reflections read as a window)
  const winPos = KEY_DIR.clone().multiplyScalar(20);
  const win = panel(3.6, 2.4, 0xfff0e0, 7.0, winPos);
  const bars = new THREE.MeshBasicMaterial({ color: 0x050403 });
  const v = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 2.5), bars);
  const h = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 0.1), bars);
  v.position.z = h.position.z = 0.05;
  win.add(v, h);
  // warm practical lamp, opposite side
  panel(4, 4, 0xffb46a, 2.2, new THREE.Vector3(14, 7, 9));
  // cool fill from the front-right
  panel(10, 3, 0xbcd0ff, 0.7, new THREE.Vector3(6, 12, 14));
  return env;
}

const envScene = buildEnvScene();
const pmrem = new THREE.PMREMGenerator(renderer);
const envPM = pmrem.fromScene(envScene, 0.02);
scene.environment = envPM.texture;
scene.environmentIntensity = 1.0;

const cubeRT = new THREE.WebGLCubeRenderTarget(256, {
  type: THREE.HalfFloatType,
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
});
const cubeCam = new THREE.CubeCamera(0.1, 100, cubeRT);
cubeCam.update(renderer, envScene);

// ------------------------------------------------------------------
// Cup + saucer
// ------------------------------------------------------------------
const SAUCER_TOP = 0.07;
const CUP_FOOT = 0.06;
const CUP_H = 0.92; // outer height of bowl
const WALL = 0.07;
const RB = 0.5; // outer radius at foot top
const RR = 1.16; // outer rim radius
const INNER_BOTTOM = 0.16;
const LIQUID_Y = 0.8; // liquid level (cup local)

function outerR(y) {
  // y from CUP_FOOT..CUP_H
  const t = THREE.MathUtils.clamp((y - CUP_FOOT) / (CUP_H - CUP_FOOT), 0, 1);
  return RB + (RR - RB) * (1 - Math.pow(1 - t, 2.3)) * (0.92 + 0.08 * t);
}
function innerR(y) {
  return Math.max(0, outerR(y) - WALL * (1 + 0.25 * (1 - (y - CUP_FOOT) / CUP_H)));
}

function cupProfile() {
  const pts = [];
  pts.push(new THREE.Vector2(0.0, 0.0));
  pts.push(new THREE.Vector2(RB * 0.86, 0.0));
  pts.push(new THREE.Vector2(RB * 0.9, 0.012));
  pts.push(new THREE.Vector2(RB * 0.92, CUP_FOOT * 0.6));
  pts.push(new THREE.Vector2(RB * 0.97, CUP_FOOT));
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const y = CUP_FOOT + (CUP_H - CUP_FOOT) * (i / n);
    pts.push(new THREE.Vector2(outerR(y), y));
  }
  // rounded rim
  const ro = outerR(CUP_H), ri = innerR(CUP_H);
  const cx = (ro + ri) / 2, rad = (ro - ri) / 2;
  for (let i = 1; i < 10; i++) {
    const a = (i / 10) * Math.PI;
    pts.push(new THREE.Vector2(cx + Math.cos(a) * rad, CUP_H + Math.sin(a) * rad));
  }
  for (let i = n; i >= 0; i--) {
    const y = INNER_BOTTOM + 0.05 + (CUP_H - INNER_BOTTOM - 0.05) * (i / n);
    pts.push(new THREE.Vector2(innerR(y), y));
  }
  pts.push(new THREE.Vector2(innerR(INNER_BOTTOM + 0.05) * 0.6, INNER_BOTTOM));
  pts.push(new THREE.Vector2(0.0, INNER_BOTTOM));
  return pts;
}

function saucerProfile() {
  const pts = [];
  const add = (x, y) => pts.push(new THREE.Vector2(x, y));
  add(0, 0.012);
  add(0.75, 0.012);
  add(0.82, 0.0);
  add(0.9, 0.0);
  add(0.95, 0.02);
  // upper surface back to centre
  const top = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const x = 0.95 + t * 0.95;
    const y = 0.02 + Math.pow(t, 1.8) * 0.13;
    top.push([x, y]);
  }
  for (const [x, y] of top) add(x, y);
  // rim lip
  add(1.92, 0.165);
  add(1.93, 0.175);
  add(1.915, 0.185);
  for (let i = 16; i >= 0; i--) {
    const t = i / 16;
    const x = 0.95 + t * 0.92;
    const y = 0.065 + Math.pow(t, 1.8) * 0.115;
    add(x, y);
  }
  // well for the cup
  add(0.62, 0.06);
  add(0.58, SAUCER_TOP - 0.008);
  add(0.0, SAUCER_TOP - 0.008);
  return pts;
}

const ceramic = new THREE.MeshPhysicalMaterial({
  color: 0xe8e2da,
  roughness: 0.28,
  metalness: 0.0,
  clearcoat: 1.0,
  clearcoatRoughness: 0.06,
  sheen: 0.2,
});

const world = new THREE.Group();
scene.add(world);

const saucer = new THREE.Mesh(new THREE.LatheGeometry(saucerProfile(), 128), ceramic);
saucer.castShadow = true;
saucer.receiveShadow = true;
world.add(saucer);

const cup = new THREE.Group();
cup.position.y = SAUCER_TOP - 0.008;
world.add(cup);

const cupMesh = new THREE.Mesh(new THREE.LatheGeometry(cupProfile(), 160), ceramic);
cupMesh.castShadow = true;
cupMesh.receiveShadow = true;
cup.add(cupMesh);

// handle: a C-shaped loop whose two ends sit inside the slanted wall
{
  const yTop = 0.74, yBot = 0.3;
  const top = new THREE.Vector2(outerR(yTop) - WALL * 0.45, yTop);
  const bot = new THREE.Vector2(outerR(yBot) - WALL * 0.45, yBot);
  const chord = top.clone().sub(bot);
  const R = chord.length() / 2;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(R, 0.052, 20, 72, Math.PI), ceramic);
  handle.rotation.z = -Math.PI / 2;
  handle.scale.set(1, 1.35, 1.35);
  handle.castShadow = true;
  const g = new THREE.Group();
  g.add(handle);
  g.position.set((top.x + bot.x) / 2, (top.y + bot.y) / 2, 0);
  g.rotation.z = Math.atan2(chord.y, chord.x) - Math.PI / 2;
  cup.add(g);
  // handle points to the right-front
  cup.rotation.y = -0.85;
}

// table
{
  const tableMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, {}]),
    lights: true,
    vertexShader: `
      #include <common>
      #include <shadowmap_pars_vertex>
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vW = wp.xyz;
        vec3 transformedNormal = normalMatrix * normal;
        vec4 worldPosition = wp;
        #include <shadowmap_vertex>
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      #include <common>
      #include <packing>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float d = length(vW.xz);
        // dark walnut grain
        float grain = n(vec2(vW.x*0.6, vW.z*14.0)) * 0.6 + n(vec2(vW.x*2.0, vW.z*40.0)) * 0.4;
        vec3 base = mix(vec3(0.030,0.017,0.011), vec3(0.060,0.034,0.020), grain);
        float pool = exp(-d*d*0.10);
        float sh = getShadowMask();
        vec3 c = base * (0.35 + 1.6 * pool * mix(0.35, 1.0, sh));
        // soft contact occlusion under saucer
        c *= mix(0.45, 1.0, smoothstep(1.7, 2.6, d));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const table = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), tableMat);
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.001;
  table.receiveShadow = true;
  world.add(table);
}

// key light (matches the window in the environment)
const key = new THREE.DirectionalLight(0xfff1e0, 1.6);
key.position.copy(KEY_DIR).multiplyScalar(8);
key.target.position.set(0, 0, 0);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 3;
key.shadow.camera.bottom = -3;
key.shadow.camera.near = 1;
key.shadow.camera.far = 20;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
key.shadow.radius = 6;
key.shadow.intensity = 0.7;
world.add(key, key.target);

// ------------------------------------------------------------------
// Liquid
// ------------------------------------------------------------------
const SIM_SIZE = 256;
const sim = new LiquidSim(renderer, SIM_SIZE);
const LIQ_R = innerR(LIQUID_Y) + 0.012;
const AMP = 0.022;

const liquidMat = new THREE.ShaderMaterial({
  vertexShader: liquidVert,
  fragmentShader: liquidFrag,
  uniforms: {
    uState: { value: sim.stateTexture },
    uCoord: { value: sim.coordTexture },
    uEnv: { value: cubeRT.texture },
    uTexel: { value: new THREE.Vector2(1 / SIM_SIZE, 1 / SIM_SIZE) },
    uAmp: { value: AMP },
    uRadius: { value: LIQ_R },
    uLightDir: { value: KEY_DIR.clone() },
    uLightColor: { value: new THREE.Color(1.0, 0.93, 0.85).multiplyScalar(1.6) },
    uTime: { value: 0 },
  },
});
const liquidGeo = new THREE.PlaneGeometry(LIQ_R * 2, LIQ_R * 2, 200, 200);
liquidGeo.rotateX(-Math.PI / 2);
const liquid = new THREE.Mesh(liquidGeo, liquidMat);
liquid.position.y = LIQUID_Y;
// The liquid lives in cup space but the sim is in an un-rotated frame:
// counter-rotate so disk coords match world x/z directly.
const liquidHolder = new THREE.Group();
liquidHolder.position.y = cup.position.y;
liquidHolder.add(liquid);
world.add(liquidHolder);
const LIQUID_WORLD_Y = cup.position.y + LIQUID_Y;

// ------------------------------------------------------------------
// Camera framing
// ------------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const target = new THREE.Vector3(0, LIQUID_WORLD_Y - 0.12, 0);
const ELEV = THREE.MathUtils.degToRad(47);
const AZIM = THREE.MathUtils.degToRad(-18);

function frame() {
  const w = window.innerWidth, h = window.innerHeight;
  const aspect = w / h;
  camera.aspect = aspect;
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  // keep the cup (plus a bit of saucer) in view in both orientations
  const needH = 3.7, needW = 3.3;
  const dist = Math.max(needH / (2 * tanH), needW / (2 * tanH * aspect));
  camera.position.set(
    target.x + Math.sin(AZIM) * Math.cos(ELEV) * dist,
    target.y + Math.sin(ELEV) * dist,
    target.z + Math.cos(AZIM) * Math.cos(ELEV) * dist
  );
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

// ------------------------------------------------------------------
// Pointer -> liquid
// ------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -LIQUID_WORLD_Y);
const hit = new THREE.Vector3();

const pointer = {
  has: false, // a current position exists
  x: 0, y: 0, // disk units
  simX: 0, simY: 0, simHas: false, // where the sim last saw it
  onLiquid: false,
};

function toDisk(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(plane, hit)) return null;
  // sim disk: p.x = world x / R, p.y = world z / R
  return [hit.x / LIQ_R, hit.z / LIQ_R];
}

function onMove(e) {
  const d = toDisk(e.clientX, e.clientY);
  if (!d) return;
  pointer.x = d[0];
  pointer.y = d[1];
  if (!pointer.has) {
    pointer.has = true;
    pointer.simX = d[0];
    pointer.simY = d[1];
  }
}
function onLeave() {
  pointer.has = false;
}
canvas.addEventListener('pointermove', (e) => {
  // use coalesced events for fast swipes when available
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  if (evs && evs.length) {
    // only the latest position is needed; the sim interpolates the segment
    onMove(evs[evs.length - 1]);
  } else onMove(e);
});
canvas.addEventListener('pointerdown', (e) => {
  pointer.has = false;
  onMove(e);
});
canvas.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') onLeave(); });
canvas.addEventListener('pointercancel', onLeave);
canvas.addEventListener('pointerleave', onLeave);
window.addEventListener('blur', onLeave);

// ------------------------------------------------------------------
// Simulation driver (fixed time step)
// ------------------------------------------------------------------
let acc = 0;

function simulate(dt) {
  acc += dt;
  let steps = Math.floor(acc / sim.stepDt);
  const MAX = 10;
  if (steps > MAX) { steps = MAX; acc = 0; } else acc -= steps * sim.stepDt;
  if (steps === 0) return 0;

  const active = pointer.has;
  const x0 = pointer.simX, y0 = pointer.simY;
  const x1 = pointer.x, y1 = pointer.y;
  const total = steps * sim.stepDt;
  const vx = (x1 - x0) / total, vy = (y1 - y0) / total;
  const sp = Math.hypot(vx, vy);
  const near = Math.hypot(x1, y1) < 1.35 || Math.hypot(x0, y0) < 1.35;
  // ignore teleports (e.g. re-entering the window far away)
  const moving = active && near && sp > 0.02 && Math.hypot(x1 - x0, y1 - y0) < 1.2;
  const vel = [vx, vy];

  for (let i = 0; i < steps; i++) {
    const a = i / steps, b = (i + 1) / steps;
    sim.step([x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b], vel, moving);
  }
  if (active) { pointer.simX = x1; pointer.simY = y1; }
  sim.advect(total, [x0, y0, x1, y1], vel, moving);
  return steps;
}

function render() {
  liquidMat.uniforms.uState.value = sim.stateTexture;
  liquidMat.uniforms.uCoord.value = sim.coordTexture;
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
}

// ------------------------------------------------------------------
// Reduced motion: compose a still frame by stirring offscreen.
// ------------------------------------------------------------------
function composeStill() {
  sim.reset();
  const dt = sim.stepDt, sub = 4, fdt = dt * sub;
  let px = null, py = null;
  const T = 1.8;
  for (let t = 0; t < T; t += fdt) {
    // one lazy curl through the crema
    const s = t / T;
    const ang = s * Math.PI * 1.7 + 2.2;
    const rad = 0.6 * (1 - s * 0.6);
    const x = Math.cos(ang) * rad;
    const y = Math.sin(ang) * rad * 0.85;
    const ok = px !== null;
    const seg = ok ? [px, py, x, y] : [x, y, x, y];
    const vel = ok ? [(x - px) / fdt, (y - py) / fdt] : [0, 0];
    for (let i = 0; i < sub; i++) {
      const a = i / sub, b = (i + 1) / sub;
      sim.step([seg[0] + (seg[2] - seg[0]) * a, seg[1] + (seg[3] - seg[1]) * a, seg[0] + (seg[2] - seg[0]) * b, seg[1] + (seg[3] - seg[1]) * b], vel, ok);
    }
    sim.advect(fdt, seg, vel, ok);
    px = x; py = y;
  }
  // let it settle into soft ripples
  for (let t = 0; t < 1.2; t += fdt) {
    for (let i = 0; i < sub; i++) sim.step(null, null, false);
    sim.advect(fdt, null, null, false);
  }
}

const FIXED_DT = new URLSearchParams(location.search).has('fixeddt'); // deterministic testing
const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
let rafId = 0;
let last = performance.now();

function loop(now) {
  rafId = requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0;
  adaptResolution(dt);
  dt = FIXED_DT ? 1 / 60 : Math.min(dt, 1 / 20);
  simulate(dt);
  render();
}

// If frames are consistently slow (e.g. a 4K laptop panel on an integrated
// GPU), step the pixel ratio down; the simulation itself is resolution-independent.
let slowFrames = 0, sampled = 0;
function adaptResolution(dt) {
  if (FIXED_DT || dt <= 0 || dt > 0.25) return;
  sampled++;
  if (dt > 1 / 45) slowFrames++;
  if (sampled >= 90) {
    const pr = renderer.getPixelRatio();
    if (slowFrames > 60 && pr > 1) {
      renderer.setPixelRatio(Math.max(1, pr - 0.25));
      frame();
    }
    sampled = slowFrames = 0;
  }
}

function start() {
  cancelAnimationFrame(rafId);
  frame();
  if (reduceMQ.matches) {
    composeStill();
    render();
  } else {
    sim.reset();
    last = performance.now();
    rafId = requestAnimationFrame(loop);
  }
}

window.addEventListener('resize', () => {
  frame();
  if (reduceMQ.matches) render();
});
reduceMQ.addEventListener?.('change', start);
document.addEventListener('visibilitychange', () => { last = performance.now(); });

start();

// for automated checks
window.__espresso = {
  sim,
  // height along the +x radius (diagnostics)
  radial(n = 16) {
    const t = sim.state[0], N = sim.size, row = new Float32Array(N * 4);
    renderer.readRenderTargetPixels(t, 0, N / 2, N, 1, row);
    const out = [];
    for (let i = 0; i < n; i++) { const x = Math.floor(N / 2 + (i / (n - 1)) * (N / 2 - 2)); out.push(+row[x * 4].toFixed(3)); }
    return out;
  },
  stats() {
    const t = sim.state[0], n = sim.size;
    const buf = new Float32Array(n * n * 4);
    renderer.readRenderTargetPixels(t, 0, 0, n, n, buf);
    let mh = 0, mf = 0, sum = 0, cnt = 0;
    for (let i = 0; i < buf.length; i += 4) { mh = Math.max(mh, Math.abs(buf[i])); mf = Math.max(mf, Math.hypot(buf[i + 2], buf[i + 3])); sum += buf[i]; cnt++; }
    return { maxH: mh, meanH: sum / cnt, maxOrbital: mf };
  },
  project(x, y) {
    const v = new THREE.Vector3(x * LIQ_R, LIQUID_WORLD_Y, y * LIQ_R).project(camera);
    const r = canvas.getBoundingClientRect();
    return [r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height];
  },
};
