import * as THREE from 'three';
import { TableView } from '../render/TableView';
import { BALLS_PER_GAME, STEP, createState, step, type Command, type SimState } from '../sim/sim';
import { BUMPERS } from '../sim/table';
import { Audio } from './Audio';
import { Input } from './Input';

const BEST_KEY = 'neon-orbit-best';
const BUMPER_COLORS = ['#ff3d9a', '#29e6ff', '#ffc23d'];

function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el;
}

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeBest(v: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* storage unavailable (private mode): best lasts for the session */
  }
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  readonly view: TableView;
  readonly input: Input;
  readonly audio = new Audio();
  state: SimState;

  paused = false;
  pausedForScreenshot = false;
  reducedMotion = false;
  timeScale = 1;
  renderScale = 1;
  frame = 0;
  private accumulator = 0;
  private last = 0;
  private raf = 0;
  private shake = 0;
  private lastSize = '';
  private bannerTimer = 0;
  private lastHud = '';
  private readonly hud = {
    score: $('#score'),
    mult: $('#mult'),
    balls: $('#balls'),
    best: $('#best'),
    banner: $('#banner'),
    overlay: $('#overlay'),
    finalScore: $('#final-score'),
    newBest: $('#new-best'),
    overlayBest: $('#overlay-best-value'),
    cta: $('#overlay-cta'),
    kicker: $('#overlay-kicker'),
    launchFill: $('#launch-fill'),
    mute: $('#mute-btn'),
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.view = new TableView(this.renderer);
    this.state = createState(readBest(), 1);

    this.input = new Input($('#touch-left'), $('#touch-right'), $('#launch'), this.hud.overlay);
    this.input.onFirstInput = () => this.audio.unlock();
    this.input.onPause = () => this.togglePause();
    this.input.onMute = () => this.toggleMute();
    $('#pause-btn').addEventListener('click', () => this.togglePause());
    this.hud.mute.addEventListener('click', () => this.toggleMute());
    this.hud.overlay.addEventListener('pointerdown', () => {
      if (this.paused) this.togglePause();
    });

    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) document.body.classList.add('touch');
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isPlaying()) this.setPaused(true);
    });
    window.addEventListener('blur', () => {
      if (this.isPlaying()) this.setPaused(true);
    });

    this.resize();
    this.updateHud(true);
    this.publishDiagnostics();
  }

  start(): void {
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame += 1;
      this.advance(dt, this.input.command());
      this.render(dt, now / 1000);
    };
    this.raf = requestAnimationFrame(tick);
    $('#loading').classList.add('done');
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    this.renderer.dispose();
  }

  isPlaying(): boolean {
    return this.state.mode === 'play' || this.state.mode === 'plunger' || this.state.mode === 'drain';
  }

  setPaused(p: boolean): void {
    if (p && !this.isPlaying()) return;
    this.paused = p;
    this.input.clear();
    this.updateHud(true);
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  toggleMute(): void {
    this.audio.setMuted(!this.audio.muted);
    this.hud.mute.setAttribute('aria-pressed', String(this.audio.muted));
  }

  /** Advance the fixed-step simulation by wall time dt (scaled by timeScale). */
  advance(dt: number, cmd: Command): void {
    if (this.pausedForScreenshot || this.paused) {
      this.publishDiagnostics();
      return;
    }
    this.accumulator += dt * this.timeScale;
    const maxSteps = Math.ceil((0.1 * this.timeScale) / STEP);
    let n = 0;
    while (this.accumulator >= STEP && n < maxSteps) {
      step(this.state, cmd);
      this.accumulator -= STEP;
      n += 1;
    }
    if (n >= maxSteps) this.accumulator = 0;
    this.consumeEvents();
    this.updateHud(false);
    this.publishDiagnostics();
  }

  private consumeEvents(): void {
    const s = this.state;
    for (const e of s.events) {
      switch (e.type) {
        case 'bumper':
          this.audio.bumper(e.index);
          this.view.burst(BUMPERS[e.index].x, BUMPERS[e.index].y, BUMPER_COLORS[e.index], 12, 6);
          this.kick(0.12);
          break;
        case 'sling':
          this.audio.sling();
          this.view.burst(e.x, e.y, '#ff2fa8', 8, 4);
          this.kick(0.08);
          break;
        case 'flipper':
          this.audio.flipper();
          break;
        case 'hit':
          this.audio.hit(e.strength);
          break;
        case 'lane':
          this.audio.lane(e.index);
          this.view.burst(e.x, e.y, '#ffc23d', 8, 3);
          break;
        case 'lanesComplete':
          this.audio.lanesComplete();
          this.showBanner(`LANES! MULTIPLIER x${e.index}`, 1.6);
          this.kick(0.2);
          break;
        case 'launch':
          this.audio.launch(e.strength);
          break;
        case 'drain':
          this.audio.drain();
          this.showBanner(s.ballsLeft > 0 ? 'DRAINED' : 'LAST BALL LOST', 1.1);
          this.kick(0.25);
          break;
        case 'save':
          this.audio.save();
          this.showBanner('BALL SAVED', 1.4);
          break;
        case 'newBall':
          this.showBanner(`BALL ${s.ballNumber}`, 1.1);
          break;
        case 'start':
          this.audio.start();
          this.showBanner('BALL 1', 1.1);
          break;
        case 'gameOver':
          if (s.newBest) writeBest(s.best);
          this.audio.gameOver(s.newBest);
          break;
      }
    }
    s.events.length = 0;
  }

  private kick(amount: number): void {
    if (!this.reducedMotion) this.shake = Math.min(0.35, this.shake + amount);
  }

  showBanner(text: string, seconds: number): void {
    const b = this.hud.banner;
    b.textContent = text;
    b.classList.remove('hint');
    b.classList.add('show');
    this.bannerTimer = seconds;
  }

  private updateHud(force: boolean): void {
    const s = this.state;
    const dt = 1 / 60;
    if (this.bannerTimer > 0 && !this.pausedForScreenshot) {
      this.bannerTimer -= dt * Math.max(1, this.timeScale);
      if (this.bannerTimer <= 0) this.hud.banner.classList.remove('show');
    }
    if (this.bannerTimer <= 0) {
      const hint = s.mode === 'plunger' && !this.paused;
      const text = document.body.classList.contains('touch') ? 'HOLD LAUNCH, RELEASE TO FIRE' : 'HOLD SPACE, RELEASE TO FIRE';
      if (hint) {
        if (this.hud.banner.textContent !== text) this.hud.banner.textContent = text;
        this.hud.banner.classList.add('show', 'hint');
      } else {
        this.hud.banner.classList.remove('show');
      }
    }
    this.hud.launchFill.style.width = `${Math.round(s.plunger.charge * 100)}%`;

    const screen = this.paused ? 'paused' : s.mode === 'title' ? 'title' : s.mode === 'over' ? 'over' : 'none';
    const key = [s.score, s.mult, s.ballNumber, s.ballsLeft, s.best, s.mode, screen, s.newBest].join('|');
    if (!force && key === this.lastHud) return;
    this.lastHud = key;
    document.body.classList.toggle('mode-plunger', s.mode === 'plunger' && !this.paused);
    this.hud.score.textContent = s.score.toLocaleString('en-US');
    this.hud.mult.textContent = `x${s.mult}`;
    this.hud.mult.dataset.level = String(s.mult);
    this.hud.best.textContent = Math.max(s.best, s.score).toLocaleString('en-US');
    const used = BALLS_PER_GAME - s.ballsLeft;
    const balls: string[] = [];
    for (let i = 0; i < BALLS_PER_GAME; i += 1) {
      const cls = i < used ? 'used' : i === used && s.mode !== 'title' && s.mode !== 'over' ? 'current' : '';
      balls.push(`<i class="${cls}"></i>`);
    }
    this.hud.balls.innerHTML = balls.join('');

    const o = this.hud.overlay;
    o.hidden = screen === 'none';
    if (screen !== 'none') {
      this.bannerTimer = 0;
      this.hud.banner.classList.remove('show');
    }
    o.dataset.screen = screen;
    this.hud.overlayBest.textContent = s.best.toLocaleString('en-US');
    const touch = document.body.classList.contains('touch');
    if (screen === 'title') {
      this.hud.kicker.textContent = '3 balls. Light the lanes. Beat the best.';
      this.hud.cta.textContent = touch ? 'Tap to start' : 'Press SPACE or click to start';
    } else if (screen === 'over') {
      this.hud.kicker.textContent = 'GAME OVER';
      this.hud.finalScore.textContent = s.score.toLocaleString('en-US');
      this.hud.newBest.classList.toggle('on', s.newBest);
      this.hud.cta.textContent = touch ? 'Tap to play again' : 'Press SPACE to play again';
    } else if (screen === 'paused') {
      this.hud.kicker.textContent = 'PAUSED';
      this.hud.cta.textContent = touch ? 'Tap to resume' : 'Press P to resume';
    }
  }

  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale;
    const key = `${w}x${h}@${dpr}`;
    if (key === this.lastSize) return;
    this.lastSize = key;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.fitCamera();
  }

  /** Fit the whole table on screen for any aspect, leaving room for the HUD on narrow screens. */
  private fitCamera(): void {
    const aspect = this.camera.aspect;
    const narrow = aspect < 1.1;
    const pitch = THREE.MathUtils.degToRad(narrow ? 72 : 52);
    const box = this.view.bounds;
    const center = box.getCenter(new THREE.Vector3());
    center.z += narrow ? 0.0 : 0.4;
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const corners: THREE.Vector3[] = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const limitTop = narrow ? 0.76 : 0.94;
    const limitBottom = narrow ? -0.86 : -0.94;
    const limitX = 0.96;
    const offset = (limitTop + limitBottom) / 2;
    // Shift the projection so the table centers within the allowed band.
    this.camera.setViewOffset(1000, 1000, 0, offset * 500, 1000, 1000);
    let lo = 5;
    let hi = 120;
    for (let i = 0; i < 40; i += 1) {
      const d = (lo + hi) / 2;
      this.camera.position.copy(center).addScaledVector(dir, d);
      this.camera.lookAt(center);
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
      let ok = true;
      for (const c of corners) {
        const p = c.clone().project(this.camera);
        if (p.y > limitTop || p.y < limitBottom || Math.abs(p.x) > limitX) ok = false;
      }
      if (ok) hi = d;
      else lo = d;
    }
    this.camera.position.copy(center).addScaledVector(dir, hi);
    this.camera.lookAt(center);
    this.camera.updateMatrixWorld();
    this.baseCam.copy(this.camera.position);
  }

  private readonly baseCam = new THREE.Vector3();

  render(dt: number, time: number): void {
    this.resize();
    if (!this.pausedForScreenshot) this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.reducedMotion || this.pausedForScreenshot ? 0 : this.shake;
    this.camera.position.set(this.baseCam.x + Math.sin(time * 61) * sh * 0.25, this.baseCam.y, this.baseCam.z + Math.cos(time * 53) * sh * 0.35);
    this.view.update(this.state, this.pausedForScreenshot ? 0 : dt, time, this.reducedMotion);
    this.renderer.render(this.view.scene, this.camera);
  }

  publishDiagnostics(): void {
    if (import.meta.env.VITE_TEST_HOOKS !== '1') return;
    const s = this.state;
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      mode: s.mode,
      paused: this.paused,
      score: s.score,
      best: s.best,
      mult: s.mult,
      ballsLeft: s.ballsLeft,
      ballNumber: s.ballNumber,
      newBest: s.newBest,
      ball: { ...s.ball },
      flippers: s.flippers.map((f) => ({ angle: f.angle, held: f.held })),
      plunger: { charge: s.plunger.charge, pulling: s.plunger.pulling },
      laneLit: [...s.laneLit],
      bumperFlash: [...s.bumperFlash],
      stats: { ...s.stats },
      simTime: s.time,
      overlay: this.hud.overlay.hidden ? 'none' : (this.hud.overlay.dataset.screen ?? 'none'),
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
        dpr: this.renderer.getPixelRatio(),
      },
    };
  }
}
