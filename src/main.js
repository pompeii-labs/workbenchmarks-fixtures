import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './style.css';
import { waveHeight } from './waves.js';
import { createWater } from './water.js';
import { createSky } from './sky.js';
import { createJetSki } from './jetski.js';
import { Player } from './player.js';
import { Particles, Wake, SPRAY, FOAM, MIST } from './particles.js';
import { GameAudio } from './audio.js';
import { Input } from './input.js';
import { createIslands, Buoys, Rings } from './world.js';
import { Track } from './track.js';
import { RaceHud, fmtTime } from './racehud.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
$('app').appendChild(renderer.domElement);

const FOG = 0.0011;
const colors = {
  skyTop: new THREE.Color(0x1f6fd1),
  horizon: new THREE.Color(0xbfe4f7),
  deep: new THREE.Color(0x03304f),
  shallow: new THREE.Color(0x1fb3c4),
  sun: new THREE.Color(0xfff1d6),
  sunDir: new THREE.Vector3(0.45, 0.5, 0.74).normalize(),
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(colors.horizon, FOG);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 6000);

scene.add(new THREE.HemisphereLight(0xcfeaff, 0x1a5a70, 1.3));
const sunLight = new THREE.DirectionalLight(0xfff0d8, 2.6);
sunLight.position.copy(colors.sunDir).multiplyScalar(100);
scene.add(sunLight, sunLight.target);

const sky = createSky(colors);
scene.add(sky);
const water = createWater(colors, FOG);
scene.add(water);
const islands = createIslands();
scene.add(islands.group);
const buoys = new Buoys();
scene.add(buoys.group);
const rings = new Rings();
scene.add(rings.group);
const track = new Track();
scene.add(track.group);
// free-roam buoys stay off the race course
const keepBuoy = (x, z) => track.nearest(x, z).d > 30;

const ski = createJetSki();
scene.add(ski);
const player = new Player(ski);
player.ground = track;

const particles = new Particles(7000, colors, FOG);
scene.add(particles.points);
const wake = new Wake(colors, FOG);
scene.add(wake.mesh);

// soft contact shadow under the ski
const shadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,20,30,0.55)');
  gr.addColorStop(1, 'rgba(0,20,30,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(2.2, 4.2),
  new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: false })
);
shadow.rotation.x = -Math.PI / 2;
scene.add(shadow);

const audio = new GameAudio();
const input = new Input();

// ---------- game state ----------
const state = {
  started: false,
  t: 0,
  score: 0,
  combo: 1,
  comboTimer: 0,
  best: Number(localStorage.getItem('swellrider.best') || 0),
  bestAir: Number(localStorage.getItem('swellrider.bestAir') || 0),
  shake: 0,
  spraySide: 0,
  rooster: 0,
  wakeTimer: 0,
  emitAcc: { side: 0, rooster: 0, mist: 0 },
};
$('best').textContent = state.best.toLocaleString();
rings.reset(0, 0, 0);

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) {
  document.body.classList.add('touch');
  input.bindTouch($('stick'), $('knob'), $('btn-hop'), $('btn-boost'));
}

function teleport(pose) {
  player.respawn(state.t, pose);
  wake.pts.length = 0;
  camInit = false;
}

function restartRace() {
  track.resetRace();
  teleport(track.startPose());
  race.reset();
}

