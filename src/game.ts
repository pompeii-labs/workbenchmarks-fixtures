import * as THREE from 'three';
import { Input } from './input';
import { World } from './render/World';
import { Sfx } from './sfx';
import { createSim, NO_COMMAND, RUN_SECONDS, startRun, STEP, stepSim, type LandingResult, type SimState } from './sim/sim';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const BEST_KEY = 'tidehopper-best';

export class Game {
  sim: SimState;
  world: World;
  readonly renderer: THREE.WebGLRenderer;
  readonly input: Input;
  readonly sfx = new Sfx();
  paused = false;
  frozen = false; // screenshot freeze: no simulation, keep rendering
  timeScale = 1;
  renderScale = 1;
  frame = 0;
  private acc = 0;
  private last = performance.now();
  private shownLanding = 0;
  private popupTimer = 0;
  private launchTimer = 0;
  private seenEvent = 0;
  private best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
  onFrame: () => void = () => {};

  constructor(canvas: HTMLCanvasElement, seed = 1) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.sim = createSim(seed);
    this.world = new World(this.sim);
    this.input = new Input($('pad'), $('knob'), $('roll-btn'));
    this.input.onPause = () => this.togglePause();
    this.input.onConfirm = () => {
      if (this.sim.phase !== 'play') this.start();
      else if (this.paused) this.togglePause();
    };
    $('start-btn').addEventListener('click', () => this.start());
    $('again-btn').addEventListener('click', () => this.start());
    $('resume-btn').addEventListener('click', () => this.togglePause());
    $('pause-btn').addEventListener('click', () => this.togglePause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.sim.phase === 'play' && !this.paused) this.togglePause();
    });
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.showPhase();
  }

  reseed(seed: number): void {
    const z = this.sim.dolphin.z;
    this.sim = createSim(seed);
    this.sim.dolphin.z = z;
    this.world.resetEvents(this.sim);
    this.seenEvent = 0;
    this.world.update(this.sim, 0, true);
  }

  start(): void {
    this.sfx.unlock();
    startRun(this.sim);
    this.paused = false;
    this.shownLanding = 0;
    this.seenEvent = this.sim.nextEventId - 1;
    this.world.resetEvents(this.sim);
    $('popup').classList.remove('show');
    this.showPhase();
  }

  togglePause(): void {
    if (this.sim.phase !== 'play') return;
    this.paused = !this.paused;
    this.showPhase();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.world.camera.aspect = window.innerWidth / window.innerHeight;
    this.world.camera.fov = this.world.camera.aspect < 0.8 ? 70 : 55;
    this.world.camera.updateProjectionMatrix();
  }

  run(): void {
    const tick = (now: number) => {
      const dt = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.advance(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** One rendered frame: fixed simulation steps, then visuals. */
  advance(dt: number): void {
    this.frame++;
    const simulate = !this.frozen && !(this.paused && this.sim.phase === 'play');
    if (simulate) {
      this.acc += dt * this.timeScale;
      let steps = 0;
      const maxSteps = 8 * Math.max(1, this.timeScale);
      while (this.acc >= STEP && steps < maxSteps) {
        this.stepOnce();
        this.acc -= STEP;
        steps++;
      }
      if (steps >= maxSteps) this.acc = 0;
    }
    this.world.update(this.sim, simulate ? dt * this.timeScale : 0, false, !simulate);
    if (simulate) this.tickUi(dt * this.timeScale);
    this.renderer.render(this.world.scene, this.world.camera);
    this.onFrame();
  }

  stepOnce(): void {
    const phaseBefore = this.sim.phase;
    stepSim(this.sim, this.sim.phase === 'play' ? this.input.command() : NO_COMMAND);
    this.handleEvents();
    if (phaseBefore === 'play' && this.sim.phase === 'results') this.finish();
  }

  private handleEvents(): void {
    for (const e of this.sim.events) {
      if (e.id <= this.seenEvent) continue;
      this.seenEvent = e.id;
      if (e.type === 'launch') {
        this.sfx.splash(0.5);
        if (this.sim.phase === 'play') {
          const el = $('launch');
          el.textContent = e.label ?? '';
          el.className = e.label?.startsWith('Perfect') ? 'show perfect' : e.label === 'Wave boost' ? 'show good' : 'show';
          this.launchTimer = 1.3;
        }
      } else if (e.type === 'land') {
        this.sfx.splash(Math.min(1, e.size / 2));
        const l = this.sim.lastLanding;
        if (l && this.sim.phase === 'play' && l.id !== this.shownLanding) {
          this.shownLanding = l.id;
          this.showLanding(l);
          if (l.quality !== 'Belly flop' && l.trickPoints > 0) this.sfx.chime(l.landingMult);
        }
      }
    }
  }

  finish(): void {
    const s = this.sim;
    const newBest = s.score > this.best;
    if (newBest) {
      this.best = s.score;
      try {
        localStorage.setItem(BEST_KEY, String(this.best));
      } catch {
        /* storage may be unavailable */
      }
    }
    $('final-score').textContent = s.score.toLocaleString('en-US');
    $('final-jumps').textContent = String(s.jumps);
    $('final-clean').textContent = String(s.cleanLandings);
    $('final-best-jump').textContent = s.bestJump ? `${s.bestJump.toLocaleString('en-US')} · ${s.bestTrick}` : '—';
    $('final-best').textContent = this.best.toLocaleString('en-US');
    $('new-best').hidden = !newBest || s.score === 0;
    this.showPhase();
  }

  showLanding(l: LandingResult): void {
    const el = $('popup');
    const title = l.quality === 'Belly flop' ? 'Belly flop!' : l.tricks.length ? l.tricks.join(' + ') : 'Leap';
    const rows = [
      `<div class="pop-title ${l.quality === 'Belly flop' ? 'bad' : ''}">${title}</div>`,
      `<div class="pop-row"><span>Height ${l.height.toFixed(1)} m</span><b>×${l.heightMult.toFixed(1)}</b></div>`,
      `<div class="pop-row"><span>${l.quality} landing</span><b>×${l.landingMult.toFixed(1)}</b></div>`,
      l.chainMult > 1 ? `<div class="pop-row"><span>Chain</span><b>×${l.chainMult.toFixed(1)}</b></div>` : '',
      `<div class="pop-points">+${l.points.toLocaleString('en-US')}</div>`,
    ];
    el.innerHTML = rows.join('');
    el.className = `show q-${l.quality.split(' ')[0].toLowerCase()}`;
    this.popupTimer = 2.6;
  }

  private tickUi(dt: number): void {
    if (this.popupTimer > 0) {
      this.popupTimer -= dt;
      if (this.popupTimer <= 0) $('popup').classList.remove('show');
    }
    if (this.launchTimer > 0) {
      this.launchTimer -= dt;
      if (this.launchTimer <= 0) $('launch').classList.remove('show');
    }
    this.refreshHud();
  }

  refreshHud(): void {
    const s = this.sim;
    $('score').textContent = s.score.toLocaleString('en-US');
    const left = Math.max(0, Math.ceil(RUN_SECONDS - s.runTime));
    $('timer').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    $('timer').classList.toggle('low', left <= 10 && s.phase === 'play');
    $('chain').textContent = `×${s.chain.toFixed(1)}`;
    $('chain-box').classList.toggle('hot', s.chain > 1);
    const d = s.dolphin;
    const meter = $('air');
    if (d.airborne && d.air && s.phase === 'play') {
      meter.classList.add('show');
      $('air-height').textContent = `${Math.max(0, d.y - d.air.exitY).toFixed(1)} m`;
      const TAU = Math.PI * 2;
      const parts: string[] = [];
      const f = d.air.flip / TAU;
      const sp = d.air.spin / TAU;
      const r = d.air.roll / TAU;
      if (Math.abs(f) > 0.15) parts.push(`${f > 0 ? 'Back' : 'Front'} ${Math.abs(f).toFixed(1)}`);
      if (Math.abs(sp) > 0.15) parts.push(`Spin ${Math.abs(sp).toFixed(1)}`);
      if (Math.abs(r) > 0.15) parts.push(`Roll ${Math.abs(r).toFixed(1)}`);
      $('air-tricks').textContent = parts.join(' · ') || 'W/S flip · A/D spin · Q/E roll';
    } else meter.classList.remove('show');
  }

  showPhase(): void {
    const p = this.sim.phase;
    document.body.dataset.phase = this.paused && p === 'play' ? 'paused' : p;
    $('title').hidden = p !== 'title';
    $('results').hidden = p !== 'results';
    $('pause').hidden = !(this.paused && p === 'play');
    $('hud').hidden = p !== 'play';
    $('touch').hidden = p !== 'play';
    this.refreshHud();
  }
}
