// Synthesized arcade sounds; no audio files to load.
import type { SimEvent } from '../sim/sim';

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    if (!this.ctx || !this.master || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number): void {
    if (!this.ctx || !this.master || this.muted || this.ctx.state !== 'running') return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Audio-only noise; not gameplay randomness.
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  play(e: SimEvent): void {
    switch (e.type) {
      case 'bumper':
        this.tone('square', [520, 660, 780][e.index] ?? 600, 180, 0.16, 0.18);
        this.noise(0.05, 0.4, 2400);
        break;
      case 'sling':
        this.tone('triangle', 300, 120, 0.1, 0.2);
        this.noise(0.04, 0.3, 1600);
        break;
      case 'flip':
        this.noise(0.05, 0.5, 900);
        this.tone('sine', 140, 70, 0.06, 0.12);
        break;
      case 'lane':
        this.tone('sine', 880, 1320, 0.12, 0.14);
        break;
      case 'multiplier':
        [0, 0.08, 0.16, 0.24].forEach((d, i) => this.tone('square', 440 * Math.pow(1.26, i), 440 * Math.pow(1.26, i), 0.12, 0.12, d));
        break;
      case 'launch':
        this.noise(0.18, 0.5, 500 + e.strength * 600);
        this.tone('sawtooth', 120, 600, 0.22, 0.1);
        break;
      case 'save':
        this.tone('triangle', 660, 990, 0.2, 0.15);
        this.tone('triangle', 990, 1320, 0.2, 0.15, 0.12);
        break;
      case 'drain':
        this.tone('sawtooth', 400, 60, 0.7, 0.16);
        break;
      case 'gameover':
        [0, 0.2, 0.4].forEach((d, i) => this.tone('square', 330 / Math.pow(1.2, i), 300 / Math.pow(1.2, i), 0.25, 0.12, d));
        break;
      case 'start':
        [0, 0.07, 0.14].forEach((d, i) => this.tone('square', 523 * Math.pow(1.26, i), 523 * Math.pow(1.26, i), 0.1, 0.1, d));
        break;
      case 'wall':
        this.noise(0.03, Math.min(0.25, e.strength / 60), 3000);
        break;
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
