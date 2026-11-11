/**
 * Core physical constants, terrestrial AM1.5G solar spectrum model,
 * Shockley-Queisser detailed-balance solver, and single-diode solar cell solver.
 */

export const HC_EV_NM = 1239.84193; // h*c in eV·nm
export const K_BOLTZMANN_EV = 8.617333262e-5; // eV/K
export const Q_CHARGE = 1.602176634e-19; // Coulombs
export const SI_BANDGAP_EV = 1.12;

export function wavelengthToEv(wavelengthNm: number): number {
  return HC_EV_NM / Math.max(1, wavelengthNm);
}

export function evToWavelength(ev: number): number {
  return HC_EV_NM / Math.max(0.05, ev);
}

export function spectralBandLabel(wavelengthNm: number): string {
  if (wavelengthNm < 380) return 'Ultraviolet (UV)';
  if (wavelengthNm < 450) return 'Violet / Deep Blue';
  if (wavelengthNm < 495) return 'Blue';
  if (wavelengthNm < 570) return 'Green';
  if (wavelengthNm < 590) return 'Yellow';
  if (wavelengthNm < 625) return 'Orange';
  if (wavelengthNm <= 740) return 'Red';
  return 'Near-Infrared (Invisible)';
}

/**
 * Converts wavelength (nm) into an intuitive display RGB hex/css string.
 * Visible wavelengths use perceptual spectral mapping; UV and IR transition smoothly
 * into unmistakable deep-violet and warm-ember hues.
 */
