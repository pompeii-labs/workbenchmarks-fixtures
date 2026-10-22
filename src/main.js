import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './style.css';
import { Game, BALLS_PER_GAME } from './game.js';
import { Sfx } from './audio.js';
import {
  BALL_R, WALLS, BUMPERS, SLINGS, FLIPPER, FLIPPERS, GATE, LANE, LANE_X, ROLLOVERS, ARC, BOUNDS, PLAYFIELD,
} from './table.js';

const HS_KEY = 'neonorbit.highscore';
const loadHigh = () => { try { return parseInt(localStorage.getItem(HS_KEY) || '0', 10) || 0; } catch { return 0; } };
const saveHigh = (v) => { try { localStorage.setItem(HS_KEY, String(v)); } catch { /* private mode */ } };

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05030c);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

// table space (x, y) -> world (x, h, -y)
const W = (x, y, h = 0) => new THREE.Vector3(x, h, -y);

// lights
scene.add(new THREE.HemisphereLight(0x8899ff, 0x220033, 0.5));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(-4, 18, 6);
key.target.position.set(0, 0, -10);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 14, bottom: -14, near: 1, far: 50 });
key.shadow.bias = -0.0005;
scene.add(key, key.target);

// ---------------------------------------------------------------- playfield art
function playfieldTexture() {
  const ppu = 80;
  const w = Math.round((BOUNDS.maxX - BOUNDS.minX) * ppu);
  const h = Math.round((BOUNDS.maxY - BOUNDS.minY) * ppu);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const P = (x, y) => [(x - BOUNDS.minX) * ppu, (BOUNDS.maxY - y) * ppu];

  g.fillStyle = '#07040f';
  g.fillRect(0, 0, w, h);

  // table outline clip
  g.save();
  g.beginPath();
  g.moveTo(...P(PLAYFIELD.left, -1));
  g.lineTo(...P(PLAYFIELD.left, ARC.cy));
  for (let i = 0; i <= 48; i++) {
    const a = Math.PI - (i / 48) * Math.PI;
    g.lineTo(...P(ARC.cx + Math.cos(a) * ARC.r, ARC.cy + Math.sin(a) * ARC.r));
  }
  g.lineTo(...P(LANE.outer, -1));
  g.closePath();
  g.clip();

  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1a0638');
  grad.addColorStop(0.45, '#0d0a3a');
  grad.addColorStop(1, '#16052a');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // starburst behind bumpers
  const [sx, sy] = P(0, 12.4);
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2, a1 = a0 + Math.PI / 24;
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx + Math.cos(a0) * 900, sy + Math.sin(a0) * 900);
    g.lineTo(sx + Math.cos(a1) * 900, sy + Math.sin(a1) * 900);
    g.closePath();
    g.fillStyle = i % 2 ? 'rgba(255,40,180,0.07)' : 'rgba(60,200,255,0.05)';
    g.fill();
  }
  const rg = g.createRadialGradient(sx, sy, 10, sx, sy, 260);
  rg.addColorStop(0, 'rgba(255,80,200,0.35)');
  rg.addColorStop(1, 'rgba(255,80,200,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, w, h);

  // perspective grid (synthwave floor) in the lower half
  g.strokeStyle = 'rgba(0,240,255,0.18)';
  g.lineWidth = 2;
  for (let y = 0; y < 9; y += 0.8) { g.beginPath(); g.moveTo(...P(-5, y)); g.lineTo(...P(5.3, y)); g.stroke(); }
  for (let x = -6; x <= 6; x += 1) { g.beginPath(); g.moveTo(...P(x * 0.4, 9)); g.lineTo(...P(x * 1.3, -1)); g.stroke(); }

  // title
  g.save();
  const [tx, ty] = P(0, 8.2);
  g.translate(tx, ty);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${0.95 * ppu}px "Trebuchet MS", Arial, sans-serif`;
  g.shadowColor = '#ff2bd6';
  g.shadowBlur = 30;
  g.fillStyle = '#ff5ae0';
  g.fillText('NEON ORBIT', 0, 0);
  g.shadowBlur = 0;
  g.lineWidth = 3;
  g.strokeStyle = '#ffffff';
  g.strokeText('NEON ORBIT', 0, 0);
  g.restore();

  // arrows pointing to the bumpers / lanes
  const arrow = (x, y, col, s = 1) => {
    const [ax, ay] = P(x, y);
    g.save();
    g.translate(ax, ay);
    g.scale(s, s);
    g.beginPath();
    g.moveTo(0, -0.5 * ppu); g.lineTo(0.35 * ppu, 0.1 * ppu); g.lineTo(-0.35 * ppu, 0.1 * ppu);
    g.closePath();
    g.fillStyle = col;
    g.globalAlpha = 0.55;
    g.fill();
    g.restore();
  };
  arrow(-2.4, 9.6, '#00e5ff'); arrow(2.4, 9.6, '#00e5ff');
  arrow(-4.0, 13.5, '#ffd400', 0.8); arrow(4.0, 13.5, '#ffd400', 0.8);

  // label text
  const label = (text, x, y, size, col, rot = 0) => {
    const [lx, ly] = P(x, y);
    g.save(); g.translate(lx, ly); g.rotate(rot);
    g.font = `bold ${size * ppu}px "Trebuchet MS", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = col; g.fillText(text, 0, 0); g.restore();
  };
  label('SHOOT AGAIN', 0, 0.05, 0.2, 'rgba(255,255,255,0.5)');
  label('LAUNCH', LANE_X, 6, 0.28, 'rgba(255,212,0,0.55)', -Math.PI / 2);
  label('BONUS X', 0, 7.0, 0.22, 'rgba(255,255,255,0.55)');
  label('JACKPOT', 0, 9.75, 0.2, 'rgba(255,255,255,0.5)');

  // shooter lane stripe
  g.fillStyle = 'rgba(255,212,0,0.08)';
  const [l0x, l0y] = P(LANE.inner, ARC.cy); const [l1x, l1y] = P(LANE.outer, -1);
  g.fillRect(l0x, l0y, l1x - l0x, l1y - l0y);
  g.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const pfW = BOUNDS.maxX - BOUNDS.minX, pfH = BOUNDS.maxY - BOUNDS.minY;
