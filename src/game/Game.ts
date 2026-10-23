import * as THREE from 'three';
import { Input } from '../core/Input';
import { createRenderer } from '../core/Renderer';
import { JetSki } from '../render/JetSki';
import { createSky } from '../render/Sky';
import { Splash } from '../render/Splash';
import { Water } from '../render/Water';
import { World } from '../render/World';
import { Course } from '../render/Course';
import { Autopilot } from '../sim/autopilot';
import { GATES, RAMPS, formatLap, rampLocal } from '../sim/course';
import { hullHeight, IDLE, lapClock, placeRingAhead, TUNING, type Command, type SimEvent, type SimState } from '../sim/sim';
import { createRace, raceClock, RIVALS, stepRace, type RaceEvent, type RacePhase, type RaceWorld } from '../sim/race';
import { RivalTags } from '../ui/RivalTags';
import { waveHeight } from '../sim/waves';
import { AudioSystem } from '../systems/AudioSystem';
import { Hud } from '../ui/Hud';

type UiMode = 'title' | 'play' | 'paused' | 'finished';

interface FxAcc {
  rooster: number;
  bow: number;
  carve: number;
  foam: number;
}

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
  private readonly rivalSkis = RIVALS.map((r) => new JetSki({ accent: r.color, vest: '#f3f5f7' }));
  private readonly tags = new RivalTags(el('#tags'));
  private readonly splash = new Splash();
  private readonly world = new World();
  private readonly course = new Course();
  private readonly autopilot = new Autopilot();
  private readonly hintPilot = new Autopilot();
  /** Best lap survives restarts (and reloads, via localStorage). */
  private bestLap = 0;
  private readonly hud = new Hud();
  private readonly audio = new AudioSystem();
  private readonly input: Input;
  private readonly sky: THREE.Mesh;
  private readonly hudEl = el('#hud');

  private race!: RaceWorld;
  private seed = 1;
  private raceLaps = 3;
  private rivalCount = RIVALS.length;
  /** sim time at which the finish screen opens (0 = not pending) */
  private finishAt = 0;
  private lastRaceEventId = 0;
  private rivalEventIds: number[] = [];
  private rivalFx: FxAcc[] = [];
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
    this.scene.add(this.water.mesh, this.world.group, this.course.group, this.ski.root, this.splash.foam, this.splash.spray);
    for (const r of this.rivalSkis) this.scene.add(r.root);

    try {
      const b = Number(localStorage.getItem('swellrider-bestlap'));
      if (Number.isFinite(b) && b > 5) this.bestLap = b;
    } catch {
      // storage unavailable
    }
    this.resetRun('free');

    el('#start-btn').addEventListener('click', () => this.startPlay());
    el('#resume-btn').addEventListener('click', () => this.setPaused(false));
    el('#restart-btn').addEventListener('click', () => this.restartRace());
    el('#again-btn').addEventListener('click', () => this.restartRace());
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
    for (const r of this.rivalSkis) r.dispose();
    this.splash.dispose();
    this.world.dispose();
    this.course.dispose();
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
    if (a === 'restart') return this.restartRace();
    if (this.ui === 'finished') return;
    if (a === 'pause') this.setPaused(this.ui !== 'paused');
  }

  private get sim(): SimState {
    return this.race.racers[0].s;
  }

  private restartRace(): void {
    this.resetRun('countdown');
    this.ui = 'title';
    this.startPlay();
  }

  private startPlay(): void {
    this.audio.unlock();
    if (this.ui === 'title') this.resetRun('countdown');
    this.ui = 'play';
    this.input.flush();
    el('#title').classList.add('hidden');
    el('#pause').classList.add('hidden');
  }

  private setPaused(p: boolean): void {
    if (this.ui === 'title' || this.ui === 'finished') return;
    this.ui = p ? 'paused' : 'play';
    el('#pause').classList.toggle('hidden', !p);
    if (p) {
      const r = this.sim.race;
      const best = Math.max(0, this.bestLap || r.bestLap);
      const me = this.race.racers[0];
      const pos = this.race.phase === 'racing' ? `Running ${me.place} of ${this.race.racers.length} · lap ${Math.min(r.laps + 1, this.race.totalLaps)}/${this.race.totalLaps}` : 'On the grid';
      el('#pause-laps').textContent = best > 0 ? `${pos} · best lap ${formatLap(best)}` : `${pos} · follow the glowing gates`;
    }
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

  private resetRun(phase: RacePhase): void {
    this.race = createRace(this.seed, { phase, laps: this.raceLaps, rivals: this.rivalCount, playerBest: this.bestLap });
    this.finishAt = 0;
    this.lastRaceEventId = 0;
    this.rivalEventIds = this.race.racers.map(() => 0);
    this.rivalFx = this.race.racers.map(() => ({ rooster: 0, bow: 0, carve: 0, foam: 0 }));
    this.autopilot.reset();
    this.hintPilot.reset();
    this.hud.resetRace();
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
          const cmd = this.ui === 'play' ? this.input.read() : IDLE;
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
      this.race.phase === 'countdown' ? this.lastCmd.throttle * 0.4 : this.race.racers[0].lastCmd.throttle,
      this.sim.airborne,
      this.sim.boosting,
      (this.ui === 'play' || this.ui === 'finished') && this.sim.mode === 'ride',
    );
    this.publishDiagnostics();
  }

  private stepOnce(cmd: Command): void {
    this.lastCmd = cmd;
    stepRace(this.race, cmd, this.ui === 'title');
    const w = this.race;
    this.emitWaterFx(this.sim, w.racers[0].lastCmd, this.emitAcc, 1);
    for (const ev of this.sim.events) {
      if (ev.id <= this.lastEventId) continue;
      this.lastEventId = ev.id;
      this.handleEvent(ev);
    }
    // Rivals: spray and splashes near the camera only.
    const cam = this.camera.position;
    for (let i = 1; i < w.racers.length; i += 1) {
      const r = w.racers[i];
      const near = Math.hypot(r.s.x - cam.x, r.s.z - cam.z) < 110;
      if (near) this.emitWaterFx(r.s, r.lastCmd, this.rivalFx[i], 0.45);
      for (const ev of r.s.events) {
        if (ev.id <= this.rivalEventIds[i]) continue;
        this.rivalEventIds[i] = ev.id;
        if (near) this.handleRivalEvent(r.s, ev);
      }
    }
    for (const ev of w.events) {
      if (ev.id <= this.lastRaceEventId) continue;
      this.lastRaceEventId = ev.id;
      this.handleRaceEvent(ev);
    }
    if (this.finishAt > 0 && this.sim.t >= this.finishAt && this.ui !== 'title') {
      this.finishAt = 0;
      if (this.ui === 'paused') el('#pause').classList.add('hidden');
      this.ui = 'finished';
      this.hud.showFinish(w);
      el<HTMLButtonElement>('#again-btn').focus({ preventScroll: true });
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
      case 'race-start':
        if (loud) this.audio.chime(false);
        break;
      case 'gate':
        if (loud) this.audio.chime(false);
        break;
      case 'lap': {
        const best = ev.label === 'best';
        const prev = this.bestLap;
        if (best && this.ui === 'play') {
          this.bestLap = ev.value;
          try {
            localStorage.setItem('swellrider-bestlap', ev.value.toFixed(3));
          } catch {
            // ignore
          }
        }
        if (this.ui !== 'title') this.hud.lapComplete(s.t, s.race.laps, ev.value, best, prev);
        if (loud) this.audio.fanfare(best);
        break;
      }
      case 'trick':
        if (ev.label && this.ui !== 'title') this.hud.popup(ev.label, ev.value);
        break;
      default:
        break;
    }
  }

  private handleRivalEvent(s: SimState, ev: SimEvent): void {
    this.carry.set(s.vx, 0, s.vz);
    if (ev.type === 'launch') this.splash.burst(ev.x, ev.y, ev.z, 14, 3 + Math.min(4, ev.value * 0.3), this.carry);
    else if (ev.type === 'land' && ev.value > 2) this.splash.burst(ev.x, ev.y, ev.z, Math.min(120, 30 + ev.value * 6), 3 + ev.value * 0.4, this.carry);
    else if (ev.type === 'wipeout') this.splash.burst(ev.x, ev.y, ev.z, 140, 7, this.carry);
  }

  private handleRaceEvent(ev: RaceEvent): void {
    const loud = this.ui === 'play' || this.ui === 'finished';
    switch (ev.type) {
      case 'countdown':
        if (loud) this.audio.chime(false);
        break;
      case 'go':
        if (loud) this.audio.chime(true);
        break;
      case 'bump': {
        const a = this.race.racers[ev.a].s;
        const b = this.race.racers[ev.b].s;
        this.carry.set((a.vx + b.vx) / 2, 0, (a.vz + b.vz) / 2);
        this.splash.burst(ev.x, ev.y, ev.z, Math.min(90, 20 + ev.value * 10), 2.5 + ev.value * 0.5, this.carry);
        if (ev.a === 0) {
          this.trauma = Math.min(1, this.trauma + 0.15 + ev.value * 0.05);
          if (loud) this.audio.splash(4 + ev.value * 1.5);
        }
        break;
      }
      case 'finish':
        if (ev.a === 0 && this.ui !== 'title') {
          this.finishAt = this.sim.t + 1.1;
          if (loud) this.audio.fanfare(ev.b === 1);
        }
        break;
      default:
        break;
    }
  }

  private emitWaterFx(s: SimState, cmd: Command, acc: FxAcc, rate: number): void {
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
    acc.rooster += rate * (speed / 3) * boost * (s.mode === 'wipeout' ? 0 : 1) * (cmd.throttle > 0 ? 1 : 0.35);
    while (acc.rooster >= 1) {
      acc.rooster -= 1;
      const up = 3 + speed * 0.28 * boost;
      sp.emit(s.x - fx * 1.6, s.y + 0.05, s.z - fz * 1.6, -fx * speed * 0.12 + s.vx * 0.45, up, -fz * speed * 0.12 + s.vz * 0.45, 1.4, 0.4, 1.0);
    }
    // Bow spray peeling off both sides
    acc.bow += (rate * speed) / 9;
    while (acc.bow >= 1) {
      acc.bow -= 1;
      for (const side of [-1, 1]) {
        const out = 1.6 + speed * 0.11;
        sp.emit(s.x + fx * 0.6 + rx * side * 0.6, s.y, s.z + fz * 0.6 + rz * side * 0.6,
          rx * side * out + s.vx * 0.7, 1.4 + speed * 0.07, rz * side * out + s.vz * 0.7, 1.2, 0.2, 0.6);
      }
    }
    // Carve sheet: slip sideways throws a wall of water to the outside
    const slip = Math.abs(lateral);
    if (slip > 1.2) {
      acc.carve += rate * slip * 0.9;
      const side = Math.sign(lateral);
      while (acc.carve >= 1) {
        acc.carve -= 1;
        const out = 3 + slip * 1.1;
        sp.emit(s.x + rx * side * 0.7 - fx * 0.4, s.y, s.z + rz * side * 0.7 - fz * 0.4,
          rx * side * out + s.vx * 0.5, 2.6 + slip * 0.5, rz * side * out + s.vz * 0.5, 2, 0.34, 0.9);
      }
    }
    // Wake foam
    acc.foam += rate;
    if (acc.foam >= 3) {
      acc.foam = 0;
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
    this.rivalSkis.forEach((ski, i) => {
      const r = this.race.racers[i + 1];
      ski.root.visible = !!r;
      if (!r) return;
      const o = r.s;
      const wt = o.mode === 'wipeout' ? Math.max(0, o.modeTimer / TUNING.wipeoutTime) : 0;
      ski.apply(o.x, o.y, o.z, o.heading, o.pitch, o.roll, o.steerVisual, o.airborne, wt, o.t);
    });
    this.water.update(s.t, s.x, s.z);
    this.water.setShadow(s.x, s.z, Math.max(0, s.y - s.surfaceY));
    this.world.update(s.rings, s.t, s.x, s.z, this.frozen || this.ui === 'paused' ? 0 : 1 / 60);
    this.course.update(s.t, s.race.nextGate, s.race.started, this.camera.position, this.ui !== 'title');
    this.splash.syncFoam(s.t);
    this.sky.position.copy(this.camera.position);
    this.hud.update(s, this.race);
    this.hudEl.classList.toggle('off', this.ui === 'title' || this.ui === 'finished');
    this.tags.update(this.race, this.camera, this.ui === 'play' || this.ui === 'paused');
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
        onRamp: s.onRamp,
        airFromRamp: s.airFromRamp,
        rampJumps: s.rampJumps,
        lastRampAir: s.lastRampAir,
        lastRampHeight: s.lastRampHeight,
        surfaceY: s.surfaceY,
        vx: s.vx,
        vz: s.vz,
        bumps: s.bumps,
      },
      field: {
        phase: this.race.phase,
        countdown: this.race.countdown,
        totalLaps: this.race.totalLaps,
        clock: raceClock(this.race),
        position: this.race.racers[0].place,
        racers: this.race.racers.length,
        finished: this.race.racers[0].finished,
        finishTime: this.race.racers[0].finishTime,
        finishOrder: [...this.race.finishOrder],
        finishVisible: this.hud.finishVisible,
        bumpsPlayerRival: this.race.bumpsPlayerRival,
        bumpsRivalRival: this.race.bumpsRivalRival,
        holdRivals: this.race.holdRivals,
        lastBump: this.race.lastBump,
        rivals: this.race.racers.slice(1).map((r) => ({
          name: r.name,
          place: r.place,
          x: r.s.x,
          y: r.s.y,
          z: r.s.z,
          vx: r.s.vx,
          vz: r.s.vz,
          speed: Math.hypot(r.s.vx, r.s.vz),
          laps: r.s.race.laps,
          nextGate: r.s.race.nextGate,
          gatesPassed: r.s.race.gatesPassed,
          progress: r.progress,
          rampJumps: r.s.rampJumps,
          airborne: r.s.airborne,
          wipeouts: r.s.wipeouts,
          bumps: r.s.bumps,
          finished: r.finished,
          finishTime: r.finishTime,
        })),
      },
      race: {
        started: s.race.started,
        nextGate: s.race.nextGate,
        gates: GATES.length,
        laps: s.race.laps,
        gatesPassed: s.race.gatesPassed,
        clock: lapClock(s),
        lastLap: s.race.lastLap,
        bestLap: s.race.bestLap,
        storedBest: this.bestLap,
        message: this.hud.message,
        ...((c) => ({ steerHint: c.steer, throttleHint: c.throttle }))(this.hintPilot.command(s)),
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
    const laps = this.raceLaps;
    if (name === 'race-finish') this.raceLaps = 1;
    this.resetRun(name === 'countdown' || name === 'title' ? (name === 'title' ? 'free' : 'countdown') : 'racing');
    this.raceLaps = laps;
    el('#title').classList.add('hidden');
    el('#pause').classList.add('hidden');
    this.ui = 'play';
    const full: Command = { throttle: 1, steer: 0, boost: false, jump: false };
    switch (name) {
      case 'title':
        this.ui = 'title';
        el('#title').classList.remove('hidden');
        this.drive(240, () => IDLE, () => false);
        break;
      case 'countdown':
        this.drive(75, () => IDLE, () => false);
        break;
      case 'pack-ramp': {
        // Follow the pack onto the first kicker until a rival is flying off it.
        const ok = this.drive(
          2400,
          (s) => this.autopilot.command(s),
          () => this.race.racers.some((r) => r.bot && r.s.airborne && r.s.airFromRamp && r.s.airTime > 0.35 && Math.hypot(r.s.x - this.sim.x, r.s.z - this.sim.z) < 45),
        );
        if (!ok) throw new Error('pack-ramp: no rival flew off a ramp near the player');
        break;
      }
      case 'bump': {
        // Ride up the start straight, then a rival closes in from the right and they trade paint.
        this.drive(120, (s) => this.autopilot.command(s), () => false);
        let ok = false;
        for (let attempt = 0; attempt < 12 && !ok; attempt += 1) {
          // Wait for both hulls to be on the water (a hop clears a rival), then converge.
          this.drive(300, (s) => this.autopilot.command(s), (s) => !s.airborne);
          window.__THREE_GAME_TEST_HOOKS__?.placeRival(1, 1.5, 3.2, 0.3, Math.hypot(this.sim.vx, this.sim.vz) + 1);
          ok = this.drive(60, (s) => this.autopilot.command(s), () => this.race.bumpsPlayerRival >= 1);
        }
        if (!ok) throw new Error('bump: no player-rival contact');
        this.drive(8, (s) => this.autopilot.command(s), () => false);
        break;
      }
      case 'race-finish': {
        const ok = this.drive(9000, (s) => this.autopilot.command(s, true), () => this.hud.finishVisible);
        if (!ok) throw new Error('race-finish: player never finished');
        this.drive(240, () => IDLE, () => false);
        break;
      }
      case 'active-play':
        this.drive(200, (s, i) => ({ ...full, steer: i > 120 && !s.airborne ? 0.55 : 0 }), () => false);
        break;
      case 'paused':
        this.drive(200, () => full, () => false);
        this.setPaused(true);
        break;
      case 'ramp-jump': {
        const ok = this.drive(
          3000,
          (s) => this.autopilot.command(s, true),
          (s) => s.onRamp >= 0 && !s.airborne && rampLocal(RAMPS[s.onRamp], s.x, s.z).u > 8,
        );
        if (!ok) throw new Error('ramp-jump: never rode up a ramp');
        break;
      }
      case 'hairpin': {
        const ok = this.drive(
          6000,
          (s) => this.autopilot.command(s),
          (s) => s.race.nextGate === 2 && Math.hypot(s.x - GATES[2].x, s.z - GATES[2].z) < 55,
        );
        if (!ok) throw new Error('hairpin: autopilot never reached gate 2');
        break;
      }
      case 'lap-complete': {
        const ok = this.drive(9000, (s) => this.autopilot.command(s, true), (s) => s.race.laps >= 1);
        if (!ok) throw new Error('lap-complete: autopilot did not finish a lap');
        this.drive(40, (s) => this.autopilot.command(s), () => false);
        break;
      }
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
        this.resetRun(this.ui === 'title' ? 'free' : 'countdown');
      },
      setRaceLaps: (n: number) => {
        this.raceLaps = Math.max(1, Math.min(9, Math.floor(n)));
        if (!this.race.racers[0].finished) this.race.totalLaps = this.raceLaps;
        this.publishDiagnostics();
      },
      setRivalsHold: (hold: boolean) => {
        this.race.holdRivals = hold;
        this.publishDiagnostics();
      },
      placeRival: (index: number, ahead: number, side: number, headingOffset: number, speed: number) => {
        const r = this.race.racers[index + 1];
        const p = this.sim;
        const fx = -Math.sin(p.heading);
        const fz = -Math.cos(p.heading);
        const o = r.s;
        o.x = p.x + fx * ahead + -fz * side;
        o.z = p.z + fz * ahead + fx * side;
        o.heading = p.heading + headingOffset;
        o.vx = -Math.sin(o.heading) * speed;
        o.vz = -Math.cos(o.heading) * speed;
        o.vy = 0;
        o.airborne = false;
        o.mode = 'ride';
        o.onRamp = -1;
        o.y = hullHeight(o.x, o.z, o.heading, o.t);
        o.surfaceY = o.y;
        r.brain.cursor = -1;
        this.publishDiagnostics();
        return { x: o.x, z: o.z };
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
      placeBeforeRamp: (index: number, dist: number) => {
        const r = RAMPS[index];
        const s = this.sim;
        s.x = r.x - r.dx * dist;
        s.z = r.z - r.dz * dist;
        s.heading = Math.atan2(-r.dx, -r.dz);
        s.vx = 0;
        s.vz = 0;
        s.vy = 0;
        s.airborne = false;
        s.mode = 'ride';
        s.onRamp = -1;
        s.y = hullHeight(s.x, s.z, s.heading, s.t);
        s.surfaceY = s.y;
        this.camYaw = s.heading;
        this.camY = s.y;
        this.publishDiagnostics();
        return { x: s.x, z: s.z, heading: s.heading };
      },
      placeRingAhead: (dist: number, air: boolean) => {
        const r = placeRingAhead(this.sim, dist, air);
        this.publishDiagnostics();
        return r.id;
      },
    };
  }
}
