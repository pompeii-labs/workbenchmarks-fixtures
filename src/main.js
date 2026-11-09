import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { poseAt, pinState, BEAT, bodyMatrixAt } from './motion.js';
import { Pelican } from './pelican.js';
import { buildUnicycle, buildPin } from './unicycle.js';
import { buildSetting } from './setting.js';

const params = new URLSearchParams(location.search);
const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = reduceQuery.matches || params.has('still');
// A frame with two pins in the air and one in a wing.
const STILL_T = 10 * BEAT + 0.2;
const T0 = params.has('t') ? parseFloat(params.get('t')) : 2.0;
const FROZEN = params.has('t');

// ---------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 80);

const { spot } = buildSetting(scene, renderer.capabilities.getMaxAnisotropy());

// ---------- rig (mirrors bodyMatrixAt in motion.js)
const root = new THREE.Group();
const rollG = new THREE.Group();
const hubG = new THREE.Group();
const wheelSpin = new THREE.Group();
const frameG = new THREE.Group();
const bodyG = new THREE.Group();
bodyG.rotation.order = 'YXZ';
scene.add(root);
root.add(rollG);
rollG.add(hubG);
hubG.add(wheelSpin, frameG);
frameG.add(bodyG);
hubG.position.y = 0.3;

const unicycle = buildUnicycle(wheelSpin, frameG);
const pelican = new Pelican(bodyG, hubG);
const pinProto = buildPin();
const pins = [0, 1, 2].map(() => {
  const m = pinProto.clone();
  scene.add(m);
  return m;
});

const pose = {};
const lookW = new THREE.Vector3();
const tmp = new THREE.Vector3();

function setAct(t, dt) {
  poseAt(t, pose);
  root.position.set(pose.x, 0, pose.z);
  root.rotation.y = pose.yaw;
  rollG.rotation.z = pose.roll;
  wheelSpin.rotation.x = pose.wheel;
  unicycle.update(pose.wheel);
  frameG.rotation.x = pose.pitch;
  bodyG.position.set(0, pose.bodyY, 0.02);
  bodyG.rotation.set(pose.bodyPitch, pose.bodyYaw, pose.bodyRoll);
  root.updateMatrixWorld(true);

  // pins + what the pelican watches
  lookW.set(0, 0, 0);
  let wsum = 0;
  for (let i = 0; i < 3; i++) {
    const st = pinState(i, t, pins[i].position, pins[i].quaternion);
    if (st.flying) {
      // watch the pin that's on its way down to a wing most closely
      const w = Math.sin(Math.PI * st.s) * (0.4 + st.s);
      lookW.addScaledVector(pins[i].position, w);
      wsum += w;
    }
  }
  let look = null;
  if (wsum > 0.05) {
    lookW.divideScalar(wsum);
    look = bodyG.worldToLocal(lookW);
  }
  pelican.update(t, dt, pose, look);

  spot.target.position.set(pose.x, 1.0, pose.z);
  spot.target.updateMatrixWorld();
}

// ---------- camera: follows the performer, turns with it, drifts slowly
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.enableZoom = false;
controls.rotateSpeed = 0.6;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = 1.5;
controls.autoRotateSpeed = -0.9;

const AIM_Y = params.has('aim') ? parseFloat(params.get('aim')) : 1.3;
const ZOOM = params.has('zoom') ? parseFloat(params.get('zoom')) : 1;
function fitDistance() {
  const vh = THREE.MathUtils.degToRad(camera.fov / 2);
  const tv = Math.tan(vh);
  const th = tv * camera.aspect;
  // the act: about 1.7 m wide (wings + pins) and 2.9 m tall (floor to pin apex)
  return (Math.max(1.5 / tv, 0.95 / th) * 1.05) / ZOOM;
}

let lastYaw = 0;
function initCamera(t) {
  poseAt(t, pose);
  const target = new THREE.Vector3(pose.x, AIM_Y, pose.z);
  // front-left three-quarter view, slightly above
  const camA = parseFloat(params.get('cam') || '0');
  const dir = new THREE.Vector3(0.62, 0.22, 0.75)
    .normalize()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw + camA);
  camera.position.copy(target).addScaledVector(dir, fitDistance());
  controls.target.copy(target);
  lastYaw = pose.yaw;
  controls.update();
}

const yAxis = new THREE.Vector3(0, 1, 0);
function followCamera(dt) {
  const target = tmp.set(pose.x, AIM_Y, pose.z);
  const off = camera.position.clone().sub(controls.target);
  off.applyAxisAngle(yAxis, pose.yaw - lastYaw);
  lastYaw = pose.yaw;
  off.setLength(THREE.MathUtils.lerp(off.length(), fitDistance(), Math.min(1, dt * 3)));
  controls.target.copy(target);
  camera.position.copy(target).add(off);
  controls.update(dt);
}

// ---------- loop
let simT = reduced ? STILL_T : T0;
let lastNow = performance.now();
let running = false;

function warmUp(t) {
  // settle the springs (head look, pouch) so a still frame looks natural
  for (let s = t - 2; s < t; s += 1 / 60) setAct(s, 1 / 60);
  setAct(t, 1 / 60);
}

function renderStill() {
  controls.update();
  renderer.render(scene, camera);
}

function frame(now) {
  if (!running) return;
  const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
  lastNow = now;
  if (!FROZEN) simT += dt;
  setAct(simT, dt);
  followCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function start() {
  if (reduced) {
    running = false;
    controls.autoRotate = false;
    controls.enableDamping = false;
    simT = STILL_T;
    warmUp(simT);
    initCamera(simT);
    renderStill();
  } else {
    controls.autoRotate = !FROZEN;
    controls.enableDamping = true;
    warmUp(simT);
    initCamera(simT);
    running = true;
    lastNow = performance.now();
    requestAnimationFrame(frame);
  }
}

controls.addEventListener('change', () => {
  if (!running) renderer.render(scene, camera);
});
reduceQuery.addEventListener('change', (e) => {
  running = false;
  reduced = e.matches;
  start();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (!running) {
    const off = camera.position.clone().sub(controls.target).setLength(fitDistance());
    camera.position.copy(controls.target).add(off);
    renderStill();
  }
});

camera.aspect = window.innerWidth / window.innerHeight;
camera.updateProjectionMatrix();
start();

// hooks for automated checks
window.__act = { poseAt, pinState, bodyMatrixAt, bodyG, hubG, pins, setAct, renderer, scene, camera, get t() { return simT; } };