const playfield = new THREE.Mesh(
  new THREE.PlaneGeometry(pfW, pfH),
  new THREE.MeshStandardMaterial({ map: playfieldTexture(), roughness: 0.45, metalness: 0.1 })
);
playfield.rotation.x = -Math.PI / 2;
playfield.position.copy(W((BOUNDS.minX + BOUNDS.maxX) / 2, (BOUNDS.minY + BOUNDS.maxY) / 2));
playfield.receiveShadow = true;
scene.add(playfield);

// cabinet rails
const woodMat = new THREE.MeshStandardMaterial({ color: 0x1b1030, roughness: 0.6, metalness: 0.2 });
const railTrim = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2bd6).multiplyScalar(2.2), toneMapped: false });
function rail(x, y0, y1) {
  const len = y1 - y0;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, len), woodMat);
  m.position.copy(W(x, (y0 + y1) / 2, 0.45));
  scene.add(m);
  const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), railTrim);
  t.position.copy(W(x, (y0 + y1) / 2, 0.92));
  scene.add(t);
}
rail(PLAYFIELD.left - 0.33, -1.2, ARC.cy);
rail(LANE.outer + 0.33, -1.2, ARC.cy);
// front apron
const apron = new THREE.Mesh(new THREE.BoxGeometry(LANE.outer - PLAYFIELD.left + 1.16, 0.5, 0.9), woodMat);
apron.position.copy(W((PLAYFIELD.left + LANE.outer) / 2, -1.5, 0.25));
scene.add(apron);
// back arc rail
{
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI;
    pts.push(W(ARC.cx + Math.cos(a) * (ARC.r + 0.33), ARC.cy + Math.sin(a) * (ARC.r + 0.33), 0.92));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.04, 6), railTrim));
  const back = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.28, 8), woodMat);
  back.position.y = -0.45;
  back.scale.set(1, 1, 1);
  scene.add(back);
}

// ---------------------------------------------------------------- walls / posts
const metalMat = new THREE.MeshStandardMaterial({ color: 0x7a8098, roughness: 0.35, metalness: 0.85 });
const rubberMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x00e5ff, emissiveIntensity: 0.08 });
const neonCyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00e5ff).multiplyScalar(1.5), toneMapped: false });

