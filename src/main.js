import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  Sim, R, FLIPPER, LEFT, DIVIDER, OUTER, LANE_X, ARC, PLUNGER_REST,
} from './physics.js';
import { Game, BALLS_PER_GAME } from './game.js';
import { Sfx } from './audio.js';
import './style.css';

// ---------------------------------------------------------------- setup
const app = document.getElementById('app');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05030c);
scene.fog = new THREE.Fog(0x05030c, 40, 80);

const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.4, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// The whole table lives in a group tilted toward the player.
const TILT = 0.13;
const table = new THREE.Group();
table.rotation.x = TILT;
scene.add(table);

// table (x, y) -> local (x, h, -y)
const P = (x, y, h = 0) => new THREE.Vector3(x, h, -y);

const sim = new Sim();
const sfx = new Sfx();

// ---------------------------------------------------------------- lights
scene.add(new THREE.HemisphereLight(0x8a7dff, 0x100820, 0.5));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(-6, 22, 6);
key.target.position.set(0.45, 0, -10);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);

const glowA = new THREE.PointLight(0xff2bd6, 18, 14, 1.6);
glowA.position.copy(P(-2.5, 14, 2.5));
const glowB = new THREE.PointLight(0x18e7ff, 18, 14, 1.6);
glowB.position.copy(P(3, 6, 2.5));
table.add(glowA, glowB);

// ---------------------------------------------------------------- colors / materials
const C = {
  cyan: new THREE.Color(0x19f0ff),
  pink: new THREE.Color(0xff2bd6),
  yellow: new THREE.Color(0xffd21f),
  green: new THREE.Color(0x3dff7a),
  orange: new THREE.Color(0xff7a1a),
  violet: new THREE.Color(0x9a5cff),
};

const neon = (color, k = 1.5) => new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(k), toneMapped: false });

const railMat = new THREE.MeshStandardMaterial({ color: 0x1b1730, metalness: 0.7, roughness: 0.35, envMap: envTex, envMapIntensity: 0.6 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ff, metalness: 1, roughness: 0.12, envMap: envTex, envMapIntensity: 1.2 });
const rubberMat = new THREE.MeshStandardMaterial({ color: 0x0f0f14, roughness: 0.8 });

