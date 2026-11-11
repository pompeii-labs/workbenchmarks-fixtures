// The physics behind every figure on the page lives here, free of any DOM code,
// so it can be unit-tested (see test/physics.test.ts).
import { AM0, AM15G, BIN_START, BIN_WIDTH } from './data/am15.ts';

export const H = 6.62607015e-34; // Planck constant, J s
export const C = 299792458; // speed of light, m/s
export const Q = 1.602176634e-19; // elementary charge, C
export const KB = 1.380649e-23; // Boltzmann constant, J/K
/** hc expressed in eV nm: photon energy (eV) = HC_EV_NM / wavelength (nm). */
export const HC_EV_NM = (H * C) / Q * 1e9; // ~1239.84

export const SILICON_GAP_EV = 1.12;

export const photonEnergyEv = (nm: number) => HC_EV_NM / nm;
export const wavelengthNm = (ev: number) => HC_EV_NM / ev;

/** Planck black-body spectral radiance scaled to the sun seen from Earth, W/m^2/nm. */
export function blackbodySun(nm: number, T = 5772): number {
  const l = nm * 1e-9;
  const radiance = (2 * H * C * C) / l ** 5 / Math.expm1((H * C) / (l * KB * T)); // W/m^2/m/sr
  const solidAngle = Math.PI * (6.957e8 / 1.495978707e11) ** 2; // sun's disc from 1 au
  return radiance * solidAngle * 1e-9;
}

export interface Bin { nm: number; am0: number; am15: number }
/** The reference spectra as 5 nm bins (centre wavelength, W/m^2/nm). */
export const SPECTRUM: Bin[] = AM15G.map((g, i) => ({
  nm: BIN_START + BIN_WIDTH * (i + 0.5),
  am0: AM0[i],
  am15: g,
}));

export function spectrumAt(nm: number, which: 'am0' | 'am15'): number {
  const i = Math.floor((nm - BIN_START) / BIN_WIDTH);
  if (i < 0 || i >= SPECTRUM.length) return 0;
  return SPECTRUM[i][which];
}

/** Total power in the spectrum, W/m^2. */
export function totalIrradiance(which: 'am0' | 'am15' = 'am15'): number {
  let s = 0;
  for (const b of SPECTRUM) s += b[which] * BIN_WIDTH;
  return s;
}

/** Photons per m^2 per second in the whole spectrum. */
export function totalPhotonFlux(which: 'am0' | 'am15' = 'am15'): number {
  let s = 0;
  for (const b of SPECTRUM) s += (b[which] * BIN_WIDTH) / (photonEnergyEv(b.nm) * Q);
  return s;
}

export interface Budget {
  gap: number;
  /** Fractions of the incoming sunlight power; they sum to 1. */
  belowGap: number; // photons too weak to lift an electron: pass through
  heat: number; // energy above the gap, shed as heat in picoseconds
  voltage: number; // unavoidable voltage / re-emission losses (detailed balance)
  electricity: number; // Shockley-Queisser limit
  /** Short-circuit current density at the limit, A/m^2, and best voltage, V. */
  jsc: number;
  vmp: number;
  voc: number;
}

/**
 * Where the energy of standard sunlight goes in an ideal single-junction cell
 * with the given band gap (Shockley & Queisser's detailed-balance limit, 1961):
 * every photon above the gap is absorbed and yields one electron; the only
 * recombination is the light the cell must itself emit at temperature T.
 */
export function energyBudget(gapEv: number, T = 298.15): Budget {
  const lg = wavelengthNm(gapEv);
  let pin = 0, below = 0, heat = 0, flux = 0;
  for (const b of SPECTRUM) {
    const lo = b.nm - BIN_WIDTH / 2, hi = b.nm + BIN_WIDTH / 2;
    const p = b.am15 * BIN_WIDTH;
    pin += p;
    // Share of this bin whose photons are above the gap (shorter than lg).
    const f = lg >= hi ? 1 : lg <= lo ? 0 : (lg - lo) / BIN_WIDTH;
    const nmEff = f === 1 || f === 0 ? b.nm : (lo + lg) / 2;
    const absorbed = p * f;
    below += p - absorbed;
    const ev = photonEnergyEv(nmEff);
    flux += absorbed / (ev * Q);
    heat += absorbed * (1 - gapEv / ev);
  }
  const jsc = flux * Q; // A/m^2
  // Radiative dark current: black-body photons above the gap emitted by the cell.
  const kT = (KB * T) / Q; // eV
  let integral = 0;
  const dE = 0.002;
  for (let e = gapEv + dE / 2; e < gapEv + 60 * kT; e += dE) integral += (e * e) / Math.expm1(e / kT) * dE;
  const j0 = Q * ((2 * Math.PI) / (H ** 3 * C ** 2)) * integral * Q ** 3; // eV^3 -> J^3
  const power = (v: number) => v * (jsc - j0 * Math.expm1(v / kT));
  const voc = kT * Math.log(jsc / j0 + 1);
  // Golden-section search for the maximum-power voltage.
  let a = 0, b2 = voc;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 60; i++) {
    const c1 = b2 - g * (b2 - a), c2 = a + g * (b2 - a);
    if (power(c1) > power(c2)) b2 = c2; else a = c1;
  }
  const vmp = (a + b2) / 2;
  const electricity = power(vmp) / pin;
  const usable = 1 - below / pin - heat / pin;
  return {
    gap: gapEv,
    belowGap: below / pin,
    heat: heat / pin,
    voltage: usable - electricity,
    electricity,
    jsc, vmp, voc,
  };
}

