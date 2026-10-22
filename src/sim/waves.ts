// Ocean swell model shared by the simulation (TS) and the water shader (GLSL).
// Swells roll toward the shore (+x). Their front faces rise as they approach,
// so a dolphin heading seaward (-x) up a rising face gets a ramp + lift boost.

export interface WaveComponent {
  dirX: number;
  dirZ: number;
  amp: number;
  k: number; // wavenumber 2π/λ
  w: number; // angular frequency
  phase: number;
}

const G = 9.8;

function component(dx: number, dz: number, amp: number, wavelength: number, phase: number): WaveComponent {
  const len = Math.hypot(dx, dz);
  const k = (Math.PI * 2) / wavelength;
  return { dirX: dx / len, dirZ: dz / len, amp, k, w: Math.sqrt(G * k) * 0.9, phase };
}

export function createWaves(rng: () => number): WaveComponent[] {
  return [
    component(1, 0.12, 0.95, 28, rng() * Math.PI * 2),
    component(0.92, -0.38, 0.42, 15, rng() * Math.PI * 2),
    component(0.55, 0.83, 0.16, 7.5, rng() * Math.PI * 2),
  ];
}

export interface WaveSample {
  h: number; // surface height
  dhdt: number; // vertical surface velocity
  gx: number; // dh/dx
  gz: number; // dh/dz
}

const sample: WaveSample = { h: 0, dhdt: 0, gx: 0, gz: 0 };

/** Calm the swell near the beach so the shoreline reads clearly. */
export function shoreDamp(x: number): number {
  const t = Math.min(Math.max((x - 22) / 16, 0), 1);
  return 1 - t * 0.75;
}

export function sampleWaves(waves: WaveComponent[], x: number, z: number, t: number, out: WaveSample = sample): WaveSample {
  let h = 0;
  let dhdt = 0;
  let gx = 0;
  let gz = 0;
  for (const c of waves) {
    const arg = c.k * (c.dirX * x + c.dirZ * z) - c.w * t + c.phase;
    const s = Math.sin(arg);
    const co = Math.cos(arg);
    h += c.amp * s;
    dhdt += -c.amp * c.w * co;
    gx += c.amp * c.k * c.dirX * co;
    gz += c.amp * c.k * c.dirZ * co;
  }
  const d = shoreDamp(x);
  out.h = h * d;
  out.dhdt = dhdt * d;
  out.gx = gx * d;
  out.gz = gz * d;
  return out;
}

export function waveHeight(waves: WaveComponent[], x: number, z: number, t: number): number {
  return sampleWaves(waves, x, z, t, { h: 0, dhdt: 0, gx: 0, gz: 0 }).h;
}

export const MAX_WAVE_AMP = 0.95 + 0.42 + 0.16;