function segmentMesh(w, mat) {
  const dx = w.bx - w.ax, dy = w.by - w.ay;
  const len = Math.hypot(dx, dy);
  const thick = Math.max(0.12, w.r * 2);
  const geo = new THREE.BoxGeometry(len, w.h, thick);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(W((w.ax + w.bx) / 2, (w.ay + w.by) / 2, w.h / 2));
  m.rotation.y = Math.atan2(dy, dx);
  m.castShadow = true;
  return m;
}
for (const w of WALLS) {
  if (w.kind === 'sling' || w.kind === 'slingEdge') continue;
  if (w.kind === 'post') {
    const m = segmentMesh(w, rubberMat);
    scene.add(m);
    for (const [x, y] of [[w.ax, w.ay], [w.bx, w.by]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(w.r, w.r, w.h, 16), rubberMat);
      c.position.copy(W(x, y, w.h / 2));
      c.castShadow = true;
      scene.add(c);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10), metalMat);
      cap.position.copy(W(x, y, w.h + 0.05));
      scene.add(cap);
    }
    continue;
  }
  scene.add(segmentMesh(w, metalMat));
  if (w.kind === 'wall' && w.h > 0.4) {
    const strip = segmentMesh({ ...w, r: 0.03, h: 0.04 }, neonCyan);
    strip.position.y = w.h + 0.02;
    strip.castShadow = false;
    scene.add(strip);
  }
}
// arc neon strip
{
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI;
    pts.push(W(ARC.cx + Math.cos(a) * (ARC.r - 0.06), ARC.cy + Math.sin(a) * (ARC.r - 0.06), 0.57));
  }
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.03, 6), neonCyan));
}

// gate
const gateMesh = segmentMesh({ ...GATE, r: 0.03, h: 0.3 }, metalMat);
scene.add(gateMesh);

// ---------------------------------------------------------------- shape helpers
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function extrudeTable(points2d, depth, mat, bevel = 0.03) {
  const shape = new THREE.Shape(points2d.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}
function circlePts(cx, cy, r, n = 24) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}

// ---------------------------------------------------------------- flippers
const flipperMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 });
const flipperRubber = new THREE.MeshStandardMaterial({ color: 0xff2050, roughness: 0.5, emissive: 0xff1040, emissiveIntensity: 0.6 });
const flipperMeshes = FLIPPERS.map((f) => {
  const g = new THREE.Group();
  const outline = hull([...circlePts(0, 0, FLIPPER.r0 - 0.035, 32), ...circlePts(FLIPPER.len, 0, FLIPPER.r1 - 0.035, 24)]);
  const body = extrudeTable(outline, 0.3, flipperMat, 0.035);
  body.position.y = 0.035;
  g.add(body);
  const band = extrudeTable(hull([...circlePts(0, 0, FLIPPER.r0, 32), ...circlePts(FLIPPER.len, 0, FLIPPER.r1, 24)]), 0.12, flipperRubber, 0.0);
  band.position.y = 0.12;
  g.add(band);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 12), metalMat);
  pin.position.y = 0.2;
  g.add(pin);
  g.position.copy(W(f.px, f.py, 0));
  scene.add(g);
  return g;
});

// ---------------------------------------------------------------- slingshots
const slingBodyMat = new THREE.MeshStandardMaterial({ color: 0x2a1050, roughness: 0.4, metalness: 0.3, emissive: 0x6020ff, emissiveIntensity: 0.4 });
const slingMeshes = SLINGS.map((s) => {
  const pts = [s.A, s.B, s.C];
  const body = extrudeTable(pts, 0.42, slingBodyMat, 0.04);
  scene.add(body);
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0xffd400, emissiveIntensity: 0.3 });
  const band = segmentMesh({ ax: s.B[0], ay: s.B[1], bx: s.C[0], by: s.C[1], r: 0.07, h: 0.32 }, bandMat);
  // push the band slightly outward along the kicking face
  let nx = -(s.C[1] - s.B[1]), ny = s.C[0] - s.B[0];
  if (nx * (s.A[0] - s.B[0]) + ny * (s.A[1] - s.B[1]) > 0) { nx = -nx; ny = -ny; }
  const nl = Math.hypot(nx, ny);
  const off = W((nx / nl) * 0.06, (ny / nl) * 0.06);
  band.position.add(off);
  scene.add(band);
  for (const [x, y] of pts) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 14), rubberMat);
    p.position.copy(W(x, y, 0.25));
    scene.add(p);
  }
  return { band, bandMat, base: band.position.clone(), out: off.clone().normalize() };
});