// ---------------------------------------------------------------- playfield texture
const FIELD = { x0: LEFT - 0.7, x1: OUTER + 0.7, y0: -1.6, y1: ARC.cy + ARC.r + 0.8 };
const TEX_W = 1024;
const TEX_H = Math.round((TEX_W * (FIELD.y1 - FIELD.y0)) / (FIELD.x1 - FIELD.x0));
function drawField() {
  const cv = document.createElement('canvas');
  cv.width = TEX_W;
  cv.height = TEX_H;
  const g = cv.getContext('2d');
  const sx = (x) => ((x - FIELD.x0) / (FIELD.x1 - FIELD.x0)) * TEX_W;
  const sy = (y) => ((FIELD.y1 - y) / (FIELD.y1 - FIELD.y0)) * TEX_H;
  const u = TEX_W / (FIELD.x1 - FIELD.x0); // pixels per unit

  const bg = g.createLinearGradient(0, 0, 0, TEX_H);
  bg.addColorStop(0, '#1a0b3a');
  bg.addColorStop(0.5, '#0d0a2a');
  bg.addColorStop(1, '#160624');
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX_W, TEX_H);

  // perspective grid
  g.strokeStyle = 'rgba(120, 80, 255, 0.16)';
  g.lineWidth = 2;
  for (let x = Math.ceil(FIELD.x0); x <= FIELD.x1; x += 1) {
    g.beginPath(); g.moveTo(sx(x), 0); g.lineTo(sx(x), TEX_H); g.stroke();
  }
  for (let y = Math.ceil(FIELD.y0); y <= FIELD.y1; y += 1) {
    g.beginPath(); g.moveTo(0, sy(y)); g.lineTo(TEX_W, sy(y)); g.stroke();
  }

  // glow halos under bumpers
  for (const b of sim.table.bumpers) {
    const rg = g.createRadialGradient(sx(b.x), sy(b.y), 0, sx(b.x), sy(b.y), u * 1.6);
    rg.addColorStop(0, 'rgba(255, 60, 220, 0.45)');
    rg.addColorStop(1, 'rgba(255, 60, 220, 0)');
    g.fillStyle = rg;
    g.fillRect(sx(b.x) - u * 2, sy(b.y) - u * 2, u * 4, u * 4);
  }

  // chevrons up the left orbit and the right target bank
  const chevron = (x, y, color) => {
    g.strokeStyle = color;
    g.lineWidth = u * 0.12;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(sx(x - 0.35), sy(y - 0.25));
    g.lineTo(sx(x), sy(y + 0.1));
    g.lineTo(sx(x + 0.35), sy(y - 0.25));
    g.stroke();
  };
  for (let i = 0; i < 4; i++) chevron(-3.6, 8.2 + i * 0.7, `rgba(25, 240, 255, ${0.25 + i * 0.12})`);
  for (let i = 0; i < 4; i++) chevron(3.5, 6.6 + i * 0.7, `rgba(255, 210, 31, ${0.25 + i * 0.12})`);

  // title
  g.save();
  g.translate(sx(0.3), sy(8.9));
  g.font = `900 ${u * 1.25}px "Arial Black", Impact, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#ff2bd6';
  g.shadowBlur = u * 0.5;
  g.fillStyle = 'rgba(255, 90, 230, 0.85)';
  g.fillText('NEON', 0, 0);
  g.font = `700 ${u * 0.34}px system-ui, sans-serif`;
  g.shadowBlur = u * 0.2;
  g.fillStyle = 'rgba(160, 240, 255, 0.85)';
  g.fillText('P I N B A L L', 0, u * 0.85);
  g.restore();

  // labels
  g.font = `800 ${u * 0.3}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.75)';
  MULT_POS.forEach(([x, y], i) => g.fillText(`${i + 2}X`, sx(x), sy(y - 0.52)));
  g.fillStyle = 'rgba(255, 210, 31, 0.8)';
  g.font = `800 ${u * 0.22}px system-ui, sans-serif`;
  g.fillText('SHOOT AGAIN', sx(SAVE_POS[0]), sy(SAVE_POS[1] - 0.48));

  // outline of the play area (painted edge under the rails)
  g.strokeStyle = 'rgba(25, 240, 255, 0.35)';
  g.lineWidth = u * 0.05;
  g.beginPath();
  g.arc(sx(ARC.cx), sy(ARC.cy), (ARC.r - 0.35) * u, Math.PI, 0);
  g.stroke();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const MULT_POS = [[-1.2, 6.5], [-0.4, 6.5], [0.4, 6.5], [1.2, 6.5]];
const SAVE_POS = [0, 4.7];

{
  const w = FIELD.x1 - FIELD.x0;
  const h = FIELD.y1 - FIELD.y0;
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshStandardMaterial({ map: drawField(), roughness: 0.32, metalness: 0.1, envMap: envTex, envMapIntensity: 0.35 });
  const field = new THREE.Mesh(geo, mat);
  field.rotation.x = -Math.PI / 2;
  field.position.copy(P((FIELD.x0 + FIELD.x1) / 2, (FIELD.y0 + FIELD.y1) / 2, 0));
  field.receiveShadow = true;
  table.add(field);

  // cabinet body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.8, 1.6, h + 0.8),
    new THREE.MeshStandardMaterial({ color: 0x120a22, metalness: 0.3, roughness: 0.6 }),
  );
  body.position.copy(P((FIELD.x0 + FIELD.x1) / 2, (FIELD.y0 + FIELD.y1) / 2, -0.81));
  table.add(body);
  // side rails of the cabinet
  for (const x of [FIELD.x0 - 0.2, FIELD.x1 + 0.2]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, h + 0.8), new THREE.MeshStandardMaterial({ color: 0x241c3c, metalness: 0.5, roughness: 0.45 }));
    rail.position.copy(P(x, (FIELD.y0 + FIELD.y1) / 2, 0.2));
    table.add(rail);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, h + 0.6), neon(C.violet, 2.5));
    strip.position.copy(P(x, (FIELD.y0 + FIELD.y1) / 2, 0.67));
    table.add(strip);
  }
}

