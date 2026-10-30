/**
 * Sample-based audio. Every sound is a Soundza recording (soundza.com), listed in
 * artifacts/sound/cues.json with its trigger and gain.
 *
 * - One AudioContext, created on the first user gesture (unlock()).
 * - Every file is fetched and decoded once at unlock, into a map by cue id.
 * - Buses: sfx / ui / bed -> master -> destination. Mute ramps master.
 * - Loops (engine, water rush, ocean bed) start once and follow game state.
 */

type CueId =
  | 'engine'
  | 'water-rush'
  | 'ocean-ambience'
  | 'land-splash'
  | 'land-splash-2'
  | 'wipeout'
  | 'launch'
  | 'bump'
  | 'ring'
  | 'gate'
  | 'countdown'
  | 'go'
  | 'lap'
  | 'lap-best'
  | 'finish-win'
  | 'finish'
  | 'ui-click';

type Bus = 'sfx' | 'ui' | 'bed';

interface CueDef {
  file: string;
  /** gain into its bus, in dB (mirrors gain_db in cues.json) */
  gainDb: number;
  bus: Bus;
}

const CUES: Record<CueId, CueDef> = {
  engine: { file: 'engine.wav', gainDb: -8, bus: 'sfx' },
  'water-rush': { file: 'water-rush.wav', gainDb: -4, bus: 'sfx' },
  'ocean-ambience': { file: 'ocean-bed.wav', gainDb: -2, bus: 'bed' },
  'land-splash': { file: 'land-splash.mp3', gainDb: -4, bus: 'sfx' },
  'land-splash-2': { file: 'splash2.mp3', gainDb: -6, bus: 'sfx' },
  wipeout: { file: 'wipeout.mp3', gainDb: -8, bus: 'sfx' },
  launch: { file: 'launch.mp3', gainDb: -10, bus: 'sfx' },
  bump: { file: 'bump.mp3', gainDb: -6, bus: 'sfx' },
  ring: { file: 'ring.mp3', gainDb: -9, bus: 'sfx' },
  gate: { file: 'gate.mp3', gainDb: -3, bus: 'sfx' },
  countdown: { file: 'countdown.mp3', gainDb: 0, bus: 'sfx' },
  go: { file: 'go.mp3', gainDb: -8, bus: 'sfx' },
  lap: { file: 'lap.mp3', gainDb: -7, bus: 'sfx' },
  'lap-best': { file: 'lap-best.mp3', gainDb: -6, bus: 'sfx' },
  'finish-win': { file: 'finish-win.mp3', gainDb: -6, bus: 'sfx' },
  finish: { file: 'finish.mp3', gainDb: -7, bus: 'sfx' },
  'ui-click': { file: 'ui-click.mp3', gainDb: -12, bus: 'ui' },
};

const MAX_VOICES = 4;
const COOLDOWN_S = 0.06;
const MASTER = 1;

const db = (d: number): number => 10 ** (d / 20);

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

