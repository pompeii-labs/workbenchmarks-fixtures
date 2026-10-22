import { View } from '../render/View';
import { ballOnPlunger, createState, NO_COMMAND, step, type Command, type SimState } from '../sim/sim';
import { BALLS_PER_GAME, DT } from '../sim/table';
import { Input } from './Input';
import { Sfx } from './Sfx';

const HIGH_KEY = 'neon-pinball.high';
const MAX_STEPS_PER_FRAME = 240;

function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el;
}

function loadHigh(): number {
  try {
    return Math.max(0, Number(localStorage.getItem(HIGH_KEY)) || 0);
  } catch {
    return 0;
  }
}

export class Game {
  state: SimState;
  readonly view: View;
  readonly input: Input;
  readonly sfx = new Sfx();
  paused = false;
  pausedForScreenshot = false;
  reducedMotion = false;
  timeScale = 1;
  frame = 0;
  /** When set, replaces live input (test hooks only). */
  commandOverride: Command | null = null;
  onFrame: () => void = () => {};

  private acc = 0;
  private last = 0;
  private raf = 0;
  private lastEventId = 0;
  private lastScore = -1;
  private lastMode = '';
  private readonly el = {
    score: $('#score-value'),
    mult: $('#mult-value'),
    ball: $('#ball-value'),
    high: $('#high-value'),
    titleHigh: $('#title-high'),
    overHigh: $('#over-high'),
    final: $('#final-score'),
    newHigh: $('#new-high'),
    title: $('#overlay-title'),
    pause: $('#overlay-pause'),
    over: $('#overlay-over'),
    launchHint: $('#launch-hint'),
    charge: $('#charge-fill'),
    launchBtn: $('#launch-btn'),
    zones: $('#touch-zones'),
    callout: $('#callout'),
    mute: $('#mute-state'),
    loading: $('#loading'),
  };

  constructor(canvas: HTMLCanvasElement) {
    this.state = createState(loadHigh(), 1);
    this.view = new View(canvas);
    this.input = new Input($('#app'), this.el.launchBtn);
    this.input.wantsStart = () => this.state.mode === 'title' || this.state.mode === 'gameover';
    this.input.onPause = () => this.togglePause();
    this.input.onMute = () => this.toggleMute();
    this.input.onFirstGesture = () => this.sfx.unlock();

    const pauseBtn = $('#pause-btn');
    pauseBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    pauseBtn.addEventListener('click', () => this.togglePause());
    const resume = $('#resume-btn');
    resume.addEventListener('pointerdown', (e) => e.stopPropagation());
    resume.addEventListener('click', () => this.togglePause());
    $('#legend').addEventListener('click', () => this.toggleMute());

    this.lastEventId = this.state.eventSeq;
    this.view.resize();
    this.syncHud(true);
  }

