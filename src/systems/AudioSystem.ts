/**
 * Game audio. Recorded sounds from Soundza (https://soundza.com, see public/sfx/CREDITS.md)
 * load after the first user gesture. Until a sample has decoded, or if it fails to load,
 * the matching procedural fallback plays instead, so the game is never silent.
 *
 * Mix: master -> { sfx, engine, ambience, music }. Mute ramps the master.
 */

const SAMPLE_FILES = {
  engine: 'engine-loop.wav',
  ocean: 'ocean-ambience.mp3',
  music: 'music-sunny-island.mp3',
  splashLand: 'splash-land.mp3',
  splashSmall: 'splash-small.mp3',
  splashWipeout: 'splash-wipeout.mp3',
  bump: 'bump-thud.mp3',
  launch: 'launch-whoosh.mp3',
  ring: 'ring-pickup.mp3',
  gate: 'gate-chime.mp3',
  beep: 'countdown-beep.mp3',
  go: 'countdown-go.mp3',
  lap: 'lap-chime.mp3',
  bestLap: 'best-lap-jingle.mp3',
  finish: 'finish-fanfare.mp3',
  trick: 'trick-land.mp3',
  boost: 'boost-start.mp3',
  click: 'ui-click.mp3',
} as const;

export type SampleName = keyof typeof SAMPLE_FILES;

const MASTER = 0.8;
const MUSIC_LEVEL = 0.22;
const AMBIENCE_LEVEL = 0.32;