// ---------------------------------------------------------------- walls
const WALL_H = 0.55;
function addWall(w, mat = railMat, stripColor = C.cyan) {
  const a = P(w.ax, w.ay);
  const b = P(w.bx, w.by);
  const len = a.distanceTo(b);
  const thick = w.r * 2;
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const ang = Math.atan2(-(b.z - a.z), b.x - a.x);
  const extra = thick; // overlap joints
  const m = new THREE.Mesh(new THREE.BoxGeometry(len + extra, WALL_H, thick), mat);
  m.position.set(mid.x, WALL_H / 2, mid.z);
  m.rotation.y = ang;
  m.castShadow = true;
  m.receiveShadow = true;
  table.add(m);
  if (stripColor) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(len + extra, 0.05, thick + 0.02), neon(stripColor));
    s.position.set(mid.x, WALL_H + 0.02, mid.z);
    s.rotation.y = ang;
    table.add(s);
  }
  return m;
}

let gateMesh = null;
for (const w of sim.table.walls) {
  if (w.kind === 'sling' || w.kind === 'target') continue;
  if (w.kind === 'gate') {
    gateMesh = addWall(w, chromeMat, null);
    gateMesh.scale.y = 0.6;
    gateMesh.position.y = WALL_H * 0.3;
    continue;
  }
  const color = w.arc ? C.pink : w.guide ? C.yellow : w.lane ? C.violet : C.cyan;
  addWall(w, railMat, w.apron ? null : color);
}

// ---------------------------------------------------------------- slingshots
const slingFx = [];
for (const s of sim.table.slings) {
  const shape = new THREE.Shape();
  // shape is in table (x, y); after rotation it maps to (x, h, -y)
  s.pts.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2a1650, metalness: 0.4, roughness: 0.4, emissive: C.pink, emissiveIntensity: 0.15 }));
  body.rotation.x = -Math.PI / 2;
  body.castShadow = true;
  table.add(body);
  // glowing rubber on the kicking face
  const [p1, , p3] = s.pts;
  const face = addWall({ ax: p1[0], ay: p1[1], bx: p3[0], by: p3[1], r: 0.07 }, rubberMat, null);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(face.geometry.parameters.width, 0.1, 0.16), neon(C.cyan, 1));
  bar.position.copy(face.position).setY(0.3);
  bar.rotation.y = face.rotation.y;
  table.add(bar);
  slingFx.push({ body, bar, flash: 0 });
}

// ---------------------------------------------------------------- bumpers
const bumperFx = sim.table.bumpers.map((b, i) => {
  const g = new THREE.Group();
  g.position.copy(P(b.x, b.y));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(b.r + 0.08, b.r + 0.12, 0.12, 40), chromeMat);
  base.position.y = 0.06;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r, 0.32, 40), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.2, roughness: 0.5 }));
  skirt.position.y = 0.28;
  const ringColor = [C.cyan, C.yellow, C.pink][i];
  const ringMat = neon(ringColor, 1);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(b.r - 0.02, 0.06, 12, 40), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.42;
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: ringColor, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.1 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.82, b.r * 0.9, 0.22, 40), capMat);
  cap.position.y = 0.58;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.35, b.r * 0.35, 0.05, 24), chromeMat);
  top.position.y = 0.71;
  for (const m of [base, skirt, cap]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(base, skirt, ring, cap, top);
  table.add(g);
  const light = new THREE.PointLight(ringColor, 0, 5, 2);
  light.position.copy(P(b.x, b.y, 1.0));
  table.add(light);
  return { group: g, ringMat, capMat, ringColor, light, flash: 0 };
});

// ---------------------------------------------------------------- posts
for (const p of sim.table.posts) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 0.5, 20), chromeMat);
  m.position.copy(P(p.x, p.y, 0.25));
  m.castShadow = true;
  table.add(m);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(p.r + 0.02, 0.04, 8, 20), neon(C.cyan, 1.5));
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(P(p.x, p.y, 0.3));
  table.add(ring);
}

