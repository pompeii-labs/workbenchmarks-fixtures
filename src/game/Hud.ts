// DOM HUD and overlays. Reads SimState; buttons call back into the game.
import { BALLS_PER_GAME, type SimState } from '../sim/sim';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

export class Hud {
  private score = $('#score-value');
  private scoreBlock = $('.hud-score');
  private mult = $('#mult-value');
  private high = $('#high-value');
  private pips = Array.from(document.querySelectorAll<HTMLElement>('#ball-pips i'));
  private msg = $('#message');
  private popups = $('#popups');
  private title = $('#overlay-title');
  private titleHigh = $('#title-high');
  private over = $('#overlay-gameover');
  private finalScore = $('#final-score');
  private finalHigh = $('#final-high');
  private newHigh = $('#new-high');
  private pause = $('#overlay-pause');
  private pauseButton = $('#pause-button');
  private plunger = $('#plunger-button');
  private meter = $('#plunger-meter');
  private muteButton = $('#mute-button');
  private msgTimer = 0;
  private lastScore = -1;
  private lastBall = 0;
  pendingBallMessage = false;
  onResume: () => void = () => {};
  onPause: () => void = () => {};
  onMute: () => boolean = () => false;

  constructor() {
    $('#resume-button').addEventListener('click', () => this.onResume());
    this.pauseButton.addEventListener('click', () => this.onPause());
    this.muteButton.addEventListener('click', () => {
      const muted = this.onMute();
      this.muteButton.textContent = `Sound: ${muted ? 'off' : 'on'}`;
    });
    // Overlay buttons must not leak taps to the flipper surface.
    for (const el of [this.pause, this.pauseButton]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  message(text: string, tone: 'pink' | 'cyan' | 'amber' = 'pink', seconds = 1.4): void {
    this.msg.textContent = text;
    this.msg.className = `show ${tone}`;
    this.msgTimer = performance.now() + seconds * 1000;
  }

  clearMessage(): void {
    this.msg.className = '';
    this.msgTimer = 0;
    this.pendingBallMessage = false;
    this.lastBall = 0;
    this.lastScore = -1;
  }

  popup(x: number, y: number, text: string, color: string): void {
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    this.popups.appendChild(el);
    setTimeout(() => el.remove(), 800);
    while (this.popups.childElementCount > 12) this.popups.firstElementChild?.remove();
  }

  update(s: SimState, paused: boolean): void {
    if (s.score !== this.lastScore) {
      this.score.textContent = s.score.toLocaleString('en-US');
      if (this.lastScore >= 0 && s.score > this.lastScore) {
        this.scoreBlock.classList.remove('bump');
        void this.scoreBlock.offsetWidth;
        this.scoreBlock.classList.add('bump');
      }
      this.lastScore = s.score;
    }
    this.mult.textContent = `${s.multiplier}x`;
    this.high.textContent = s.highScore.toLocaleString('en-US');
    const inGame = s.mode === 'play' || s.mode === 'drained';
    this.pips.forEach((pip, i) => {
      const used = !inGame ? s.mode === 'gameover' : i < s.ball - 1;
      pip.classList.toggle('used', used);
      pip.classList.toggle('current', inGame && i === s.ball - 1);
    });

    if (s.mode === 'play' && s.ball !== this.lastBall && s.ball > 1 && this.pendingBallMessage) {
      this.message(s.ball === BALLS_PER_GAME ? 'LAST BALL' : `BALL ${s.ball}`, 'cyan');
      this.pendingBallMessage = false;
    }
    if (s.mode === 'play') this.lastBall = s.ball;
    if (this.msgTimer && performance.now() > this.msgTimer) {
      this.msg.className = '';
      this.msgTimer = 0;
    }

    this.title.classList.toggle('hidden', s.mode !== 'attract');
    this.titleHigh.textContent = s.highScore.toLocaleString('en-US');
    this.over.classList.toggle('hidden', s.mode !== 'gameover');
    this.finalScore.textContent = s.score.toLocaleString('en-US');
    this.finalHigh.textContent = s.highScore.toLocaleString('en-US');
    this.newHigh.classList.toggle('hidden', !(s.newHighScore && s.score > 0));
    this.pause.classList.toggle('hidden', !paused);
    this.pauseButton.classList.toggle('hidden', !inGame || paused);

    const ready = s.mode === 'play' && s.ball0.inLane && s.ball0.y < -7.5 && !paused;
    this.plunger.classList.toggle('ready', ready);
    this.meter.style.height = `${Math.round(s.plungerCharge * 100)}%`;
  }
}
