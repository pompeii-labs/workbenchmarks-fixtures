// Sanity checks of the physics models against well-known reference values.
import * as P from '../src/physics.ts';

const s = P.spectrum();
let top = 0; for (const v of s.top) top += v;
const rows: [string, number, string][] = [];
rows.push(['Above-atmosphere irradiance (W/m2)', s.topTotal, 'solar constant ~1361']);
rows.push(['  (integrated 250-4000 nm)', top, '']);
const f = P.bandFractions();
rows.push(['UV fraction at ground', f.uv, 'AM1.5G ~0.05']);
rows.push(['Visible fraction at ground', f.vis, 'AM1.5G ~0.43']);
rows.push(['IR fraction at ground', f.ir, 'AM1.5G ~0.52']);
rows.push(['Photon flux at ground (1/m2/s)', P.totalPhotonFlux(), 'AM1.5G ~4.3e21']);
rows.push(['Photon energy 550 nm (eV)', P.eV(550), '2.25']);
rows.push(['Si gap wavelength (nm)', P.nmFromEV(P.SI_GAP), '~1107']);
for (const g of [0.67, 1.12, 1.34, 1.42, 1.7]) {
  const b = P.gapBudget(g);
  rows.push([`Gap ${g} eV: SQ limit`, b.sq, g === 1.12 ? 'Si ~0.33' : g === 1.34 ? 'peak 0.337' : '']);
  rows.push([`  kept (ultimate)`, b.kept, '']);
  rows.push([`  below gap`, b.notAbsorbed, '']);
  rows.push([`  heat`, b.heat, '']);
  rows.push([`  Voc (V)`, b.voc, '']);
  rows.push([`  Jsc (mA/cm2)`, b.jsc / 10, g === 1.12 ? '~43.8' : '']);
}
const best = P.sqCurveData().reduce((a, b) => (b.sq > a.sq ? b : a));
rows.push(['SQ peak gap (eV)', best.gap, '~1.34']);
rows.push(['SQ peak value', best.sq, '~0.337']);
const st = P.cellState(1000, 25);
const mp = P.maxPower(st);
rows.push(['Cell Voc 25C (V)', P.cellVoc(st), '0.68']);
rows.push(['Cell Isc (A)', P.cellIsc(st), '9.6']);
rows.push(['Cell Pmax (W)', mp.P, '~5.2']);
rows.push(['Cell FF', mp.P / (P.cellVoc(st) * P.cellIsc(st)), '~0.8']);
rows.push(['Cell efficiency', mp.P / (1000 * P.CELL_AREA), '~0.21']);
const st65 = P.cellState(1000, 65);
rows.push(['dVoc/dT (mV/K)', (P.cellVoc(st65) - P.cellVoc(st)) / 40 * 1000, '~ -2']);
rows.push(['Pmax change per K (%/K)', (P.maxPower(st65).P / mp.P - 1) / 40 * 100, '~ -0.35']);
rows.push(['Voc at 100 W/m2', P.cellVoc(P.cellState(100, 25)), '~0.62']);
rows.push(['R at MPP (ohm)', mp.V / mp.I, '']);
for (const l of [400, 500, 600, 800, 1000, 1100]) rows.push([`Abs depth ${l} nm (um)`, P.absorptionDepth(l) * 1e6, '']);
for (const [a, b, c] of rows) console.log(a.padEnd(38), (Math.abs(b) < 1e-3 || Math.abs(b) > 1e5 ? b.toExponential(3) : b.toFixed(4)).padStart(12), ' ', c);
