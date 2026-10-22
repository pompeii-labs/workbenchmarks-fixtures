import * as THREE from 'three';
import './style.css';
import { waveHeight, waveLift, waveSlope, SHORE_X } from './waves.js';
import { createDolphin } from './dolphin.js';
import { createWorld, PALETTE, SUN_DIR } from './world.js';
import { createSplash } from './particles.js';
import { createAudio } from './audio.js';

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PALETTE.horizon.clone(), 120, 420);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);

scene.add(new THREE.HemisphereLight('#bfe3ff', '#ffc9a0', 1.15));
const sun = new THREE.DirectionalLight('#fff0d6', 2.4);
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#ffd0e0', 0.7);
scene.add(fill, fill.target);

const world = createWorld(scene);
const splash = createSplash(scene);
const audio = createAudio();
const dolphin = createDolphin();
dolphin.root.scale.setScalar(1.25);
scene.add(dolphin.root);

// ---------- tuning ----------
const G = 19; // gravity (m/s^2), a touch floaty
const SWIM_DEPTH = 0.12;
const MAX_LIFT = 8; // normaliser for the wave lift meter
const FLIP_RATE = 8.5, ROLL_RATE = 10, SPIN_RATE = 8.5;
const X_MIN = SHORE_X + 13, X_MAX = 120;
const TAU = Math.PI * 2;

// ---------- state ----------
const s = {
  pos: new THREE.Vector3(10, 0, 0),
  vel: new THREE.Vector3(),
  heading: 0,
  turnVel: 0,
  speed: 13,
  mode: 'swim',
  charge: 0,
  depth: SWIM_DEPTH,
  swimPitch: 0,
  swimRoll: 0,
  lift: 0,
  stun: 0,
  score: 0,
  bestJump: Number(localStorage.getItem('dolphin-best-jump') || 0),
  chain: 0,
  chainTimer: 0,
  air: null,
};

const keys = new Set();
const touch = { x: 0, y: 0, dive: false, spin: false };
let started = false;
let time = 0;

// ---------- input ----------
const held = (...k) => k.some((c) => keys.has(c));
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!started && (e.code === 'Space' || e.code === 'Enter')) { start(); return; }
  if (e.code === 'KeyM') toggleMute();
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function input() {
  const up = held('KeyW', 'ArrowUp') ? 1 : 0;
  const down = held('KeyS', 'ArrowDown') ? 1 : 0;
  const left = held('KeyA', 'ArrowLeft') ? 1 : 0;
  const right = held('KeyD', 'ArrowRight') ? 1 : 0;
  const spinL = held('KeyQ') ? 1 : 0;
  const spinR = held('KeyE') ? 1 : 0;
  return {
    fwd: THREE.MathUtils.clamp(up - down - touch.y, -1, 1),
    turn: THREE.MathUtils.clamp(left - right - touch.x, -1, 1),
    spin: spinL - spinR + (touch.spin ? 1 : 0),
    dive: held('Space') || touch.dive,
  };
}

const startBtn = document.getElementById('start');
startBtn.addEventListener('click', start);
function start() {
  if (started) return;
  started = true;
  audio.init();
  document.getElementById('title').classList.add('hidden');
  if (matchMedia('(pointer: coarse)').matches) document.getElementById('touch').classList.remove('hidden');
  showHint('Hold SPACE to dive, release to leap. Time it on the rising face of a swell!');
}

const muteBtn = document.getElementById('mute');
muteBtn.addEventListener('click', toggleMute);
function toggleMute() {
  audio.init();
  muteBtn.classList.toggle('off', audio.toggleMute());
}

// touch controls: a virtual stick + dive/spin buttons
(() => {
  const stick = document.getElementById('stick');
  const knob = document.getElementById('knob');
  let id = null;
  const move = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== id) continue;
      const r = stick.getBoundingClientRect();
      let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      touch.x = dx; touch.y = dy;
      knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
    }
    e.preventDefault();
  };
  stick.addEventListener('touchstart', (e) => { id = e.changedTouches[0].identifier; move(e); }, { passive: false });
  stick.addEventListener('touchmove', move, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) if (t.identifier === id) { id = null; touch.x = touch.y = 0; knob.style.transform = ''; }
  };
  stick.addEventListener('touchend', end);
  stick.addEventListener('touchcancel', end);
  const btn = (el, key) => {
    el.addEventListener('touchstart', (e) => { touch[key] = true; e.preventDefault(); }, { passive: false });
    el.addEventListener('touchend', () => (touch[key] = false));
    el.addEventListener('touchcancel', () => (touch[key] = false));
  };
  btn(document.getElementById('btn-dive'), 'dive');
  btn(document.getElementById('btn-spin'), 'spin');
})();

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const hud = {
  score: $('score'), best: $('best'), chainBox: $('chain-box'), chain: $('chain'), chainFill: $('chain-fill'),
  airBox: $('air-box'), airHeight: $('air-height'), airTricks: $('air-tricks'), popup: $('popup'),
  lift: $('lift-fill'), charge: $('charge-fill'), hint: $('hint'),
};
let hintTimer = 0;
function showHint(text, dur = 7) { hud.hint.textContent = text; hud.hint.style.opacity = 1; hintTimer = dur; }
function flash(text) {
  const el = document.createElement('div');
  el.className = 'flash';
  el.textContent = text;
  document.getElementById('hud').appendChild(el);
  setTimeout(() => el.remove(), 950);
}
let displayedScore = 0;