// ---------------------------------------------------------------- bumpers
const BUMPER_COLORS = [0xff2bd6, 0x00e5ff, 0xffd400];
const bumperMeshes = BUMPERS.map((b, i) => {
  const g = new THREE.Group();
  g.position.copy(W(b.x, b.y));
  const col = new THREE.Color(BUMPER_COLORS[i]);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(b.r + 0.05, b.r + 0.1, 0.12, 32), metalMat);
  base.position.y = 0.06;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r, 0.18, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: col, emissiveIntensity: 0.3 }));
  skirt.position.y = 0.2;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.7, b.r * 0.78, 0.35, 32),
    new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.3, metalness: 0.6 }));
  body.position.y = 0.45;
  const capMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, roughness: 0.2, transparent: true, opacity: 0.95 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.95, b.r * 0.95, 0.14, 32), capMat);
  cap.position.y = 0.68;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.45, b.r * 0.6, 0.08, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  top.position.y = 0.78;
  for (const m of [base, skirt, body, cap]) m.castShadow = true;
  g.add(base, skirt, body, cap, top);
  const light = new THREE.PointLight(col, 0, 4, 1.8);
  light.position.y = 1.0;
  g.add(light);
  scene.add(g);
  return { g, cap, capMat, skirt, top, light, col };
});

// ---------------------------------------------------------------- inserts (playfield lamps)
function insert(x, y, r, color, shape = 'circle') {
  const geo = shape === 'circle' ? new THREE.CircleGeometry(r, 28) : new THREE.CircleGeometry(r, 3);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), toneMapped: false, transparent: true });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  if (shape !== 'circle') m.rotation.z = Math.PI / 2;
  m.position.copy(W(x, y, 0.012));
  scene.add(m);
  const base = new THREE.Color(color);
  return {
    set(level) { mat.color.copy(base).multiplyScalar(0.12 + level * 2.4); mat.opacity = 0.55 + level * 0.45; },
  };
}
const rolloverLamps = ROLLOVERS.map((r) => insert(r.x, r.y + 0.75, 0.2, 0xffd400));
const rolloverWire = ROLLOVERS.map((r) => insert(r.x, r.y, 0.28, 0x00e5ff));
const multLamps = [2, 3, 4, 5].map((n, i) => insert(-1.35 + i * 0.9, 6.3, 0.26, 0xff2bd6));
const multLabels = [];
{
  // little number decals on the multiplier lamps
  [2, 3, 4, 5].forEach((n, i) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 40px Arial'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`${n}x`, 32, 34);
    const t = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(W(-1.35 + i * 0.9, 6.3, 0.02));
    scene.add(m);
    multLabels.push(m);
  });
}
const jackpotLamp = insert(0, 9.3, 0.32, 0x00ff9c, 'tri');
const shootAgainLamp = insert(0, 0.45, 0.22, 0xff4040);
const laneArrowLamps = [insert(-4.0, 12.3, 0.2, 0xffd400, 'tri'), insert(4.0, 12.3, 0.2, 0xffd400, 'tri')];

// ---------------------------------------------------------------- plunger & ball
const plunger = new THREE.Group();
{
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 12), metalMat);
  rod.rotation.x = Math.PI / 2;
  rod.position.z = 0.8;
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 20),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.08;
  const spring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 20), metalMat);
  plunger.add(rod, tip);
  plunger.userData.springs = [];
  for (let i = 0; i < 6; i++) {
    const s = spring.clone();
    s.position.z = 0.25 + i * 0.13;
    plunger.add(s);
    plunger.userData.springs.push(s);
  }
  plunger.position.y = 0.25;
  scene.add(plunger);
}

