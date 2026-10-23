import * as THREE from 'three';
import { Input } from '../core/Input';
import { createRenderer } from '../core/Renderer';
import { JetSki } from '../render/JetSki';
import { createSky } from '../render/Sky';
import { Splash } from '../render/Splash';
import { Water } from '../render/Water';
import { World } from '../render/World';
import { createState, IDLE, placeRingAhead, step, TUNING, type Command, type SimEvent, type SimState } from '../sim/sim';
import { waveHeight } from '../sim/waves';
import { AudioSystem } from '../systems/AudioSystem';
import { Hud } from '../ui/Hud';

type UiMode = 'title' | 'play' | 'paused';

const DT = TUNING.dt;
const MAX_DPR = 1.75;

const PALETTE = {
  skyTop: new THREE.Color('#3f8fd6'),
  horizon: new THREE.Color('#cfe6f2'),
  deep: new THREE.Color('#0a3d62'),
  shallow: new THREE.Color('#1fa5b4'),
  sunColor: new THREE.Color('#fff1cf'),
  sunDir: new THREE.Vector3(0.55, 0.42, -0.72).normalize(),
  fogDensity: 0.0029,
};

function el<T extends HTMLElement = HTMLElement>(sel: string): T {
  const e = document.querySelector<T>(sel);
  if (!e) throw new Error(`Missing element ${sel}`);
  return e;
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(64, 1, 0.1, 2000);
  private readonly water = new Water(PALETTE);
  private readonly ski = new JetSki();
  private readonly splash = new Splash();
  private readonly world = new World();
  private readonly hud = new Hud();
  private readonly audio = new AudioSystem();
  private readonly input: Input;
  private readonly sky: THREE.Mesh;
  private readonly hudEl = el('#hud');

  private sim: SimState;
  private seed = 1;
  private ui: UiMode = 'title';
  private lastEventId = 0;
  private acc = 0;
  private lastTime = 0;
  private frame = 0;
  private rafId = 0;
  private running = false;
  private frozen = false;
  private timeScale = 1;
  private renderScale = 1;
  private reducedMotion = false;
  private lastCmd: Command = IDLE;
  private emitAcc = { rooster: 0, bow: 0, carve: 0, foam: 0 };

  // camera state
  private camYaw = 0;
  private camY = 0;
  private trauma = 0;
  private shakeT = 0;
  private readonly camPos = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly carry = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMappingExposure = 1.0;

    this.input = new Input(el('#touch-stick'), el('#touch-knob'), el('#jump-button'), el('#boost-button'));
    this.input.onAction = (a) => this.onAction(a);

    this.sky = createSky(PALETTE.skyTop, PALETTE.horizon, PALETTE.sunDir, PALETTE.sunColor);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(PALETTE.horizon.clone(), 0.0022);
    this.scene.background = PALETTE.horizon.clone();
    const hemi = new THREE.HemisphereLight('#cfeaff', '#1b5a78', 1.5);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff0d0', 2.8);
    sun.position.copy(PALETTE.sunDir).multiplyScalar(100);
    this.scene.add(sun);
    this.scene.add(this.water.mesh, this.world.group, this.ski.root, this.splash.foam, this.splash.spray);

    this.sim = createState(this.seed);
    this.resetRun();

    el('#start-btn').addEventListener('click', () => this.startPlay());
    el('#resume-btn').addEventListener('click', () => this.setPaused(false));
    el('#restart-btn').addEventListener('click', () => {
      this.resetRun();
      this.startPlay();
    });
    el('#pause-btn').addEventListener('click', () => this.setPaused(this.ui !== 'paused'));
    el('#mute-btn').addEventListener('click', () => this.toggleMute());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.ui === 'play') this.setPaused(true);
    });
    try {
      if (localStorage.getItem('swellrider-muted') === '1') this.toggleMute(true);
    } catch {
      // storage may be unavailable (private mode / sandboxed iframe)
    }

    if (__TEST_HOOKS__) this.installTestHooks();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.frameUpdate(now);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.audio.dispose();
    this.water.dispose();
    this.ski.dispose();
    this.splash.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- flow

  private onAction(a: 'pause' | 'restart' | 'mute' | 'start'): void {
    this.audio.unlock();
    if (a === 'mute') return this.toggleMute();
    if (this.ui === 'title') {
      if (a === 'start' || a === 'restart') this.startPlay();
      return;
    }
    if (a === 'pause') this.setPaused(this.ui !== 'paused');
    else if (a === 'restart') {
      this.resetRun();
      this.startPlay();
    }
  }

  private startPlay(): void {
    this.audio.unlock();
    if (this.ui === 'title') this.resetRun();
    this.ui = 'play';
    this.input.flush();
    el('#title').classList.add('hidden');
    el('#pause').classList.add('hidden');
  }

  private setPaused(p: boolean): void {
    if (this.ui === 'title') return;
    this.ui = p ? 'paused' : 'play';
    el('#pause').classList.toggle('hidden', !p);
    if (p) el<HTMLButtonElement>('#resume-btn').focus({ preventScroll: true });
    else {
      this.input.flush();
      this.canvas.focus({ preventScroll: true });
    }
  }

  private toggleMute(force?: boolean): void {
    const m = force ?? !this.audio.muted;
    this.audio.setMuted(m);
    el('#mute-btn').classList.toggle('muted', m);
    try {
      localStorage.setItem('swellrider-muted', m ? '1' : '0');
    } catch {
      // ignore
    }
  }

  private resetRun(): void {
    this.sim = createState(this.seed);
    this.lastEventId = 0;
    this.acc = 0;
    this.splash.reset(this.seed);
    this.world.clearRings();
    this.hud.clearPopups();
    this.hud.resetHint();
    this.camYaw = this.sim.heading;
    this.camY = this.sim.y;
    this.trauma = 0;
    this.emitAcc = { rooster: 0, bow: 0, carve: 0, foam: 0 };
  }

  // ---------------------------------------------------------------- loop

  private frameUpdate(now: number): void {
    const realDt = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.frame += 1;

    if (!this.frozen) {
      const simulate = this.ui !== 'paused';
      if (simulate) {
        this.acc += realDt * this.timeScale;
        const maxSteps = Math.ceil(6 * this.timeScale);
        let n = 0;
        while (this.acc >= DT && n < maxSteps) {
          const cmd = this.ui === 'play' ? this.input.read() : this.attractCommand();
          this.stepOnce(cmd);
          this.acc -= DT;
          n += 1;
        }
        if (n >= maxSteps) this.acc = 0; // capped catch-up: drop the backlog
      }
      this.updateCamera(this.ui === 'paused' ? 0 : realDt);
    }
    this.renderFrame();
    if (this.frame === 2) el('#loading').classList.add('done');
    this.audio.engine(
      Math.min(1, Math.hypot(this.sim.vx, this.sim.vz) / TUNING.boostSpeed),
      this.lastCmd.throttle,
      this.sim.airborne,
      this.sim.boosting,
      this.ui === 'play' && this.sim.mode === 'ride',
    );
    this.publishDiagnostics();
  }

  /** Title-screen autopilot: gentle cruising so the menu shows the game. */
  private attractCommand(): Command {
    const t = this.sim.t;
    return { throttle: 0.75, steer: Math.sin(t * 0.35) * 0.45, boost: false, jump: false };
  }

  private stepOnce(cmd: Command): void {
    this.lastCmd = cmd;
    step(this.sim, cmd);
    this.emitWaterFx(cmd);
    for (const ev of this.sim.events) {
      if (ev.id <= this.lastEventId) continue;
      this.lastEventId = ev.id;
      this.handleEvent(ev);
    }
    this.splash.update(DT, this.sim.t);
    this.splash.tickFoam(DT);
  }

  private handleEvent(ev: SimEvent): void {
    const s = this.sim;
    this.carry.set(s.vx, 0, s.vz);
    const loud = this.ui === 'play';
    switch (ev.type) {
      case 'launch':
        this.splash.burst(ev.x, ev.y, ev.z, 26, 3 + Math.min(4, ev.value * 0.3), this.carry);
        break;
      case 'land': {
        const impact = Math.max(0, ev.value);
        if (impact > 2) {
          this.splash.burst(ev.x, ev.y, ev.z, Math.min(220, 50 + impact * 9), 3 + impact * 0.45, this.carry);
          this.trauma = Math.min(1, this.trauma + 0.12 + impact * 0.025);
          if (loud) this.audio.splash(impact);
        }
        break;
      }
      case 'wipeout':
        this.splash.burst(ev.x, ev.y, ev.z, 260, 8, this.carry);
        this.trauma = Math.min(1, this.trauma + 0.7);
        if (loud) this.audio.splash(14);
        break;
      case 'ring':
        this.world.popRing(ev.value);
        this.splash.burst(ev.x, ev.y - 1, ev.z, 40, 4, this.carry);
        if (loud) this.audio.chime(ev.label === 'air');
        break;
      case 'trick':
        if (ev.label && this.ui !== 'title') this.hud.popup(ev.label, ev.value);
        break;
      default:
        break;
    }
  }

  private emitWaterFx(cmd: Command): void {
    const s = this.sim;
    const speed = Math.hypot(s.vx, s.vz);
    const onWater = !s.airborne && s.y - s.surfaceY < 0.2;
    if (!onWater || speed < 1.5) return;
    const fx = -Math.sin(s.heading);
    const fz = -Math.cos(s.heading);
    const rx = -fz;
    const rz = fx;
    const lateral = s.vx * rx + s.vz * rz;
    const sp = this.splash;
    const boost = s.boosting ? 1.6 : 1;

    // Rooster tail from the jet nozzle
    this.emitAcc.rooster += (speed / 3) * boost * (s.mode === 'wipeout' ? 0 : 1) * (cmd.throttle > 0 ? 1 : 0.35);
    while (this.emitAcc.rooster >= 1) {
      this.emitAcc.rooster -= 1;
      const up = 3 + speed * 0.28 * boost;
      sp.emit(s.x - fx * 1.6, s.y + 0.05, s.z - fz * 1.6, -fx * speed * 0.12 + s.vx * 0.45, up, -fz * speed * 0.12 + s.vz * 0.45, 1.4, 0.4, 1.0);
    }
    // Bow spray peeling off both sides
    this.emitAcc.bow += speed / 9;
    while (this.emitAcc.bow >= 1) {
      this.emitAcc.bow -= 1;
      for (const side of [-1, 1]) {
        const out = 1.6 + speed * 0.11;
        sp.emit(s.x + fx * 0.6 + rx * side * 0.6, s.y, s.z + fz * 0.6 + rz * side * 0.6,
          rx * side * out + s.vx * 0.7, 1.4 + speed * 0.07, rz * side * out + s.vz * 0.7, 1.2, 0.2, 0.6);
      }
    }
    // Carve sheet: slip sideways throws a wall of water to the outside
    const slip = Math.abs(lateral);
    if (slip > 1.2) {
      this.emitAcc.carve += slip * 0.9;
      const side = Math.sign(lateral);
      while (this.emitAcc.carve >= 1) {
        this.emitAcc.carve -= 1;
        const out = 3 + slip * 1.1;
        sp.emit(s.x + rx * side * 0.7 - fx * 0.4, s.y, s.z + rz * side * 0.7 - fz * 0.4,
          rx * side * out + s.vx * 0.5, 2.6 + slip * 0.5, rz * side * out + s.vz * 0.5, 2, 0.34, 0.9);
      }
    }
    // Wake foam
    this.emitAcc.foam += 1;
    if (this.emitAcc.foam >= 3) {
      this.emitAcc.foam = 0;
      sp.emitFoam(s.x - fx * 1.5, s.z - fz * 1.5, 0, 1.3 + speed * 0.05, 2.4, 3.6);
    }
  }

  private updateCamera(dt: number): void {
    const s = this.sim;
    const speed = Math.hypot(s.vx, s.vz);
    const fwdSpeed = -Math.sin(s.heading) * s.vx + -Math.cos(s.heading) * s.vz;
    // Follow the direction of travel (so air spins are visible), fall back to
    // the nose when slow or reversing.
    const targetYaw = speed > 4 && fwdSpeed > 0 ? Math.atan2(-s.vx, -s.vz) : s.heading;
    let d = targetYaw - this.camYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const k = dt <= 0 ? 0 : 1 - Math.exp(-dt * (s.airborne ? 2.2 : 4.5));
    this.camYaw += d * k;
    const ky = dt <= 0 ? 0 : 1 - Math.exp(-dt * (s.airborne ? 2 : 5));
    // In the air the camera stays low so the ski visibly climbs out of frame centre.
    const camTarget = s.airborne ? s.surfaceY + (s.y - s.surfaceY) * 0.35 : s.y;
    this.camY += (camTarget - this.camY) * ky;

    const speed01 = Math.min(1, speed / TUNING.boostSpeed);
    const dist = 6.6 + speed01 * 2.2;
    const height = 2.5 + speed01 * 0.5;
    const cfx = -Math.sin(this.camYaw);
    const cfz = -Math.cos(this.camYaw);
    this.camPos.set(s.x - cfx * dist, this.camY + height, s.z - cfz * dist);
    // Keep the camera clear of the waves under it.
    const under = waveHeight(this.camPos.x, this.camPos.z, s.t) + 1.2;
    if (this.camPos.y < under) this.camPos.y = under;
    this.lookAt.set(s.x + cfx * 5, this.camY * 0.6 + s.y * 0.4 + 1.0, s.z + cfz * 5);

    if (dt > 0) {
      this.shakeT += dt;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }
    const shake = this.reducedMotion ? 0 : this.trauma * this.trauma;
    const n = (seed: number) => Math.sin(this.shakeT * 41 + seed * 12.9) * Math.sin(this.shakeT * 23 + seed * 7.1);
    // speed rumble keeps it feeling fast
    const rumble = this.reducedMotion || s.airborne ? 0 : speed01 * speed01 * 0.035;
    this.camPos.x += (n(1) * 0.45) * shake + n(4) * rumble;
    this.camPos.y += (n(2) * 0.35) * shake + n(5) * rumble;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.lookAt);
    this.camera.rotation.z += n(3) * 0.05 * shake;

    const fov = 62 + speed01 * 14 + (s.boosting ? 6 : 0);
    const nf = dt <= 0 ? this.camera.fov : this.camera.fov + (fov - this.camera.fov) * (1 - Math.exp(-dt * 3));
    if (Math.abs(nf - this.camera.fov) > 0.01) {
      this.camera.fov = nf;
      this.camera.updateProjectionMatrix();
    }
  }

  private renderFrame(): void {
    this.resize();
    const s = this.sim;
    const wipeT = s.mode === 'wipeout' ? Math.max(0, s.modeTimer / TUNING.wipeoutTime) : 0;
    this.ski.apply(s.x, s.y, s.z, s.heading, s.pitch, s.roll, s.steerVisual, s.airborne, wipeT, s.t);
    this.water.update(s.t, s.x, s.z);
    this.water.setShadow(s.x, s.z, Math.max(0, s.y - s.surfaceY));
    this.world.update(s.rings, s.t, s.x, s.z, this.frozen || this.ui === 'paused' ? 0 : 1 / 60);
    this.splash.syncFoam(s.t);
    this.sky.position.copy(this.camera.position);
    this.hud.update(s);
    this.hudEl.classList.toggle('off', this.ui === 'title');
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * this.renderScale;
    if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  // ---------------------------------------------------------------- tests

  private publishDiagnostics(): void {
    if (!__TEST_HOOKS__) return;
    const s = this.sim;
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      ui: this.ui,
      sim: {
        t: s.t,
        step: s.step,
        mode: s.mode,
        x: s.x,
        y: s.y,
        z: s.z,
        speed: Math.hypot(s.vx, s.vz),
        heading: s.heading,
        airborne: s.airborne,
        airTime: s.airTime,
        heightAboveWater: s.y - s.surfaceY,
        score: s.score,
        combo: s.combo,
        jumps: s.jumps,
        wipeouts: s.wipeouts,
        ringsHit: s.ringsHit,
        boost: s.boost,
        boosting: s.boosting,
        bestAir: s.bestAir,
        rings: s.rings.length,
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
        dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR) * this.renderScale,
      },
    };
  }

  /** Advance the real simulation with scripted commands (test setup only). */
  private drive(maxSteps: number, cmd: (s: SimState, i: number) => Command, until: (s: SimState) => boolean): boolean {
    if (!__TEST_HOOKS__) return false;
    for (let i = 0; i < maxSteps; i += 1) {
      this.stepOnce(cmd(this.sim, i));
      if (until(this.sim)) return true;
    }
    return false;
  }

  private settleCamera(): void {
    if (!__TEST_HOOKS__) return;
    for (let i = 0; i < 90; i += 1) this.updateCamera(1 / 60);
  }

  private applyState(name: string): void {
    if (!__TEST_HOOKS__) return;
    this.resetRun();
    el('#title').classList.add('hidden');
    el('#pause').classList.add('hidden');
    this.ui = 'play';
    const full: Command = { throttle: 1, steer: 0, boost: false, jump: false };
    switch (name) {
      case 'title':
        this.ui = 'title';
        el('#title').classList.remove('hidden');
        this.drive(120, () => this.attractCommand(), () => false);
        break;
      case 'active-play':
        this.drive(200, (s, i) => ({ ...full, steer: i > 120 && !s.airborne ? 0.55 : 0 }), () => false);
        break;
      case 'paused':
        this.drive(200, () => full, () => false);
        this.setPaused(true);
        break;
      case 'big-air': {
        const ok = this.drive(
          2400,
          (s) => ({ throttle: 1, steer: 0, boost: true, jump: !s.airborne && s.surfaceVy > 1.5 }),
          (s) => s.airborne && s.airTime > 0.35 && s.y - s.surfaceY > 3 && s.vy < 1.5,
        );
        if (!ok) throw new Error('big-air: could not reach a big jump');
        break;
      }
      case 'wipeout': {
        this.drive(120, () => full, () => false);
        let spun = false;
        const ok = this.drive(
          2400,
          (s) => {
            if (!s.airborne) return { ...full, jump: !spun && s.surfaceVy > 1 };
            spun = true;
            return { throttle: 1, steer: s.airSpin > -1.6 ? 1 : 0, boost: false, jump: false };
          },
          (s) => s.mode === 'wipeout' && s.modeTimer < TUNING.wipeoutTime - 0.25,
        );
        if (!ok) throw new Error('wipeout: could not produce a wipeout');
        break;
      }
      default:
        throw new Error(`Unknown test state: ${name}`);
    }
    this.settleCamera();
    this.renderFrame();
    this.publishDiagnostics();
  }

  private installTestHooks(): void {
    if (!__TEST_HOOKS__) return;
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.seed = value >>> 0 || 1;
        this.resetRun();
      },
      setState: (name: string) => {
        this.applyState(name);
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.frozen = paused;
        this.publishDiagnostics();
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
      },
      hideDebugUi: () => {},
      setTimeScale: (n: number) => {
        this.timeScale = Math.max(0.1, Math.min(8, n));
      },
      setRenderScale: (scale: number) => {
        this.renderScale = Math.max(0.25, Math.min(1, scale));
        this.resize();
      },
      placeRingAhead: (dist: number, air: boolean) => {
        const r = placeRingAhead(this.sim, dist, air);
        this.publishDiagnostics();
        return r.id;
      },
    };
  }
}
