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
import { Race, RIVALS, RACE_LAPS, ordinal } from './race.js';
import { collideScenery } from './collide.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
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

// ---------- rivals ----------
function makeTag(name, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(3.6, 0.9, 1);
  sprite.renderOrder = 3;
  let shown = null;
  sprite.userData.draw = (place) => {
    if (shown === place) return;
    shown = place;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(0, 25, 50, 0.6)';
    g.beginPath();
    if (g.roundRect) g.roundRect(8, 8, 240, 48, 24);
    else g.rect(8, 8, 240, 48);
    g.fill();
    g.fillStyle = hex(color);
    g.beginPath();
    g.arc(36, 32, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = 'italic bold 22px Trebuchet MS, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(place ? String(place) : '', 36, 33);
    g.textAlign = 'left';
    g.font = 'bold 26px Trebuchet MS, sans-serif';
    g.fillText(name, 62, 33);
    tex.needsUpdate = true;
  };
  sprite.userData.draw(0);
  return sprite;
}

const rivals = RIVALS.map((cfg) => {
  const model = createJetSki({ paint: cfg.color, accent: cfg.accent, vest: cfg.vest, helmet: cfg.color });
  scene.add(model);
  const ski = new Player(model);
  ski.ground = track;
  return { ...cfg, ski, basePower: 0.9 + 0.1 * cfg.skill };
});
const race = new Race(track, player, rivals);
for (const r of race.racers) {
  r.fx = { acc: { side: 0, rooster: 0, mist: 0 }, wakeTimer: 0, wake: r.isPlayer ? wake : new Wake(colors, FOG, 120) };
  if (r.isPlayer) continue;
  r.fx.shadow = shadow.clone();
  r.fx.shadow.material = shadow.material.clone();
  scene.add(r.fx.shadow);
  scene.add(r.fx.wake.mesh);
  r.fx.tag = makeTag(r.name, r.color);
  scene.add(r.fx.tag);
}

const audio = new GameAudio();
const input = new Input();

// ---------- game state ----------
const state = {
  started: false,
  mode: 'race', // race (vs rivals) | free (solo)
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
};
$('best').textContent = state.best.toLocaleString();
rings.reset(0, 0, 0);

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) {
  document.body.classList.add('touch');
  input.bindTouch($('stick'), $('knob'), $('btn-hop'), $('btn-boost'));
}

function clearWakes() {
  for (const r of race.racers) if (r.fx.wake) r.fx.wake.pts.length = 0;
}

function teleport(pose) {
  player.respawn(state.t, pose);
  wake.pts.length = 0;
  camInit = false;
}

function setRivals(on) {
  for (const r of race.racers) {
    if (r.isPlayer) continue;
    r.active = on;
    r.ski.model.visible = on;
    r.fx.shadow.visible = on;
    r.fx.tag.visible = on;
    r.fx.wake.mesh.visible = on;
    r.fx.wake.pts.length = 0;
  }
}

let finishShowAt = null;
function hideFinish() {
  finishShowAt = null;
  state.scoreLocked = false;
  document.body.classList.remove('finished');
  $('finish').classList.add('hidden');
}

/** Line up on the grid against the rivals and count down. */
function startRace() {
  state.mode = 'race';
  setRivals(true);
  track.resetRace();
  raceHud.reset();
  race.setup(state.t, { playerSlot: 4 });
  for (const r of race.racers) r.ski.power = r.basePower ?? 1;
  clearWakes();
  camInit = false;
  state.score = 0;
  state.combo = 1;
  hideFinish();
  $('pos-box').classList.remove('hidden');
  $('pos-of').textContent = String(race.racers.length);
  toast(`${RACE_LAPS} LAPS`, `${race.racers.length - 1} rivals · gates in order · first back through the arch wins`, 'small');
  toastTimer = 2.2;
}

/** The original solo mode: no rivals, just you, the course and the open sea. */
function startFree() {
  state.mode = 'free';
  setRivals(false);
  race.phase = 'idle';
  hideFinish();
  $('pos-box').classList.add('hidden');
  track.resetRace();
  teleport(track.startPose());
  raceHud.reset();
  toast('FREE RIDE', 'ride through the arch for a timed lap, or just explore', 'small');
}

function restart() {
  if (state.mode === 'race') startRace();
  else {
    track.resetRace();
    teleport(track.startPose());
    raceHud.reset();
    toast('BACK TO THE START', 'ride through the arch to start a lap', 'small');
  }
}