// ---------------------------------------------------------------- inserts (flat lights)
function insert(x, y, r, color, shape = 'circle') {
  const geo = shape === 'circle' ? new THREE.CircleGeometry(r, 32) : new THREE.PlaneGeometry(r * 2, r * 1.2);
  const mat = new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true, opacity: 1, toneMapped: false, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.copy(P(x, y, 0.012));
  table.add(m);
  // ring
  const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.05, 32), new THREE.MeshBasicMaterial({ color: 0x8890a8 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(P(x, y, 0.011));
  if (shape === 'circle') table.add(ring);
  return { mesh: m, base: color.clone(), set(level) { mat.color.copy(this.base).multiplyScalar(0.12 + level * 2.6); } };
}

const rollFx = sim.table.rollovers.map((r) => ({ ins: insert(r.x, r.y, 0.3, C.green), flash: 0 }));
const multFx = MULT_POS.map(([x, y], i) => insert(x, y, 0.26, [C.yellow, C.orange, C.pink, C.violet][i]));
const saveFx = insert(SAVE_POS[0], SAVE_POS[1], 0.3, C.yellow);
const targetIns = sim.table.targets.map((t) => insert(t.x - 0.6, t.y, 0.16, C.orange));

// ---------------------------------------------------------------- targets
const targetFx = sim.table.targets.map((t) => {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: C.orange, emissiveIntensity: 0.3, roughness: 0.3 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.74), mat);
  m.position.copy(P(t.x - 0.02, t.y, 0.27));
  m.castShadow = true;
  table.add(m);
  return { mesh: m, mat, flash: 0, x: m.position.x };
});

// ---------------------------------------------------------------- flippers
function flipperGeometry() {
  const { len, r0, r1 } = FLIPPER;
  const s = new THREE.Shape();
  // tapered capsule along +x, pivot at origin; tangent lines between the two end circles
  const phi = Math.asin((r0 - r1) / len);
  s.absarc(0, 0, r0, Math.PI / 2 + phi, Math.PI * 1.5 - phi, false);
  s.absarc(len, 0, r1, -Math.PI / 2 - phi, Math.PI / 2 + phi, false);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.36, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 20 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}
const flipGeo = flipperGeometry();
const flipperFx = sim.flippers.map((f) => {
  const g = new THREE.Group();
  g.position.copy(P(f.px, f.py, 0.04));
  const body = new THREE.Mesh(flipGeo, new THREE.MeshStandardMaterial({ color: 0xf4f4ff, roughness: 0.35, metalness: 0.1 }));
  body.castShadow = true;
  const rubber = new THREE.Mesh(flipGeo, neon(C.pink, 1.6));
  rubber.scale.set(1.04, 0.35, 1.12);
  rubber.position.y = 0.12;
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.44, 16), chromeMat);
  pin.position.y = 0.22;
  g.add(rubber, body, pin);
  table.add(g);
  return g;
});

// ---------------------------------------------------------------- plunger
const plungerGroup = new THREE.Group();
{
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.25, 24), neon(C.pink, 1.2));
  knob.rotation.x = Math.PI / 2;
  knob.position.z = 0.12;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 12), chromeMat);
  rod.rotation.x = Math.PI / 2;
  rod.position.z = 1.4;
  const spring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 20), chromeMat);
  plungerGroup.add(knob, rod);
  plungerGroup.userData.springs = [];
  for (let i = 0; i < 6; i++) {
    const sp = spring.clone();
    plungerGroup.add(sp);
    plungerGroup.userData.springs.push(sp);
  }
  plungerGroup.position.copy(P(LANE_X, PLUNGER_REST, 0.3));
  table.add(plungerGroup);
}
function updatePlunger() {
  const y = sim.plunger.y;
  plungerGroup.position.copy(P(LANE_X, y, 0.3));
  const springs = plungerGroup.userData.springs;
  const springLen = 0.9 - (PLUNGER_REST - y);
  springs.forEach((sp, i) => { sp.position.z = 0.35 + (i / (springs.length - 1)) * springLen; });
}

// ---------------------------------------------------------------- ball
const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(R, 40, 28),
  new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.06, envMap: envTex, envMapIntensity: 1.4 }),
);
ballMesh.castShadow = true;
table.add(ballMesh);
const ballLight = new THREE.PointLight(0x9fe8ff, 2.5, 2.2, 2);
table.add(ballLight);

// ---------------------------------------------------------------- backglass
{
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 300;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 1024, 300);
  grd.addColorStop(0, '#2a0050');
  grd.addColorStop(1, '#00243a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 300);
  g.strokeStyle = '#19f0ff';
  g.lineWidth = 10;
  g.strokeRect(14, 14, 996, 272);
  g.font = '900 160px "Arial Black", Impact, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#ff2bd6';
  g.shadowBlur = 40;
  g.fillStyle = '#ff7bf0';
  g.fillText('NEON', 512, 150);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const w = FIELD.x1 - FIELD.x0 + 0.8;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * 300) / 1024), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) }));
  glass.position.copy(P((FIELD.x0 + FIELD.x1) / 2, FIELD.y1 + 0.4, (w * 300) / 1024 / 2 + 0.3));
  glass.rotation.x = -TILT * 0.5;
  table.add(glass);
}