interface LoopVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** linear gain of the cue at full presence */
  full: number;
}

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<Bus, GainNode>> = {};
  private readonly buffers = new Map<CueId, AudioBuffer>();
  private readonly voices = new Map<CueId, Voice[]>();
  private readonly lastPlay = new Map<CueId, number>();
  private readonly loops = new Map<CueId, LoopVoice>();
  private waterFilter: BiquadFilterNode | null = null;
  private splashTurn = 0;
  private paused = false;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER;
    this.master.connect(ctx.destination);
    for (const b of ['sfx', 'ui', 'bed'] as Bus[]) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses[b] = g;
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    });
    void this.loadAll();
  }

  private async loadAll(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const base = import.meta.env.BASE_URL;
    await Promise.all(
      (Object.keys(CUES) as CueId[]).map(async (id) => {
        try {
          const res = await fetch(`${base}sounds/${CUES[id].file}`);
          if (!res.ok) return;
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          if (this.ctx !== ctx) return;
          this.buffers.set(id, buf);
          if (id === 'engine' || id === 'water-rush' || id === 'ocean-ambience') this.startLoop(id);
        } catch {
          // a sound that fails to load stays silent; the game keeps running
        }
      }),
    );
  }

  private startLoop(id: CueId): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(id);
    if (!ctx || !buf || this.loops.has(id)) return;
    const def = CUES[id];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    const full = db(def.gainDb);
    // The ocean bed is always on (low); engine and water wait for engine().
    gain.gain.value = id === 'ocean-ambience' ? full : 0;
    if (id === 'water-rush') {
      // Tilt the waterfall roar toward spray hiss; opened up by speed in engine().
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 500;
      hp.Q.value = 0.5;
      src.connect(hp);
      hp.connect(gain);
      this.waterFilter = hp;
    } else {
      src.connect(gain);
    }
    gain.connect(this.buses[def.bus]!);
    // Random start offset so loops never line up the same way twice.
    src.start(ctx.currentTime, Math.random() * buf.duration);
    this.loops.set(id, { src, gain, full });
  }

  /** One-shot: new source per play, ±4% rate, ±1.5 dB, voice cap and cooldown. */
  private play(id: CueId, opts: { gainDb?: number; rate?: number; vary?: boolean } = {}): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(id);
    if (!ctx || !buf) return;
    const now = ctx.currentTime;
    const last = this.lastPlay.get(id) ?? -1;
    if (now - last < COOLDOWN_S) return;
    this.lastPlay.set(id, now);
    const def = CUES[id];
    const vary = opts.vary ?? true;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (vary ? 1 + (Math.random() * 2 - 1) * 0.04 : 1);
    const gain = ctx.createGain();
    gain.gain.value = db(def.gainDb + (opts.gainDb ?? 0) + (vary ? (Math.random() * 2 - 1) * 1.5 : 0));
    src.connect(gain).connect(this.buses[def.bus]!);
    const list = this.voices.get(id) ?? [];
    while (list.length >= MAX_VOICES) {
      const old = list.shift()!;
      try {
        old.gain.gain.setTargetAtTime(0, now, 0.01);
        old.src.stop(now + 0.05);
      } catch {
        // already stopped
      }
    }
    const v = { src, gain };
    list.push(v);
    this.voices.set(id, list);
    src.onended = () => {
      const l = this.voices.get(id);
      if (l) {
        const i = l.indexOf(v);
        if (i >= 0) l.splice(i, 1);
      }
    };
    src.start(now);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.05);
  }

  /** Pause menu: duck the bed; engine and water fall silent through engine(active=false). */
  setPaused(p: boolean): void {
    this.paused = p;
    const bed = this.buses.bed;
    if (bed && this.ctx) bed.gain.setTargetAtTime(p ? 0.5 : 1, this.ctx.currentTime, 0.15);
  }

  /** speed 0..1, airborne silences the hull water and revs the engine. */
  engine(speed01: number, throttle: number, airborne: boolean, boosting: boolean, active: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const on = active && !this.paused;
    const thr = Math.max(0, throttle);
    const rev = airborne ? 0.85 + thr * 0.3 : speed01 * 0.75 + thr * 0.25;
    const eng = this.loops.get('engine');
    if (eng) {
      // Recorded at a steady mid rpm: idle ~0.75x, flat out ~1.6x, boost a touch more.
      const rate = 0.75 + rev * 0.85 + (boosting ? 0.12 : 0);
      eng.src.playbackRate.setTargetAtTime(rate, now, airborne ? 0.06 : 0.1);
      const level = on ? 0.45 + Math.min(1, rev) * 0.55 : 0;
      eng.gain.gain.setTargetAtTime(eng.full * level, now, 0.1);
    }
    const water = this.loops.get('water-rush');
    if (water) {
      const level = on && !airborne ? Math.min(1, speed01 * 1.1) : 0;
      water.gain.gain.setTargetAtTime(water.full * level, now, airborne ? 0.04 : 0.08);
      water.src.playbackRate.setTargetAtTime(0.9 + speed01 * 0.25, now, 0.1);
      if (this.waterFilter) this.waterFilter.frequency.setTargetAtTime(900 - speed01 * 500, now, 0.1);
    }
  }

  /** Hull slaps the water. power ~2 (small hop) .. 14 (big air). Alternates two takes. */
  splash(power: number): void {
    const p = Math.min(1, Math.max(0, (power - 2) / 10));
    const id: CueId = this.splashTurn++ % 2 === 0 ? 'land-splash' : 'land-splash-2';
    this.play(id, { gainDb: -9 + p * 9, rate: 1.06 - p * 0.12 });
  }

  /** Rider thrown into the sea: the crash plus a heavy, pitched-down slap under it. */
  wipeout(): void {
    this.play('wipeout');
    this.play('land-splash-2', { gainDb: -3, rate: 0.82 });
  }

  /** Hull leaves the water (ramp lip, swell crest or pop). */
  launch(power: number): void {
    const p = Math.min(1, Math.max(0, power / 8));
    this.play('launch', { gainDb: -6 + p * 6, rate: 1.05 - p * 0.1 });
  }

  /** Ski-to-ski contact involving the player. */
  bump(strength: number): void {
    const p = Math.min(1, Math.max(0, strength / 5));
    this.play('bump', { gainDb: -6 + p * 6 });
    this.splash(3 + strength * 1.2);
  }

  ring(air: boolean): void {
    this.play('ring', { rate: air ? 1.26 : 1, vary: false });
  }

  gate(): void {
    this.play('gate');
  }

  countdown(): void {
    this.play('countdown', { vary: false });
  }

  go(): void {
    this.play('go', { vary: false });
  }

  /** Lap complete; a longer fanfare for a new best. */
  fanfare(best: boolean): void {
    this.play(best ? 'lap-best' : 'lap', { vary: false });
  }

  finish(won: boolean): void {
    // The last lap's jingle fires on the same frame; the finish fanfare replaces it.
    this.stopAll(['lap', 'lap-best']);
    this.play(won ? 'finish-win' : 'finish', { vary: false });
  }

  click(): void {
    this.play('ui-click');
  }

  /** Ring and gate feedback (kept for older call sites). */
  chime(high: boolean): void {
    if (high) this.ring(true);
    else this.gate();
  }

  /** Restart: cut every one-shot still ringing. Loops keep running and follow engine(). */
  stopAll(only?: CueId[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [id, list] of this.voices) {
      if (only && !only.includes(id)) continue;
      for (const v of list) {
        try {
          v.src.stop();
        } catch {
          // already stopped
        }
      }
      list.length = 0;
    }
  }

  dispose(): void {
    for (const l of this.loops.values()) {
      try {
        l.src.stop();
      } catch {
        // already stopped
      }
    }
    this.loops.clear();
    void this.ctx?.close();
    this.ctx = null;
  }
}