const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 32, 20),
  new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.08, envMapIntensity: 2.8 })
);
ballMesh.castShadow = true;
scene.add(ballMesh);
const ballLight = new THREE.PointLight(0xaaccff, 0.6, 2.5, 2);
scene.add(ballLight);

// ---------------------------------------------------------------- post processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.35, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- camera fit
const camTarget = new THREE.Vector3();
const camBase = new THREE.Vector3();
function fitCamera() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  const portrait = w / h < 0.9;
  camera.fov = portrait ? 45 : 36;
  camera.updateProjectionMatrix();
  const pitch = THREE.MathUtils.degToRad(portrait ? 66 : 56);
  const cx = (BOUNDS.minX + BOUNDS.maxX) / 2;
  camTarget.copy(W(cx, (BOUNDS.minY + BOUNDS.maxY) / 2 - (portrait ? 0.4 : 0.8)));
  const corners = [
    W(BOUNDS.minX - 0.5, BOUNDS.minY - 0.8, 0.9), W(BOUNDS.maxX + 0.5, BOUNDS.minY - 0.8, 0.9),
    W(BOUNDS.minX - 0.5, BOUNDS.maxY + 0.2, 0.9), W(BOUNDS.maxX + 0.5, BOUNDS.maxY + 0.2, 0.9),
    W(BOUNDS.minX - 0.5, BOUNDS.minY - 0.8, 0), W(BOUNDS.maxX + 0.5, BOUNDS.minY - 0.8, 0),
  ];
  const topPad = portrait ? 0.80 : 0.84; // leave room for HUD
  for (let d = 8; d < 80; d += 0.25) {
    camera.position.set(camTarget.x, camTarget.y + Math.sin(pitch) * d, camTarget.z + Math.cos(pitch) * d);
    camera.lookAt(camTarget);
    camera.updateMatrixWorld();
    const ok = corners.every((c) => {
      const p = c.clone().project(camera);
      return Math.abs(p.x) < 0.97 && p.y < topPad && p.y > -0.97;
    });
    if (ok) break;
  }
  camBase.copy(camera.position);
}
window.addEventListener('resize', fitCamera);
fitCamera();

// ---------------------------------------------------------------- game + HUD
const $ = (id) => document.getElementById(id);
const hud = { score: $('score'), ball: $('ball'), high: $('high'), mult: $('mult'), msg: $('msg'), overlay: $('overlay'), plungeBtn: $('plunge'), mute: $('mute') };
const sfx = new Sfx();
let shake = 0;
let msgTimer = 0;
let overlayLock = 0;

function flash(text, cls = '', time = 1.6) {
  hud.msg.textContent = text;
  hud.msg.className = 'show ' + cls;
  msgTimer = time;
}
const fmt = (n) => n.toLocaleString('en-US');

const game = new Game({
  highScore: loadHigh(),
  onEvent(type, d) {
    switch (type) {
      case 'flipper': sfx.flipper(d.up); break;
      case 'bumper': sfx.bumper(d.index); shake = Math.max(shake, 0.07); break;
      case 'sling': sfx.sling(); shake = Math.max(shake, 0.05); break;
      case 'hit': sfx.hit(d.speed); break;
      case 'rollover': sfx.rollover(); break;
      case 'lanes': sfx.fanfare(); flash(`BONUS ${d.multiplier}X`, 'pink'); break;
      case 'jackpot': sfx.fanfare([784, 988, 1175, 1568, 1976], 0.07); flash('JACKPOT! +10,000', 'green', 2.2); shake = 0.15; break;
      case 'extraball': sfx.fanfare([659, 784, 1046, 1318], 0.1); flash('EXTRA BALL!', 'gold', 2.2); break;
      case 'shootagain': flash('SHOOT AGAIN', 'gold'); break;
      case 'launch': sfx.launch(d.power); break;
      case 'saved': sfx.fanfare([880, 660, 880], 0.08); flash('BALL SAVED', 'cyan'); break;
      case 'serve': if (d.ball > 1) flash(`BALL ${d.ball}`, '', 1.2); break;
      case 'drain': sfx.drain(); flash('DRAIN', 'red', 1.4); shake = 0.1; break;
      case 'start': sfx.fanfare([523, 659, 784, 1046, 1318], 0.07); hideOverlay(); flash('BALL 1', '', 1.2); break;
      case 'gameover':
        sfx.gameover();
        if (d.newHigh) saveHigh(game.highScore);
        overlayLock = 1.2;
        msgTimer = 0;
        hud.msg.className = '';
        shownScore = d.score;
        showOverlay('gameover', d);
        break;
    }
  },
});