function start(mode = 'race') {
  if (state.started) return;
  state.started = true;
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  audio.init();
  if (mode === 'free') startFree();
  else startRace();
}
const pick = (e) => (e.target.closest && e.target.closest('#btn-free') ? 'free' : 'race');
$('title').addEventListener('click', (e) => start(pick(e)));
$('title').addEventListener('touchend', (e) => {
  e.preventDefault();
  start(pick(e));
});
const onButton = (id, fn) => {
  const el = $(id);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    fn();
  });
  el.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  });
};
onButton('btn-again', startRace);
onButton('btn-free2', startFree);
input.onKey = (code) => {
  if (!state.started && (code === 'Enter' || code === 'Space' || code === 'KeyW' || code === 'ArrowUp')) start('race');
  if (code === 'KeyM') {
    audio.setMuted(!audio.muted);
    toast(audio.muted ? 'SOUND OFF' : 'SOUND ON', '', 'small');
  }
  if (code === 'KeyR' && state.started && race.phase !== 'countdown') {
    player.respawn(state.t);
    toast('RESET', '', 'small');
  }
  if (code === 'KeyT' && state.started) restart();
  if (code === 'Enter' && state.started && finishShowAt !== null) startRace();
};
onButton('btn-restart', restart);
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
  if (state.scoreLocked) return; // the autopilot cool-down lap after the finish doesn't score
  state.score += pts;
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('swellrider.best', String(Math.round(state.best)));
  }
}