// ---------------------------------------------------------------- camera fit
const camTarget = new THREE.Vector3();
const camBase = new THREE.Vector3();
function fitCamera() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 50 : 40;

  table.updateMatrixWorld(true);
  const pts = [];
  for (const x of [FIELD.x0, FIELD.x1]) for (const y of [FIELD.y0 + 0.6, FIELD.y1 + 1.6]) pts.push(P(x, y, 0.6).applyMatrix4(table.matrixWorld));
  const center = P((FIELD.x0 + FIELD.x1) / 2, (FIELD.y0 + FIELD.y1) / 2 + 0.6, 0).applyMatrix4(table.matrixWorld);
  camTarget.copy(center);

  // camera looks down the table from behind the flippers
  const elev = w / h < 0.8 ? 0.95 : 0.78; // radians above the playfield
  const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
  let lo = 5;
  let hi = 120;
  for (let i = 0; i < 30; i++) {
    const d = (lo + hi) / 2;
    camera.position.copy(center).addScaledVector(dir, d);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const fits = pts.every((p) => {
      const v = p.clone().project(camera);
      return Math.abs(v.x) < 0.94 && v.y < 0.9 && v.y > -0.94;
    });
    if (fits) hi = d; else lo = d;
  }
  camera.position.copy(center).addScaledVector(dir, hi);
  camera.lookAt(center);
  camBase.copy(camera.position);
}
window.addEventListener('resize', fitCamera);
fitCamera();

// ---------------------------------------------------------------- HUD
const hud = {
  score: document.getElementById('score'),
  ball: document.getElementById('ball'),
  hi: document.getElementById('hi'),
  mult: document.getElementById('mult'),
  msg: document.getElementById('msg'),
  sub: document.getElementById('sub'),
  hint: document.getElementById('hint'),
  mute: document.getElementById('mute'),
};
const fmt = (n) => n.toLocaleString('en-US');
let msgTimer = 0;
let shake = 0;

const game = new Game(sim, {
  message(text, secs) {
    hud.msg.textContent = text;
    hud.msg.classList.remove('pop');
    void hud.msg.offsetWidth;
    hud.msg.classList.add('pop');
    msgTimer = secs;
  },
  sound(name, arg) {
    sfx.play(name, arg);
  },
  flash(kind, id) {
    if (kind === 'bumper') { bumperFx[id].flash = 1; shake = Math.max(shake, 0.12); }
    else if (kind === 'sling') { slingFx[id].flash = 1; shake = Math.max(shake, 0.06); }
    else if (kind === 'target') targetFx[id].flash = 1;
    else if (kind === 'rollover') rollFx[id].flash = 1;
  },
});
hud.hi.textContent = fmt(game.hi);

// ---------------------------------------------------------------- input
const isTouch = window.matchMedia?.('(pointer: coarse)').matches;
const held = { left: new Set(), right: new Set(), plunge: new Set() };
const LEFT_KEYS = new Set(['KeyZ', 'KeyA', 'ArrowLeft', 'ShiftLeft', 'ControlLeft']);
const RIGHT_KEYS = new Set(['Slash', 'KeyL', 'ArrowRight', 'ShiftRight', 'ControlRight', 'Period']);
const PLUNGE_KEYS = new Set(['Space', 'Enter', 'ArrowDown', 'KeyS', 'NumpadEnter']);

function applyInput() {
  const playing = game.state === 'play';
  const l = playing && held.left.size > 0;
  const r = playing && held.right.size > 0;
  const prevL = sim.flippers[0].pressed;
  const prevR = sim.flippers[1].pressed;
  sim.setFlipper(0, l);
  sim.setFlipper(1, r);
  if (l && !prevL) { sfx.play('flip'); game.laneChange(-1); }
  if (r && !prevR) { sfx.play('flip'); game.laneChange(1); }
  if ((!l && prevL) || (!r && prevR)) sfx.play('unflip');
  sim.setPlunger(playing && held.plunge.size > 0 && sim.ballInLane());
}

