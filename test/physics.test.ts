import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/physics.ts';

const near = (a: number, b: number, tol: number, msg?: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} +/- ${tol}, got ${a}`);

test('photon energy: E = hc / wavelength', () => {
  near(P.HC_EV_NM, 1239.84, 0.01);
  near(P.photonEnergyEv(500), 2.48, 0.005);
  near(P.wavelengthNm(1.12), 1107, 1, 'silicon cut-off');
});

test('reference spectra integrate to the standard totals', () => {
  near(P.totalIrradiance('am15'), 1000.4, 1, 'AM1.5G');
  near(P.totalIrradiance('am0'), 1348, 2, 'AM0 to 4000 nm');
  near(P.totalPhotonFlux('am15') / 1e21, 4.3, 0.15, 'photon flux');
});

test('black body at 5772 K approximates sunlight above the atmosphere', () => {
  let s = 0;
  for (let nm = 100; nm < 20000; nm += 2) s += P.blackbodySun(nm) * 2;
  near(s, 1361, 10, 'solar constant');
});

test('energy budget fractions add to one and match published limits', () => {
  const si = P.energyBudget(1.12);
  near(si.belowGap + si.heat + si.voltage + si.electricity, 1, 1e-9);
  // Shockley-Queisser limit under AM1.5G: about 33 % at 1.12 eV, peak ~33.7 % near 1.34 eV
  // (Rühle, Solar Energy 130, 2016).
  near(si.electricity, 0.333, 0.008, 'Si SQ limit');
  near(si.jsc / 10, 43.8, 0.6, 'Si max Jsc mA/cm2');
  near(si.belowGap, 0.19, 0.02);
  near(si.heat, 0.32, 0.03);
  let best = { gap: 0, eff: 0 };
  for (let g = 0.6; g <= 2.4; g += 0.01) {
    const e = P.energyBudget(g).electricity;
    if (e > best.eff) best = { gap: g, eff: e };
  }
  near(best.eff, 0.337, 0.006, 'SQ peak');
  near(best.gap, 1.34, 0.04, 'SQ peak gap');
});

test('cell model behaves like a real silicon cell', () => {
  const stc = P.ivCurve(1000, 25);
  near(stc.isc, 13.6, 0.05);
  near(stc.voc, 0.705, 0.002);
  const eff = stc.mpp.p / (1000 * P.CELL.areaM2);
  assert.ok(eff > 0.22 && eff < 0.25, `efficiency ${eff}`);
  const ff = stc.mpp.p / (stc.isc * stc.voc);
  assert.ok(ff > 0.78 && ff < 0.85, `fill factor ${ff}`);
  // Hotter cells lose voltage: about -0.3 %/K in power.
  const hot = P.ivCurve(1000, 65);
  const coeff = (hot.mpp.p / stc.mpp.p - 1) / 40;
  assert.ok(coeff < -0.0025 && coeff > -0.0042, `temp coeff ${coeff}`);
  assert.ok(hot.isc > stc.isc);
  // Current is proportional to light; voltage barely moves.
  const dim = P.ivCurve(500, 25);
  near(dim.isc / stc.isc, 0.5, 0.005);
  assert.ok(dim.voc > 0.95 * stc.voc && dim.voc < stc.voc);
  // A resistor's operating point lies on both the curve and Ohm's law.
  const op = stc.at(0.05);
  near(op.v / op.i, 0.05, 1e-6);
  assert.ok(op.p <= stc.mpp.p * 1.001);
  near(stc.at(stc.mpp.v / stc.mpp.i).p, stc.mpp.p, 0.02);
  near(stc.at(Infinity).v, stc.voc, 1e-9);
  assert.equal(P.ivCurve(0, 25).at(1).p, 0);
});
