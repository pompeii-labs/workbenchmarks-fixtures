import * as THREE from 'three';
import { createRenderer, resizeRenderer } from './core/Renderer';
import { Input } from './input';
import { Audio } from './audio';
import { DolphinModel } from './render/dolphin';
import { World } from './render/world';
import { Fx } from './render/fx';
import { Hud } from './hud';
import { createSeededRandom } from './utils/random';
import {
  createSim,
  startSession,
  step,
  IDLE,
  STEP,
  type SimState,
} from './sim/sim';
import { sampleSurface } from './sim/waves';

const BEST_KEY = 'dolphin-coast-best';
const TEST_BUILD = import.meta.env.MODE === 'test';

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 900);
  private readonly dolphin = new DolphinModel();
  private readonly world: World;
  private readonly fx: Fx;
  private readonly hud = new Hud();
  private readonly audio = new Audio();
  private readonly input: Input;
  private sim: SimState;
  private rng = createSeededRandom(1);
  private accumulator = 0;
  private last = performance.now();
  private frame = 0;
  private timeScale = 1;
  private renderScale = 1;
  private frozen = false;
  private seenEvent = 0;
  private camYaw = 0;
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private shake = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMappingExposure = 1.08;
    this.world = new World(this.scene);
    this.fx = new Fx(this.scene);
    this.scene.add(this.dolphin.group);
    this.dolphin.group.rotation.order = 'YXZ';
    this.sim = createSim(loadBest());
    // Seeded start: where along the coast the session begins (and so which swell phase).
    this.sim.time = this.rng() * 30;

    this.input = new Input(this.el('touch-stick'), this.el('touch-knob'), this.el('sprint-button'));
    this.input.onPause = () => this.togglePause();
    this.input.onConfirm = () => {
      if (this.sim.phase === 'title' || this.sim.phase === 'results') this.begin();
      else if (this.sim.phase === 'paused') this.togglePause();
    };
    this.el('play-button').addEventListener('click', () => this.begin());
    this.el('again-button').addEventListener('click', () => this.begin());
    this.el('resume-button').addEventListener('click', () => this.togglePause());
    this.el('pause-button').addEventListener('click', () => this.togglePause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.sim.phase === 'playing') this.togglePause();
    });

    this.snapCamera();
    resizeRenderer(this.renderer, this.camera, 2);
    if (TEST_BUILD) this.installTestHooks();
    this.hud.update(this.sim);
    this.publish();
  }

  start(): void {
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frameUpdate(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    document.getElementById('loading')?.classList.add('done');
  }

  private begin(): void {
    this.audio.unlock();
    startSession(this.sim);
    this.seenEvent = this.sim.nextEventId - 1;
    this.hud.update(this.sim);
  }

  private togglePause(): void {
    if (this.sim.phase === 'playing') this.sim.phase = 'paused';
    else if (this.sim.phase === 'paused') {
      this.sim.phase = 'playing';
      this.last = performance.now();
    }
    this.hud.update(this.sim);
  }

  private frameUpdate(dt: number): void {
    this.frame++;
    if (!this.frozen) {
      this.accumulator += dt * this.timeScale;
      const maxSteps = 8 * Math.max(1, this.timeScale);
      let steps = 0;
      while (this.accumulator >= STEP && steps < maxSteps) {
        const cmd = (this.sim.phase === 'playing' ? this.input.command() : IDLE);
        step(this.sim, cmd);
        this.accumulator -= STEP;
        steps++;
      }
      if (steps >= maxSteps) this.accumulator = 0;
      this.consumeEvents();
      this.fx.update(dt * this.timeScale);
      this.updateCamera(dt * this.timeScale);
    }
    this.renderFrame();
    this.publish();
  }

  private consumeEvents(): void {
    for (const e of this.sim.events) {
      if (e.id <= this.seenEvent) continue;
      this.seenEvent = e.id;
      if (e.type === 'launch') {
        this.fx.splash(e.x, e.y, e.z, 26 + Math.round(e.boost * 4), 1 + e.boost * 0.1);
        this.audio.splash(0.7);
        if (e.waveGrade) this.hud.toast(e.waveGrade, 'swell');
      } else if (e.type === 'land') {
        const t = e.trick;
        const flop = t.landMult === 0;
        this.fx.splash(e.x, e.y, e.z, flop ? 70 : t.grade === 'Perfect' ? 18 : 36, flop ? 2.2 : 1.1);
        this.audio.splash(flop ? 1.6 : 0.9);
        if (flop) {
          this.audio.thud();
          this.shake = 0.5;
        } else this.audio.chime(t.grade === 'Perfect' ? 5 : t.grade === 'Clean' ? 3 : 2);
        this.hud.trick(t);
      } else if (e.type === 'timeup') {
        try {
          localStorage.setItem(BEST_KEY, String(this.sim.best));
        } catch {
          /* storage unavailable */
        }
      }
    }
    if (this.sim.events.length > 64) this.sim.events.splice(0, this.sim.events.length - 16);
    this.hud.update(this.sim);
  }

  private snapCamera(): void {
    this.camYaw = this.sim.dolphin.yaw;
    this.desiredCamera(this.camPos, this.camLook);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private desiredCamera(pos: THREE.Vector3, look: THREE.Vector3): void {
    const d = this.sim.dolphin;
    const hx = Math.sin(this.camYaw);
    const hz = -Math.cos(this.camYaw);
    const air = d.airborne ? Math.max(0, d.y) : 0;
    const back = 9.5 + air * 0.35;
    const up = 3.6 + air * 0.45;
    pos.set(d.x - hx * back, Math.max(d.y * 0.6, 0) + up, d.z - hz * back);
    look.set(d.x + hx * 5, Math.max(d.y * 0.8, -1) + 0.6, d.z + hz * 5);
  }

  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private updateCamera(dt: number): void {
    const d = this.sim.dolphin;
    this.camYaw += (d.yaw - this.camYaw) * Math.min(1, dt * 2.2);
    this.desiredCamera(this.tmpPos, this.tmpLook);
    const k = Math.min(1, dt * 5);
    this.camPos.lerp(this.tmpPos, k);
    this.camLook.lerp(this.tmpLook, Math.min(1, dt * 8));
    // Keep the camera above the swell.
    const surf = sampleSurface(this.camPos.x, this.camPos.z, this.sim.time, { h: 0, dhdt: 0, gx: 0, gz: 0 });
    this.camPos.y = Math.max(this.camPos.y, surf.h + 1.4);
    this.shake = Math.max(0, this.shake - dt);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) this.camera.position.y += Math.sin(this.frame * 1.7) * this.shake * 0.4;
    this.camera.lookAt(this.camLook);
  }

  private renderFrame(): void {
    const scale = this.renderScale;
    resizeRenderer(this.renderer, this.camera, 2 * scale);
    const d = this.sim.dolphin;
    const g = this.dolphin.group;
    g.position.set(d.x, d.y, d.z);
    g.rotation.set(d.pitch, -d.yaw, d.roll);
    this.dolphin.animate(d.tailPhase, d.airborne);
    this.dolphin.setUnderwater(this.sim.surface.h - d.y);
    this.world.update(d.x, d.z, this.sim.time, this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  private publish(): void {
    if (import.meta.env.MODE !== 'test') return;
    const s = this.sim;
    const d = s.dolphin;
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: s.time,
      phase: s.phase,
      score: s.score,
      best: s.best,
      remaining: s.remaining,
      combo: s.combo,
      jumps: s.jumps,
      cleanLandings: s.cleanLandings,
      targetScore: 0,
      complete: s.phase === 'results',
      airborne: d.airborne,
      launchPotential: s.launchPotential,
      lastTrick: s.lastTrick,
      peak: s.jump?.peak ?? null,
      player: {
        position: { x: d.x, y: d.y, z: d.z },
        speed: d.airborne ? Math.hypot(d.vh, d.vy) : d.speed,
        pitch: d.pitch,
        roll: d.roll,
        yaw: d.yaw,
        stamina: d.stamina,
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, 2) * this.renderScale,
      },
    };
  }

  private installTestHooks(): void {
    if (import.meta.env.MODE !== 'test') return;
    const refresh = () => {
      this.snapCamera();
      this.hud.update(this.sim);
      this.renderFrame();
      this.publish();
    };
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.rng = createSeededRandom(value);
        this.sim.time = this.rng() * 30;
      },
      setState: (name: string) => {
        const best = this.sim.best;
        this.sim = createSim(best);
        this.sim.time = 12.5;
        this.seenEvent = 0;
        this.fx.clear();
        this.hud.clearPopups();
        if (name === 'title') {
          // attract mode as on first load
        } else if (name === 'active-play') {
          startSession(this.sim);
          this.sim.remaining = 71;
          this.sim.score = 4820;
          this.sim.combo = 2;
          this.sim.comboTimer = 5;
          this.sim.dolphin.pitch = 0.25;
          this.sim.dolphin.y = -1.2;
        } else if (name === 'airborne-trick') {
          startSession(this.sim);
          this.sim.remaining = 48;
          this.sim.score = 12650;
          this.sim.combo = 3;
          this.sim.comboTimer = 5;
          const d = this.sim.dolphin;
          d.airborne = true;
          d.y = 6.2;
          d.vh = 13;
          d.vy = 2;
          d.pitch = 2.3;
          d.roll = -0.5;
          d.yaw = 0.15;
          this.sim.jump = { launchPitch: 0.8, launchVelAngle: 0.8, launchRoll: 0, launchY: 0, peak: 6.4, airtime: 0.8, waveBoost: 5.5, pitchArmed: true, rollArmed: true };
          this.sim.jumps = 6;
        } else if (name === 'paused') {
          startSession(this.sim);
          this.sim.remaining = 55;
          this.sim.score = 7300;
          this.sim.phase = 'paused';
        } else if (name === 'results') {
          startSession(this.sim);
          this.sim.score = 38420;
          this.sim.jumps = 17;
          this.sim.cleanLandings = 13;
          this.sim.bestTrick = {
            id: 1, points: 9800, height: 9.1, airtime: 2.3, flips: 2, spins: 1, grade: 'Perfect',
            heightMult: 2.8, landMult: 2, waveMult: 1.5, comboMult: 1.75, name: 'Double Backflip + 360 Spin',
          };
          this.sim.remaining = 0;
          this.sim.phase = 'results';
          this.sim.best = Math.max(this.sim.best, this.sim.score);
        } else {
          throw new Error(`Unknown test state: ${name}`);
        }
        refresh();
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.frozen = paused;
      },
      setReducedMotion: () => {},
      hideDebugUi: () => {},
      setTimeScale: (n: number) => {
        this.timeScale = Math.max(0.1, n);
      },
      setRenderScale: (s: number) => {
        this.renderScale = Math.min(1, Math.max(0.2, s));
      },
      setRemaining: (seconds: number) => {
        this.sim.remaining = seconds;
      },
    };
  }

  private el(id: string): HTMLElement {
    const e = document.getElementById(id);
    if (!e) throw new Error(`Missing #${id}`);
    return e;
  }
}