function startIfIdle() {
  if (game.state === 'attract') {
    game.start();
    return true;
  }
  return false;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    const m = sfx.toggleMute();
    hud.mute.textContent = m ? 'SOUND OFF' : 'SOUND ON';
    return;
  }
  const isGameKey = LEFT_KEYS.has(e.code) || RIGHT_KEYS.has(e.code) || PLUNGE_KEYS.has(e.code);
  if (!isGameKey) return;
  e.preventDefault();
  sfx.unlock();
  if (e.repeat) return;
  if (PLUNGE_KEYS.has(e.code) && startIfIdle()) return;
  if (LEFT_KEYS.has(e.code)) held.left.add(e.code);
  if (RIGHT_KEYS.has(e.code)) held.right.add(e.code);
  if (PLUNGE_KEYS.has(e.code)) held.plunge.add(e.code);
  applyInput();
});
window.addEventListener('keyup', (e) => {
  held.left.delete(e.code);
  held.right.delete(e.code);
  held.plunge.delete(e.code);
  applyInput();
});

const touchLayer = document.getElementById('touch');
touchLayer.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  sfx.unlock();
  if (startIfIdle()) return;
  const id = 'p' + e.pointerId;
  if (e.clientX < window.innerWidth / 2) held.left.add(id);
  else {
    held.right.add(id);
    held.plunge.add(id); // right side also pulls the plunger while the ball is in the lane
  }
  touchLayer.setPointerCapture?.(e.pointerId);
  applyInput();
});
const release = (e) => {
  const id = 'p' + e.pointerId;
  held.left.delete(id);
  held.right.delete(id);
  held.plunge.delete(id);
  applyInput();
};
touchLayer.addEventListener('pointerup', release);
touchLayer.addEventListener('pointercancel', release);
touchLayer.addEventListener('contextmenu', (e) => e.preventDefault());
hud.mute.addEventListener('click', (e) => {
  e.stopPropagation();
  sfx.unlock();
  const m = sfx.toggleMute();
  hud.mute.textContent = m ? 'SOUND OFF' : 'SOUND ON';
});
hud.mute.addEventListener('pointerdown', (e) => e.stopPropagation());

function releaseAll() {
  held.left.clear();
  held.right.clear();
  held.plunge.clear();
  applyInput();
}
window.addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

// ---------------------------------------------------------------- loop
const timer = new THREE.Timer();
timer.connect?.(document);
let blink = 0;
let lastCharge = -1;

function updateVisuals(dt) {
  blink += dt;
  const b = sim.ball;
  ballMesh.visible = b.active;
  if (b.active) {
    ballMesh.position.copy(P(b.x, b.y, R));
    // roll the ball
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0.01) {
      const axis = new THREE.Vector3(-b.vy, 0, -b.vx).normalize();
      ballMesh.rotateOnWorldAxis(axis, (sp * dt) / R);
    }
    ballLight.position.copy(P(b.x, b.y, 0.9));
  }
  ballLight.intensity = b.active ? 2.5 : 0;

  sim.flippers.forEach((f, i) => {
    flipperFx[i].rotation.y = f.side > 0 ? f.a : Math.PI - f.a;
  });
  updatePlunger();

  if (gateMesh) gateMesh.visible = true;

  for (const fx of bumperFx) {
    fx.flash = Math.max(0, fx.flash - dt * 6);
    const k = fx.flash;
    fx.ringMat.color.copy(fx.ringColor).multiplyScalar(1 + k * 6);
    fx.capMat.emissiveIntensity = 0.4 + k * 5;
    fx.light.intensity = k * 30;
    const s = 1 + k * 0.08;
    fx.group.scale.set(s, 1 - k * 0.15, s);
  }
  for (const fx of slingFx) {
    fx.flash = Math.max(0, fx.flash - dt * 8);
    fx.bar.material.color.copy(C.cyan).multiplyScalar(1 + fx.flash * 6);
    fx.body.material.emissiveIntensity = 0.15 + fx.flash * 2;
  }
  targetFx.forEach((fx, i) => {
    fx.flash = Math.max(0, fx.flash - dt * 6);
    const lit = game.targets[i];
    fx.mat.emissiveIntensity = (lit ? 1.6 : 0.25) + fx.flash * 4;
    fx.mesh.position.x = fx.x + fx.flash * 0.08;
    targetIns[i].set(lit ? 1 : fx.flash);
  });
  rollFx.forEach((fx, i) => {
    fx.flash = Math.max(0, fx.flash - dt * 4);
    fx.ins.set(game.rolls[i] ? 1 : fx.flash * 0.8);
  });
  const attract = game.state !== 'play';
  multFx.forEach((ins, i) => {
    if (attract) ins.set(Math.sin(blink * 6 - i * 0.9) > 0.3 ? 0.8 : 0);
    else ins.set(game.mult >= i + 2 ? 1 : 0);
  });
  if (attract) rollFx.forEach((fx, i) => fx.ins.set(Math.sin(blink * 5 + i) > 0 ? 0.7 : 0));
  saveFx.set(game.ballSaveActive() ? (Math.sin(blink * 14) > 0 ? 1 : 0.1) : 0);

  // camera shake
  shake = Math.max(0, shake - dt);
  if (!reduceMotion && shake > 0) {
    const s = shake * 0.6;
    camera.position.set(camBase.x + (Math.random() - 0.5) * s, camBase.y + (Math.random() - 0.5) * s, camBase.z + (Math.random() - 0.5) * s * 0.5);
  } else {
    camera.position.copy(camBase);
  }
  camera.lookAt(camTarget);
}

