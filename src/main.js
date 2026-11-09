import * as THREE from 'three';
import { headingAt, meanDistance, pathPoint } from './act.js';
import { buildAct } from './performer.js';
import { buildStage } from './stage.js';

const canvas = document.getElementById('stage');
const params = new URLSearchParams(location.search);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.getElementById('fallback').style.display = 'grid';
  throw err;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
const stage = buildStage(scene);
const act = buildAct(scene);

// ---- camera: slow automatic orbit, drag to take over ---------------------------
const FOV = 30;
const ACT_TOP = 2.75; // highest a pin ever gets, with a little air
const ACT_HALF_W = 1.25; // half-width to keep in frame (wings, pins, surges)
const LOOK_Y = 1.32;
const DRIFT = 0.05; // rad/s
// The opening view (and the still frame) is a three-quarter front: bill and
// pouch in profile, both wings and the whole pattern readable.
const START_AZ = 2.32;
const STILL_T = 4.18; // two pins aloft, one in the wing
const STILL_AZ = 3.69;
const START_POL = 1.38;
const view = {
  az: Number(params.get('az') ?? START_AZ),
  pol: Number(params.get('pol') ?? START_POL), // from straight up
  zoom: 1,
  vAz: DRIFT,
  vPol: 0,
  fit: 6,
};
const POL_MIN = 0.35;
const POL_MAX = 1.52;

let maxPixelRatio = 2;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = FOV;
  camera.updateProjectionMatrix();
  // Distance at which the whole act fits, whichever way the screen is turned.
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const fitV = (ACT_TOP / 2 + 0.4) / tanV;
  const fitH = ACT_HALF_W / (tanV * camera.aspect);
  view.fit = Math.max(fitV, fitH);
  needsRender = true;
}

const pointers = new Map();
let pinch = 0;
let lastInput = -1e9;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.classList.add('dragging');
  view.vAz = view.vPol = 0;
  pinch = 0;
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  lastInput = performance.now();
  if (pointers.size === 1) {
    const k = 5.5 / Math.max(320, Math.min(window.innerWidth, window.innerHeight));
    view.az -= dx * k;
    view.pol = THREE.MathUtils.clamp(view.pol - dy * k, POL_MIN, POL_MAX);
    // Remember the gesture's speed so a flick carries on a little.
    view.vAz = THREE.MathUtils.lerp(view.vAz, (-dx * k) / 0.016, 0.5);
    view.vPol = THREE.MathUtils.lerp(view.vPol, (-dy * k) / 0.016, 0.5);
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) view.zoom = THREE.MathUtils.clamp((view.zoom * pinch) / d, 0.55, 1.8);
    pinch = d;
  }
  needsRender = true;
});
const release = (e) => {
  pointers.delete(e.pointerId);
  pinch = 0;
  if (!pointers.size) {
    canvas.classList.remove('dragging');
    if (performance.now() - lastInput > 80) view.vAz = view.vPol = 0; // held still, then let go
  }
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    view.zoom = THREE.MathUtils.clamp(view.zoom * Math.exp(e.deltaY * 0.001), 0.55, 1.8);
    needsRender = true;
  },
  { passive: false },
);

const target = new THREE.Vector3();
const ground = new THREE.Vector3();
function placeCamera(t) {
  pathPoint(meanDistance(t), ground);
  // ?rel=<radians> pins the camera relative to the rider (0 = dead ahead); for inspection.
  if (params.has('rel')) view.az = headingAt(meanDistance(t)) + Number(params.get('rel'));
  stage.aim(ground);
  target.set(ground.x, LOOK_Y, ground.z);
  const d = view.fit * view.zoom;
  const sp = Math.sin(view.pol);
  camera.position.set(
    target.x + d * sp * Math.sin(view.az),
    target.y + d * Math.cos(view.pol),
    target.z + d * sp * Math.cos(view.az),
  );
  camera.lookAt(target);
}

// ---- time ------------------------------------------------------------------------
// With prefers-reduced-motion the act holds one well-composed instant; the
// view can still be turned by hand, but nothing moves on its own.
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let still = motionQuery.matches || params.has('still');
let t = params.has('t') ? Number(params.get('t')) : still ? STILL_T : 0;
if (still && !params.has('az') && !params.has('rel')) view.az = STILL_AZ;
let needsRender = true;
let last = 0;
let lastRaw = 0;
let slowTime = 0;
let slowFrames = 0;
let raf = 0;

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05); // never jump after a stall
  last = now;
  const dragging = pointers.size > 0;
  // If the machine cannot keep up, give up resolution rather than smoothness.
  if (!still && maxPixelRatio > 1 && (window.devicePixelRatio || 1) > 1) {
    slowTime += Math.min((now - lastRaw) / 1000, 0.25);
    if (++slowFrames === 40) {
      if (slowTime / slowFrames > 1 / 40) {
        maxPixelRatio = Math.max(1, maxPixelRatio - 0.5);
        resize();
      }
      slowTime = slowFrames = 0;
    }
  }
  lastRaw = now;
  if (still) {
    if (!needsRender) return;
  } else {
    t += dt;
    if (!dragging) {
      // Ease from whatever the last gesture left behind back to the slow drift.
      const ease = 1 - Math.exp(-dt * 1.6);
      view.vAz += (DRIFT - view.vAz) * ease;
      view.vPol += (0 - view.vPol) * (1 - Math.exp(-dt * 5));
      view.az += view.vAz * dt;
      view.pol = THREE.MathUtils.clamp(view.pol + view.vPol * dt, POL_MIN, POL_MAX);
    }
  }
  needsRender = false;
  act.update(t);
  placeCamera(t);
  renderer.render(scene, camera);
}

motionQuery.addEventListener('change', (e) => {
  still = e.matches;
  if (still) {
    t = STILL_T;
    view.az = STILL_AZ;
    view.pol = START_POL;
  }
  needsRender = true;
});
document.addEventListener('visibilitychange', () => {
  cancelAnimationFrame(raf);
  if (!document.hidden) {
    last = lastRaw = performance.now();
    slowTime = slowFrames = 0;
    raf = requestAnimationFrame(frame);
  }
});
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
canvas.addEventListener('webglcontextrestored', () => (needsRender = true));

resize();
last = lastRaw = performance.now();
raf = requestAnimationFrame(frame);

// Handle for inspection from the console and for automated checks.
window.__act = {
  get time() {
    return t;
  },
  set time(v) {
    t = v;
    needsRender = true;
  },
  view,
  renderer,
  scene,
  camera,
};
