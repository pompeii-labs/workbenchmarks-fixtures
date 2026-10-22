// Shared wave model. The same formula runs on the CPU (physics) and the GPU
// (ocean shader), so the dolphin rides exactly the surface you see.

const raw = [
  // dx, dz: travel direction. Main swells roll diagonally toward the shore and toward the player.
  { dx: -0.45, dz: 1.0, len: 32, amp: 1.2, phase: 0.0, speed: 0.95 },
  { dx: -0.85, dz: 0.6, len: 19, amp: 0.5, phase: 1.7, speed: 1.0 },
  { dx: 0.25, dz: 1.0, len: 11, amp: 0.2, phase: 4.1, speed: 1.0 },
];

export const WAVES = raw.map((w) => {
  const l = Math.hypot(w.dx, w.dz);
  const k = (Math.PI * 2) / w.len;
  return { dx: w.dx / l, dz: w.dz / l, k, amp: w.amp, phase: w.phase, omega: Math.sqrt(9.8 * k) * w.speed };
});

export const SHORE_X = -58; // where sand meets sea level

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function shoreFactor(x) {
  return 0.35 + 0.65 * smoothstep(-75, -25, x);
}

export function waveHeight(x, z, t) {
  let h = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    const th = w.k * (w.dx * x + w.dz * z) - w.omega * t + w.phase;
    const s = (Math.sin(th) + 1) * 0.5;
    h += w.amp * (2 * s * s - 0.75); // peaky crests, flat troughs
  }
  return h * shoreFactor(x);
}

// Vertical speed of the surface as felt by something moving with horizontal velocity (vx, vz).
// Positive = the water under you is pushing you up (you're climbing the face of a swell).
export function waveLift(x, z, t, vx, vz) {
  const e = 0.05;
  const dt = (waveHeight(x, z, t + e) - waveHeight(x, z, t - e)) / (2 * e);
  const gx = (waveHeight(x + e, z, t) - waveHeight(x - e, z, t)) / (2 * e);
  const gz = (waveHeight(x, z + e, t) - waveHeight(x, z - e, t)) / (2 * e);
  return dt + gx * vx + gz * vz;
}

export function waveSlope(x, z, t, dirX, dirZ) {
  const e = 0.3;
  return (waveHeight(x + dirX * e, z + dirZ * e, t) - waveHeight(x - dirX * e, z - dirZ * e, t)) / (2 * e);
}

const f = (n) => n.toFixed(5);
export const waveGLSL = /* glsl */ `
float shoreFactor(float x){ return 0.35 + 0.65 * smoothstep(-75.0, -25.0, x); }
float waveH(vec2 p, float t){
  float h = 0.0; float th; float s;
${WAVES.map(
  (w) => `  th = ${f(w.k)} * (${f(w.dx)} * p.x + ${f(w.dz)} * p.y) - ${f(w.omega)} * t + ${f(w.phase)};
  s = (sin(th) + 1.0) * 0.5; h += ${f(w.amp)} * (2.0 * s * s - 0.75);`
).join('\n')}
  return h * shoreFactor(p.x);
}
`;
