export function createAudio() {
  let context, engine, engineGain, filter, waterGain, master;
  let enabled = false;
  function initialize() {
    if (context) return;
    context = new (window.AudioContext || window.webkitAudioContext)();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    engine = context.createOscillator();
    engine.type = "sawtooth";
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 250;
    engine.connect(filter).connect(engineGain).connect(master);
    engine.start();
    const buffer = context.createBuffer(
      1,
      context.sampleRate * 2,
      context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const waterFilter = context.createBiquadFilter();
    waterFilter.type = "lowpass";
    waterFilter.frequency.value = 1800;
    waterGain = context.createGain();
    waterGain.gain.value = 0;
    noise.connect(waterFilter).connect(waterGain).connect(master);
    noise.start();
  }
  return {
    get enabled() {
      return enabled;
    },
    toggle() {
      initialize();
      enabled = !enabled;
      context.resume();
      master.gain.setTargetAtTime(
        enabled ? 0.35 : 0,
        context.currentTime,
        0.15,
      );
      return enabled;
    },
    update(ride, active) {
      if (!context) return;
      const t = context.currentTime;
      engine.frequency.setTargetAtTime(
        40 + ride.speed * 3.5 + (ride.boosting ? 24 : 0),
        t,
        0.1,
      );
      engineGain.gain.setTargetAtTime(
        active ? 0.025 + ride.speed * 0.0015 : 0,
        t,
        0.1,
      );
      filter.frequency.setTargetAtTime(160 + ride.speed * 12, t, 0.1);
      waterGain.gain.setTargetAtTime(
        active ? (ride.airborne ? 0.018 : 0.025 + ride.speed * 0.002) : 0.008,
        t,
        0.15,
      );
    },
    splash() {
      if (!enabled || !context) return;
      const now = context.currentTime;
      waterGain.gain.cancelScheduledValues(now);
      waterGain.gain.setValueAtTime(0.32, now);
      waterGain.gain.exponentialRampToValueAtTime(0.05, now + 0.5);
    },
    chime() {
      if (!enabled || !context) return;
      [523.25, 659.25, 783.99].forEach((frequency, i) => {
        const osc = context.createOscillator(),
          gain = context.createGain(),
          time = context.currentTime + i * 0.09;
        osc.type = "sine";
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.15, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
        osc.connect(gain).connect(master);
        osc.start(time);
        osc.stop(time + 0.6);
      });
    },
  };
}
