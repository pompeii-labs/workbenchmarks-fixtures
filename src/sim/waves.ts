// Shared swell model. The simulation samples it in TypeScript and the water
// shader evaluates the identical sum in GLSL, so what you see is what you ride.

export interface Swell {
  amp: number;
  dirX: number;
  dirZ: number;
  k: number; // wavenumber (2π / wavelength)
  w: number; // angular frequency
  phase: number;
}

function swell(amp: number, dx: number, dz: number, wavelength: number, phase: number): Swell {
  const len = Math.hypot(dx, dz);
  const k = (Math.PI * 2) / wavelength;
  return { amp, dirX: dx / len, dirZ: dz / len, k, w: Math.sqrt(9.8 * k), phase };
}

// Swells roll in toward the shore (+x) at a slant; a small chop crosses them.
export const SWELLS: Swell[] = [
  swell(0.95, 1, -0.38, 27, 0),
  swell(0.48, 0.72, 0.69, 14.5, 1.7),
  swell(0.2, 0.18, -1, 7.2, 4.1),
];

export interface SurfaceSample {
  h: number; // height
  dhdt: number; // vertical surface velocity (positive = rising)
  gx: number; // slope dh/dx
  gz: number; // slope dh/dz
}

export function sampleSurface(x: number, z: number, t: number, out: SurfaceSample): SurfaceSample {
  let h = 0;
  let dhdt = 0;
  let gx = 0;
  let gz = 0;
  for (const s of SWELLS) {
    const arg = s.k * (s.dirX * x + s.dirZ * z) - s.w * t + s.phase;
    const sn = Math.sin(arg);
    const cs = Math.cos(arg);
    h += s.amp * sn;
    dhdt += -s.amp * s.w * cs;
    gx += s.amp * s.k * s.dirX * cs;
    gz += s.amp * s.k * s.dirZ * cs;
  }
  out.h = h;
  out.dhdt = dhdt;
  out.gx = gx;
  out.gz = gz;
  return out;
}

export function swellGlsl(): string {
  const terms = SWELLS.map(
    (s) =>
      `{ float a = ${s.k.toFixed(5)} * dot(vec2(${s.dirX.toFixed(5)}, ${s.dirZ.toFixed(5)}), p) - ${s.w.toFixed(5)} * t + ${s.phase.toFixed(5)};
     h += ${s.amp.toFixed(5)} * sin(a);
     g += ${(s.amp * s.k).toFixed(5)} * vec2(${s.dirX.toFixed(5)}, ${s.dirZ.toFixed(5)}) * cos(a); }`,
  ).join('\n    ');
  return `
  vec3 swellSample(vec2 p, float t) {
    float h = 0.0;
    vec2 g = vec2(0.0);
    ${terms}
    return vec3(h, g);
  }`;
}
