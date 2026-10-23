// Single source of truth for the ocean surface.
// The same wave set drives the GPU water mesh (GLSL generated below) and the
// CPU physics (waveHeight), so the jet ski rides exactly what you see.

const G = 9.81;

// [direction (rad), wavelength (m), amplitude (m), speed multiplier, phase, sharp crest, swell (envelope-modulated)]
const DEFS = [
  [0.35, 72, 1.75, 0.9, 0.0, 1, 1],
  [-0.6, 46, 1.05, 0.95, 1.7, 1, 1],
  [1.25, 25, 0.42, 1.0, 4.1, 1, 0],
  [2.6, 14, 0.2, 1.0, 2.3, 0, 0],
  [-2.05, 8.6, 0.12, 1.0, 5.2, 0, 0],
  [0.95, 5.3, 0.07, 1.0, 0.7, 0, 0],
];

export const WAVES = DEFS.map(([a, len, amp, sm, ph, sharp, swell]) => {
  const k = (2 * Math.PI) / len;
  return { dx: Math.cos(a), dz: Math.sin(a), k, amp, w: Math.sqrt(G * k) * sm, ph, sharp: !!sharp, swell: !!swell };
});

// Slowly drifting envelope that makes patches of the sea much bigger than others.
export function swellEnvelope(x, z, t) {
  const e = 0.72 + 0.33 * Math.sin(0.0105 * x - 0.0042 * z + 0.06 * t) + 0.25 * Math.sin(-0.0051 * x + 0.0093 * z - 0.045 * t);
  return Math.max(0.15, e);
}

export function waveHeight(x, z, t) {
  const env = swellEnvelope(x, z, t);
  let h = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    let s = Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t + w.ph);
    if (w.sharp) {
      const u = 0.5 + 0.5 * s;
      s = 2 * u * u - 0.75; // peaky crests, flat troughs, zero mean
    }
    h += w.amp * s * (w.swell ? env : 1);
  }
  return h;
}

const f = (n) => n.toFixed(6);

export const WAVE_GLSL = /* glsl */ `
float waveEnvelope(vec2 p, float t) {
  return max(0.15, 0.72 + 0.33 * sin(0.0105 * p.x - 0.0042 * p.y + 0.06 * t) + 0.25 * sin(-0.0051 * p.x + 0.0093 * p.y - 0.045 * t));
}
float waveHeight(vec2 p, float t) {
  float env = waveEnvelope(p, t);
  float h = 0.0;
  float s;
  float u;
${WAVES.map(
  (w) =>
    `  s = sin(${f(w.k * w.dx)} * p.x + ${f(w.k * w.dz)} * p.y - ${f(w.w)} * t + ${f(w.ph)});\n` +
    (w.sharp ? `  u = 0.5 + 0.5 * s; s = 2.0 * u * u - 0.75;\n` : '') +
    `  h += ${f(w.amp)} * s${w.swell ? ' * env' : ''};`
).join('\n')}
  return h;
}
`;
