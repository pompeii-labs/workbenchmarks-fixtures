import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sim, STEP, BALL_R, LANE, PLUNGER_REST, ARC } from './physics.js';
import { initAudio, sfx, setMuted, isMuted } from './audio.js';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------
const TILT = THREE.MathUtils.degToRad(7);
const BOUNDS = { x0: -10.9, x1: 12.4, y0: -1.8, y1: 41.5 };
const WALL_H = 0.8;
const BALLS_PER_GAME = 3;
const BALL_SAVE_SECONDS = 6;
const HI_KEY = 'neon-pinball.highscore';

const COLORS = {
  pink: new THREE.Color('#ff2bd6'),
  cyan: new THREE.Color('#28f0ff'),
  yellow: new THREE.Color('#ffd22b'),
  orange: new THREE.Color('#ff7a1a'),
  green: new THREE.Color('#3dff8b'),
  white: new THREE.Color('#ffffff'),
};
const BUMPER_COLORS = [COLORS.pink, COLORS.cyan, COLORS.yellow];

const $ = (id) => document.getElementById(id);
const v3 = (x, y, h = 0) => new THREE.Vector3(x, h, -y);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

// ---------------------------------------------------------------------------
// Renderer, scene, post-processing
// ---------------------------------------------------------------------------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#07061a');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 300);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.35, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const table = new THREE.Group();
table.rotation.x = TILT;
scene.add(table);

