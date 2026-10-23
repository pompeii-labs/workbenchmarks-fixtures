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

    // the nearest rival's engine: a thinner, buzzier drone than ours
    this.rivFilter = ctx.createBiquadFilter();
    this.rivFilter.type = 'bandpass';
    this.rivFilter.Q.value = 1.5;
    this.rivFilter.frequency.value = 900;
    this.rivGain = ctx.createGain();
    this.rivGain.gain.value = 0;
    this.rivOsc = ctx.createOscillator();
    this.rivOsc.type = 'sawtooth';
    this.rivOsc.connect(this.rivFilter).connect(this.rivGain).connect(this.master);
    this.rivOsc.start();
  }

  /** dist (m) and speed (m/s) of the closest rival, closing = approach speed (for a little doppler) */
  rival(dist, speed, closing = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const near = Math.max(0, 1 - dist / 70);
    const f = (70 + Math.min(1.3, speed / 32) * 110) * (1 + Math.max(-0.08, Math.min(0.08, closing / 340)));
    this.rivOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.rivFilter.frequency.setTargetAtTime(500 + speed * 30, t, 0.1);
    this.rivGain.gain.setTargetAtTime(near * near * 0.16, t, 0.1);
  }

  /** hull-on-hull knock */
  bump(intensity) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const k = Math.min(1, intensity);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150 + Math.random() * 40, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 + k * 0.5, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
    // plastic clack on top
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 2;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.15 + k * 0.35, t + 0.003);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(f).connect(g2).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.12);
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

  // short single blip (gates, warnings)
  beep(freq = 990) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, t);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
  }
}
