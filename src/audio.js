// Tiny synthesized sound kit (no audio files needed).
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('neonorbit.muted') === '1';
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('neonorbit.muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }
  tone(freq, dur, { type = 'square', vol = 0.3, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  noise(dur, { vol = 0.3, freq = 2000, q = 1, type = 'bandpass', delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }
  flipper(up) {
    if (up) { this.noise(0.06, { vol: 0.5, freq: 900, q: 0.8 }); this.tone(140, 0.05, { type: 'triangle', vol: 0.3, slide: 0.5 }); }
    else this.noise(0.04, { vol: 0.2, freq: 600 });
  }
  bumper(i) {
    const base = [523, 659, 784][i] || 600;
    this.tone(base, 0.12, { vol: 0.25, slide: 1.5 });
    this.tone(base * 2, 0.08, { type: 'triangle', vol: 0.15 });
    this.noise(0.05, { vol: 0.35, freq: 3000 });
  }
  sling() { this.noise(0.07, { vol: 0.5, freq: 1500, q: 2 }); this.tone(220, 0.08, { vol: 0.2, slide: 0.6 }); }
  hit(speed) { this.noise(0.03, { vol: Math.min(0.35, speed * 0.02), freq: 2500, q: 3 }); }
  rollover() { this.tone(1046, 0.1, { type: 'triangle', vol: 0.25 }); this.tone(1568, 0.15, { type: 'triangle', vol: 0.2, delay: 0.07 }); }
  launch(p) { this.noise(0.25, { vol: 0.4 * (0.4 + p), freq: 500, type: 'lowpass' }); this.tone(90, 0.15, { type: 'sine', vol: 0.5, slide: 0.5 }); }
  pull() { this.noise(0.05, { vol: 0.08, freq: 400 }); }
  fanfare(notes = [523, 659, 784, 1046], step = 0.09) {
    notes.forEach((n, i) => this.tone(n, 0.18, { vol: 0.2, delay: i * step }));
  }
  drain() { [392, 330, 262, 196].forEach((n, i) => this.tone(n, 0.25, { type: 'sawtooth', vol: 0.15, delay: i * 0.14 })); }
  gameover() { [392, 370, 349, 330, 262].forEach((n, i) => this.tone(n, 0.35, { type: 'sawtooth', vol: 0.15, delay: i * 0.2 })); }
}
