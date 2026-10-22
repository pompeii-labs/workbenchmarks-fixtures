// Tiny synthesized sound kit (no audio files needed).
export function createAudio() {
  let ctx = null, master = null, noiseBuf = null, muted = false, surf = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    // ambient surf: looping brown noise, gently swelling
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = ctx.createGain(); g.gain.value = 0.12;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.07;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(); lfo.start();
    surf = g;
  }

  function noise(dur, freq, vol, type = 'lowpass', sweepTo = null) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, vol = 0.15, type = 'sine', delay = 0, slideTo = null) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
  return {
    init,
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.6; return muted; },
    get muted() { return muted; },
    launch(power) { noise(0.5, 900, 0.35 * power + 0.1, 'bandpass', 3000); },
    splash(size) { noise(0.35 + size * 0.5, 1800, 0.25 + size * 0.45, 'lowpass', 300); },
    trick(n) { const f = PENTA[Math.min(n, PENTA.length - 1)]; tone(f, 0.35, 0.12, 'triangle'); tone(f * 2, 0.25, 0.04, 'sine', 0.03); },
    land(grade) {
      if (grade >= 3) [0, 2, 4, 5].forEach((k, i) => tone(PENTA[k], 0.4, 0.1, 'triangle', i * 0.07));
      else if (grade >= 1) [0, 2].forEach((k, i) => tone(PENTA[k], 0.3, 0.08, 'triangle', i * 0.08));
      else tone(180, 0.4, 0.12, 'sine', 0, 90);
    },
    chirp() { tone(1800, 0.12, 0.05, 'sine', 0, 3200); tone(2400, 0.1, 0.04, 'sine', 0.13, 3600); },
    hoop() { tone(1046.5, 0.25, 0.1, 'sine'); tone(1568, 0.4, 0.08, 'sine', 0.06); },
  };
}
