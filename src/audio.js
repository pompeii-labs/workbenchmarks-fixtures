// Tiny synthesized sound effects (no audio files needed).
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuf = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  tone(freq, dur, { type = 'square', vol = 0.2, to = null, delay = 0 } = {}) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.2, freq = 1200, q = 1, to = null, delay = 0 } = {}) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  play(name, arg) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'flip':
        this.noise(0.06, { vol: 0.35, freq: 220, q: 0.8 });
        this.tone(110, 0.06, { type: 'triangle', vol: 0.25, to: 60 });
        break;
      case 'unflip':
        this.noise(0.04, { vol: 0.12, freq: 160, q: 0.8 });
        break;
      case 'hit':
        this.tone(180, 0.05, { type: 'triangle', vol: Math.min(0.3, (arg || 5) / 60) });
        break;
      case 'wall':
        this.noise(0.035, { vol: Math.min(0.18, (arg || 3) / 120), freq: 900, q: 2 });
        break;
      case 'bumper': {
        const base = [660, 784, 880][arg || 0];
        this.tone(base, 0.09, { vol: 0.18, to: base / 2 });
        this.noise(0.05, { vol: 0.2, freq: 2500, q: 1 });
        break;
      }
      case 'sling':
        this.tone(330, 0.07, { type: 'sawtooth', vol: 0.14, to: 160 });
        this.noise(0.05, { vol: 0.2, freq: 1500 });
        break;
      case 'target':
        this.tone(1046, 0.08, { vol: 0.14 });
        this.tone(1568, 0.1, { vol: 0.1, delay: 0.05 });
        break;
      case 'rollover':
        this.tone(523, 0.07, { type: 'triangle', vol: 0.18, to: 1046 });
        break;
      case 'set':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, { vol: 0.14, delay: i * 0.07 }));
        break;
      case 'mult':
        [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.1, { type: 'triangle', vol: 0.16, delay: 0.3 + i * 0.05 }));
        break;
      case 'launch':
        this.noise(0.25, { vol: 0.3, freq: 300, to: 3000, q: 1.5 });
        this.tone(90, 0.12, { type: 'triangle', vol: 0.3, to: 45 });
        break;
      case 'charge':
        this.tone(80 + 400 * (arg || 0), 0.03, { type: 'sine', vol: 0.05 });
        break;
      case 'drain':
        this.tone(392, 0.5, { type: 'sawtooth', vol: 0.14, to: 60 });
        break;
      case 'save':
        [784, 988, 1175].forEach((f, i) => this.tone(f, 0.1, { vol: 0.12, delay: i * 0.08 }));
        break;
      case 'start':
        [262, 330, 392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.09, { vol: 0.14, delay: i * 0.06 }));
        break;
      case 'hiscore':
        [784, 1046, 1318, 1568, 1318, 1568].forEach((f, i) => this.tone(f, 0.1, { vol: 0.13, delay: i * 0.08 }));
        break;
      case 'gameover':
        [523, 392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.2, delay: i * 0.18 }));
        break;
    }
  }
}