// ---------- helpers ----------
const fwd = (h, out = new THREE.Vector3()) => out.set(-Math.sin(h), 0, -Math.cos(h));
const wrapPi = (a) => a - TAU * Math.round(a / TAU);
const q = new THREE.Quaternion();
const qa = new THREE.Quaternion();
const e = new THREE.Euler();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const surfaceAt = (x, z) => waveHeight(x, z, time);

function setOrientation(yaw, pitch, roll) {
  q.setFromAxisAngle(AY, yaw);
  qa.setFromAxisAngle(AX, pitch); q.multiply(qa);
  qa.setFromAxisAngle(AZ, roll); q.multiply(qa);
  dolphin.root.quaternion.copy(q);
}

// ---------- jump ----------
function launch() {
  const f = fwd(s.heading);
  const lift = s.lift;
  const vy = 6.5 + s.charge * 5 + Math.max(0, lift) * 1.55 + Math.min(0, lift) * 0.5 + s.speed * 0.12;
  s.vel.set(f.x * s.speed, Math.max(5, vy), f.z * s.speed);
  s.pos.y = Math.max(s.pos.y, surfaceAt(s.pos.x, s.pos.z) - 0.6);
  s.mode = 'air';
  const hPitch = Math.atan2(s.vel.y, s.speed);
  s.air = {
    flip: 0, roll: 0, spin: 0, flipV: 0, rollV: 0, spinV: 0,
    trajPitch: s.swimPitch, maxY: s.pos.y, t: 0, exited: false,
    lift, liftFrac: THREE.MathUtils.clamp(lift / MAX_LIFT, 0, 1), counted: { flip: 0, roll: 0, spin: 0 }, hoops: 0,
    hPitch,
  };
  s.charge = 0;
  if (s.air.liftFrac > 0.55) flash(s.air.liftFrac > 0.8 ? 'Perfect wave!' : 'Wave boost!');
  audio.launch(Math.min(1, vy / 20));
  splash.burst(s.pos.clone().setY(surfaceAt(s.pos.x, s.pos.z)), 70, 5 + s.air.liftFrac * 4, s.vel);
}

const TRICK_NAMES = {
  flip: (n, dir) => `${n > 1 ? n + 'x ' : ''}${dir > 0 ? 'Backflip' : 'Frontflip'}`,
  roll: (n) => `${n > 1 ? n + 'x ' : ''}Barrel Roll`,
  spin: (n) => `${n * 360} Spin`,
};
const TRICK_POINTS = { flip: 450, roll: 260, spin: 320 };

function trickCount(angle) { return Math.floor((Math.abs(angle) + 0.6) / TAU); }