// ---------- splash emitters ----------
function burst(x, y, z, n, power, spread = 1, vel = player.vel) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(0.3, 1) * power * spread;
    particles.spawn(SPRAY, x + Math.cos(a) * rand(0.5, 1.8), y + 0.2, z + Math.sin(a) * rand(0.5, 1.8),
      Math.cos(a) * r + vel.x * 0.3, rand(0.5, 1.2) * power, Math.sin(a) * r + vel.z * 0.3,
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

// spray for one ski; k scales the particle count (far-off rivals spray less)
function emitRide(p, acc, dt, k = 1) {
  if (p.airborne || p.onRamp || k <= 0) return;
  const s = Math.min(1.4, p.speed / 30);
  if (p.speed < 1.5) return;
  const fwd = p.fwd, right = p.right;
  const vx = p.vel.x, vz = p.vel.z;
  const y = p.pos.y;
  const turn = Math.abs(p.steerS);
  dt *= k;

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
const world = { islands, track, buoys };
/** Ski vs scenery for any racer; k = how loud / big the splash is (by distance from you). */
function collide(r, k = 1) {
  const hit = collideScenery(r.ski, world, state.t);
  if (!hit || k <= 0) return;
  burst(hit.x, hit.y, hit.z, Math.round(hit.strength * 100 * Math.max(0.3, k)), 4 + hit.strength * 2.5, 1, r.ski.vel);
  audio.splash(hit.strength * k);
  if (r.isPlayer) state.shake = Math.max(state.shake, hit.strength * 0.75);
}

// splashes for the rivals' own jumps and landings
function handleRivalEvents(r, k) {
  const p = r.ski;
  for (const ev of p.events) {
    if (k <= 0) break;
    if (ev.type === 'launch' && (ev.ramp || ev.vy > 4)) {
      burst(p.pos.x, p.pos.y - 0.3, p.pos.z, Math.round(35 * k), 4.5, 1, p.vel);
      if (ev.ramp) audio.splash(0.3 * k);
    } else if (ev.type === 'land' && (ev.airTime > 0.25 || ev.impact > 6)) {
      const intensity = Math.min(1.5, ev.impact / 14);
      burst(p.pos.x, p.pos.y, p.pos.z, Math.round((40 + intensity * 180) * k), 3 + intensity * 7, 1 + intensity * 0.5, p.vel);
      audio.splash(intensity * k * k);
    }
  }
  p.events.length = 0;
}

// ski-on-ski bumps: spray where the hulls met, a knock, and a jolt if it was you
const bumpCool = new Map();
function handleBumps() {
  for (const b of race.bumps) {
    if (b.impulse < 1.2) continue;
    const key = b.a.name + b.b.name;
    const mine = b.a.isPlayer || b.b.isPlayer;
    const k = mine ? 1 : audible(b.x, b.z);
    if (k <= 0) continue;
    const hard = Math.min(1.5, b.impulse / 8);
    burst(b.x, b.y + 0.2, b.z, Math.round((20 + hard * 70) * Math.max(0.4, k)), 2.5 + hard * 4, 0.6, b.a.ski.vel);
    if ((bumpCool.get(key) ?? -1) < state.t - 0.25) {
      audio.bump(hard * k);
      bumpCool.set(key, state.t);
    }
    if (mine) {
      state.shake = Math.max(state.shake, 0.2 + hard * 0.5);
      if (hard > 0.6 && toastTimer <= 0) {
        const other = b.a.isPlayer ? b.b : b.a;
        toast('BUMP!', other.name, 'meh');
        toastTimer = 0.7;
      }
    }
  }
  race.bumps.length = 0;
}

/** 1 close to you, fading to 0 by ~160 m: scales rivals' effects and sounds. */
function audible(x, z) {
  const d = Math.hypot(x - camera.position.x, z - camera.position.z);
  return clamp(1.25 - d / 130, 0, 1);
}

// ---------- race ----------
const raceHud = new RaceHud(track, isTouch);
function handleRace(events) {
  for (const ev of events) {
    const vs = state.mode === 'race';
    if (ev.type === 'start') {
      if (vs) audio.beep(1320);
      else {
        toast('GO!', `lap ${track.lap} · ${track.gates.length - 1} gates, then back through the arch`, 'ring');
        audio.chime(1.2);
      }
    } else if (ev.type === 'gate') {
      audio.beep(ev.delta !== null && ev.delta < 0 ? 1320 : 990);
      addScore(100);
      raceHud.showSplit(ev);
    } else if (ev.type === 'lap') {
      let sub;
      if (ev.best && ev.prevBest !== null) sub = `NEW BEST LAP! (-${(ev.prevBest - ev.time).toFixed(2)}s)`;
      else if (ev.best) sub = 'BEST LAP SET';
      else sub = `+${(ev.time - track.best).toFixed(2)}s off your best`;
      if (vs && ev.lap >= RACE_LAPS) sub = null; // the finish takes over
      else if (vs) toast(ev.lap + 1 === RACE_LAPS ? 'FINAL LAP!' : `LAP ${ev.lap + 1} / ${RACE_LAPS}`, `${fmtTime(ev.time)} · ${sub}`, ev.best ? 'trick' : 'ring');
      else toast(`LAP ${fmtTime(ev.time)}`, sub, ev.best ? 'trick' : 'ring');
      audio.chime(ev.best ? 1.5 : 1.25);
      if (ev.best) setTimeout(() => audio.chime(2), 180);
      addScore(ev.best ? 3000 : 1000);
      raceHud.showLap(ev);
    } else if (ev.type === 'missed') {
      toast('MISSED GATE', 'turn back for the glowing gate', 'bad');
      audio.beep(330);
    }
  }
}

// countdown, the finish, rescues
const PLACE_BONUS = [5000, 3000, 2000, 1200, 800, 500];
function showCount(text, go = false) {
  const el = $('countdown');
  el.textContent = text;
  el.className = '';
  void el.offsetWidth; // restart the animation
  el.className = go ? 'show go' : 'show';
}
function handleRaceEvents() {
  for (const ev of race.events) {
    if (!state.started || state.mode !== 'race') continue;
    if (ev.type === 'count') {
      showCount(String(ev.n));
      audio.beep(660);
    } else if (ev.type === 'go') {
      showCount('GO!', true);
      audio.beep(1320);
      audio.chime(1.2);
    } else if (ev.type === 'finish' && ev.racer.isPlayer) {
      const place = ev.racer.place;
      toast(place === 1 ? 'YOU WIN!' : `${ordinal(place)} PLACE`, fmtTime(ev.racer.finishTime), place === 1 ? 'trick' : 'ring');
      toastTimer = 2.5;
      audio.chime(place === 1 ? 1.5 : 1.2);
      if (place <= 3) setTimeout(() => audio.chime(2), 200);
      addScore(PLACE_BONUS[place - 1] ?? 0);
      state.scoreLocked = true;
      finishShowAt = state.t + 1.6;
      finishRefresh = 0;
    }
  }
  race.events.length = 0;
}

// ---------- finish screen ----------
let finishRefresh = 0;
function updateFinish(dt) {
  if (finishShowAt === null || state.t < finishShowAt) return;
  const el = $('finish');
  const first = el.classList.contains('hidden');
  if (first) {
    el.classList.remove('hidden');
    document.body.classList.add('finished'); // the "YOU WIN" toast has had its moment
    const me = race.player;
    $('finish-place').textContent = me.place === 1 ? '1ST!' : ordinal(me.place);
    $('finish-place').className = me.place === 1 ? 'win' : '';
    $('finish-sub').textContent = me.place === 1 ? `You beat all ${race.racers.length - 1} rivals` : `You finished ${ordinal(me.place).toLowerCase()} of ${race.racers.length}`;
    $('finish-time').textContent = fmtTime(me.finishTime);
    $('finish-best').textContent = fmtTime(me.bestLap);
    $('finish-score').textContent = Math.round(state.score).toLocaleString();
  }
  // the rest of the field is still racing behind the screen: keep the table live
  if ((finishRefresh -= dt) > 0 && !first) return;
  finishRefresh = 0.25;
  const rows = race.order.map((r) => {
    const time = r.finished
      ? `<td class="r">${fmtTime(r.finishTime)}</td>`
      : `<td class="r racing">lap ${Math.min(RACE_LAPS, Math.max(1, Math.ceil(r.c / race.N)))} / ${RACE_LAPS}</td>`;
    return `<tr class="${r.isPlayer ? 'me' : ''}"><td class="p">${ordinal(r.place)}</td><td><span class="sw" style="background:${hex(r.color)}"></span>${r.name}</td>${time}<td class="r">${fmtTime(r.bestLap)}</td></tr>`;
  });
  $('finish-table').innerHTML = `<tr><td></td><td></td><td class="r"><small>TIME</small></td><td class="r"><small>BEST LAP</small></td></tr>${rows.join('')}`;
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

// ---------- race HUD: position, race clock, standings ----------
const posEl = { box: $('pos-box'), n: $('pos-n'), sfx: $('pos-sfx'), time: $('race-time'), list: $('standings') };
let standT = 0;
function updatePosHud(dt) {
  if (state.mode !== 'race') return;
  const me = race.player;
  const pre = race.phase === 'countdown';
  posEl.n.textContent = pre ? '-' : String(me.place);
  posEl.sfx.textContent = pre ? '' : ordinal(me.place).replace(/^\d+/, '');
  posEl.box.classList.toggle('p1', !pre && me.place === 1);
  posEl.time.textContent = fmtTime(race.raceTime(state.t));
  if ((standT -= dt) > 0) return;
  standT = 0.2;
  // gaps in seconds, estimated from the distance between you and them
  const pace = Math.max(14, player.speed);
  posEl.list.innerHTML = race.order
    .map((r) => {
      let gap = '';
      if (r.finished) gap = fmtTime(r.finishTime);
      else if (!r.isPlayer && !pre) {
        const d = (r.progress - me.progress) / pace;
        gap = `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}s`;
      }
      return `<li class="${r.isPlayer ? 'me' : ''}"><span class="n">${r.place}</span><span class="sw" style="background:${hex(r.color)}"></span><span class="nm">${r.name}</span><span class="gap">${gap}</span></li>`;
    })
    .join('');
}

// ---------- per-ski visuals ----------
function updateSkiFx(r, dt) {
  const p = r.ski;
  const k = r.isPlayer ? 1 : audible(p.pos.x, p.pos.z);
  // wake ribbon
  r.fx.wakeTimer -= dt;
  if (r.fx.wakeTimer <= 0) {
    r.fx.wakeTimer = 1 / 30;
    const w = p.airborne || p.onRamp ? 0 : Math.min(1, p.speed / 12);
    r.fx.wake.push(p.pos.x - p.fwd.x * 1.6, p.pos.z - p.fwd.z * 1.6, p.right.x * 0.5, p.right.z * 0.5, w);
  }
  r.fx.wake.update(dt, state.t);
  emitRide(p, r.fx.acc, dt, r.isPlayer ? 1 : k * 0.6);
  // contact shadow
  const sh = r.isPlayer ? shadow : r.fx.shadow;
  const g = track.groundHeight(p.pos.x, p.pos.z, state.t);
  const above = Math.max(0, p.pos.y - g);
  sh.position.set(p.pos.x, g + 0.12, p.pos.z);
  sh.rotation.z = p.heading + p.airSpin;
  sh.scale.setScalar(1 + above * 0.08);
  sh.material.opacity = Math.max(0, 1 - above / 10);
  if (r.isPlayer) return;
  // blink while a rescued rival is still a ghost (it can't hit anyone yet)
  p.model.visible = r.ghost > 0 ? Math.floor(state.t * 12) % 2 === 0 : true;
  const tag = r.fx.tag;
  const d = Math.hypot(p.pos.x - camera.position.x, p.pos.z - camera.position.z);
  // (right next to you the rider is obvious; a huge label would just block the view)
  tag.visible = d < 170 && d > 9;
  tag.material.opacity = clamp((d - 9) / 8, 0, 1);
  tag.position.set(p.pos.x, p.pos.y + 2.9, p.pos.z);
  const sc = 1 + d / 140; // stay readable a little further out
  tag.scale.set(3.6 * sc, 0.9 * sc, 1);
  tag.userData.draw(state.mode === 'race' && race.phase !== 'countdown' && race.phase !== 'demo' ? r.place : 0);
}

// ---------- loop ----------
const STEP = 1 / 120;
let acc = 0;
let last = performance.now();
const raceOn = () => !state.started || state.mode === 'race';

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (document.hidden) return;

  const human = input.read();
  // attract mode behind the title, and the cool-down lap after you finish: autopilot
  const autopilot = !state.started || (state.mode === 'race' && race.player.finished);

  // catch-up: rivals behind you find a little extra, the ones way ahead ease off
  for (const r of race.racers) {
    if (r.isPlayer) continue;
    let pw = r.basePower;
    if (state.started && race.phase === 'racing' && !race.player.finished) pw *= 1 + clamp((race.player.progress - r.progress) / 450, -0.06, 0.1);
    r.ski.power = pw;
  }

  acc += dt;
  let first = true;
  while (acc >= STEP) {
    const x0 = player.pos.x, z0 = player.pos.z, t0 = state.t;
    const on = raceOn();
    if (on) race.pre();
    for (const r of race.racers) {
      if (r.active === false) continue;
      let inp;
      if (r.isPlayer && !autopilot) inp = first ? human : { ...human, hop: false };
      else if (race.phase === 'countdown') inp = { throttle: Math.sin(state.t * 3 + r.place) > 0.3 ? 1 : 0, steer: 0, boost: false, hop: false }; // revving on the line
      else inp = race.aiInput(r, state.t, STEP);
      r.ski.step(STEP, state.t, inp);
    }
    first = false;
    state.t += STEP;
    acc -= STEP;
    for (const r of race.racers) if (r.active !== false) collide(r, r.isPlayer ? 1 : audible(r.ski.pos.x, r.ski.pos.z));
    if (state.started && (state.mode === 'free' || (race.phase === 'racing' && !race.player.finished))) {
      handleRace(track.update(x0, z0, player.pos.x, player.pos.z, t0, state.t));
    }
    if (on) race.post(t0, state.t, STEP, playerCrossings());
  }
  handleEvents();
  for (const r of race.racers) if (!r.isPlayer && r.active !== false) handleRivalEvents(r, audible(r.ski.pos.x, r.ski.pos.z));
  handleBumps();
  handleRaceEvents();

  if (!player.airborne) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0 && state.combo > 1) state.combo = 1;
  }

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

  water.material.uniforms.uTime.value = state.t;
  water.userData.follow(player.pos.x, player.pos.z);
  updateCamera(dt);
  for (const r of race.racers) if (r.active !== false) updateSkiFx(r, dt);
  particles.update(dt, state.t, camera, renderer.domElement.height);
  sky.position.copy(camera.position);
  sunLight.position.copy(player.pos).addScaledVector(colors.sunDir, 100);
  sunLight.target.position.copy(player.pos);

  audio.update({ throttle: player.throttle, speed: player.speed, airborne: player.airborne, boosting: player.boosting });
  // the closest rival's engine
  let near = null, nd = 1e9;
  for (const r of race.racers) {
    if (r.isPlayer || r.active === false) continue;
    const d = r.ski.pos.distanceTo(player.pos);
    if (d < nd) {
      nd = d;
      near = r;
    }
  }
  if (near) {
    const dx = near.ski.pos.x - player.pos.x, dz = near.ski.pos.z - player.pos.z;
    const closing = -((near.ski.vel.x - player.vel.x) * dx + (near.ski.vel.z - player.vel.z) * dz) / Math.max(1, nd);
    audio.rival(nd, near.ski.speed, closing);
  } else audio.rival(1e9, 0);

  if (state.started) {
    updateHud(dt);
    raceHud.update(dt, state.t, player, {
      lapText: state.mode === 'race' ? `${race.lap}/${RACE_LAPS}` : null,
      rivals: state.mode === 'race' ? race.racers.filter((r) => !r.isPlayer) : null,
    });
    updatePosHud(dt);
    updateFinish(dt);
  }
  renderer.render(scene, camera);
}

/** How many gates the player has been through (the first arch crossing = 1), from Track's lap logic. */
function playerCrossings() {
  if (!track.racing) return 0;
  const N = track.gates.length;
  return track.next === 0 ? track.lap * N : (track.lap - 1) * N + track.next;
}

// attract mode: a demo race behind the title screen
race.setup(state.t, { demo: true });
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// for debugging in the console
window.__game = { player, state, camera, renderer, input, track, teleport, race, startRace, startFree };