function showOverlay(kind, d = {}) {
  const o = hud.overlay;
  if (kind === 'gameover') {
    o.querySelector('h1').textContent = 'GAME OVER';
    o.querySelector('.sub').innerHTML = `SCORE <b>${fmt(d.score)}</b>${d.newHigh ? '<div class="newhigh">NEW HIGH SCORE!</div>' : ''}`;
    o.querySelector('.cta').textContent = isTouch ? 'TAP TO PLAY AGAIN' : 'PRESS ENTER TO PLAY AGAIN';
  }
  o.classList.remove('hidden');
}
function hideOverlay() { hud.overlay.classList.add('hidden'); }

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
hud.overlay.querySelector('.cta').textContent = isTouch ? 'TAP TO PLAY' : 'PRESS ENTER TO PLAY';

function tryStart() {
  sfx.unlock();
  if ((game.state === 'attract' || game.state === 'gameover') && overlayLock <= 0) {
    game.start();
    return true;
  }
  return false;
}

// keyboard
const KEYMAP = {
  ArrowLeft: 'left', KeyZ: 'left', ShiftLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', Slash: 'right', ShiftRight: 'right', KeyL: 'right', KeyD: 'right',
  Space: 'plunger', ArrowDown: 'plunger', KeyS: 'plunger',
};
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  sfx.unlock();
  if (e.code === 'KeyM') { hud.mute.classList.toggle('off', sfx.toggleMute()); return; }
  if (e.repeat) return;
  if (e.code === 'Enter' || (e.code === 'Space' && game.state !== 'playing' && game.state !== 'draining')) {
    if (tryStart()) return;
  }
  if (e.code === 'Enter' && game.state === 'playing') { game.setInput('plunger', true); return; }
  const a = KEYMAP[e.code];
  if (a) game.setInput(a, true);
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Enter') { game.setInput('plunger', false); return; }
  const a = KEYMAP[e.code];
  if (a) game.setInput(a, false);
});
window.addEventListener('blur', () => { for (const k of ['left', 'right', 'plunger']) game.setInput(k, false); });

// touch / mouse: left half = left flipper, right half = right flipper
const pointers = new Map();
function syncPointers() {
  let l = false, r = false;
  for (const side of pointers.values()) { if (side === 'left') l = true; if (side === 'right') r = true; }
  game.setInput('left', l);
  game.setInput('right', r);
}
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (tryStart()) return;
  pointers.set(e.pointerId, e.clientX < window.innerWidth / 2 ? 'left' : 'right');
  syncPointers();
});
const endPointer = (e) => { if (pointers.delete(e.pointerId)) syncPointers(); };
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
hud.overlay.addEventListener('pointerdown', (e) => { e.preventDefault(); tryStart(); });
hud.plungeBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); sfx.unlock(); if (!tryStart()) game.setInput('plunger', true); });
const plungeUp = () => game.setInput('plunger', false);
hud.plungeBtn.addEventListener('pointerup', plungeUp);
hud.plungeBtn.addEventListener('pointercancel', plungeUp);
hud.plungeBtn.addEventListener('pointerleave', plungeUp);
hud.mute.classList.toggle('off', sfx.muted);
hud.mute.addEventListener('click', () => { sfx.unlock(); hud.mute.classList.toggle('off', sfx.toggleMute()); });

// ---------------------------------------------------------------- frame loop
const timer = new THREE.Timer();
timer.connect(document);
const prevBall = new THREE.Vector2(game.ball.x, game.ball.y);
const tmpQ = new THREE.Quaternion();
const tmpAxis = new THREE.Vector3();
let lastPull = 0;
let shownScore = 0;

