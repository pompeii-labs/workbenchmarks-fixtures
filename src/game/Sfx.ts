/** Tiny WebAudio synth: every sound is generated, no asset files. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Audio-only noise; not gameplay randomness, so it does not use the sim RNG.
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  bumper(i: number): void {
    const base = [523, 659, 784][i] ?? 600;
    this.tone(base, 0.12, 'square', 0.18, base * 1.5);
    this.tone(base * 2, 0.08, 'triangle', 0.12);
  }
  flipper(): void {
    this.noise(0.05, 0.5, 1800);
    this.tone(140, 0.06, 'square', 0.08, 70);
  }
  launch(strength: number): void {
    this.noise(0.25, 0.4 + strength * 0.4, 600 + strength * 900);
    this.tone(200, 0.3, 'sawtooth', 0.08, 600 + strength * 600);
  }
  wall(strength: number): void {
    this.tone(220 + strength * 200, 0.04, 'triangle', 0.05 + strength * 0.12);
  }
  lane(i: number): void {
    this.tone(880 + i * 110, 0.18, 'triangle', 0.16);
  }
  lanesComplete(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, 'square', 0.12, undefined, i * 0.07));
  }
  drain(): void {
    this.tone(392, 0.5, 'sawtooth', 0.14, 70);
  }
  newBall(): void {
    this.tone(660, 0.08, 'square', 0.08);
    this.tone(990, 0.1, 'square', 0.08, undefined, 0.09);
  }
  gameOver(high: boolean): void {
    const notes = high ? [523, 659, 784, 1047, 784, 1047] : [392, 349, 311, 262];
    notes.forEach((f, i) => this.tone(f, 0.22, 'square', 0.12, undefined, i * 0.15));
  }
  start(): void {
    [392, 523, 659].forEach((f, i) => this.tone(f, 0.12, 'square', 0.12, undefined, i * 0.08));
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
