/**
 * One wave table drives both the physics (TypeScript) and the water mesh
 * (GLSL generated from the same numbers), so what you see is what you ride.
 *
 * Each wave is a sharpened travelling sine: h = A * (2 * u^s - 1),
 * u = (sin(theta) + 1) / 2, theta = k * dot(dir, p) - omega * t + phase.
 * Sharpness s > 1 makes narrow crests and broad troughs, which reads as chop.
 */
export interface Wave {
  dirX: number;
  dirZ: number;
  k: number;
  omega: number;
  amp: number;
  sharp: number;
  phase: number;
}

const G = 9.81;

function wave(dx: number, dz: number, wavelength: number, amp: number, sharp: number, phase: number): Wave {
  const len = Math.hypot(dx, dz);
  const k = (Math.PI * 2) / wavelength;
  // Deep-water dispersion: long swells travel faster than short chop.
  const omega = Math.sqrt(G * k);
  return { dirX: dx / len, dirZ: dz / len, k, omega, amp, sharp, phase };
}

/** Long swells: the ramps. */
export const SWELLS: Wave[] = [
  wave(0.18, 1, 46, 1.45, 2.3, 0.0),
  wave(-0.6, 0.8, 35, 0.85, 2.0, 1.7),
  wave(0.85, 0.5, 63, 0.7, 1.6, 4.1),
];

/** Chop: short, busy, sharp-crested. */
export const CHOP: Wave[] = [
  wave(1, 0.35, 9.5, 0.22, 1.7, 0.6),
  wave(-0.35, 1, 7.1, 0.17, 1.6, 2.2),
  wave(0.7, -0.7, 5.3, 0.12, 1.5, 3.9),
  wave(-1, -0.25, 3.7, 0.08, 1.4, 5.3),
  wave(0.3, -0.95, 2.6, 0.05, 1.3, 0.9),
];

export const WAVES: Wave[] = [...SWELLS, ...CHOP];

/** Surface height at world (x, z) and time t. */
export function waveHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (let i = 0; i < WAVES.length; i += 1) {
    const w = WAVES[i];
    const theta = w.k * (w.dirX * x + w.dirZ * z) - w.omega * t + w.phase;
    const u = (Math.sin(theta) + 1) * 0.5;
    h += w.amp * (2 * Math.pow(u, w.sharp) - 1);
  }
  return h;
}

/** Height of the swells only (used to pick spots and for HUD hints). */
export function swellHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (const w of SWELLS) {
    const theta = w.k * (w.dirX * x + w.dirZ * z) - w.omega * t + w.phase;
    const u = (Math.sin(theta) + 1) * 0.5;
    h += w.amp * (2 * Math.pow(u, w.sharp) - 1);
  }
  return h;
}

export const MAX_SWELL = SWELLS.reduce((sum, w) => sum + w.amp, 0);

function f(n: number): string {
  const s = n.toFixed(6);
  return s.includes('.') ? s : `${s}.0`;
}

/**
 * GLSL: `vec3 waveSample(vec2 p, float t)` returns (height, dh/dx, dh/dz).
 * `minWavelength` lets the vertex stage skip waves its grid cannot resolve;
 * the fragment stage adds them back as normal detail.
 */
export function waveGlsl(name: string, waves: Wave[]): string {
  const lines = waves.map((w) => {
    return `  {
    float th = ${f(w.k)} * dot(vec2(${f(w.dirX)}, ${f(w.dirZ)}), p) - ${f(w.omega)} * t + ${f(w.phase)};
    float s = sin(th);
    float u = max((s + 1.0) * 0.5, 1e-5);
    float pw = pow(u, ${f(w.sharp - 1)});
    r.x += ${f(w.amp)} * (2.0 * pw * u - 1.0);
    float d = ${f(w.amp * w.sharp * w.k)} * pw * cos(th);
    r.y += d * ${f(w.dirX)};
    r.z += d * ${f(w.dirZ)};
  }`;
  });
  return `vec3 ${name}(vec2 p, float t) {
  vec3 r = vec3(0.0);
${lines.join('\n')}
  return r;
}`;
}