  start(): void {
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      this.frameStep(now);
    };
    this.raf = requestAnimationFrame(tick);
    // First frame rendered: drop the loading screen.
    this.view.render();
    requestAnimationFrame(() => this.el.loading.classList.add('done'));
  }

  togglePause(): void {
    if (this.state.mode !== 'play' && this.state.mode !== 'drain') return;
    this.paused = !this.paused;
    this.syncHud(true);
  }

  private toggleMute(): void {
    const muted = this.sfx.toggleMute();
    this.el.mute.textContent = muted ? 'sound off' : 'sound on';
  }

  private frameStep(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frame += 1;
    const running = !this.paused && !this.pausedForScreenshot;
    if (running) {
      this.acc += dt * this.timeScale;
      let steps = 0;
      const cmd = this.commandOverride ?? this.input.command();
      while (this.acc >= DT && steps < MAX_STEPS_PER_FRAME * this.timeScale) {
        step(this.state, cmd);
        this.acc -= DT;
        steps++;
      }
      if (steps >= MAX_STEPS_PER_FRAME * this.timeScale) this.acc = 0;
      this.consumeEvents();
    } else {
      // Keep reading input so held keys do not register as fresh presses on resume.
      if (!this.pausedForScreenshot) this.input.command();
      this.acc = 0;
    }
    this.view.update(this.state, running ? dt : 0, this.reducedMotion || !running);
    this.syncHud(false);
    this.view.render();
    this.onFrame();
  }

  /** Step the sim once with no input; used by hooks to settle a new state. */
  settle(): void {
    step(this.state, this.commandOverride ?? NO_COMMAND);
    this.lastEventId = this.state.eventSeq;
  }

  private consumeEvents(): void {
    const s = this.state;
    for (const e of s.events) {
      if (e.id <= this.lastEventId) continue;
      this.lastEventId = e.id;
      switch (e.type) {
        case 'bumper':
          this.sfx.bumper(e.index);
          this.view.kick(0.08 + 0.1 * e.strength);
          break;
        case 'flipper':
          this.sfx.flipper();
          break;
        case 'launch':
          this.sfx.launch(e.strength);
          break;
        case 'wall':
          this.sfx.wall(e.strength);
          break;
        case 'lane':
          this.sfx.lane(e.index);
          break;
        case 'lanesComplete':
          this.sfx.lanesComplete();
          this.view.lanesFlash();
          this.view.kick(0.2);
          this.callout(`MULTIPLIER x${e.index}`);
          break;
        case 'drain':
          this.sfx.drain();
          this.view.kick(0.25);
          this.callout(s.ball >= BALLS_PER_GAME ? 'LAST BALL LOST' : 'BALL LOST');
          break;
        case 'newBall':
          this.sfx.newBall();
          if (e.index === BALLS_PER_GAME) this.callout('FINAL BALL');
          break;
        case 'start':
          this.sfx.start();
          break;
        case 'gameover':
          this.sfx.gameOver(e.index === 1);
          if (e.index === 1) {
            try {
              localStorage.setItem(HIGH_KEY, String(s.highScore));
            } catch {
              /* storage unavailable: keep the in-memory high score */
            }
          }
          break;
      }
    }
  }

  private callout(text: string): void {
    const c = this.el.callout;
    c.textContent = text;
    c.classList.remove('show');
    void c.offsetWidth;
    c.classList.add('show');
  }

  syncHud(force: boolean): void {
    const s = this.state;
    if (force || s.score !== this.lastScore) {
      this.el.score.textContent = s.score.toLocaleString('en-US');
      if (!force && s.score > this.lastScore) {
        this.el.score.classList.add('bump');
        window.setTimeout(() => this.el.score.classList.remove('bump'), 90);
      }
      this.lastScore = s.score;
    }
    const high = Math.max(s.highScore, s.score);
    this.el.high.textContent = high.toLocaleString('en-US');
    this.el.mult.textContent = `x${s.multiplier}`;
    this.el.ball.textContent = `${Math.min(s.ball, BALLS_PER_GAME)}/${BALLS_PER_GAME}`;
    const modeKey = `${s.mode}:${this.paused}`;
    if (force || modeKey !== this.lastMode) {
      this.lastMode = modeKey;
      this.el.title.classList.toggle('hidden', s.mode !== 'title');
      this.el.over.classList.toggle('hidden', s.mode !== 'gameover');
      this.el.pause.classList.toggle('hidden', !this.paused);
      this.el.titleHigh.textContent = s.highScore.toLocaleString('en-US');
      this.el.overHigh.textContent = s.highScore.toLocaleString('en-US');
      this.el.final.textContent = s.score.toLocaleString('en-US');
      this.el.newHigh.classList.toggle('hidden', !s.newHigh);
      this.el.zones.classList.toggle('active', s.mode === 'play' || s.mode === 'drain');
    }
    const onPlunger = ballOnPlunger(s) && !this.paused;
    this.el.launchHint.classList.toggle('hidden', !onPlunger);
    this.el.launchBtn.classList.toggle('hidden', !(onPlunger && matchMedia('(pointer: coarse)').matches));
    this.el.charge.style.width = `${Math.round(s.plungerCharge * 100)}%`;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    this.sfx.dispose();
    this.view.dispose();
  }
}