// ---------------------------------------------------------------------------
// A real-ish silicon cell: the single-diode model.
// ---------------------------------------------------------------------------
export const CELL = {
  areaM2: 0.182 * 0.182, // a common "M10" wafer, 182 mm square
  iscRef: 13.6, // A at 1000 W/m^2, 25 C
  vocRef: 0.705, // V at 1000 W/m^2, 25 C
  n: 1.05, // diode ideality factor
  rs: 0.0015, // series resistance, ohm
  alphaIsc: 0.0005, // +0.05 %/K
  gapEv: 1.2, // silicon gap extrapolated to 0 K, sets the temperature dependence
};

export interface IvPoint { v: number; i: number; p: number }
export interface IvCurve {
  points: IvPoint[];
  isc: number; voc: number;
  mpp: IvPoint;
  /** Operating point when a resistor of `ohms` is connected. */
  at(ohms: number): IvPoint;
}

export function ivCurve(irradiance: number, tempC: number): IvCurve {
  const T = tempC + 273.15, Tref = 298.15;
  const vt = (CELL.n * KB * T) / Q;
  const vtRef = (CELL.n * KB * Tref) / Q;
  const i0Ref = CELL.iscRef / Math.expm1(CELL.vocRef / vtRef);
  const i0 = i0Ref * (T / Tref) ** 3 * Math.exp((CELL.gapEv / CELL.n) * (Q / KB) * (1 / Tref - 1 / T));
  const il = CELL.iscRef * (irradiance / 1000) * (1 + CELL.alphaIsc * (tempC - 25));
  const voc = il > 0 ? vt * Math.log(il / i0 + 1) : 0;
  const iOfVd = (vd: number) => il - i0 * Math.expm1(vd / vt);
  const points: IvPoint[] = [];
  let mpp: IvPoint = { v: 0, i: 0, p: 0 };
  const N = 240;
  for (let k = 0; k <= N; k++) {
    // Sample more densely near the knee.
    const u = k / N;
    const vd = voc * (1 - (1 - u) ** 2.2);
    const i = iOfVd(vd);
    const v = vd - i * CELL.rs;
    if (v < 0) continue;
    const pt = { v, i: Math.max(0, i), p: v * Math.max(0, i) };
    points.push(pt);
    if (pt.p > mpp.p) mpp = pt;
  }
  const isc = points.length ? at(0).i : 0;
  if (points.length) points.unshift({ v: 0, i: isc, p: 0 });
  function at(ohms: number): IvPoint {
    if (il <= 0) return { v: 0, i: 0, p: 0 };
    if (!isFinite(ohms)) return { v: voc, i: 0, p: 0 };
    const r = ohms + CELL.rs;
    let lo = 0, hi = voc;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (iOfVd(mid) - mid / r > 0) lo = mid; else hi = mid;
    }
    const vd = (lo + hi) / 2;
    const i = vd / r;
    return { v: i * ohms, i, p: i * i * ohms };
  }
  return { points, isc, voc, mpp, at };
}

// ---------------------------------------------------------------------------
// Colour of a wavelength, for drawing the spectrum.
// ---------------------------------------------------------------------------
/** Approximate sRGB colour of monochromatic light (0..255 per channel). */
export function wavelengthRgb(nm: number): [number, number, number] {
  let r = 0, g = 0, b = 0;
  if (nm < 380) { r = 0.45; b = 0.75; }
  else if (nm < 440) { r = (440 - nm) / 60 * 0.75; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
  else { r = 1; }
  // Fade towards the edges of vision, but never to black: the UV and infrared
  // are drawn as dim violet and dim red so they remain visible on the chart.
  let k = 1;
  if (nm < 420) k = 0.45 + 0.55 * Math.max(0, (nm - 380) / 40);
  else if (nm > 680) k = 0.42 + 0.58 * Math.max(0, (780 - nm) / 100);
  const ch = (x: number) => Math.round(255 * Math.pow(x * k, 0.8));
  return [ch(r), ch(g), ch(b)];
}

export function wavelengthCss(nm: number, alpha = 1): string {
  const [r, g, b] = wavelengthRgb(nm);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function bandName(nm: number): string {
  if (nm < 380) return 'ultraviolet';
  if (nm < 450) return 'violet';
  if (nm < 495) return 'blue';
  if (nm < 570) return 'green';
  if (nm < 590) return 'yellow';
  if (nm < 620) return 'orange';
  if (nm < 750) return 'red';
  return 'infrared';
}
