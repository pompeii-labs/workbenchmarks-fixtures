// Tiny WebAudio synth for arcade blips. No audio files needed.
let ctx = null;
let master = null;
let muted = false;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.35;
  master.connect(ctx.destination);
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.35;
}
export const isMuted = () => muted;

function tone({ type = 'square', f0 = 440, f1 = f0, dur = 0.1, vol = 0.3, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let noiseBuf = null;
function noise({ dur = 0.08, vol = 0.3, freq = 1200, q = 1, delay = 0 }) {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur + 0.02);
}

export const sfx = {
  flipper: () => { noise({ dur: 0.05, vol: 0.5, freq: 400, q: 0.8 }); tone({ type: 'triangle', f0: 160, f1: 60, dur: 0.06, vol: 0.25 }); },
  flipperHit: () => noise({ dur: 0.06, vol: 0.5, freq: 900, q: 1.5 }),
  bumper: (id = 0) => { const b = [880, 990, 1175][id % 3]; tone({ f0: b, f1: b / 2, dur: 0.14, vol: 0.22 }); tone({ type: 'sine', f0: b * 2, f1: b, dur: 0.08, vol: 0.12 }); },
  sling: () => { tone({ type: 'sawtooth', f0: 520, f1: 260, dur: 0.07, vol: 0.18 }); noise({ dur: 0.04, vol: 0.3, freq: 2000 }); },
  wall: (s = 20) => noise({ dur: 0.03, vol: Math.min(0.25, s / 200), freq: 2500, q: 2 }),
  post: () => tone({ type: 'triangle', f0: 1400, f1: 900, dur: 0.05, vol: 0.12 }),
  target: () => { tone({ f0: 660, f1: 660, dur: 0.06, vol: 0.2 }); tone({ f0: 1320, f1: 1320, dur: 0.1, vol: 0.15, delay: 0.05 }); },
  rollover: () => tone({ type: 'square', f0: 600, f1: 1800, dur: 0.12, vol: 0.15 }),
  laneComplete: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f0: f, f1: f, dur: 0.1, vol: 0.18, delay: i * 0.07 })),
  bonus: () => [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'triangle', f0: f, f1: f * 1.01, dur: 0.12, vol: 0.2, delay: i * 0.06 })),
  plungerPull: () => noise({ dur: 0.15, vol: 0.08, freq: 300 }),
  launch: (p = 1) => { noise({ dur: 0.25, vol: 0.2 + p * 0.3, freq: 600, q: 0.6 }); tone({ type: 'sawtooth', f0: 120, f1: 400 + p * 400, dur: 0.18, vol: 0.12 }); },
  drain: () => [440, 370, 311, 220].forEach((f, i) => tone({ type: 'sawtooth', f0: f, f1: f * 0.97, dur: 0.18, vol: 0.15, delay: i * 0.14 })),
  save: () => [880, 1175, 880, 1175].forEach((f, i) => tone({ f0: f, f1: f, dur: 0.07, vol: 0.15, delay: i * 0.08 })),
  start: () => [392, 523, 659, 784, 659, 784].forEach((f, i) => tone({ f0: f, f1: f, dur: 0.09, vol: 0.16, delay: i * 0.08 })),
  gameOver: () => [523, 494, 466, 440, 415, 392].forEach((f, i) => tone({ type: 'triangle', f0: f, f1: f, dur: 0.2, vol: 0.2, delay: i * 0.16 })),
  highScore: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone({ f0: f, f1: f, dur: 0.12, vol: 0.18, delay: 1.1 + i * 0.09 })),
};
