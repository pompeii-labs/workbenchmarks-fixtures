// Synthesized arcade sounds (WebAudio, no asset files).
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < len; i += 1) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, vol: number, freq: number, delay = 0): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  bumper(i: number): void {
    const f = [660, 784, 988][i % 3];
    this.tone(f, 0.12, 'square', 0.18, f * 1.5);
    this.hiss(0.05, 0.25, 3000);
  }
  sling(): void {
    this.tone(220, 0.08, 'sawtooth', 0.16, 110);
    this.hiss(0.06, 0.3, 1800);
  }
  flipper(): void {
    this.tone(90, 0.06, 'triangle', 0.3, 50);
    this.hiss(0.03, 0.18, 900);
  }
  hit(strength: number): void {
    this.hiss(0.04, Math.min(0.25, strength / 80), 2400);
  }
  lane(i: number): void {
    this.tone(1046 + i * 130, 0.18, 'sine', 0.2);
  }
  lanesComplete(): void {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.16, 'square', 0.13, undefined, i * 0.07));
  }
  launch(charge: number): void {
    this.hiss(0.35, 0.3 + charge * 0.2, 600 + charge * 1200);
    this.tone(120, 0.25, 'sawtooth', 0.1, 400 + charge * 400);
  }
  drain(): void {
    this.tone(440, 0.7, 'sawtooth', 0.15, 55);
  }
  save(): void {
    [784, 988, 784, 988].forEach((f, i) => this.tone(f, 0.1, 'square', 0.12, undefined, i * 0.09));
  }
  start(): void {
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'square', 0.12, undefined, i * 0.08));
  }
  gameOver(best: boolean): void {
    const notes = best ? [523, 659, 784, 1046, 1318, 1568] : [392, 330, 262, 196];
    notes.forEach((f, i) => this.tone(f, 0.22, 'square', 0.12, undefined, i * 0.12));
  }
}