// Lighting
scene.add(new THREE.HemisphereLight('#8a7dff', '#120a26', 0.55));
const sun = new THREE.DirectionalLight('#ffffff', 1.1);
sun.position.set(-6, 40, 14);
sun.target.position.set(0.8, 0, -18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 100 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const moodA = new THREE.PointLight(COLORS.pink, 40, 40, 1.6);
moodA.position.copy(v3(-9, 36, 6));
const moodB = new THREE.PointLight(COLORS.cyan, 40, 40, 1.6);
moodB.position.copy(v3(11, 8, 6));
table.add(moodA, moodB);

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------
const sim = new Sim();
const T = sim.t;

// ---------------------------------------------------------------------------
// Playfield artwork (drawn once to a canvas texture)
// ---------------------------------------------------------------------------
function makePlayfieldTexture() {
  const S = 48;
  const W = Math.round((BOUNDS.x1 - BOUNDS.x0) * S);
  const H = Math.round((BOUNDS.y1 - BOUNDS.y0) * S);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const X = (x) => (x - BOUNDS.x0) * S;
  const Y = (y) => (BOUNDS.y1 - y) * S;

  let grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#24104f');
  grad.addColorStop(0.5, '#130a35');
  grad.addColorStop(1, '#0b0622');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Glow behind bumpers
  grad = g.createRadialGradient(X(0), Y(27), 0, X(0), Y(27), 10 * S);
  grad.addColorStop(0, 'rgba(255,43,214,0.35)');
  grad.addColorStop(1, 'rgba(255,43,214,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Synthwave grid in the lower half
  g.strokeStyle = 'rgba(40,240,255,0.13)';
  g.lineWidth = 2;
  for (let x = -10; x <= 10; x += 1.25) {
    g.beginPath(); g.moveTo(X(x), Y(17)); g.lineTo(X(x * 1.4), Y(-2)); g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const y = 17 - Math.pow(i / 11, 1.6) * 19;
    g.beginPath(); g.moveTo(X(-10), Y(y)); g.lineTo(X(10), Y(y)); g.stroke();
  }

  // Starburst rays
  g.save();
  g.translate(X(0), Y(27));
  for (let i = 0; i < 24; i++) {
    g.rotate((Math.PI * 2) / 24);
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(40,240,255,0.05)';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-0.7 * S, -11 * S); g.lineTo(0.7 * S, -11 * S); g.fill();
  }
  g.restore();

  // Bumper rings
  for (const b of T.bumpers) {
    g.strokeStyle = '#' + BUMPER_COLORS[b.id].getHexString();
    g.globalAlpha = 0.5;
    g.lineWidth = 5;
    g.beginPath(); g.arc(X(b.x), Y(b.y), 1.7 * S, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  }

  // Logo
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${3.4 * S}px Impact, 'Arial Black', sans-serif`;
  g.shadowColor = '#ff2bd6';
  g.shadowBlur = 30;
  g.fillStyle = 'rgba(255,43,214,0.55)';
  g.fillText('NEON', X(0), Y(19.2));
  g.font = `700 ${1.0 * S}px 'Arial Black', sans-serif`;
  g.shadowColor = '#28f0ff';
  g.fillStyle = 'rgba(40,240,255,0.6)';
  g.fillText('P I N B A L L', X(0), Y(17.0));
  g.shadowBlur = 0;

  // Multiplier labels
  g.font = `800 ${0.6 * S}px sans-serif`;
  g.fillStyle = 'rgba(255,255,255,0.75)';
  [2, 3, 4, 5].forEach((m, i) => g.fillText('x' + m, X(-3 + i * 2), Y(13.2)));
  g.font = `700 ${0.42 * S}px sans-serif`;
  g.fillStyle = 'rgba(61,255,139,0.8)';
  g.fillText('SHOOT AGAIN', X(0), Y(7.0));
  g.fillStyle = 'rgba(255,210,43,0.8)';
  g.fillText('LIGHT LANES FOR MULTIPLIER', X(0.8), Y(33.4));
  g.fillStyle = 'rgba(40,240,255,0.7)';
  g.save();
  g.translate(X(-8.7), Y(21));
  g.rotate(-Math.PI / 2);
  g.fillText('TARGETS', 0, 0);
  g.restore();
  g.save();
  g.translate(X(8.7), Y(21));
  g.rotate(Math.PI / 2);
  g.fillText('TARGETS', 0, 0);
  g.restore();
  g.restore();

  // Shooter lane
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(X(LANE.x0), Y(LANE.top), (LANE.x1 - LANE.x0) * S, (LANE.top - BOUNDS.y0) * S);

  // Drain
  grad = g.createLinearGradient(0, Y(3), 0, Y(-1.8));
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = grad;
  g.fillRect(X(-1.8), Y(3), 3.6 * S, 5 * S);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// ---------------------------------------------------------------------------
// Table geometry
// ---------------------------------------------------------------------------
const mats = {
  field: new THREE.MeshStandardMaterial({ map: makePlayfieldTexture(), roughness: 0.35, metalness: 0.0 }),
  wall: new THREE.MeshStandardMaterial({ color: '#2a2550', roughness: 0.35, metalness: 0.6 }),
  fill: new THREE.MeshStandardMaterial({ color: '#1a1638', roughness: 0.6, metalness: 0.3 }),
  cabinet: new THREE.MeshStandardMaterial({ color: '#120d2c', roughness: 0.5, metalness: 0.4 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#c8c8d8', roughness: 0.15, metalness: 1.0 }),
  rail: new THREE.MeshStandardMaterial({ color: '#2b2650', roughness: 0.3, metalness: 0.8 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#f4f0ff', roughness: 0.5, metalness: 0.0 }),
  flipper: new THREE.MeshStandardMaterial({ color: '#fbf7ff', roughness: 0.25, metalness: 0.05 }),
  neonCyan: new THREE.MeshBasicMaterial({ color: COLORS.cyan.clone().multiplyScalar(1.6) }),
  neonPink: new THREE.MeshBasicMaterial({ color: COLORS.pink.clone().multiplyScalar(1.6) }),
};

function enableShadows(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

// Extrude a 2D table-space polygon upward into a solid.
function extrudePoly(points, height, material) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); // shape (x, y) -> (x, depth, -y)
  return enableShadows(new THREE.Mesh(geo, material));
}

// Playfield surface
{
  const w = BOUNDS.x1 - BOUNDS.x0, h = BOUNDS.y1 - BOUNDS.y0;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.field);
  plane.rotation.x = -Math.PI / 2;
  plane.position.copy(v3((BOUNDS.x0 + BOUNDS.x1) / 2, (BOUNDS.y0 + BOUNDS.y1) / 2, 0));
  plane.receiveShadow = true;
  table.add(plane);

  // Cabinet body and side rails
  const body = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, 3, h + 1.6), mats.cabinet);
  body.position.copy(v3((BOUNDS.x0 + BOUNDS.x1) / 2, (BOUNDS.y0 + BOUNDS.y1) / 2, -1.52));
  table.add(body);
  const railH = 1.5;
  const rails = [
    [BOUNDS.x0 - 0.4, (BOUNDS.y0 + BOUNDS.y1) / 2, 0.8, h + 1.6],
    [BOUNDS.x1 + 0.4, (BOUNDS.y0 + BOUNDS.y1) / 2, 0.8, h + 1.6],
    [(BOUNDS.x0 + BOUNDS.x1) / 2, BOUNDS.y1 + 0.4, w + 1.6, 0.8],
    [(BOUNDS.x0 + BOUNDS.x1) / 2, BOUNDS.y0 - 0.4, w + 1.6, 0.8],
  ];
  for (const [x, y, sx, sy] of rails) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(sx, railH, sy), mats.rail);
    r.position.copy(v3(x, y, railH / 2 - 0.2));
    table.add(enableShadows(r, false, true));
  }
  // Neon strips along the side rails
  for (const x of [BOUNDS.x0 - 0.4, BOUNDS.x1 + 0.4]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, h + 1.4), x < 0 ? mats.neonPink : mats.neonCyan);
    s.position.copy(v3(x, (BOUNDS.y0 + BOUNDS.y1) / 2, railH - 0.14));
    table.add(s);
  }
}

// Solid fills: area above the arch, side margins, lower aprons.
{
  const arcPts = [];
  for (let i = 0; i <= 40; i++) {
    const a = (Math.PI * i) / 40;
    arcPts.push([ARC.cx + (ARC.r + 0.15) * Math.cos(a), ARC.cy + (ARC.r + 0.15) * Math.sin(a)]);
  }
  // Above-arch fill: a polygon running round the outside of the arch.
  const top = [[BOUNDS.x1, ARC.cy], ...arcPts, [BOUNDS.x0, ARC.cy], [BOUNDS.x0, BOUNDS.y1], [BOUNDS.x1, BOUNDS.y1]];
  table.add(extrudePoly(top, WALL_H, mats.fill));
  table.add(extrudePoly([[BOUNDS.x0, BOUNDS.y0], [-10.15, BOUNDS.y0], [-10.15, ARC.cy], [BOUNDS.x0, ARC.cy]], WALL_H, mats.fill));
  table.add(extrudePoly([[LANE.x1 + 0.15, BOUNDS.y0], [BOUNDS.x1, BOUNDS.y0], [BOUNDS.x1, ARC.cy], [LANE.x1 + 0.15, ARC.cy]], WALL_H, mats.fill));
  const apronL = [[-10, 15.5], [-10, BOUNDS.y0], [-1.7, BOUNDS.y0], [-1.7, 2.4], [-4.7, 4.75], [-4.5, 6.0], [-6.4, 8.07]];
  table.add(extrudePoly(apronL, WALL_H * 0.7, mats.fill));
  table.add(extrudePoly(apronL.map(([x, y]) => [-x, y]).reverse(), WALL_H * 0.7, mats.fill));
}

// Walls: one box per physics segment.
const slingMeshes = [];
const targetMeshes = [];
for (const w of T.walls) {
  if (w.kind === 'plunger') continue;
  const len = Math.hypot(w.bx - w.ax, w.by - w.ay);
  const ang = Math.atan2(w.by - w.ay, w.bx - w.ax);
  const mid = [(w.ax + w.bx) / 2, (w.ay + w.by) / 2];
  const g = new THREE.Group();
  g.position.copy(v3(mid[0], mid[1], 0));
  g.rotation.y = ang;
  table.add(g);
  if (w.kind === 'sling') {
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: COLORS.pink, emissiveIntensity: 0.4, roughness: 0.4 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.55, 0.32), mat);
    m.position.y = 0.4;
    g.add(enableShadows(m));
    slingMeshes[w.id] = { mesh: m, mat, flash: 0 };
  } else if (w.kind === 'target') {
    const mat = new THREE.MeshStandardMaterial({ color: '#ffd22b', emissive: COLORS.yellow, emissiveIntensity: 0.15, roughness: 0.3 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(len - 0.1, 0.9, 0.22), mat);
    m.position.y = 0.45;
    g.add(enableShadows(m));
    targetMeshes[w.id] = { mesh: m, mat, flash: 0 };
  } else if (w.kind === 'gate') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), mats.chrome);
    m.position.y = 0.75;
    g.add(m);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 0.05), mats.neonCyan);
    flap.position.y = 0.5;
    g.add(flap);
  } else {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len + (w.arc ? 0.08 : 0.3), WALL_H, w.r * 2), mats.wall);
    m.position.y = WALL_H / 2;
    g.add(enableShadows(m));
    if (w.arc || w.lane) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(len + 0.08, 0.06, 0.12), mats.neonCyan);
      strip.position.y = WALL_H + 0.03;
      g.add(strip);
    } else if (w.guide) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.12), mats.neonPink);
      strip.position.y = WALL_H + 0.03;
      g.add(strip);
    }
  }
}

// Rubber posts
for (const p of T.posts) {
  const g = new THREE.Group();
  g.position.copy(v3(p.x, p.y));
  const rubber = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 0.5, 24), mats.rubber);
  rubber.position.y = 0.3;
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.0, 12), mats.chrome);
  pin.position.y = 0.5;
  g.add(rubber, pin);
  table.add(enableShadows(g));
}

// Pop bumpers
const bumperFx = T.bumpers.map((b) => {
  const color = BUMPER_COLORS[b.id];
  const g = new THREE.Group();
  g.position.copy(v3(b.x, b.y));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(b.r + 0.1, b.r + 0.15, 0.2, 40), mats.chrome);
  base.position.y = 0.1;
  const bodyMat = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.4), emissive: color, emissiveIntensity: 0.25, roughness: 0.3, transparent: true, opacity: 0.92 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.82, b.r * 0.9, 0.6, 40), bodyMat);
  body.position.y = 0.5;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(b.r - 0.02, 0.09, 10, 40), mats.chrome);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.45;
  const capMat = new THREE.MeshStandardMaterial({ color: color.clone().lerp(COLORS.white, 0.35), emissive: color, emissiveIntensity: 0.12, roughness: 0.25, metalness: 0.2 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(b.r + 0.12, b.r, 0.22, 40), capMat);
  cap.position.y = 0.92;
  const star = new THREE.Mesh(new THREE.CircleGeometry(0.45, 5), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.2) }));
  star.rotation.x = -Math.PI / 2;
  star.position.y = 1.035;
  g.add(base, body, ring, cap, star);
  enableShadows(g);
  star.castShadow = false;
  const light = new THREE.PointLight(color, 1.5, 9, 1.8);
  light.position.y = 1.6;
  g.add(light);
  table.add(g);
  return { g, bodyMat, capMat, star, ring, light, color, flash: 0 };
});

// Flippers
function flipperGeometry(f) {
  const s = new THREE.Shape();
  s.moveTo(0, f.r0);
  s.absarc(0, 0, f.r0, Math.PI / 2, (Math.PI * 3) / 2, false);
  s.lineTo(f.len, -f.r1);
  s.absarc(f.len, 0, f.r1, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(0, f.r0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2, curveSegments: 16 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.08, 0);
  return geo;
}
const flipperMeshes = T.flippers.map((f) => {
  const g = new THREE.Group();
  g.position.copy(v3(f.px, f.py));
  const body = new THREE.Mesh(flipperGeometry(f), mats.flipper);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(f.len - 0.6, 0.05, 0.14),
    new THREE.MeshBasicMaterial({ color: (f.side === 'left' ? COLORS.pink : COLORS.cyan).clone().multiplyScalar(1.8) }),
  );
  stripe.position.set(f.len / 2 + 0.05, 0.7, 0);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16), mats.chrome);
  cap.position.y = 0.72;
  g.add(body, stripe, cap);
  table.add(enableShadows(g));
  return g;
});

// Plunger
const plunger = new THREE.Group();
{
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4, 12), mats.chrome);
  rod.rotation.x = Math.PI / 2;
  rod.position.set(0, 0.45, 2);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.3, 24), new THREE.MeshStandardMaterial({ color: '#ff2b5a', roughness: 0.4, emissive: '#ff2b5a', emissiveIntensity: 0.3 }));
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, 0.45, 0.15);
  const spring = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 80 }, (_, i) => new THREE.Vector3(Math.cos(i * 0.9) * 0.35, 0.45 + Math.sin(i * 0.9) * 0.35, 0.4 + i * 0.03))), 240, 0.05, 6),
    mats.chrome,
  );
  plunger.add(rod, tip, spring);
  enableShadows(plunger);
  plunger.position.copy(v3(LANE.cx, PLUNGER_REST + 0.15));
  table.add(plunger);
}

// ---------------------------------------------------------------------------
// Lamps (inserts)
// ---------------------------------------------------------------------------
function makeLamp(x, y, geo, color, rot = 0) {
  const mat = new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = rot;
  m.position.copy(v3(x, y, 0.012));
  table.add(m);
  const lamp = {
    mesh: m,
    level: 0,
    set(l) {
      this.level = l;
      mat.color.copy(color).multiplyScalar(0.12 + l * 2.4);
      mat.opacity = 0.55 + 0.45 * Math.min(1, l);
    },
  };
  lamp.set(0);
  return lamp;
}
const ringGeo = new THREE.RingGeometry(0.42, 0.62, 32);
const discGeo = new THREE.CircleGeometry(0.45, 32);
const chevronGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.7, 0); s.lineTo(0, 0.55); s.lineTo(0.7, 0); s.lineTo(0.7, 0.3); s.lineTo(0, 0.85); s.lineTo(-0.7, 0.3); s.lineTo(-0.7, 0);
  return new THREE.ShapeGeometry(s);
})();

const lamps = {
  rollovers: T.rollovers.map((r) => makeLamp(r.x, r.y, discGeo, COLORS.yellow)),
  rolloverRings: T.rollovers.map((r) => makeLamp(r.x, r.y, ringGeo, COLORS.orange)),
  mult: [2, 3, 4, 5].map((m, i) => makeLamp(-3 + i * 2, 13.2, ringGeo, COLORS.pink)),
  shootAgain: makeLamp(0, 8.2, ringGeo, COLORS.green),
  targets: [
    makeLamp(-8.6, 19.95, new THREE.CircleGeometry(0.3, 20), COLORS.cyan),
    makeLamp(-8.6, 22.05, new THREE.CircleGeometry(0.3, 20), COLORS.cyan),
    makeLamp(8.6, 19.95, new THREE.CircleGeometry(0.3, 20), COLORS.cyan),
    makeLamp(8.6, 22.05, new THREE.CircleGeometry(0.3, 20), COLORS.cyan),
  ],
  chevrons: [0, 1, 2, 3].map((i) => makeLamp(0, 21 + i * 0.9, chevronGeo, COLORS.cyan)),
  power: Array.from({ length: 8 }, (_, i) => makeLamp(LANE.cx, 3.4 + i * 0.85, new THREE.PlaneGeometry(0.8, 0.45), i < 5 ? COLORS.yellow : COLORS.pink)),
};
// Rotate chevrons to point up the table (their shape already points +y).
lamps.chevrons.forEach((l) => (l.mesh.rotation.z = 0));

// Ball
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 40, 24), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, metalness: 1 }));
ballMesh.castShadow = true;
table.add(ballMesh);

// ---------------------------------------------------------------------------
// Camera fitting
// ---------------------------------------------------------------------------
let shake = 0;
const camBase = new THREE.Vector3();
const camLook = new THREE.Vector3();
function fitCamera() {
  const w = window.innerWidth, h = window.innerHeight;
  const aspect = w / h;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = aspect;

  table.updateMatrixWorld(true);
  const corners = [];
  for (const x of [BOUNDS.x0 - 0.8, BOUNDS.x1 + 0.8]) {
    for (const y of [BOUNDS.y0 - 0.8, BOUNDS.y1 + 0.8]) {
      for (const hgt of [0, 1.5]) corners.push(v3(x, y, hgt).applyMatrix4(table.matrixWorld));
    }
  }
  const center = v3((BOUNDS.x0 + BOUNDS.x1) / 2, (BOUNDS.y0 + BOUNDS.y1) / 2 + 1.5, 0).applyMatrix4(table.matrixWorld);
  // Wide screens get a lower, more dramatic angle; tall screens look more top-down.
  const elev = THREE.MathUtils.degToRad(aspect > 1 ? 54 : aspect > 0.7 ? 62 : 70);
  const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
  const topMargin = 0.86, side = 0.97;
  let lo = 10, hi = 300;
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2;
    camera.position.copy(center).addScaledVector(dir, d);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    let ok = true;
    for (const c of corners) {
      const p = c.clone().project(camera);
      if (Math.abs(p.x) > side || p.y > topMargin || p.y < -0.98) { ok = false; break; }
    }
    if (ok) hi = d; else lo = d;
  }
  camera.position.copy(center).addScaledVector(dir, hi);
  camera.lookAt(center);
  camBase.copy(camera.position);
  camLook.copy(center);
}
window.addEventListener('resize', fitCamera);
fitCamera();

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const loadHi = () => {
  try { return parseInt(localStorage.getItem(HI_KEY) || '0', 10) || 0; } catch { return 0; }
};
const saveHi = (v) => {
  try { localStorage.setItem(HI_KEY, String(v)); } catch { /* storage unavailable */ }
};

const game = {
  state: 'attract', // attract | playing | over
  score: 0,
  shownScore: 0,
  ball: 0,
  mult: 1,
  bonus: 0,
  lanes: [false, false, false],
  targets: [false, false, false, false],
  hi: loadHi(),
  saveUntil: 0,
  saveUsed: false,
  inPlay: false,
  waiting: false,
  newHi: false,
};
const timers = [];
const after = (sec, fn) => timers.push({ at: sim.time + sec, fn });

const ui = {
  score: $('score'), ball: $('ball'), hi: $('hi'), mult: $('mult'), msg: $('message'),
  overlay: $('overlay'), sub: $('overlay-sub'), start: $('start'), launch: $('launch'), mute: $('mute'),
};
ui.hi.textContent = fmt(game.hi);

let msgTimer = 0;
function message(text, ms = 1200, cls = '') {
  ui.msg.textContent = text;
  ui.msg.className = 'message show ' + cls;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (ui.msg.className = 'message ' + cls), ms);
}

function addScore(pts) {
  if (game.state !== 'playing') return;
  game.score += pts * game.mult;
  if (game.score > game.hi) {
    if (!game.newHi && game.hi > 0) {
      message('NEW HIGH SCORE!', 1400, 'yellow');
      sfx.bonus();
    }
    game.newHi = true;
    game.hi = game.score;
  }
}

function startGame() {
  initAudio();
  Object.assign(game, {
    state: 'playing', score: 0, shownScore: 0, ball: 1, mult: 1, bonus: 0,
    lanes: [false, false, false], targets: [false, false, false, false], newHi: false,
    saveUsed: false, saveUntil: 0, inPlay: false, waiting: false,
  });
  timers.length = 0;
  ui.overlay.classList.add('hidden');
  sfx.start();
  serveBall();
  message('BALL 1', 1000, 'cyan');
}

function serveBall() {
  sim.serve();
  game.inPlay = false;
  game.waiting = false;
}

function endBall() {
  game.waiting = true;
  const bonus = game.bonus * game.mult;
  if (bonus > 0) {
    game.score += bonus;
    if (game.score > game.hi) { game.hi = game.score; game.newHi = true; }
    message(`BONUS ${fmt(game.bonus)}${game.mult > 1 ? ' x' + game.mult : ''}`, 1300, 'yellow');
    sfx.bonus();
  }
  game.bonus = 0;
  game.mult = 1;
  after(bonus > 0 ? 1.6 : 0.9, () => {
    if (game.ball >= BALLS_PER_GAME) return gameOver();
    game.ball++;
    game.saveUsed = false;
    serveBall();
    message(game.ball === BALLS_PER_GAME ? 'LAST BALL' : `BALL ${game.ball}`, 1000, 'cyan');
  });
}

function gameOver() {
  game.state = 'over';
  sfx.gameOver();
  const isHi = game.newHi;
  if (isHi) {
    saveHi(game.hi);
    sfx.highScore();
  }
  ui.sub.textContent = `GAME OVER\nScore ${fmt(game.score)}${isHi ? '\n*** NEW HIGH SCORE ***' : ''}`;
  ui.start.textContent = 'Play again';
  ui.overlay.classList.remove('hidden');
  sim.serve(); // park a ball in the lane for the attract view
}

function handleEvent(e) {
  const playing = game.state === 'playing';
  switch (e.type) {
    case 'bumper': {
      bumperFx[e.id].flash = 1;
      shake = Math.min(1, shake + 0.35);
      sfx.bumper(e.id);
      addScore(100);
      if (playing) game.bonus += 20;
      break;
    }
    case 'sling':
      slingMeshes[e.id].flash = 1;
      shake = Math.min(1, shake + 0.2);
      sfx.sling();
      addScore(10);
      break;
    case 'target': {
      targetMeshes[e.id].flash = 1;
      sfx.target();
      if (!playing) break;
      if (!game.targets[e.id]) {
        game.targets[e.id] = true;
        addScore(500);
        game.bonus += 200;
        if (game.targets.every(Boolean)) {
          addScore(5000);
          message('TARGETS!\n5,000', 1300, 'cyan');
          sfx.laneComplete();
          after(0.6, () => game.targets.fill(false));
        }
      } else addScore(100);
      break;
    }
    case 'rollover': {
      sfx.rollover();
      if (!playing) break;
      addScore(250);
      if (!game.lanes[e.id]) {
        game.lanes[e.id] = true;
        if (game.lanes.every(Boolean)) {
          game.bonus += 1000;
          if (game.mult < 5) {
            game.mult++;
            message(`MULTIPLIER\nx${game.mult}`, 1400);
          } else {
            addScore(10000);
            message('MAX MULTIPLIER\n10,000', 1400, 'yellow');
          }
          sfx.laneComplete();
          lampBlink = 0.8;
          after(0.8, () => game.lanes.fill(false));
        }
      }
      break;
    }
    case 'launch':
      sfx.launch(e.power);
      break;
    case 'flipperHit':
      sfx.flipperHit();
      break;
    case 'wall':
      sfx.wall(e.speed);
      break;
    case 'post':
      sfx.post();
      break;
    case 'drain': {
      if (!playing) {
        after(0.8, () => sim.serve());
        break;
      }
      if (sim.time < game.saveUntil) {
        game.saveUntil = 0;
        message('BALL SAVED', 1100, 'cyan');
        sfx.save();
        after(0.7, serveBall);
      } else {
        sfx.drain();
        shake = 0.6;
        endBall();
      }
      break;
    }
  }
}

let lampBlink = 0;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = { left: false, right: false, plunger: false };
const touch = { left: new Set(), right: new Set(), plunger: false };
let paused = false;
const input = () => ({
  left: keys.left || touch.left.size > 0,
  right: keys.right || touch.right.size > 0,
  plunger: keys.plunger || touch.plunger,
});

const LEFT_KEYS = new Set(['KeyZ', 'ArrowLeft', 'ShiftLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['Slash', 'ArrowRight', 'ShiftRight', 'KeyL']);
const PLUNGER_KEYS = new Set(['Space', 'ArrowDown', 'KeyS']);

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Slash'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  initAudio();
  if (LEFT_KEYS.has(e.code)) keys.left = true;
  else if (RIGHT_KEYS.has(e.code)) keys.right = true;
  else if (PLUNGER_KEYS.has(e.code)) {
    if (game.state !== 'playing' && e.code === 'Space') return startGame();
    keys.plunger = true;
  } else if (e.code === 'Enter' && game.state !== 'playing') startGame();
  else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyP' && game.state === 'playing') togglePause();
});
window.addEventListener('keyup', (e) => {
  if (LEFT_KEYS.has(e.code)) keys.left = false;
  else if (RIGHT_KEYS.has(e.code)) keys.right = false;
  else if (PLUNGER_KEYS.has(e.code)) keys.plunger = false;
});
window.addEventListener('blur', () => {
  keys.left = keys.right = keys.plunger = false;
  touch.left.clear();
  touch.right.clear();
  touch.plunger = false;
});

canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  if (game.state !== 'playing') return;
  canvas.setPointerCapture?.(e.pointerId);
  (e.clientX < window.innerWidth / 2 ? touch.left : touch.right).add(e.pointerId);
});
const releasePointer = (e) => {
  touch.left.delete(e.pointerId);
  touch.right.delete(e.pointerId);
};
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

ui.launch.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  initAudio();
  ui.launch.setPointerCapture?.(e.pointerId);
  touch.plunger = true;
  ui.launch.classList.add('active');
});
const launchUp = () => {
  touch.plunger = false;
  ui.launch.classList.remove('active');
};
ui.launch.addEventListener('pointerup', launchUp);
ui.launch.addEventListener('pointercancel', launchUp);

ui.start.addEventListener('click', () => startGame());

function toggleMute() {
  setMuted(!isMuted());
  ui.mute.classList.toggle('off', isMuted());
  try { localStorage.setItem(HI_KEY + '.muted', isMuted() ? '1' : '0'); } catch { /* ignore */ }
}
ui.mute.addEventListener('click', (e) => {
  e.stopPropagation();
  initAudio();
  toggleMute();
  ui.mute.blur();
});
try {
  if (localStorage.getItem(HI_KEY + '.muted') === '1') toggleMute();
} catch { /* ignore */ }

function togglePause() {
  paused = !paused;
  if (paused) {
    ui.msg.textContent = 'PAUSED';
    ui.msg.className = 'message show cyan';
  } else ui.msg.className = 'message';
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing' && !paused) togglePause();
});

// ---------------------------------------------------------------------------
// Simulation step + game logic
// ---------------------------------------------------------------------------
const prevFlip = [false, false];
function tick() {
  const inp = input();
  // Lane change: flipper buttons rotate the lit top lanes (classic pinball rule).
  const flips = [inp.left, inp.right];
  for (let i = 0; i < 2; i++) {
    if (flips[i] && !prevFlip[i]) {
      sfx.flipper();
      if (game.state === 'playing' && !game.lanes.every(Boolean)) {
        const l = game.lanes;
        if (i === 0) l.push(l.shift());
        else l.unshift(l.pop());
      }
    }
    prevFlip[i] = flips[i];
  }
  if (inp.plunger && !sim.plunger.pulling && sim.ballOnPlunger()) sfx.plungerPull();

  sim.step(inp);
  for (const e of sim.events) handleEvent(e);
  sim.events.length = 0;

  if (game.state === 'playing' && !game.inPlay && sim.ball.active && sim.ball.x < LANE.x0 - BALL_R) {
    game.inPlay = true;
    if (!game.saveUsed) {
      game.saveUsed = true;
      game.saveUntil = sim.time + BALL_SAVE_SECONDS;
    }
  }

  for (let i = timers.length - 1; i >= 0; i--) {
    if (sim.time >= timers[i].at) {
      const t = timers.splice(i, 1)[0];
      t.fn();
    }
  }
}

// ---------------------------------------------------------------------------
// Visual update
// ---------------------------------------------------------------------------
const tmpQ = new THREE.Quaternion();
const tmpAxis = new THREE.Vector3();
let lastBall = { x: sim.ball.x, y: sim.ball.y };
let clock = 0;

function updateVisuals(dt) {
  clock += dt;
  const b = sim.ball;

  // Ball position + rolling rotation.
  ballMesh.visible = b.active;
  ballMesh.position.copy(v3(b.x, b.y, BALL_R));
  const mx = b.x - lastBall.x, my = b.y - lastBall.y;
  const dist = Math.hypot(mx, my);
  if (dist > 1e-5 && dist < 5) {
    tmpAxis.set(-my, 0, -mx).normalize();
    tmpQ.setFromAxisAngle(tmpAxis, dist / BALL_R);
    ballMesh.quaternion.premultiply(tmpQ);
  }
  lastBall = { x: b.x, y: b.y };

  T.flippers.forEach((f, i) => (flipperMeshes[i].rotation.y = f.angle));
  plunger.position.z = -(PLUNGER_REST + 0.15 - sim.plunger.pos);

  // Bumpers
  for (const fx of bumperFx) {
    fx.flash = Math.max(0, fx.flash - dt * 6);
    const f = fx.flash;
    fx.bodyMat.emissiveIntensity = 0.25 + f * 4;
    fx.capMat.emissiveIntensity = 0.12 + f * 3;
    fx.star.material.color.copy(fx.color).multiplyScalar(0.9 + f * 3);
    fx.light.intensity = 1.5 + f * 60;
    const s = 1 + f * 0.12;
    fx.g.scale.set(s, 1 - f * 0.1, s);
  }
  for (const s of slingMeshes) {
    s.flash = Math.max(0, s.flash - dt * 7);
    s.mat.emissiveIntensity = 0.4 + s.flash * 5;
    s.mesh.position.z = -s.flash * 0.12;
  }
  targetMeshes.forEach((t, i) => {
    t.flash = Math.max(0, t.flash - dt * 6);
    const lit = game.targets[i];
    t.mat.emissiveIntensity = (lit ? 1.2 : 0.15) + t.flash * 4;
    lamps.targets[i].set(lit ? 1 : 0.1 + t.flash);
  });

  // Lamps
  const playing = game.state === 'playing';
  const blinkOn = Math.floor(clock * 8) % 2 === 0;
  lampBlink = Math.max(0, lampBlink - dt);
  T.rollovers.forEach((r, i) => {
    let l = game.lanes[i] ? 1 : 0.05;
    if (lampBlink > 0) l = blinkOn ? 1 : 0.1;
    if (!playing) l = (Math.floor(clock * 3) % 3 === i) ? 1 : 0.05;
    lamps.rollovers[i].set(l);
    lamps.rolloverRings[i].set(l * 0.6 + 0.1);
  });
  lamps.mult.forEach((l, i) => l.set(game.mult >= i + 2 ? 1 : playing ? 0.03 : (Math.floor(clock * 4) % 4 === i ? 0.6 : 0.03)));
  const saving = playing && game.inPlay && sim.time < game.saveUntil;
  const saveLeft = game.saveUntil - sim.time;
  lamps.shootAgain.set(saving ? (saveLeft > 2 || blinkOn ? 1 : 0.1) : 0.05);
  lamps.chevrons.forEach((l, i) => l.set(Math.floor(clock * 6) % 4 === i ? 1 : 0.08));
  const charge = sim.plunger.charge;
  const ballWaiting = sim.ballOnPlunger();
  lamps.power.forEach((l, i) => {
    const lit = charge * 8 > i;
    l.set(lit ? 1 : ballWaiting && playing ? (Math.floor(clock * 10) % 8 === i ? 0.5 : 0.05) : 0.03);
  });

  // Camera shake
  shake = Math.max(0, shake - dt * 3.5);
  const s = shake * shake * 0.35;
  camera.position.set(camBase.x + (Math.random() - 0.5) * s, camBase.y + (Math.random() - 0.5) * s, camBase.z + (Math.random() - 0.5) * s * 0.5);
  camera.lookAt(camLook);

  // HUD
  if (game.shownScore < game.score) {
    game.shownScore = Math.min(game.score, game.shownScore + Math.max(10, (game.score - game.shownScore) * dt * 12));
  } else game.shownScore = game.score;
  ui.score.textContent = fmt(game.shownScore);
  ui.ball.textContent = game.state === 'playing' ? `${game.ball} / ${BALLS_PER_GAME}` : '-';
  ui.mult.textContent = game.mult > 1 ? `x${game.mult} SCORING` : '';
  ui.hi.textContent = fmt(game.hi);
  ui.launch.classList.toggle('visible', playing && sim.ballInLane());
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let acc = 0;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 20) {
      tick();
      acc -= STEP;
      n++;
    }
    if (n === 20) acc = 0;
  }
  updateVisuals(paused ? 0 : dt);
  composer.render();
}

ui.sub.textContent = game.hi > 0 ? `High score ${fmt(game.hi)}` : 'Three balls. Light the lanes. Beat the high score.';
sim.serve();
requestAnimationFrame(frame);

// Small debug hook for automated testing.
window.__pinball = { sim, game, startGame };
