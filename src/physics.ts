// Physics models used by the interactive figures.
// Everything here is plain math so it can be checked from Node (scripts/check-physics.ts).

export const h = 6.62607015e-34; // Planck constant, J s
export const c = 2.99792458e8; // speed of light, m/s
export const kB = 1.380649e-23; // Boltzmann constant, J/K
export const q = 1.602176634e-19; // elementary charge, C
export const T_SUN = 5772; // effective temperature of the photosphere, K
export const SI_GAP = 1.12; // silicon band gap at room temperature, eV

/** Photon energy in eV for a wavelength in nm (E = hc / lambda). */
export const eV = (nm: number) => (h * c) / (nm * 1e-9) / q;
export const nmFromEV = (e: number) => (h * c) / (e * q) / 1e-9;

const DILUTION = (6.957e8 / 1.496e11) ** 2; // (R_sun / 1 AU)^2

/** Blackbody spectral irradiance at Earth's distance, W m^-2 nm^-1. */
export function sunAboveAtmosphere(nm: number): number {
  const l = nm * 1e-9;
  const x = (h * c) / (l * kB * T_SUN);
  const radiance = (2 * Math.PI * h * c * c) / l ** 5 / Math.expm1(x); // W m^-2 m^-1 at the surface
  return radiance * DILUTION * 1e-9;
}

// A simplified clear-sky transmission (air mass 1.5): Rayleigh + aerosol
// scattering, the ozone UV cut-off, and the main O2 / H2O / CO2 bands.
// It reproduces the shape of the standard AM1.5 spectrum, not its fine detail.
const BANDS: [number, number, number][] = [
  // centre nm, width nm (sigma), peak absorbed fraction
  [590, 45, 0.04], // ozone (Chappuis)
  [687, 3, 0.25], // O2 B
  [720, 9, 0.35], // H2O
  [762, 3, 0.75], // O2 A
  [820, 12, 0.3], // H2O
  [940, 26, 0.75], // H2O
  [1130, 30, 0.85], // H2O
  [1390, 50, 0.99], // H2O
  [1880, 70, 0.99], // H2O
  [2700, 140, 0.99], // H2O + CO2
];
function transmission(nm: number): number {
  const um = nm / 1000;
  const m = 1.5;
  const rayleigh = 0.008569 * um ** -4 * (1 + 0.0113 * um ** -2 + 0.00013 * um ** -4);
  const aerosol = 0.084 * (um / 0.5) ** -1.3;
  let t = Math.exp(-m * (rayleigh + aerosol));
  t *= 1 / (1 + Math.exp(-(nm - 305) / 7)); // ozone Hartley/Huggins cut-off
  for (const [c0, w, d] of BANDS) t *= 1 - d * Math.exp(-0.5 * ((nm - c0) / w) ** 2);
  return t;
}

export interface Spectrum {
  nm: Float64Array; // wavelength grid
  top: Float64Array; // above atmosphere, W m^-2 nm^-1
  ground: Float64Array; // at the ground, scaled to 1000 W/m^2 total
  topTotal: number;
  groundTotal: number;
}

let cached: Spectrum | null = null;
export function spectrum(): Spectrum {
  if (cached) return cached;
  const lo = 250, hi = 4000, step = 1;
  const n = Math.round((hi - lo) / step) + 1;
  const nm = new Float64Array(n), top = new Float64Array(n), ground = new Float64Array(n);
  let topSum = 0, gSum = 0;
  for (let i = 0; i < n; i++) {
    const l = lo + i * step;
    nm[i] = l;
    top[i] = sunAboveAtmosphere(l);
    ground[i] = top[i] * transmission(l);
    topSum += top[i] * step;
    gSum += ground[i] * step;
  }
  // The measured AM1.5 "global" spectrum (direct + sky light) is defined to total 1000 W/m^2.
  const k = 1000 / gSum;
  for (let i = 0; i < n; i++) ground[i] *= k;
  // Integrated blackbody beyond 4000 nm adds ~1%; report the full Stefan-Boltzmann total instead.
  const full = 5.670374419e-8 * T_SUN ** 4 * DILUTION;
  cached = { nm, top, ground, topTotal: Math.max(topSum, full), groundTotal: 1000 };
  return cached;
}

