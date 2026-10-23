// Tiny synthesized sound: engine drone, hull/water hiss, wind, splashes, chimes.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // engine
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.Q.value = 3;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc1.connect(this.engFilter);
    const o2g = ctx.createGain();
    o2g.gain.value = 0.5;
    this.osc2.connect(o2g).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.osc1.start();
    this.osc2.start();

    // noise sources
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const mkNoise = (type, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { f, g };
    };
    this.water = mkNoise('bandpass', 900, 0.7);
    this.wind = mkNoise('highpass', 1800, 0.5);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  update({ throttle, speed, airborne, boosting }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = Math.min(1.3, throttle * (airborne ? 1.25 : 0.6 + speed / 70) + (boosting ? 0.2 : 0));
    const f = 42 + rpm * 95 + Math.sin(t * 31) * 2;
    this.osc1.frequency.setTargetAtTime(f, t, 0.06);
    this.osc2.frequency.setTargetAtTime(f * 0.5 + 1.5, t, 0.06);
    this.engFilter.frequency.setTargetAtTime(380 + rpm * 1300, t, 0.08);
    this.engGain.gain.setTargetAtTime(0.06 + rpm * 0.12, t, 0.08);
    const s = Math.min(1, speed / 35);
    this.water.g.gain.setTargetAtTime(airborne ? 0.0 : 0.04 + s * 0.22, t, 0.05);
    this.water.f.frequency.setTargetAtTime(600 + s * 900, t, 0.1);
    this.wind.g.gain.setTargetAtTime((airborne ? 0.12 : 0.03) * s, t, 0.2);
  }

  splash(intensity) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.6 + Math.random() * 0.3;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2500 + intensity * 2500, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.6 + intensity * 0.4);
    const g = ctx.createGain();
    const peak = Math.min(0.9, 0.15 + intensity * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7 + intensity * 0.5);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 1.5);
  }

  chime(pitch = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [660, 880, 1320].forEach((fr, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = fr * pitch;
      const g = ctx.createGain();
      const st = t + i * 0.07;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.25, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.4);
      o.connect(g).connect(this.master);
      o.start(st);
      o.stop(st + 0.5);
    });
  }
}