interface PlayOpts {
  gain?: number;
  rate?: number;
  pan?: number;
  /** seconds from now */
  delay?: number;
  /** skip if this sample started less than this many seconds ago */
  cooldown?: number;
}

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private engineBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private musicBus: GainNode | null = null;

  // procedural engine (fallback until the engine sample decodes)
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private hissGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // sampled engine: the player's ski plus one voice for the nearest rival
  private engineSrc: AudioBufferSourceNode | null = null;
  private engineSampleGain: GainNode | null = null;
  private engineSampleFilter: BiquadFilterNode | null = null;
  private rivalSrc: AudioBufferSourceNode | null = null;
  private rivalGain: GainNode | null = null;
  private rivalPan: StereoPannerNode | null = null;

  private readonly buffers = new Map<SampleName, AudioBuffer>();
  private readonly lastPlay = new Map<SampleName, number>();
  private readonly playCounts: Partial<Record<SampleName, number>> = {};
  private loadFailures = 0;
  private loading = false;
  private bedsStarted = false;
  private paused = false;

  muted = false;
  private splashN = 0;

  /** Base URL for the sample folder; relative so dist/ works from any subfolder. */
  constructor(private readonly baseUrl = `${import.meta.env.BASE_URL}sfx/`) {}

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER;
    // Gentle limiter so stacked splashes + fanfare never clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    this.master.connect(limiter).connect(ctx.destination);

    this.sfxBus = this.bus(1);
    this.engineBus = this.bus(1);
    this.ambienceBus = this.bus(AMBIENCE_LEVEL);
    this.musicBus = this.bus(MUSIC_LEVEL);

    const len = ctx.sampleRate * 1.5;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i += 1) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }

    // Procedural engine drone (fallback).
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
    this.engineFilter.connect(this.engineGain).connect(this.engineBus);
    this.engineOsc.start();
    this.engineOsc2.start();

    // Water rush under the hull: filtered noise that follows speed. Kept with the
    // sampled engine too, it sells the speed better than any fixed recording.
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noiseBuffer;
    hiss.loop = true;
    const hf = ctx.createBiquadFilter();
    hf.type = 'bandpass';
    hf.frequency.value = 1400;
    hf.Q.value = 0.6;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    hiss.connect(hf).connect(this.hissGain).connect(this.engineBus);
    hiss.start();

    document.addEventListener('visibilitychange', this.onVisibility);
    void this.loadAll();
  }

  private bus(level: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = level;
    g.connect(this.master!);
    return g;
  }

  private readonly onVisibility = (): void => {
    if (!this.ctx) return;
    if (document.hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  };

  private async loadAll(): Promise<void> {
    if (this.loading || !this.ctx) return;
    this.loading = true;
    const ctx = this.ctx;
    // Small, gameplay-critical sounds first; the music bed last.
    const order = (Object.keys(SAMPLE_FILES) as SampleName[]).sort((a, b) => Number(a === 'music') - Number(b === 'music'));
    await Promise.all(
      order.map(async (name) => {
        try {
          const res = await fetch(this.baseUrl + SAMPLE_FILES[name]);
          if (!res.ok) throw new Error(`${res.status}`);
          const bytes = await res.arrayBuffer();
          const buf = await new Promise<AudioBuffer>((resolve, reject) => ctx.decodeAudioData(bytes, resolve, reject));
          if (this.ctx !== ctx) return;
          this.buffers.set(name, buf);
          this.onLoaded(name);
        } catch {
          this.loadFailures += 1;
        }
      }),
    );
  }

  private onLoaded(name: SampleName): void {
    if (name === 'engine') this.startSampledEngine();
    if (name === 'ocean' || name === 'music') this.startBed(name);
  }

  private startSampledEngine(): void {
    const ctx = this.ctx;
    const buf = this.buffers.get('engine');
    if (!ctx || !buf || !this.engineBus || this.engineSrc) return;
    this.engineSampleFilter = ctx.createBiquadFilter();
    this.engineSampleFilter.type = 'lowpass';
    this.engineSampleFilter.frequency.value = 2000;
    this.engineSampleFilter.Q.value = 0.5;
    this.engineSampleGain = ctx.createGain();
    this.engineSampleGain.gain.value = 0;
    this.engineSrc = ctx.createBufferSource();
    this.engineSrc.buffer = buf;
    this.engineSrc.loop = true;
    this.engineSrc.connect(this.engineSampleFilter).connect(this.engineSampleGain).connect(this.engineBus);
    this.engineSrc.start(0, Math.random() * buf.duration);

    // Nearest rival: same recording, darker and panned.
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 1100;
    this.rivalGain = ctx.createGain();
    this.rivalGain.gain.value = 0;
    this.rivalPan = ctx.createStereoPanner();
    this.rivalSrc = ctx.createBufferSource();
    this.rivalSrc.buffer = buf;
    this.rivalSrc.loop = true;
    this.rivalSrc.connect(rf).connect(this.rivalGain).connect(this.rivalPan).connect(this.engineBus);
    this.rivalSrc.start(0, Math.random() * buf.duration);

    // Retire the oscillator drone.
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    const o1 = this.engineOsc;
    const o2 = this.engineOsc2;
    this.engineOsc = null;
    this.engineOsc2 = null;
    o1?.stop(ctx.currentTime + 0.6);
    o2?.stop(ctx.currentTime + 0.6);
  }

  private startBed(name: 'ocean' | 'music'): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    const bus = name === 'music' ? this.musicBus : this.ambienceBus;
    if (!ctx || !buf || !bus) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + (name === 'music' ? 2.5 : 1.5));
    src.connect(g).connect(bus);
    src.start();
    this.bedsStarted = true;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.05);
  }

  /** Pause menu: duck the music and ambience. */
  setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    if (!this.ctx || !this.musicBus || !this.ambienceBus) return;
    const now = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(p ? MUSIC_LEVEL * 0.45 : MUSIC_LEVEL, now, 0.15);
    this.ambienceBus.gain.setTargetAtTime(p ? AMBIENCE_LEVEL * 0.5 : AMBIENCE_LEVEL, now, 0.15);
  }

  /** Play a loaded sample. Returns false when it isn't available (caller falls back). */
  private play(name: SampleName, o: PlayOpts = {}): boolean {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf || !this.sfxBus) return false;
    const now = ctx.currentTime;
    if (o.cooldown && now - (this.lastPlay.get(name) ?? -1e9) < o.cooldown) return true;
    this.lastPlay.set(name, now);
    this.playCounts[name] = (this.playCounts[name] ?? 0) + 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    let tail: AudioNode = src.connect(g);
    if (o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      tail = tail.connect(p);
    }
    tail.connect(this.sfxBus);
    src.start(now + (o.delay ?? 0));
    return true;
  }

  /** speed 0..1, airborne silences hiss and revs the engine. */
  engine(speed01: number, throttle: number, airborne: boolean, boosting: boolean, active: boolean): void {
    if (!this.ctx || !this.hissGain) return;
    const now = this.ctx.currentTime;
    const rev = airborne ? 0.9 + Math.max(0, throttle) * 0.3 : speed01 * 0.8 + Math.max(0, throttle) * 0.25;
    if (this.engineSrc && this.engineSampleGain && this.engineSampleFilter) {
      this.engineSrc.playbackRate.setTargetAtTime(0.62 + rev * 0.7 + (boosting ? 0.12 : 0), now, airborne ? 0.15 : 0.08);
      this.engineSampleFilter.frequency.setTargetAtTime(airborne ? 5200 : 1100 + rev * 3600, now, 0.1);
      this.engineSampleGain.gain.setTargetAtTime(active ? 0.32 + rev * 0.34 : 0, now, 0.12);
    } else if (this.engineOsc && this.engineOsc2 && this.engineGain && this.engineFilter) {
      const f = 42 + rev * 90 + (boosting ? 25 : 0);
      this.engineOsc.frequency.setTargetAtTime(f, now, 0.08);
      this.engineOsc2.frequency.setTargetAtTime(f * 0.5, now, 0.08);
      this.engineFilter.frequency.setTargetAtTime(380 + rev * 1400, now, 0.1);
      this.engineGain.gain.setTargetAtTime(active ? 0.11 + rev * 0.08 : 0, now, 0.1);
    }
    this.hissGain.gain.setTargetAtTime(active && !airborne ? speed01 * 0.16 : 0, now, 0.06);
  }

  /** Nearest rival engine: distance in metres, speed 0..1, pan -1..1. */
  rivalEngine(dist: number, speed01: number, pan: number, active: boolean): void {
    if (!this.ctx || !this.rivalSrc || !this.rivalGain || !this.rivalPan) return;
    const now = this.ctx.currentTime;
    const near = Math.max(0, 1 - dist / 70);
    this.rivalSrc.playbackRate.setTargetAtTime(0.7 + speed01 * 0.6, now, 0.1);
    this.rivalGain.gain.setTargetAtTime(active ? near * near * 0.28 : 0, now, 0.15);
    this.rivalPan.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, pan)), now, 0.1);
  }

  /** Landing / impact splash. power ~ impact speed. gain/pan let rivals' splashes sit back in the mix. */
  splash(power: number, gain = 1, pan = 0): void {
    if (!this.ctx) return;
    const v = Math.min(1, 0.3 + power * 0.07) * gain;
    const rate = 1.12 - Math.min(0.3, power * 0.025) + (Math.random() - 0.5) * 0.08;
    const name: SampleName = power >= 12 ? 'splashWipeout' : power < 4 ? 'splashSmall' : 'splashLand';
    if (this.play(name, { gain: v, rate, pan, cooldown: 0.08 })) return;
    this.noiseSplash(power, gain);
  }

  wipeout(gain = 1, pan = 0): void {
    if (this.play('splashWipeout', { gain: 0.95 * gain, rate: 0.95, pan, cooldown: 0.2 })) {
      this.play('bump', { gain: 0.5 * gain, rate: 0.8, pan });
      return;
    }
    this.noiseSplash(14, gain);
  }

  /** Leaving the water: whoosh scaled by launch speed, plus a little spray. */
  launch(vy: number): void {
    // Small crest hops just spit a little spray; real jumps get the air whoosh.
    const g = Math.min(1, 0.3 + vy * 0.07);
    if (vy > 3) this.play('launch', { gain: g, rate: 0.9 + Math.min(0.3, vy * 0.03), cooldown: 0.25 });
    this.play('splashSmall', { gain: g * 0.5, rate: 1.15 + Math.random() * 0.1, cooldown: 0.15 });
  }

  /** Ski-on-ski contact. */
  bump(strength: number, gain = 1, pan = 0): void {
    const g = Math.min(1, 0.45 + strength * 0.12) * gain;
    if (this.play('bump', { gain: g, rate: 0.9 + Math.random() * 0.15, pan, cooldown: 0.12 })) {
      this.play('splashSmall', { gain: g * 0.6, rate: 0.95, pan });
      return;
    }
    this.noiseSplash(4 + strength * 1.5, gain);
  }

  ring(air: boolean): void {
    if (!this.play('ring', { gain: 0.75, rate: air ? 1.26 : 1 })) this.chime(air);
  }

  gate(): void {
    if (!this.play('gate', { gain: 0.6, cooldown: 0.1 })) this.chime(false);
  }

  countdown(n: number): void {
    // 3, 2, 1: same beep, stepping up a little each count.
    if (!this.play('beep', { gain: 0.8, rate: n >= 3 ? 1 : n === 2 ? 1.06 : 1.12 })) this.chime(false);
  }

  go(): void {
    if (!this.play('go', { gain: 0.85 })) this.chime(true);
  }

  lap(best: boolean): void {
    if (best) {
      if (!this.play('bestLap', { gain: 0.85 })) this.fanfare(true);
    } else if (!this.play('lap', { gain: 0.85 })) this.fanfare(false);
  }

  finish(place: number): void {
    if (place === 1) {
      if (!this.play('finish', { gain: 0.9 })) this.fanfare(true);
    } else if (!this.play('bestLap', { gain: 0.75, rate: place <= 3 ? 1 : 0.84 })) this.fanfare(false);
  }

  trick(points: number): void {
    this.play('trick', { gain: Math.min(0.8, 0.4 + points / 2000), rate: 1 + Math.min(0.25, points / 4000), cooldown: 0.1 });
  }

  boost(): void {
    this.play('boost', { gain: 0.5, cooldown: 0.4 });
  }

  click(): void {
    this.play('click', { gain: 0.6, cooldown: 0.05 });
  }

  // ------------------------------------------------------------ procedural fallbacks

  private noiseSplash(power: number, gain = 1): void {
    if (!this.ctx || !this.sfxBus || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, now);
    f.frequency.exponentialRampToValueAtTime(300, now + 0.5);
    const g = this.ctx.createGain();
    const v = Math.min(0.5, 0.08 + power * 0.03) * gain;
    g.gain.setValueAtTime(Math.max(0.0002, v), now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    src.connect(f).connect(g).connect(this.sfxBus);
    this.splashN = (this.splashN + 1) % 5;
    src.start(now, this.splashN * 0.1);
    src.stop(now + 0.65);
  }

  /** Lap complete: rising arpeggio, longer for a new best. */
  fanfare(best: boolean): void {
    if (!this.ctx || !this.sfxBus) return;
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
      o.connect(g).connect(this.sfxBus!);
      o.start(t);
      o.stop(t + 0.45);
    });
  }

  chime(high: boolean): void {
    if (!this.ctx || !this.sfxBus) return;
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
      o.connect(g).connect(this.sfxBus!);
      o.start(t);
      o.stop(t + 0.32);
    });
  }

  /** For test diagnostics. */
  diagnostics(): { state: string; loaded: number; total: number; failed: number; sampledEngine: boolean; beds: boolean; muted: boolean; plays: Partial<Record<SampleName, number>> } {
    return {
      state: this.ctx?.state ?? 'none',
      loaded: this.buffers.size,
      total: Object.keys(SAMPLE_FILES).length,
      failed: this.loadFailures,
      sampledEngine: this.engineSrc !== null,
      beds: this.bedsStarted,
      muted: this.muted,
      plays: { ...this.playCounts },
    };
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    void this.ctx?.close();
    this.ctx = null;
  }
}