function start() {
  if (state.started) return;
  state.started = true;
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  audio.init();
  restartRace();
}
$('title').addEventListener('click', start);
$('title').addEventListener('touchend', (e) => {
  e.preventDefault();
  start();
});
input.onKey = (code) => {
  if (!state.started && (code === 'Enter' || code === 'Space' || code === 'KeyW' || code === 'ArrowUp')) start();
  if (code === 'KeyM') {
    audio.setMuted(!audio.muted);
    toast(audio.muted ? 'SOUND OFF' : 'SOUND ON', '', 'small');
  }
  if (code === 'KeyR') {
    player.respawn(state.t);
    toast('RESET', '', 'small');
  }
  if (code === 'KeyT' && state.started) {
    restartRace();
    toast('BACK TO THE START', 'ride through the arch to start a lap', 'small');
  }
};
$('btn-restart')?.addEventListener('click', (e) => {
  e.stopPropagation();
  restartRace();
  toast('BACK TO THE START', 'ride through the arch to start a lap', 'small');
});
$('btn-restart')?.addEventListener('touchend', (e) => {
  e.preventDefault();
  e.stopPropagation();
  restartRace();
  toast('BACK TO THE START', '', 'small');
});
$('btn-mute')?.addEventListener('click', (e) => {
  e.stopPropagation();
  audio.init();
  audio.setMuted(!audio.muted);
  $('btn-mute').textContent = audio.muted ? '🔇' : '🔊';
});