function frame(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.05);
  game.update(dt);
  const t = game.time;
  overlayLock -= dt;

  // ball
  const b = game.ball;
  ballMesh.visible = b.active || game.state === 'attract';
  ballMesh.position.copy(W(b.x, b.y, BALL_R));
  const mvx = b.x - prevBall.x, mvy = b.y - prevBall.y;
  const dist = Math.hypot(mvx, mvy);
  if (dist > 1e-5 && dist < 2) {
    tmpAxis.set(-mvy, 0, -mvx).normalize(); // up x velocity in world space
    tmpQ.setFromAxisAngle(tmpAxis, dist / BALL_R);
    ballMesh.quaternion.premultiply(tmpQ);
  }
  prevBall.set(b.x, b.y);
  ballLight.position.copy(W(b.x, b.y, 0.8));
  ballLight.visible = ballMesh.visible;

  // flippers
  game.flippers.forEach((f, i) => { flipperMeshes[i].rotation.y = f.angle; });

  // plunger
  plunger.position.z = -game.plungerY;
  plunger.position.x = LANE_X;
  const compress = (game.plungerY - LANE.plungerPulled) / (LANE.plungerRest - LANE.plungerPulled);
  plunger.userData.springs.forEach((s, i) => { s.position.z = 0.22 + i * (0.06 + 0.07 * compress); });
  if (game.plungerPull - lastPull > 0.12) { sfx.pull(); lastPull = game.plungerPull; }
  if (game.plungerPull === 0) lastPull = 0;

  // bumpers
  bumperMeshes.forEach((m, i) => {
    const g = game.bumperGlow[i];
    const idle = game.state === 'attract' || game.state === 'gameover' ? 0.5 + 0.5 * Math.sin(t * 3 + i * 2) : 0.35;
    m.capMat.emissiveIntensity = 0.4 + idle * 0.4 + g * 5;
    m.top.material.color.setScalar(1 + g * 3);
    m.light.intensity = g * 12;
    const s = 1 + g * 0.12;
    m.cap.scale.set(s, 1, s);
    m.cap.position.y = 0.68 - g * 0.12;
  });
  // slings
  slingMeshes.forEach((m, i) => {
    const g = game.slingGlow[i];
    m.bandMat.emissiveIntensity = 0.3 + g * 4;
    m.band.position.copy(m.base).addScaledVector(m.out, g * 0.12);
  });

  // inserts
  const attract = game.state === 'attract' || game.state === 'gameover';
  const blink = (rate) => (Math.sin(t * rate) > 0 ? 1 : 0);
  rolloverLamps.forEach((l, i) => l.set(attract ? blink(6 + i) : game.lanesLit[i] ? 1 : 0));
  rolloverWire.forEach((l, i) => l.set(game.rolloverInside[i] ? 1 : 0.1));
  multLamps.forEach((l, i) => l.set(attract ? (Math.floor(t * 5) % 4 === i ? 1 : 0) : game.multiplier >= i + 2 ? 1 : 0));
  const toJackpot = 25 - (game.bumperHits % 25);
  jackpotLamp.set(attract ? blink(4) : toJackpot <= 5 ? blink(14) : 0.05 + (1 - toJackpot / 25) * 0.6);
  shootAgainLamp.set(game.ballSave > 0 ? (game.ballSave < 2 ? blink(16) : 1) : attract ? blink(3) : 0);
  laneArrowLamps.forEach((l, i) => l.set(attract ? blink(5 + i) : blink(4 + i * 0.5) * 0.6));

  // camera shake
  shake *= Math.pow(0.0015, dt);
  camera.position.copy(camBase);
  if (shake > 0.002) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }

  // HUD
  shownScore += Math.ceil((game.score - shownScore) * Math.min(1, dt * 14));
  if (game.score < shownScore) shownScore = game.score;
  hud.score.textContent = fmt(shownScore);
  hud.ball.textContent = game.state === 'attract' ? '-' : `${Math.min(game.ballNumber, BALLS_PER_GAME)}/${BALLS_PER_GAME}`;
  hud.high.textContent = fmt(Math.max(game.highScore, game.state === 'playing' ? game.score : 0));
  hud.mult.textContent = `${game.multiplier}X`;
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) hud.msg.className = ''; }
  const needPlunge = game.state === 'playing' && !game.inPlay;
  hud.plungeBtn.classList.toggle('ready', needPlunge);

  composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// expose for debugging / automated checks
window.__pinball = { game, sfx };
