import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { TableView } from '../render/TableView';
import { CABINET } from '../render/playfieldArt';
import {
  BALLS_PER_GAME,
  createState,
  resetBallToLane,
  startGame,
  step,
  STEP,
  type SimEvent,
  type SimState,
} from '../sim/sim';
import { AudioSystem } from '../systems/AudioSystem';
import { Input } from './Input';
import { Hud } from './Hud';

const HIGH_SCORE_KEY = 'neon-pinball-highscore';
const MAX_DPR = 2;

function loadHighScore(): number {
  try {
    const v = Number(localStorage.getItem(HIGH_SCORE_KEY));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

function saveHighScore(v: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(v));
  } catch {
    /* storage unavailable (private mode); keep it in memory */
  }
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  private readonly view: TableView;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly input: Input;
  private readonly hud: Hud;
  private readonly audio = new AudioSystem();
  private sim: SimState;
  private lastEventId = 0;
  private savedHigh: number;
  private accumulator = 0;
  private lastTime = 0;
  private frameId = 0;
  private frame = 0;
  private paused = false;
  private pausedForScreenshot = false;
  private reducedMotion = false;
  private timeScale = 1;
  private renderScale = 1;
  private shake = 0;
  private cameraBase = new THREE.Vector3();
  private cameraTarget = new THREE.Vector3();
  private sizeKey = '';

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.info.autoReset = false;

    this.view = new TableView(this.renderer);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.view.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.35, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.savedHigh = loadHighScore();
    this.sim = createState(this.savedHigh, 1);

    const app = document.querySelector<HTMLElement>('#app')!;
    const plungerButton = document.querySelector<HTMLElement>('#plunger-button')!;
    this.input = new Input(app, plungerButton);
    this.input.onPause = () => this.togglePause();
    this.input.onAnyInput = () => this.audio.unlock();
    this.hud = new Hud();
    this.hud.onResume = () => this.setPaused(false);
    this.hud.onPause = () => this.setPaused(true);
    this.hud.onMute = () => {
      this.audio.muted = !this.audio.muted;
      return this.audio.muted;
    };

    if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) document.body.classList.add('touch');
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && !document.body.classList.contains('touch')) {
        document.body.classList.add('touch');
        this.sizeKey = '';
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.sim.mode === 'play') this.setPaused(true);
    });

    this.resize();
    this.view.update(this.sim, 0, 0);
    this.hud.update(this.sim, this.paused);
    if (__TEST_HOOKS__) this.installTestHooks();
    this.publishDiagnostics();
  }

  start(): void {
    this.lastTime = performance.now();
    const tick = (now: number) => {
      this.frameId = requestAnimationFrame(tick);
      this.tick(now);
    };
    this.frameId = requestAnimationFrame(tick);
    // First frame is ready: drop the loading screen.
    this.renderFrame(0);
    document.querySelector('#loading')?.classList.add('done');
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.input.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }

  private togglePause(): void {
    if (this.sim.mode === 'play' || this.sim.mode === 'drained') this.setPaused(!this.paused);
  }

  private setPaused(paused: boolean): void {
    this.paused = paused && (this.sim.mode === 'play' || this.sim.mode === 'drained');
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.hud.update(this.sim, this.paused);
  }

  private tick(now: number): void {
    this.frame += 1;
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.resize();

    if (!this.paused && !this.pausedForScreenshot) {
      this.accumulator += dt * this.timeScale;
      const maxSteps = Math.ceil((0.1 * this.timeScale) / STEP);
      let steps = 0;
      while (this.accumulator >= STEP && steps < maxSteps) {
        const cmd = this.input.command();
        const before = this.sim.mode;
        step(this.sim, cmd);
        this.input.consumeLatches();
        if (before !== 'play' && this.sim.mode === 'play' && (before === 'attract' || before === 'gameover')) {
          // The press that started the game must not also charge the plunger.
          this.input.suppressPlungerUntilRelease();
        }
        this.accumulator -= STEP;
        steps += 1;
      }
      if (steps >= maxSteps) this.accumulator = 0;
      this.consumeEvents();
    }

    this.renderFrame(this.pausedForScreenshot ? 0 : dt);
    this.publishDiagnostics();
  }

  private consumeEvents(): void {
    for (const e of this.sim.events) {
      if (e.id <= this.lastEventId) continue;
      this.lastEventId = e.id;
      this.handleEvent(e);
    }
    if (this.sim.highScore > this.savedHigh && (this.sim.mode !== 'play' || this.frame % 60 === 0)) {
      this.savedHigh = this.sim.highScore;
      saveHighScore(this.savedHigh);
    }
  }

  private handleEvent(e: SimEvent): void {
    this.audio.play(e);
    switch (e.type) {
      case 'bumper':
        this.view.flashBumper(e.index);
        this.shake = Math.min(0.12, this.shake + 0.07);
        this.popup(e.x, e.y, `+${e.points}`, ['#ff6fc0', '#8ff4ff', '#ffd27a'][e.index]);
        break;
      case 'sling':
        this.view.flashSling(e.index);
        this.shake = Math.min(0.12, this.shake + 0.03);
        this.popup(e.x, e.y, `+${e.points}`, '#ff9fd6');
        break;
      case 'lane':
        this.popup(e.x, e.y, `+${e.points}`, '#8ff4ff');
        break;
      case 'multiplier':
        this.hud.message(`${e.index}X MULTIPLIER`, 'amber');
        this.popup(e.x, e.y, `+${e.points}`, '#ffd27a');
        break;
      case 'save':
        this.hud.message('BALL SAVED', 'cyan');
        break;
      case 'drain':
        this.shake = 0.1;
        this.hud.message(this.sim.ballsLeft > 1 ? 'BALL LOST' : 'LAST BALL LOST', 'pink');
        break;
      case 'start':
        this.hud.message('BALL 1', 'cyan');
        break;
      case 'gameover':
        if (this.sim.highScore > this.savedHigh) {
          this.savedHigh = this.sim.highScore;
          saveHighScore(this.savedHigh);
        }
        break;
    }
    if (e.type === 'drain' || e.type === 'save' || e.type === 'start') this.hud.pendingBallMessage = true;
  }

  private popup(x: number, y: number, text: string, color: string): void {
    const p = new THREE.Vector3(x, 0.9, -y).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    this.hud.popup((p.x * 0.5 + 0.5) * rect.width, (-p.y * 0.5 + 0.5) * rect.height, text, color);
  }

  private resize(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * this.renderScale;
    const key = `${w}x${h}@${dpr}`;
    if (key === this.sizeKey) return;
    this.sizeKey = key;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.fitCamera(w / h, h);
  }

  /** Place the camera on a fixed player-eye angle at the distance that fits the whole cabinet. */
  private fitCamera(aspect: number, heightPx: number): void {
    const elevation = THREE.MathUtils.degToRad(aspect < 0.8 ? 62 : 56);
    const dir = new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation));
    const cx = (CABINET.left + CABINET.right) / 2;
    const cy = (CABINET.top + CABINET.bottom) / 2;
    const corners: THREE.Vector3[] = [];
    for (const x of [CABINET.left - 0.5, CABINET.right + 0.5])
      for (const y of [CABINET.bottom - 0.6, CABINET.top + 0.5])
        for (const z of [0, 1.1]) corners.push(new THREE.Vector3(x, z, -y));
    // Reserve room for the HUD at the top of the screen.
    const hudFrac = Math.min(0.25, 78 / heightPx);
    const topLimit = 1 - hudFrac * 2;
    // Touch screens keep a strip under the table for the launch button.
    const touch = document.body.classList.contains('touch');
    const bottomLimit = touch ? -1 + Math.min(0.3, 84 / heightPx) * 2 : -0.97;
    let target = new THREE.Vector3(cx, 0, -cy);
    let lo = 5;
    let hi = 120;
    const fits = (dist: number, tgt: THREE.Vector3) => {
      this.camera.position.copy(tgt).addScaledVector(dir, dist);
      this.camera.lookAt(tgt);
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
      let minY = Infinity;
      let maxY = -Infinity;
      let maxX = 0;
      for (const c of corners) {
        const p = c.clone().project(this.camera);
        maxX = Math.max(maxX, Math.abs(p.x));
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      return { ok: maxX <= 0.97 && maxY - minY <= topLimit - bottomLimit, minY, maxY };
    };
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid, target).ok) hi = mid;
      else lo = mid;
    }
    // Shift the aim so the projected table sits between the HUD and the bottom edge.
    for (let i = 0; i < 6; i++) {
      const r = fits(hi, target);
      const desiredCenter = (topLimit + bottomLimit) / 2;
      const center = (r.maxY + r.minY) / 2;
      const shift = (center - desiredCenter) * 0.5 * hi * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      target = target.clone().add(new THREE.Vector3(0, 0, -shift / Math.sin(elevation)));
    }
    fits(hi, target);
    this.cameraBase.copy(this.camera.position);
    this.cameraTarget.copy(target);
  }

  private renderFrame(dt: number): void {
    const time = this.reducedMotion ? 0 : performance.now() / 1000;
    this.view.update(this.sim, dt, time);
    this.hud.update(this.sim, this.paused);
    this.shake = Math.max(0, this.shake - dt * 0.6);
    const s = this.reducedMotion ? 0 : this.shake;
    this.camera.position.copy(this.cameraBase);
    if (s > 0) {
      this.camera.position.x += Math.sin(performance.now() * 0.09) * s;
      this.camera.position.z += Math.cos(performance.now() * 0.11) * s;
    }
    this.camera.lookAt(this.cameraTarget);
    this.renderer.info.reset();
    this.composer.render(dt);
  }

  private publishDiagnostics(): void {
    if (!__TEST_HOOKS__) return;
    const s = this.sim;
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: s.time,
      score: s.score,
      targetScore: 0,
      complete: s.mode === 'gameover',
      mode: s.mode,
      paused: this.paused,
      ball: s.ball,
      ballsLeft: s.ballsLeft,
      ballsPerGame: BALLS_PER_GAME,
      highScore: s.highScore,
      savedHighScore: this.savedHigh,
      multiplier: s.multiplier,
      lanes: [...s.lanes],
      bumperHits: s.bumperHits,
      bumperLight: [...s.bumperLight],
      bumperFlash: [...this.view.flash],
      launches: s.launches,
      flipCount: [...s.flipCount],
      drains: s.drains,
      plungerCharge: s.plungerCharge,
      plungerOffset: s.plungerOffset,
      flippers: s.flippers.map((f) => ({ angle: f.angle, pressed: f.pressed })),
      ballState: { ...s.ball0 },
      player: {
        position: { x: s.ball0.x, y: s.ball0.y, z: 0 },
        speed: Math.hypot(s.ball0.vx, s.ball0.vy),
      },
      timeScale: this.timeScale,
      renderScale: this.renderScale,
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

  private installTestHooks(): void {
    // Constant-folded away in production builds, taking the hook bodies with it.
    if (!__TEST_HOOKS__) return;
    const refresh = () => {
      this.consumeEvents();
      this.renderFrame(0);
      this.publishDiagnostics();
    };
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.sim.rngState = value >>> 0;
      },
      setState: (name: string) => {
        const high = this.savedHigh;
        this.paused = false;
        this.hud.clearMessage();
        const s = createState(high, this.sim.rngState);
        this.sim = s;
        this.lastEventId = 0;
        switch (name) {
          case 'title':
            break;
          case 'active-play':
            startGame(s);
            s.launches = 1;
            s.score = 3270;
            s.lanes = [true, false, false];
            s.ball0 = { x: 0.95, y: 3.05, vx: 6.5, vy: 8, inLane: false };
            s.bumperLight[0] = 0.2;
            s.flippers[1].angle = 0.3;
            break;
          case 'plunger':
            startGame(s);
            s.plungerCharge = 0.75;
            s.plungerOffset = 0.75 * 0.9;
            s.plungerHeld = true;
            s.ball0.y -= s.plungerOffset;
            break;
          case 'paused':
            startGame(s);
            s.score = 1840;
            s.ball0 = { x: -1.2, y: -4.0, vx: 0, vy: 0, inLane: false };
            this.paused = true;
            break;
          case 'late-game':
            startGame(s);
            s.ball = 3;
            s.ballsLeft = 1;
            s.ballSaveUsed = true;
            s.multiplier = 4;
            s.score = 58420;
            s.lanes = [true, true, false];
            s.bumperLight = [0.2, 0.2, 0.2];
            s.slingLight = [0.15, 0];
            s.ball0 = { x: -0.6, y: 2.95, vx: -9, vy: 4, inLane: false };
            s.flippers[0].angle = 0.3;
            s.flippers[0].pressed = true;
            break;
          case 'game-over':
            startGame(s);
            s.score = Math.max(41260, high + 1);
            s.highScore = s.score;
            s.newHighScore = true;
            s.mode = 'gameover';
            s.ballsLeft = 0;
            s.ball = 3;
            break;
          default:
            throw new Error(`Unknown test state: ${name}`);
        }
        // Mirror award(): a run score above the record is the record.
        if (s.score > s.highScore) {
          s.highScore = s.score;
          s.newHighScore = true;
        }
        this.lastEventId = s.nextEventId - 1;
        refresh();
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
        this.lastTime = performance.now();
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
        refresh();
      },
      hideDebugUi: () => {
        // No debug UI exists in this game; nothing to hide.
      },
      setTimeScale: (n: number) => {
        this.timeScale = Math.max(0.1, Math.min(8, n));
        this.publishDiagnostics();
      },
      setRenderScale: (scale: number) => {
        this.renderScale = Math.max(0.25, Math.min(1, scale));
        this.resize();
        refresh();
      },
      placeBall: (x: number, y: number, vx: number, vy: number) => {
        // Setup only: aims a ball so a check can prove a real flipper press hits it.
        this.sim.ball0 = { x, y, vx, vy, inLane: false };
        this.sim.launches = Math.max(1, this.sim.launches);
        refresh();
      },
      resetBall: () => {
        resetBallToLane(this.sim);
        refresh();
      },
      clearHighScore: () => {
        try {
          localStorage.removeItem(HIGH_SCORE_KEY);
        } catch {
          /* ignore */
        }
        this.savedHigh = 0;
        this.sim.highScore = 0;
        refresh();
      },
    };
  }
}