/** Fractions of ground-level power that are UV (<400), visible (400-700) and infrared (>700). */
export function bandFractions() {
  const s = spectrum();
  let uv = 0, vis = 0, ir = 0;
  for (let i = 0; i < s.nm.length; i++) {
    const p = s.ground[i];
    if (s.nm[i] < 400) uv += p; else if (s.nm[i] <= 700) vis += p; else ir += p;
  }
  const t = uv + vis + ir;
  return { uv: uv / t, vis: vis / t, ir: ir / t };
}

/** Ground-level photon flux per nm (photons m^-2 s^-1 nm^-1). */
export function photonFlux(i: number): number {
  const s = spectrum();
  const E = (h * c) / (s.nm[i] * 1e-9);
  return s.ground[i] / E;
}

export function totalPhotonFlux(): number {
  const s = spectrum();
  let n = 0;
  for (let i = 0; i < s.nm.length; i++) n += photonFlux(i);
  return n;
}

export interface GapBudget {
  notAbsorbed: number; // fraction of power in photons below the gap
  heat: number; // fraction lost by thermalisation (E - Eg per photon)
  kept: number; // Eg x (number of absorbed photons) / incident power  ("ultimate efficiency")
  sq: number; // detailed-balance (Shockley-Queisser) limit
  voc: number; // detailed-balance open-circuit voltage, V
  jsc: number; // A/m^2
}

/** Energy budget for an ideal single-gap cell at 300 K under the ground spectrum. */
export function gapBudget(gapEV: number, cellT = 300): GapBudget {
  const s = spectrum();
  let pBelow = 0, pAbove = 0, nAbove = 0;
  for (let i = 0; i < s.nm.length; i++) {
    const e = eV(s.nm[i]);
    if (e >= gapEV) { pAbove += s.ground[i]; nAbove += photonFlux(i); }
    else pBelow += s.ground[i];
  }
  const P = pBelow + pAbove;
  const keptW = nAbove * gapEV * q;
  const jsc = q * nAbove;
  // Dark saturation current from the cell's own thermal (black-body) emission above the gap.
  const kT = kB * cellT;
  const Eg = gapEV * q;
  let j0 = 0;
  const steps = 400;
  const eMax = Eg + 40 * kT;
  const dE = (eMax - Eg) / steps;
  for (let k = 0; k <= steps; k++) {
    const E = Eg + k * dE;
    const w = k === 0 || k === steps ? 0.5 : 1;
    j0 += w * (E * E) / Math.expm1(E / kT) * dE;
  }
  j0 *= q * (2 * Math.PI) / (h ** 3 * c ** 2);
  const vt = kT / q;
  const voc = vt * Math.log(jsc / j0 + 1);
  // maximise P = V (Jsc - J0 (e^{V/vt} - 1))
  let best = 0;
  for (let k = 0; k <= 600; k++) {
    const V = (voc * k) / 600;
    const p = V * (jsc - j0 * Math.expm1(V / vt));
    if (p > best) best = p;
  }
  return { notAbsorbed: pBelow / P, heat: (pAbove - keptW) / P, kept: keptW / P, sq: best / P, voc, jsc };
}

let sqCurve: { gap: number; sq: number; kept: number }[] | null = null;
export function sqCurveData() {
  if (sqCurve) return sqCurve;
  sqCurve = [];
  for (let g = 0.5; g <= 2.5001; g += 0.02) {
    const b = gapBudget(g);
    sqCurve.push({ gap: g, sq: b.sq, kept: b.kept });
  }
  return sqCurve;
}