function landEvaluate() {
  const a = s.air;
  // how well does the nose line up with the direction of travel?
  const body = tmp.set(0, 0, -1).applyQuaternion(dolphin.root.quaternion);
  const dir = tmp2.copy(s.vel).normalize();
  const noseErr = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(body.dot(dir), -1, 1)));
  const rollErr = THREE.MathUtils.radToDeg(Math.abs(wrapPi(a.roll)));
  const err = noseErr + rollErr * 0.45;

  const grades = [
    { max: 16, name: 'Perfect entry', cls: 'perfect', mult: 2, g: 4 },
    { max: 32, name: 'Great entry', cls: 'great', mult: 1.5, g: 3 },
    { max: 55, name: 'Good entry', cls: 'good', mult: 1.2, g: 2 },
    { max: 85, name: 'Sloppy', cls: 'sloppy', mult: 0.6, g: 1 },
    { max: 999, name: 'Belly flop!', cls: 'flop', mult: 0, g: 0 },
  ];
  const grade = grades.find((g) => err <= g.max);
  lastLanding = { noseErr, rollErr, flip: a.flip, roll: a.roll, spin: a.spin, t: a.t };

  const tricks = [];
  let trickPts = 0;
  const kinds = new Set();
  for (const k of ['flip', 'roll', 'spin']) {
    const n = trickCount(a[k]);
    if (n > 0) {
      tricks.push(TRICK_NAMES[k](n, Math.sign(a[k])));
      trickPts += TRICK_POINTS[k] * n * (1 + 0.3 * (n - 1));
      kinds.add(k);
    }
  }
  const height = Math.max(0, a.maxY);
  const base = 60 + a.t * 140 + trickPts;
  const mults = [];
  mults.push({ label: `Height ${height.toFixed(1)}m`, v: 1 + height / 5 });
  mults.push({ label: grade.name.replace('!', ''), v: grade.mult });
  if (kinds.size > 1) mults.push({ label: 'Combo', v: 1 + 0.5 * (kinds.size - 1) });
  if (a.liftFrac > 0.8) mults.push({ label: 'Perfect wave', v: 1.6 });
  else if (a.liftFrac > 0.55) mults.push({ label: 'Wave rider', v: 1.3 });
  if (a.hoops) mults.push({ label: `Hoop${a.hoops > 1 ? 's' : ''}`, v: 1 + 0.5 * a.hoops });
  const chainMult = 1 + 0.25 * s.chain;
  if (s.chain > 0 && grade.g >= 2) mults.push({ label: `Chain ${s.chain + 1}`, v: chainMult });

  let total = Math.round(base * mults.reduce((p, m) => p * m.v, 1));
  if (grade.g === 0) total = 0;

  s.score += total;
  if (total > s.bestJump) {
    s.bestJump = total;
    localStorage.setItem('dolphin-best-jump', String(total));
  }

  if (grade.g >= 2) { s.chain++; s.chainTimer = 5; } else { s.chain = 0; s.chainTimer = 0; }

  // landing feel
  const impact = grade.g === 0 ? 1.8 : grade.g === 1 ? 1.1 : 0.35 + (4 - grade.g) * 0.15;
  const p = s.pos.clone().setY(surfaceAt(s.pos.x, s.pos.z));
  splash.burst(p, Math.round(50 + impact * 140), 3 + impact * 4.5, grade.g >= 3 ? s.vel : null);
  audio.splash(Math.min(1, impact * 0.6));
  audio.land(grade.g);
  if (grade.g === 4) setTimeout(() => audio.chirp(), 350);
  if (grade.g === 0) { s.stun = 1.2; s.speed = 6; shake = 0.6; } else if (grade.g === 1) { s.speed *= 0.8; shake = 0.25; }

  // popup
  hud.popup.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'pop';
  el.innerHTML = `
    <div class="grade ${grade.cls}">${grade.name}</div>
    ${tricks.length ? `<div class="tricks">${tricks.join(' + ')}</div>` : ''}
    ${grade.g ? `<div class="mults">${mults.map((m) => `<span>${m.label} ×${m.v.toFixed(1)}</span>`).join('')}</div>` : ''}
    <div class="total">${total ? '+' + total.toLocaleString() : 'No points'}</div>`;
  hud.popup.appendChild(el);

  if (grade.g === 0) showHint('Tip: finish your rotation before you hit the water, nose first.', 5);
  else if (a.maxY < 3 && a.liftFrac < 0.3) showHint('Tip: leap as a swell lifts you, heading into it, to fly much higher.', 5);
}

// ---------- update ----------
let shake = 0;
let lastLanding = null;
const camPos = new THREE.Vector3(10, 4, 10);
const camLook = new THREE.Vector3();
let camYaw = 0;