// ---------- HUD helpers ----------
let toastTimer = 0;
function toast(main, sub = '', cls = '') {
  const el = $('toast');
  el.className = 'toast show ' + cls;
  el.innerHTML = `<div class="main">${main}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
  toastTimer = cls === 'small' ? 0.9 : 1.8;
}

function addScore(pts) {
  state.score += pts;
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('swellrider.best', String(Math.round(state.best)));
  }
}

// ---------- splash emitters ----------
function burst(x, y, z, n, power, spread = 1) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(0.3, 1) * power * spread;
    particles.spawn(SPRAY, x + Math.cos(a) * rand(0.5, 1.8), y + 0.2, z + Math.sin(a) * rand(0.5, 1.8),
      Math.cos(a) * r + player.vel.x * 0.3, rand(0.5, 1.2) * power, Math.sin(a) * r + player.vel.z * 0.3,
      rand(0.7, 1.5), rand(0.25, 0.6));
  }
  for (let i = 0; i < n / 3; i++) {
    const a = Math.random() * Math.PI * 2;
    particles.spawn(MIST, x + Math.cos(a) * 1.5, y + rand(0, 1.5), z + Math.sin(a) * 1.5,
      Math.cos(a) * power * 0.4, rand(0.2, 0.8) * power * 0.5, Math.sin(a) * power * 0.4, rand(1, 2), rand(1.2, 2.2));
  }
  for (let i = 0; i < n / 4; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(0, 3);
    particles.spawn(FOAM, x + Math.cos(a) * r, y, z + Math.sin(a) * r, Math.cos(a) * 2, 0, Math.sin(a) * 2, rand(2, 4), rand(0.8, 1.6));
  }
}

function emitRide(dt) {
  const p = player;
  if (p.airborne || p.onRamp) return;
  const s = Math.min(1.4, p.speed / 30);
  if (p.speed < 1.5) return;
  const fwd = p.fwd, right = p.right;
  const vx = p.vel.x, vz = p.vel.z;
  const y = p.pos.y;
  const turn = Math.abs(p.steerS);
  const acc = state.emitAcc;

  // side sheets of spray from the hull, heavier on the outside of a turn
  acc.side += dt * (90 + 260 * s) * s;
  while (acc.side >= 1) {
    acc.side -= 1;
    const side = Math.random() < 0.5 ? -1 : 1;
    const outside = side === Math.sign(p.steerS) ? -1 : 1; // steering right -> left side (+right * -1) is outside
    const boostSide = 1 + turn * (outside > 0 ? 1.6 : 0.2) * s;
    const along = rand(-0.9, 0.5);
    const ox = p.pos.x + fwd.x * along + right.x * side * 0.6;
    const oz = p.pos.z + fwd.z * along + right.z * side * 0.6;
    const out = (2 + 6 * s + p.lateral * 0.6) * boostSide * rand(0.6, 1.1);
    particles.spawn(SPRAY, ox, y + 0.15, oz,
      vx * 0.55 + right.x * side * out + rand(-0.5, 0.5),
      (1.5 + 4.5 * s) * rand(0.6, 1.2) * Math.sqrt(boostSide),
      vz * 0.55 + right.z * side * out + rand(-0.5, 0.5),
      rand(0.5, 1.0), rand(0.15, 0.35) * (0.7 + s * 0.5));
  }

  // rooster tail from the jet nozzle
  const thr = p.throttle;
  acc.rooster += dt * (thr * (60 + 200 * s) * (p.boosting ? 1.6 : 1));
  while (acc.rooster >= 1) {
    acc.rooster -= 1;
    const ox = p.pos.x - fwd.x * 1.7, oz = p.pos.z - fwd.z * 1.7;
    const back = (3 + 6 * s) * rand(0.7, 1.2);
    particles.spawn(SPRAY, ox + rand(-0.15, 0.15), y + 0.3, oz + rand(-0.15, 0.15),
      vx * 0.75 - fwd.x * back + rand(-0.5, 0.5), (3.5 + 5.5 * s) * rand(0.7, 1.15) * (p.boosting ? 1.3 : 1), vz * 0.75 - fwd.z * back + rand(-0.5, 0.5),
      rand(0.5, 0.9), rand(0.15, 0.32));
  }
  acc.mist += dt * 10 * s * (0.5 + thr);
  while (acc.mist >= 1) {
    acc.mist -= 1;
    const ox = p.pos.x - fwd.x * 2.4, oz = p.pos.z - fwd.z * 2.4;
    particles.spawn(MIST, ox, y + 0.6, oz, vx * 0.7 + rand(-1, 1), rand(0.5, 1.5), vz * 0.7 + rand(-1, 1), rand(0.5, 0.9), rand(0.6, 1.1));
  }
  // foam blobs in the wake
  if (Math.random() < dt * 40 * s) {
    const ox = p.pos.x - fwd.x * 1.8 + right.x * rand(-0.6, 0.6), oz = p.pos.z - fwd.z * 1.8 + right.z * rand(-0.6, 0.6);
    particles.spawn(FOAM, ox, y, oz, vx * 0.1, 0, vz * 0.1, rand(2, 3.5), rand(0.7, 1.3));
  }
}

// ---------- events from physics ----------
function handleEvents() {
  for (const ev of player.events) {
    if (ev.type === 'launch') {
      if (ev.ramp) {
        burst(player.pos.x, player.pos.y - 0.5, player.pos.z, 50, 5);
        audio.splash(0.35);
      } else if (ev.vy > 4) {
        burst(player.pos.x - player.fwd.x * 1.5, player.pos.y, player.pos.z - player.fwd.z * 1.5, 30, 4);
        audio.splash(0.25);
      }
    } else if (ev.type === 'land') {
      const intensity = Math.min(1.5, ev.impact / 14);
      if (ev.airTime > 0.25 || ev.impact > 6) {
        burst(player.pos.x, player.pos.y, player.pos.z, Math.round(40 + intensity * 220), 3 + intensity * 7, 1 + intensity * 0.5);
        audio.splash(intensity);
        state.shake = Math.max(state.shake, 0.15 + intensity * 0.5);
      }
      if (ev.wipeout) {
        toast('WIPEOUT!', 'stick the landing nose-first', 'bad');
        state.combo = 1;
        state.shake = 1;
        continue;
      }
      if (ev.airTime < 0.6) continue;
      const parts = [];
      if (ev.spins) parts.push(`${Math.abs(ev.spins) * 360}`);
      if (ev.flips) parts.push(Math.abs(ev.flips) > 1 ? `${Math.abs(ev.flips)}x BACKFLIP` : 'BACKFLIP');
      let name = parts.join(' + ');
      if (!name) name = ev.height > 6 ? 'HUGE AIR' : ev.height > 3 ? 'BIG AIR' : 'AIR';
      if (ev.ramp && !ev.spins && !ev.flips) name = ev.height > 12 ? 'MEGA RAMP' : 'RAMP JUMP';
      let pts = Math.round(ev.airTime * 150 + ev.height * 40 + Math.abs(ev.spins) * 600 + Math.abs(ev.flips) * 1200);
      if (ev.sketchy) {
        pts = Math.round(pts * 0.3);
        toast('SKETCHY', `${name} · +${pts}`, 'meh');
        state.combo = 1;
      } else {
        pts *= state.combo;
        const sub = `${ev.airTime.toFixed(1)}s · ${ev.height.toFixed(1)}m · +${pts.toLocaleString()}${state.combo > 1 ? ` (x${state.combo})` : ''}`;
        toast(name, sub, ev.spins || ev.flips ? 'trick' : '');
        state.combo = Math.min(8, state.combo + 1);
        player.boost = Math.min(1, player.boost + 0.2 + (ev.spins || ev.flips ? 0.2 : 0));
      }
      state.comboTimer = 8;
      addScore(pts);
      if (ev.airTime > state.bestAir) {
        state.bestAir = ev.airTime;
        localStorage.setItem('swellrider.bestAir', String(ev.airTime));
      }
    }
  }
  player.events.length = 0;
}

// ---------- obstacles ----------
function collide() {
  const p = player.pos;
  for (const c of islands.colliders) {
    const dx = p.x - c.x, dz = p.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < c.r) {
      const nx = dx / d, nz = dz / d;
      p.x = c.x + nx * c.r;
      p.z = c.z + nz * c.r;
      const vn = player.vel.x * nx + player.vel.z * nz;
      if (vn < 0) {
        player.vel.x -= 1.6 * vn * nx;
        player.vel.z -= 1.6 * vn * nz;
        player.vel.x *= 0.6;
        player.vel.z *= 0.6;
        if (-vn > 6) {
          burst(p.x, p.y, p.z, 80, 6);
          audio.splash(0.8);
          state.shake = 0.6;
        }
      }
    }
  }
  for (const c of track.colliders) {
    const dx = p.x - c.x, dz = p.z - c.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < c.r * c.r && p.y < c.y + 3.6) {
      const d = Math.sqrt(d2) || 1;
      const nx = dx / d, nz = dz / d;
      const vn = player.vel.x * nx + player.vel.z * nz;
      if (vn < 0) {
        player.vel.x -= 1.5 * vn * nx;
        player.vel.z -= 1.5 * vn * nz;
        if (-vn > 3) {
          burst(c.x, p.y, c.z, 40, 4);
          audio.splash(0.4);
          state.shake = 0.3;
        }
      }
      p.x = c.x + nx * c.r;
      p.z = c.z + nz * c.r;
    }
  }
  const wall = track.rampWall(p.x, p.z, p.y, state.t);
  if (wall) {
    p.x = wall.x;
    p.z = wall.z;
    const vn = player.vel.x * wall.nx + player.vel.z * wall.nz;
    if (vn < 0) {
      player.vel.x -= 1.5 * vn * wall.nx;
      player.vel.z -= 1.5 * vn * wall.nz;
      player.vel.x *= 0.7;
      player.vel.z *= 0.7;
      if (-vn > 4) {
        burst(p.x, p.y, p.z, 60, 5);
        audio.splash(0.6);
        state.shake = 0.5;
      }
    }
  }
  for (const b of buoys.items) {
    if (b.hidden) continue;
    const dx = p.x - b.x, dz = p.z - b.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 1.6 * 1.6 && p.y < waveHeight(b.x, b.z, state.t) + 1.5) {
      const d = Math.sqrt(d2) || 1;
      const nx = dx / d, nz = dz / d;
      const vn = player.vel.x * nx + player.vel.z * nz;
      if (vn < 0) {
        player.vel.x -= 1.5 * vn * nx;
        player.vel.z -= 1.5 * vn * nz;
        b.tilt = Math.min(1.2, -vn * 0.08);
        burst(b.x, p.y, b.z, 40, 4);
        audio.splash(0.4);
        state.shake = 0.3;
      }
      p.x = b.x + nx * 1.6;
      p.z = b.z + nz * 1.6;
    }
  }
}

// ---------- race ----------
const race = new RaceHud(track, isTouch);
function handleRace(events) {
  for (const ev of events) {
    if (ev.type === 'start') {
      toast('GO!', `lap ${track.lap} · ${track.gates.length - 1} gates, then back through the arch`, 'ring');
      audio.chime(1.2);
    } else if (ev.type === 'gate') {
      audio.beep(ev.delta !== null && ev.delta < 0 ? 1320 : 990);
      addScore(100);
      race.showSplit(ev);
    } else if (ev.type === 'lap') {
      let sub;
      if (ev.best && ev.prevBest !== null) sub = `NEW BEST LAP! (-${(ev.prevBest - ev.time).toFixed(2)}s)`;
      else if (ev.best) sub = 'BEST LAP SET';
      else sub = `+${(ev.time - track.best).toFixed(2)}s off your best`;
      toast(`LAP ${fmtTime(ev.time)}`, sub, ev.best ? 'trick' : 'ring');
      audio.chime(ev.best ? 1.5 : 1.25);
      if (ev.best) setTimeout(() => audio.chime(2), 180);
      addScore(ev.best ? 3000 : 1000);
      race.showLap(ev);
    } else if (ev.type === 'missed') {
      toast('MISSED GATE', 'turn back for the glowing gate', 'bad');
      audio.beep(330);
    }
  }
}

// ---------- camera ----------
const camPos = new THREE.Vector3(0, 4, -10);
const camLook = new THREE.Vector3();
let camHeading = 0;
let camInit = false;
function updateCamera(dt) {
  const p = player;
  // follow the direction of travel when moving fast, nose direction otherwise
  const moveH = Math.atan2(p.vel.x, p.vel.z);
  let target = p.heading;
  if (p.speed > 4 && p.airborne) target = moveH;
  let diff = target - camHeading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  camHeading += diff * (1 - Math.exp(-(p.airborne ? 2.5 : 4.5) * dt));
  const fx = Math.sin(camHeading), fz = Math.cos(camHeading);
  const s = Math.min(1.3, p.speed / 32);
  const dist = 5.8 + s * 1.8;
  const height = 2.5 + s * 0.5;
  const tx = p.pos.x - fx * dist, tz = p.pos.z - fz * dist;
  const ty = Math.max(p.pos.y, waveHeight(p.pos.x, p.pos.z, state.t)) + height;
  if (!camInit) {
    camInit = true;
    camPos.set(tx, ty, tz);
    camHeading = target;
  }
  camPos.x = damp(camPos.x, tx, 9, dt);
  camPos.z = damp(camPos.z, tz, 9, dt);
  camPos.y = damp(camPos.y, ty, p.airborne ? 3.5 : 6, dt);
  const floor = waveHeight(camPos.x, camPos.z, state.t) + 1.0;
  if (camPos.y < floor) camPos.y = floor;
  camera.position.copy(camPos);
  // shake
  const sh = state.shake * state.shake * 0.5 + (p.airborne ? 0 : s * 0.025);
  camera.position.x += (Math.random() - 0.5) * sh;
  camera.position.y += (Math.random() - 0.5) * sh;
  camLook.set(p.pos.x + fx * 5, p.pos.y + 1.2, p.pos.z + fz * 5);
  camera.lookAt(camLook);
  const fov = 62 + s * 16 + (p.boosting ? 6 : 0);
  camera.fov = damp(camera.fov, fov, 3, dt);
  camera.updateProjectionMatrix();
  state.shake = Math.max(0, state.shake - dt * 1.8);
}

// ---------- HUD ----------
const hud = {
  speed: $('speed'), score: $('score'), best: $('best'), combo: $('combo'), air: $('air'), boost: $('boost-fill'), toast: $('toast'),
};
let lastScore = -1;
function updateHud(dt) {
  hud.speed.textContent = Math.round(player.speed * 3.6);
  if (Math.round(state.score) !== lastScore) {
    lastScore = Math.round(state.score);
    hud.score.textContent = lastScore.toLocaleString();
    hud.best.textContent = Math.round(state.best).toLocaleString();
  }
  hud.combo.textContent = state.combo > 1 ? `x${state.combo}` : '';
  if (player.airborne && player.airTime > 0.3) {
    hud.air.textContent = `AIR ${player.airTime.toFixed(1)}s`;
    hud.air.classList.add('show');
  } else hud.air.classList.remove('show');
  hud.boost.style.transform = `scaleX(${player.boost.toFixed(3)})`;
  hud.boost.parentElement.classList.toggle('active', player.boosting);
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) hud.toast.classList.remove('show');
  }
}

// ---------- loop ----------
const STEP = 1 / 120;
let acc = 0;
let last = performance.now();
const idleInput = { throttle: 0, steer: 0, boost: false, hop: false };
let demoT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (document.hidden) return;

  let inp;
  if (state.started) inp = input.read();
  else {
    // attract mode behind the title screen: cruise around on its own
    demoT += dt;
    inp = { throttle: 0.85, steer: Math.sin(demoT * 0.35) * 0.45, boost: false, hop: false };
    input.read();
  }

  acc += dt;
  let first = true;
  while (acc >= STEP) {
    const x0 = player.pos.x, z0 = player.pos.z, t0 = state.t;
    player.step(STEP, state.t, first ? inp : { ...inp, hop: false });
    first = false;
    state.t += STEP;
    acc -= STEP;
    collide();
    if (state.started) handleRace(track.update(x0, z0, player.pos.x, player.pos.z, t0, state.t));
  }
  handleEvents();

  if (!player.airborne) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0 && state.combo > 1) state.combo = 1;
  }

  // wake ribbon
  state.wakeTimer -= dt;
  if (state.wakeTimer <= 0) {
    state.wakeTimer = 1 / 30;
    const k = player.airborne || player.onRamp ? 0 : Math.min(1, player.speed / 12);
    wake.push(player.pos.x - player.fwd.x * 1.6, player.pos.z - player.fwd.z * 1.6, player.right.x * 0.5, player.right.z * 0.5, k);
  }

  emitRide(dt);
  const hits = rings.update(dt, state.t, player.pos, player.heading);
  for (const h of hits) {
    addScore(500 * state.combo);
    toast('RING!', `+${(500 * state.combo).toLocaleString()}`, 'ring');
    audio.chime(1 + Math.random() * 0.1);
    player.boost = Math.min(1, player.boost + 0.35);
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      particles.spawn(MIST, h.x + Math.cos(a) * 3, h.y + Math.sin(a) * 3, h.z, Math.cos(a) * 4, Math.sin(a) * 4, rand(-1, 1), 0.8, 0.8);
    }
  }
  buoys.update(dt, state.t, player.pos.x, player.pos.z, keepBuoy);
  track.animate(state.t);
  particles.update(dt, state.t, camera, renderer.domElement.height);
  wake.update(dt, state.t);

  // contact shadow
  const sh = track.groundHeight(player.pos.x, player.pos.z, state.t);
  const above = Math.max(0, player.pos.y - sh);
  shadow.position.set(player.pos.x, sh + 0.12, player.pos.z);
  shadow.rotation.z = player.heading + player.airSpin;
  shadow.scale.setScalar(1 + above * 0.08);
  shadow.material.opacity = Math.max(0, 1 - above / 10);

  water.material.uniforms.uTime.value = state.t;
  water.userData.follow(player.pos.x, player.pos.z);
  updateCamera(dt);
  sky.position.copy(camera.position);
  sunLight.position.copy(player.pos).addScaledVector(colors.sunDir, 100);
  sunLight.target.position.copy(player.pos);

  audio.update({ throttle: player.throttle, speed: player.speed, airborne: player.airborne, boosting: player.boosting });
  if (state.started) {
    updateHud(dt);
    race.update(dt, state.t, player);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// for debugging in the console
window.__game = { player, state, camera, track, teleport };
