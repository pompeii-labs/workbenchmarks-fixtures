/** Procedural audio: engine drone, water hiss, splash bursts, ring chime. */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private hissGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;
  private splashN = 0;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 1.5;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i += 1) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 25;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(o2g).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();

    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noiseBuffer;
    hiss.loop = true;
    const hf = ctx.createBiquadFilter();
    hf.type = 'bandpass';
    hf.frequency.value = 1400;
    hf.Q.value = 0.6;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    hiss.connect(hf).connect(this.hissGain).connect(this.master);
    hiss.start();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  /** speed 0..1, airborne silences hiss and revs the engine. */
  engine(speed01: number, throttle: number, airborne: boolean, boosting: boolean, active: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineOsc2 || !this.engineGain || !this.engineFilter || !this.hissGain) return;
    const now = this.ctx.currentTime;
    const rev = airborne ? 0.9 + Math.max(0, throttle) * 0.3 : speed01 * 0.8 + Math.max(0, throttle) * 0.25;
    const f = 42 + rev * 90 + (boosting ? 25 : 0);
    this.engineOsc.frequency.setTargetAtTime(f, now, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, now, 0.08);
    this.engineFilter.frequency.setTargetAtTime(380 + rev * 1400, now, 0.1);
    this.engineGain.gain.setTargetAtTime(active ? 0.11 + rev * 0.08 : 0, now, 0.1);
    this.hissGain.gain.setTargetAtTime(active && !airborne ? speed01 * 0.16 : 0, now, 0.06);
  }

  splash(power: number): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, now);
    f.frequency.exponentialRampToValueAtTime(300, now + 0.5);
    const g = this.ctx.createGain();
    const v = Math.min(0.5, 0.08 + power * 0.03);
    g.gain.setValueAtTime(v, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    src.connect(f).connect(g).connect(this.master);
    this.splashN = (this.splashN + 1) % 5;
    src.start(now, this.splashN * 0.1);
    src.stop(now + 0.65);
  }

  /** Lap complete: rising arpeggio, longer for a new best. */
  fanfare(best: boolean): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const notes = best ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    notes.forEach((n, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'square';
      o.frequency.value = n;
      const t = now + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g);
      g.connect(this.master!);
      o.start(t);
      o.stop(t + 0.45);
    });
  }

  chime(high: boolean): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const notes = high ? [880, 1175, 1568] : [660, 880];
    notes.forEach((n, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'triangle';
      o.frequency.value = n;
      const t = now + i * 0.06;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(this.master!);
      o.start(t);
      o.stop(t + 0.32);
    });
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