function updateHud(dt) {
  hud.score.textContent = fmt(game.score);
  hud.hi.textContent = fmt(game.hi);
  hud.ball.textContent = game.state === 'play' ? `${game.ball} / ${BALLS_PER_GAME}` : '-';
  hud.mult.textContent = game.state === 'play' && game.mult > 1 ? `${game.mult}X` : '';

  if (msgTimer > 0) {
    msgTimer -= dt;
    if (msgTimer <= 0) hud.msg.textContent = '';
  }
  let sub = '';
  if (game.state === 'attract') {
    sub = isTouch ? 'TAP TO START' : 'PRESS SPACE TO START';
    if (msgTimer <= 0) hud.msg.textContent = game.score > 0 ? `LAST ${fmt(game.score)}` : 'NEON PINBALL';
  } else if (game.state === 'play' && sim.ballInLane() && sim.plunger.pull < 0.02 && sim.ball.y < PLUNGER_REST + R + 0.2) {
    sub = isTouch ? 'HOLD RIGHT SIDE TO LAUNCH' : 'HOLD SPACE TO LAUNCH';
  }
  hud.sub.textContent = sub;
  hud.sub.classList.toggle('blink', game.state === 'attract');
  hud.hint.style.opacity = game.state === 'play' ? '0.35' : '0.8';
}

function frame() {
  timer.update();
  const rawDt = timer.getDelta();
  let dt = rawDt;
  if (dt > 1 / 20) dt = 1 / 20;
  if (game.state !== 'play' && sim.plunger.charging) sim.setPlunger(false);
  if (game.state === 'play' && held.plunge.size && sim.ballInLane() && !sim.plunger.charging && sim.plunger.vel === 0) applyInput();
  sim.update(dt);
  if (sim.plunger.charging) {
    const step = Math.floor(sim.plunger.pull * 10);
    if (step !== lastCharge) { lastCharge = step; sfx.play('charge', sim.plunger.pull); }
  } else lastCharge = -1;
  game.update(dt);
  if (game.state !== 'play') applyInput();
  updateVisuals(dt);
  updateHud(dt);
  adaptQuality(rawDt);
  if (useBloom) composer.render();
  else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Drop resolution, then bloom, on slow devices so the game stays responsive.
let useBloom = true;
let perfTime = 0;
let perfFrames = 0;
let perfLevel = 0;
function adaptQuality(dt) {
  if (dt > 0.5) return; // tab was hidden
  perfTime += dt;
  perfFrames++;
  if (perfTime < 2) return;
  const fps = perfFrames / perfTime;
  perfTime = 0;
  perfFrames = 0;
  if (fps > 45 || perfLevel >= 2) return;
  perfLevel++;
  if (perfLevel === 1) {
    renderer.setPixelRatio(1);
    fitCamera();
  } else {
    useBloom = false;
    renderer.shadowMap.enabled = false;
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }
}

if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  window.__pinball = { sim, game, held, applyInput };
}

requestAnimationFrame(frame);