export function wavelengthToCssColor(wavelengthNm: number, alpha = 1): string {
  let r = 0;
  let g = 0;
  let b = 0;

  if (wavelengthNm < 380) {
    // Ultraviolet: soft glowing violet-indigo
    const t = Math.max(0, (wavelengthNm - 280) / 100);
    r = Math.round(135 + 35 * t);
    g = Math.round(70 + 20 * t);
    b = 255;
  } else if (wavelengthNm < 440) {
    r = Math.round(((440 - wavelengthNm) / (440 - 380)) * 165);
    g = 55;
    b = 255;
  } else if (wavelengthNm < 490) {
    r = 30;
    g = Math.round(((wavelengthNm - 440) / (490 - 440)) * 215 + 40);
    b = 255;
  } else if (wavelengthNm < 510) {
    r = 30;
    g = 245;
    b = Math.round(((510 - wavelengthNm) / (510 - 490)) * 225 + 30);
  } else if (wavelengthNm < 580) {
    r = Math.round(((wavelengthNm - 510) / (580 - 510)) * 250);
    g = 240;
    b = 35;
  } else if (wavelengthNm < 645) {
    r = 255;
    g = Math.round(((645 - wavelengthNm) / (645 - 580)) * 195 + 35);
    b = 40;
  } else if (wavelengthNm <= 750) {
    const fade = 0.55 + 0.45 * ((750 - wavelengthNm) / (750 - 645));
    r = Math.round(250 * fade);
    g = Math.round(48 * fade);
    b = Math.round(58 * fade);
  } else {
    // Near-infrared: deep ember crimson fading gently with wavelength
    const fade = Math.max(0.42, 1 - (wavelengthNm - 750) / 2200);
    r = Math.round(215 * fade);
    g = Math.round(62 * fade);
    b = Math.round(78 * fade);
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface SpectrumBin {
  wavelengthNm: number;
  energyEv: number;
  irradiance: number; // W / (m^2 * nm)
  photonFlux: number; // photons / (m^2 * s * nm)
  dLambda: number;
}

/**
 * Generates a high-resolution terrestrial AM1.5G solar spectrum (280–2500 nm)
 * including Planck 5778 K continuum, Rayleigh/aerosol UV-blue attenuation,
 * and genuine atmospheric O3, O2, and H2O absorption bands, normalized to 1000.0 W/m^2.
 */
function buildAm15gSpectrum(): SpectrumBin[] {
  const step = 5; // nm
  const raw: { wl: number; irr: number }[] = [];

  const dip = (wl: number, center: number, width: number, depth: number) =>
    1 - depth * Math.exp(-0.5 * Math.pow((wl - center) / width, 2));

  let integral = 0;
  for (let wl = 280; wl <= 2500; wl += step) {
    const wlM = wl * 1e-9;
    // 5778 K blackbody spectral radiance shape
    const c1 = 3.74177e-16;
    const c2 = 1.43877e-2;
    const planck = c1 / (Math.pow(wlM, 5) * (Math.exp(c2 / (wlM * 5778)) - 1));

    // Atmospheric transmittance envelope (ozone cutoff + Rayleigh scattering)
    const ozone = wl < 305 ? 0.002 : 1 / (1 + Math.exp(-(wl - 318) / 9));
    const rayleigh = Math.exp(-0.085 * Math.pow(500 / wl, 3.1));

    // Key terrestrial atmospheric molecular absorption bands (ASTM G173 AM1.5G)
    const o2A = dip(wl, 762, 6, 0.42);
    const h2o940 = dip(wl, 942, 22, 0.58);
    const h2o1130 = dip(wl, 1130, 26, 0.68);
    const h2o1380 = dip(wl, 1385, 42, 0.94);
    const h2o1870 = dip(wl, 1875, 52, 0.95);
    const co22010 = dip(wl, 2015, 20, 0.35);

    const val = planck * ozone * rayleigh * o2A * h2o940 * h2o1130 * h2o1380 * h2o1870 * co22010;
    raw.push({ wl, irr: val });
    integral += val * step;
  }

  const norm = 1000.0 / integral; // Exact 1000.0 W/m^2 standard AM1.5G irradiance
  return raw.map(({ wl, irr }) => {
    const irradiance = irr * norm;
    const energyEv = wavelengthToEv(wl);
    const photonEnergyJoules = energyEv * Q_CHARGE;
    return {
      wavelengthNm: wl,
      energyEv,
      irradiance,
      photonFlux: irradiance / photonEnergyJoules,
      dLambda: step,
    };
  });
}

export const AM15G_SPECTRUM: SpectrumBin[] = buildAm15gSpectrum();

export interface SqBreakdown {
  bandgapEv: number;
  cutoffNm: number;
  efficiencyPct: number;
  transparentLossPct: number; // E < Eg
  thermalizationLossPct: number; // E - Eg heat
  thermodynamicLossPct: number; // Carnot/entropy + radiative recombination + fill factor
  usableBandgapPct: number; // Eg * N_abs / P_in before V_mp < E_g/q
  jscMaCm2: number;
  vocVolts: number;
  vmpVolts: number;
}

/**
 * Evaluates the Shockley-Queisser detailed-balance single-junction breakdown
 * under AM1.5G (1000 W/m^2, cell at 300 K).
 */
export function evaluateShockleyQueisser(bandgapEv: number): SqBreakdown {
  const T = 300;
  const kT = K_BOLTZMANN_EV * T; // ~0.02585 eV
  const totalPower = 1000.0; // W/m^2
  const cutoffNm = evToWavelength(bandgapEv);

  let absorbedFlux = 0; // photons / (m^2 * s)
  let absorbedPower = 0; // W/m^2
  let unabsorbedPower = 0; // W/m^2

  for (const bin of AM15G_SPECTRUM) {
    const binPower = bin.irradiance * bin.dLambda;
    if (bin.energyEv >= bandgapEv) {
      absorbedPower += binPower;
      absorbedFlux += bin.photonFlux * bin.dLambda;
    } else {
      unabsorbedPower += binPower;
    }
  }

  const jph = Q_CHARGE * absorbedFlux; // A/m^2
  const usableBandgapPower = absorbedFlux * bandgapEv * Q_CHARGE; // W/m^2
  const thermalizationPower = Math.max(0, absorbedPower - usableBandgapPower);

  // Radiative dark saturation current density J0_rad (planar blackbody emission at 300 K):
  // J0 = q * (2*pi / (h^3 * c^2)) * kT * (Eg^2 + 2*Eg*kT + 2*kT^2) * exp(-Eg/kT)
  // Exact SI prefactor: 2*pi * q^4 / (h^3 * c^2) = 1.583e8 A / (m^2 * eV^3)
  const radPrefactor = 1.583e8; // A / (m^2 * eV^3)
  const j0 =
    radPrefactor *
    kT *
    (bandgapEv * bandgapEv + 2 * bandgapEv * kT + 2 * kT * kT) *
    Math.exp(-bandgapEv / kT);

  let voc = 0;
  let vmp = 0;
  let maxPower = 0;

  if (jph > j0 * 1e-6 && j0 > 0) {
    voc = kT * Math.log(jph / j0 + 1);
    // Sweep operating voltage to locate exact radiative maximum power point
    const steps = 140;
    for (let i = 1; i < steps; i++) {
      const v = (voc * i) / steps;
      const j = jph - j0 * (Math.exp(v / kT) - 1);
      const p = v * Math.max(0, j);
      if (p > maxPower) {
        maxPower = p;
        vmp = v;
      }
    }
  }

  const efficiencyPct = (maxPower / totalPower) * 100;
  const transparentLossPct = (unabsorbedPower / totalPower) * 100;
  const thermalizationLossPct = (thermalizationPower / totalPower) * 100;
  const usableBandgapPct = (usableBandgapPower / totalPower) * 100;
  const thermodynamicLossPct = Math.max(0, usableBandgapPct - efficiencyPct);

  return {
    bandgapEv,
    cutoffNm,
    efficiencyPct,
    transparentLossPct,
    thermalizationLossPct,
    thermodynamicLossPct,
    usableBandgapPct,
    jscMaCm2: jph * 0.1, // 1 A/m^2 = 0.1 mA/cm^2
    vocVolts: voc,
    vmpVolts: vmp,
  };
}

export const SQ_CURVE_CACHE: SqBreakdown[] = (() => {
  const arr: SqBreakdown[] = [];
  for (let eg = 0.4; eg <= 3.201; eg += 0.04) {
    arr.push(evaluateShockleyQueisser(Number(eg.toFixed(2))));
  }
  return arr;
})();

export interface IvCurveResult {
  points: { v: number; i: number; p: number }[];
  isc: number;
  voc: number;
  vmp: number;
  imp: number;
  pmax: number;
  fillFactor: number;
  efficiencyPct: number;
  cellCount: number;
}

/**
 * Solves the realistic single-diode equation for a modern monocrystalline silicon wafer cell
 * (182 mm M10 wafer ~ 330 cm^2 active area) or a 60-cell series module.
 */
export function solveSiliconIvCurve(
  irradianceWm2: number,
  tempC: number,
  seriesCells = 1
): IvCurveResult {
  const T = tempC + 273.15;
  const Tref = 298.15; // 25 °C
  const nIdeality = 1.08;
  const vt = nIdeality * K_BOLTZMANN_EV * T; // Thermal voltage n*k*T/q in Volts
  const vtRef = nIdeality * K_BOLTZMANN_EV * Tref;

  // Reference parameters for one modern 182mm PERC/TOPCon cell at 1000 W/m^2, 25 °C
  const cellAreaM2 = 0.0272; // ~272 cm^2 effective cell area -> 60 cells ~ 1.63 m^2
  const iphRef = 10.65; // A at 1 sun
  const vocRef = 0.688; // V at 1 sun, 25 °C
  const rsCell = 0.0032; // Ohms series resistance per cell
  const rshCell = 45.0; // Ohms shunt resistance per cell

  // Temperature-dependent photocurrent (+0.045%/°C from slight bandgap narrowing)
  const iph = iphRef * (irradianceWm2 / 1000) * (1 + 0.00045 * (T - Tref));

  // Saturation current I0(T) calibrated to Voc_ref at 25 °C and silicon Eg narrowing
  const i0Ref = iphRef / (Math.exp(vocRef / vtRef) - 1);
  const egRef = 1.121;
  const egT = 1.166 - (4.73e-4 * T * T) / (T + 636);
  const i0 =
    i0Ref *
    Math.pow(T / Tref, 3) *
    Math.exp(egRef / vtRef - egT / vt);

  // Solve single-cell current I at cell voltage vCell via Newton-Raphson
  const solveCurrentAtCellV = (vCell: number): number => {
    let curr = iph;
    for (let iter = 0; iter < 10; iter++) {
      const arg = Math.min(45, (vCell + curr * rsCell) / vt);
      const expTerm = Math.exp(arg);
      const f = iph - i0 * (expTerm - 1) - (vCell + curr * rsCell) / rshCell - curr;
      const df = -i0 * expTerm * (rsCell / vt) - rsCell / rshCell - 1;
      const delta = f / df;
      curr -= delta;
      if (Math.abs(delta) < 1e-9) break;
    }
    return Math.max(0, curr);
  };

  // Locate exact single-cell Voc via bisection
  let lo = 0;
  let hi = 0.85;
  for (let k = 0; k < 28; k++) {
    const mid = 0.5 * (lo + hi);
    const arg = Math.min(45, mid / vt);
    const net = iph - i0 * (Math.exp(arg) - 1) - mid / rshCell;
    if (net > 0) lo = mid;
    else hi = mid;
  }
  const vocCell = irradianceWm2 <= 1 ? 0 : 0.5 * (lo + hi);
  const isc = solveCurrentAtCellV(0);

  const numPts = 140;
  const points: { v: number; i: number; p: number }[] = [];
  let pmax = 0;
  let vmp = 0;
  let imp = 0;

  for (let k = 0; k <= numPts; k++) {
    const vCell = (vocCell * k) / numPts;
    const i = k === numPts ? 0 : solveCurrentAtCellV(vCell);
    const vTotal = vCell * seriesCells;
    const p = vTotal * i;
    points.push({ v: vTotal, i, p });
    if (p > pmax) {
      pmax = p;
      vmp = vTotal;
      imp = i;
    }
  }

  const voc = vocCell * seriesCells;
  const fillFactor = voc * isc > 0 ? pmax / (voc * isc) : 0;
  const incidentWatts = Math.max(0.001, irradianceWm2 * cellAreaM2 * seriesCells);
  const efficiencyPct = (pmax / incidentWatts) * 100;

  return {
    points,
    isc,
    voc,
    vmp,
    imp,
    pmax,
    fillFactor,
    efficiencyPct,
    cellCount: seriesCells,
  };
}