// Absorption coefficient of crystalline silicon at 300 K (cm^-1), rounded from M. A. Green,
// "Self-consistent optical parameters of intrinsic silicon at 300 K" (2008).
export const SI_ALPHA: [number, number][] = [
  [300, 1.73e6], [350, 1.04e6], [370, 6.9e5], [400, 9.52e4], [450, 2.55e4], [500, 1.11e4],
  [550, 6.39e3], [600, 4.14e3], [650, 2.81e3], [700, 1.9e3], [750, 1.3e3], [800, 8.5e2],
  [850, 5.35e2], [900, 3.06e2], [950, 1.57e2], [1000, 6.4e1], [1050, 1.63e1], [1100, 3.5],
  [1150, 2.2e-1], [1200, 2.2e-2],
];

/** Depth (in metres) at which ~63% (1 - 1/e) of light of this wavelength has been absorbed. */
export function absorptionDepth(nm: number): number {
  const t = SI_ALPHA;
  if (nm <= t[0][0]) return 1e-2 / t[0][1];
  for (let i = 0; i < t.length - 1; i++) {
    const [l0, a0] = t[i], [l1, a1] = t[i + 1];
    if (nm <= l1) {
      const f = (nm - l0) / (l1 - l0);
      const a = Math.exp(Math.log(a0) + f * (Math.log(a1) - Math.log(a0)));
      return 1e-2 / a;
    }
  }
  return 1e-2 / t[t.length - 1][1];
}

// ---- A real-world silicon cell: single-diode model -------------------------------------------
// A standard 15.6 cm square cell (about 243 cm^2): ~9.6 A short-circuit current and ~0.68 V
// open-circuit voltage at 1000 W/m^2 and 25 C, which gives ~21% efficiency.
export const CELL_AREA = 0.0243; // m^2
const ISC_REF = 9.6, VOC_REF = 0.68, N_IDEAL = 1.1, RS = 0.003, T_REF = 298.15;
const VT_REF = (kB * T_REF) / q;
const I0_REF = ISC_REF / Math.expm1(VOC_REF / (N_IDEAL * VT_REF));

export interface CellState { il: number; i0: number; nvt: number; rs: number }

export function cellState(irradiance: number, tempC: number): CellState {
  const T = tempC + 273.15;
  const il = ISC_REF * (irradiance / 1000) * (1 + 0.0005 * (tempC - 25));
  const i0 = I0_REF * (T / T_REF) ** 3 * Math.exp(((SI_GAP * q) / (N_IDEAL * kB)) * (1 / T_REF - 1 / T));
  return { il, i0, nvt: (N_IDEAL * kB * T) / q, rs: RS };
}

/** Terminal voltage of one cell carrying current I (explicit because shunt is neglected). */
export function cellV(s: CellState, I: number): number {
  if (I >= s.il) return -I * s.rs; // at or past the light current
  return s.nvt * Math.log((s.il - I) / s.i0 + 1) - I * s.rs;
}

export function cellVoc(s: CellState) { return s.il <= 0 ? 0 : s.nvt * Math.log(s.il / s.i0 + 1); }

/** Short-circuit current, solving V(I) = 0. */
export function cellIsc(s: CellState): number {
  if (s.il <= 0) return 0;
  let lo = 0, hi = s.il;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (cellV(s, m) > 0) lo = m; else hi = m; }
  return lo;
}

/** Operating point with a resistive load R (ohms) across `n` cells in series. */
export function operatingPoint(s: CellState, R: number, n = 1) {
  const isc = cellIsc(s);
  let lo = 0, hi = isc;
  for (let k = 0; k < 80; k++) {
    const m = (lo + hi) / 2;
    if (n * cellV(s, m) > m * R) lo = m; else hi = m;
  }
  const I = lo;
  return { I, V: n * cellV(s, I) };
}

export function maxPower(s: CellState, n = 1) {
  const isc = cellIsc(s);
  let best = { I: 0, V: 0, P: 0 };
  for (let k = 0; k <= 2000; k++) {
    const I = (isc * k) / 2000;
    const V = n * cellV(s, I);
    if (V * I > best.P) best = { I, V, P: V * I };
  }
  return best;
}