function update(dt) {
  const inp = started ? input() : { fwd: 0, turn: 0, spin: 0, dive: false };
  const f = fwd(s.heading);

  if (s.mode === 'swim') {
    s.stun = Math.max(0, s.stun - dt);
    const target = s.stun > 0 ? 7 : 13 + Math.max(0, inp.fwd) * 6 - Math.max(0, -inp.fwd) * 5 - s.charge * 2;
    s.speed += (target - s.speed) * Math.min(1, dt * 1.5);
    s.turnVel += (inp.turn * 1.5 - s.turnVel) * Math.min(1, dt * 5);
    // gently steer away from the beach / open sea limits
    if (s.pos.x < X_MIN + 10 && f.x < 0.2) s.turnVel -= (X_MIN + 10 - s.pos.x) * 0.6 * dt;
    if (s.pos.x > X_MAX - 10 && f.x > -0.2) s.turnVel += (s.pos.x - (X_MAX - 10)) * 0.6 * dt;
    s.heading += s.turnVel * dt;
    fwd(s.heading, f);
    s.pos.x += f.x * s.speed * dt;
    s.pos.z += f.z * s.speed * dt;
    s.pos.x = THREE.MathUtils.clamp(s.pos.x, X_MIN, X_MAX);

    if (inp.dive && s.stun <= 0) s.charge = Math.min(1, s.charge + dt / 0.7);
    else if (s.charge > 0) launch();

    if (s.mode === 'swim') {
      const targetDepth = SWIM_DEPTH + s.charge * 1.9;
      s.depth += (targetDepth - s.depth) * Math.min(1, dt * 6);
      const h = surfaceAt(s.pos.x, s.pos.z);
      s.pos.y = h - s.depth;
      s.lift = waveLift(s.pos.x, s.pos.z, time, f.x * s.speed, f.z * s.speed);
      const slope = Math.atan(waveSlope(s.pos.x, s.pos.z, time, f.x, f.z));
      const tp = slope - s.charge * 0.35 + Math.sin(time * 2.2) * 0.03;
      s.swimPitch += (tp - s.swimPitch) * Math.min(1, dt * 6);
      s.swimRoll += (-s.turnVel * 0.35 - s.swimRoll) * Math.min(1, dt * 5);
      setOrientation(s.heading, s.swimPitch, s.swimRoll);
      dolphin.animate(dt, s.speed, 1);
      // little bow wake around the dorsal fin
      if (Math.random() < dt * (8 + s.speed)) {
        const side = Math.random() < 0.5 ? -1 : 1;
        splash.emit(s.pos.x - f.x * 0.4 + f.z * side * 0.4, h + 0.05, s.pos.z - f.z * 0.4 - f.x * side * 0.4,
          f.z * side * 1.5 + f.x * s.speed * 0.25, 1 + Math.random() * 1.5, -f.x * side * 1.5 + f.z * s.speed * 0.25, 0.12 + Math.random() * 0.12, 0.5);
      }
      if (s.chainTimer > 0) { s.chainTimer -= dt; if (s.chainTimer <= 0) s.chain = 0; }
    }
  } else {
    const a = s.air;
    a.t += dt;
    s.vel.y -= G * dt;
    s.pos.addScaledVector(s.vel, dt);
    s.pos.x = THREE.MathUtils.clamp(s.pos.x, X_MIN - 4, X_MAX + 4);
    a.maxY = Math.max(a.maxY, s.pos.y);
    const h = surfaceAt(s.pos.x, s.pos.z);
    if (!a.exited && s.pos.y > h + 0.3) a.exited = true;

    // rotation input (with a gentle settle toward upright when you let go)
    const ctl = (angleKey, velKey, input, rate) => {
      let target;
      if (input !== 0) target = input * rate;
      else {
        // only settle when you're close to a full rotation; otherwise just coast
        const off = wrapPi(-a[angleKey]);
        target = Math.abs(off) < 1.1 ? off * 3.5 : 0;
      }
      a[velKey] += (target - a[velKey]) * Math.min(1, dt * (input !== 0 ? 7 : 9));
      a[angleKey] += a[velKey] * dt;
    };
    ctl('flip', 'flipV', -inp.fwd, FLIP_RATE);
    ctl('roll', 'rollV', -inp.turn, ROLL_RATE);
    ctl('spin', 'spinV', inp.spin, SPIN_RATE);

    // announce each completed rotation
    for (const k of ['flip', 'roll', 'spin']) {
      const n = trickCount(a[k]);
      if (n > a.counted[k]) {
        a.counted[k] = n;
        const total = a.counted.flip + a.counted.roll + a.counted.spin;
        audio.trick(total);
        flash(TRICK_NAMES[k](n, Math.sign(a[k])) + '!');
      }
    }

    const hs = Math.hypot(s.vel.x, s.vel.z);
    const tp = Math.atan2(s.vel.y, hs);
    a.trajPitch += (tp - a.trajPitch) * Math.min(1, dt * 5);
    setOrientation(s.heading + a.spin, a.trajPitch + a.flip, a.roll);
    dolphin.animate(dt, 6, 0.5);

    // drips
    if (Math.random() < dt * 30 * Math.max(0, 1 - a.t)) {
      splash.emit(s.pos.x, s.pos.y, s.pos.z, s.vel.x * 0.6, s.vel.y * 0.3, s.vel.z * 0.6, 0.12, 0.8);
    }

    // hoops
    for (const hp of world.hoops) {
      if (hp.taken) continue;
      const dx = hp.obj.position.x - s.pos.x, dy = hp.obj.position.y - s.pos.y, dz = hp.obj.position.z - s.pos.z;
      if (Math.abs(dz) < 1.2 && dx * dx + dy * dy < 2.4 * 2.4) {
        hp.taken = true;
        a.hoops++;
        audio.hoop();
        flash('Hoop! ✦');
        for (let i = 0; i < 40; i++) {
          const ang = (i / 40) * TAU;
          splash.emit(hp.obj.position.x + Math.cos(ang) * 2.4, hp.obj.position.y + Math.sin(ang) * 2.4, hp.obj.position.z, Math.cos(ang) * 3, Math.sin(ang) * 3, 0, 0.25, 0.7);
        }
      }
    }

    if (a.exited && s.vel.y < 0 && s.pos.y <= h) {
      landEvaluate();
      s.mode = 'swim';
      s.depth = Math.min(2.5, -s.vel.y * 0.1 + SWIM_DEPTH);
      s.swimPitch = a.trajPitch;
      s.speed = Math.max(s.speed, hs);
      s.air = null;
    } else if (!a.exited && a.t > 1.2) {
      // never made it out: just resume swimming
      s.mode = 'swim';
      s.air = null;
    }
  }

  dolphin.root.position.copy(s.pos);

  // ---------- camera ----------
  const inAir = s.mode === 'air';
  camYaw += wrapPi(s.heading - camYaw) * Math.min(1, dt * 2.5);
  const cf = fwd(camYaw);
  const dist = inAir ? 12 : 10;
  const desired = tmp.set(s.pos.x - cf.x * dist, 0, s.pos.z - cf.z * dist);
  const baseY = inAir ? Math.max(4.5, s.pos.y * 0.55 + 3.5) : 4.6;
  desired.y = Math.max(baseY, surfaceAt(desired.x, desired.z) + 2.6);
  camPos.lerp(desired, Math.min(1, dt * (inAir ? 3 : 4)));
  camPos.y = Math.max(camPos.y, surfaceAt(camPos.x, camPos.z) + 1.2);
  const lookTarget = tmp2.set(s.pos.x + cf.x * 5, inAir ? s.pos.y * 0.7 + 1 : Math.max(s.pos.y, 0) + 0.8, s.pos.z + cf.z * 5);
  camLook.lerp(lookTarget, Math.min(1, dt * 6));
  camera.position.copy(camPos);
  if (shake > 0) {
    shake = Math.max(0, shake - dt);
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }
  camera.lookAt(camLook);
  const targetFov = 62 + (s.speed - 13) * 0.8 + (inAir ? 4 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 2);
  camera.updateProjectionMatrix();

  // lights follow the player
  sun.position.copy(s.pos).addScaledVector(SUN_DIR, 100);
  sun.target.position.copy(s.pos);
  fill.position.copy(camera.position).add(new THREE.Vector3(0, 6, 0));
  fill.target.position.copy(s.pos);

  world.update(time, s.pos, camera);
  splash.update(dt, surfaceAt);
  splash.material.uniforms.uScale.value = window.innerHeight * 0.9;

  // ---------- HUD ----------
  displayedScore += (s.score - displayedScore) * Math.min(1, dt * 6);
  if (Math.abs(s.score - displayedScore) < 1) displayedScore = s.score;
  hud.score.textContent = Math.round(displayedScore).toLocaleString();
  hud.best.textContent = `Best jump ${s.bestJump.toLocaleString()}`;
  hud.chainBox.classList.toggle('hidden', !(s.chain > 0 && s.chainTimer > 0));
  hud.chain.textContent = `Chain ×${(1 + 0.25 * s.chain).toFixed(2)}`;
  hud.chainFill.style.width = `${(s.chainTimer / 5) * 100}%`;
  const liftFrac = inAir ? s.air.liftFrac : THREE.MathUtils.clamp(s.lift / MAX_LIFT, 0, 1);
  hud.lift.style.width = `${liftFrac * 100}%`;
  hud.lift.classList.toggle('hot', liftFrac > 0.55);
  hud.charge.style.width = `${s.charge * 100}%`;
  hud.airBox.classList.toggle('hidden', !inAir || !s.air.exited);
  if (inAir) {
    hud.airHeight.textContent = `${Math.max(0, s.pos.y).toFixed(1)} m`;
    const c = s.air.counted;
    hud.airTricks.textContent = [c.flip && `${c.flip} flip`, c.roll && `${c.roll} roll`, c.spin && `${c.spin} spin`].filter(Boolean).join(' · ');
  }
  if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) hud.hint.style.opacity = 0; }
}

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// debug / testing hook
window.__dolphin = { state: s, keys, get last() { return lastLanding; }, get time() { return time; } };
