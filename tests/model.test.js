import test from 'node:test';
import assert from 'node:assert/strict';
import saunaModel, { saunaModel as namedModel, DEFAULTS, MODEL_NOTES } from '../src/model.js';
import { HOURLY_RESOURCE, RESOURCE_PROVENANCE } from '../src/data/minneapolis-tmy.js';

const close = (actual, expected, tolerance = 1e-7) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);

test('public ESM API, normalized inputs, and documented provenance', () => {
  assert.equal(namedModel, saunaModel);
  assert.deepEqual(DEFAULTS, { arrayKw: 3, exportPolicy: 'net-metering', battery: false, gridPriceUsdPerKwh: 0.16, discountRatePct: 5 });
  assert.deepEqual(saunaModel().inputs, DEFAULTS);
  assert.deepEqual(saunaModel(null).inputs, DEFAULTS);
  const { inputs } = saunaModel({ arrayKw: '2.5', exportPolicy: 'bad', battery: 'false', gridPriceUsdPerKwh: -1, discountRatePct: NaN });
  assert.deepEqual(inputs, { ...DEFAULTS, arrayKw: 2.5, gridPriceUsdPerKwh: 0 });
  assert.equal(saunaModel({ arrayKw: -1 }).inputs.arrayKw, 0);
  assert.equal(saunaModel({ arrayKw: Infinity }).inputs.arrayKw, 3);
  assert.equal(saunaModel({ gridPriceUsdPerKwh: '' }).inputs.gridPriceUsdPerKwh, 0.16);
  assert.equal(typeof MODEL_NOTES, 'object');
  assert.match(MODEL_NOTES.calendar, /America\/Chicago/);
  assert.match(MODEL_NOTES.timing, /annualized/);
  assert.match(MODEL_NOTES.federalCredit, /December 31, 2025/);
  assert.equal(HOURLY_RESOURCE.length, 8760);
  assert.equal(RESOURCE_PROVENANCE.inputs.meteo_data.radiation_db, 'PVGIS-ERA5');
  assert.equal(RESOURCE_PROVENANCE.inputs.location.latitude, 44.98);
  assert.equal(RESOURCE_PROVENANCE.inputs.location.longitude, -93.27);
  assert.equal(RESOURCE_PROVENANCE.monthsSelected.length, 12);
  for (const row of HOURLY_RESOURCE) {
    assert.equal(row.length, 4);
    assert.ok(row.every(Number.isFinite));
    assert.ok(row.slice(0, 3).every(n => n >= 0));
  }
});

test('2027 calendar has 208 sessions and 9 kWh each, including DST Sundays', () => {
  const model = saunaModel();
  const monthlySessions = Array(12).fill(0);
  for (let day = 0; day < 365; day++) {
    const date = new Date(Date.UTC(2027, 0, day + 1));
    if ([0, 2, 4, 6].includes(date.getUTCDay())) monthlySessions[date.getUTCMonth()]++;
  }
  assert.equal(monthlySessions.reduce((a, b) => a + b), 208);
  assert.equal(model.annualSaunaKwh, 208 * 9);
  assert.deepEqual(model.monthly.map(m => m.saunaKwh), monthlySessions.map(n => n * 9));
  assert.equal(model.dailyDate, '2027-06-22');
  assert.equal(new Date(`${model.dailyDate}T12:00:00Z`).getUTCDay(), 2);
  assert.equal(model.daily.length, 96);
  model.daily.forEach((d, i) => {
    assert.equal(d.hour, (i + 0.5) / 4);
    assert.equal(d.loadKw, i >= 74 && i < 77 ? 8 : i >= 77 && i < 80 ? 4 : 0);
  });
  assert.equal(sum(model.daily, 'loadKw') / 4, 9);
  for (const y of model.years.slice(1)) assert.equal(y.saunaKwh, 1872);
});

test('zero PV is a real grid-only baseline, with no fabricated battery energy', () => {
  for (const battery of [false, true]) {
    const model = saunaModel({ arrayKw: 0, battery });
    for (const key of ['annualSolarKwh', 'directSolarKwh', 'batteryKwh', 'exportedKwh', 'batteryLossKwh', 'batteryStoredChangeKwh', 'year1SavingsUsd']) assert.equal(model[key], 0);
    assert.equal(model.gridKwh, 1872);
    assert.equal(model.upfrontCostUsd, battery ? 11000 : 0);
    assert.equal(model.irrPct, null);
    assert.equal(model.paybackYears, battery ? null : 0);
    close(model.npvUsd, battery ? -11000 - 6000 / 1.05 ** 13 : 0);
    for (const d of model.daily) {
      assert.equal(d.gridKw, d.loadKw);
      assert.equal(d.socKwh, 0);
    }
  }
});

test('annual AC and stored-energy conservation, including carryover and retirement', () => {
  for (const arrayKw of [0.25, 3, 12]) for (const battery of [false, true]) {
    const model = saunaModel({ arrayKw, battery });
    let previousSoc = 0;
    for (const y of model.years.slice(1)) {
      close(y.saunaKwh, y.directSolarKwh + y.batteryKwh + y.gridKwh);
      close(y.solarKwh + y.gridKwh,
        y.saunaKwh + y.exportedKwh + y.batteryLossKwh + y.batteryStoredChangeKwh);
      close(y.batteryStoredChangeKwh, y.endingSocKwh - previousSoc);
      assert.ok(y.endingSocKwh >= -1e-10 && y.endingSocKwh <= 13.5 + 1e-10);
      for (const key of ['solarKwh', 'saunaKwh', 'directSolarKwh', 'batteryKwh', 'gridKwh', 'exportedKwh', 'batteryLossKwh']) assert.ok(y[key] >= -1e-10);
      if (y.year === 13) assert.equal(y.endingSocKwh, 0);
      if (!battery) assert.equal(y.batteryLossKwh, 0);
      previousSoc = y.endingSocKwh;
    }
    assert.equal(model.batteryLossKwh, model.years[1].batteryLossKwh);
    assert.equal(model.batteryStoredChangeKwh, model.years[1].batteryStoredChangeKwh);
  }
  const model = saunaModel({ battery: true });
  assert.ok(model.years[1].endingSocKwh > 0);
  assert.ok(model.years[13].batteryLossKwh > 0);
});

test('daily quarter-hour power balance, SOC, efficiencies, limits, and hourly energy preservation', () => {
  const efficiency = Math.sqrt(0.9);
  for (const arrayKw of [0.25, 3, 12]) {
    const model = saunaModel({ arrayKw, battery: true });
    model.daily.forEach((d, i) => {
      close(d.solarKw + d.batteryKw + d.gridKw, d.loadKw + d.exportKw);
      assert.ok(d.solarKw >= 0 && d.solarKw <= arrayKw);
      assert.ok(Math.abs(d.batteryKw) <= 5 + 1e-10);
      assert.ok(d.socKwh >= -1e-10 && d.socKwh <= 13.5 + 1e-10);
      assert.ok(d.gridKw >= -1e-10 && d.exportKw >= -1e-10);
      if (d.batteryKw < 0) assert.equal(d.gridKw, 0, 'no grid charging');
      if (d.batteryKw > 0) assert.equal(d.exportKw, 0, 'no battery exports');
      if (i > 0) close(d.socKwh - model.daily[i - 1].socKwh,
        d.batteryKw < 0 ? -d.batteryKw * 0.25 * efficiency : -d.batteryKw * 0.25 / efficiency);
      if (i % 4 !== 0) assert.equal(d.solarKw, model.daily[i - 1].solarKw);
    });
  }
  const daily = saunaModel({ arrayKw: 12, battery: true }).daily;
  assert.ok(daily.some(d => Math.abs(d.socKwh - 13.5) < 1e-10), 'usable capacity reached');
  assert.ok(daily.some(d => Math.abs(d.batteryKw - 5) < 1e-10), 'discharge cap reached');
});

test('monthly energy and annual-settlement savings sum to annual totals under both tariffs', () => {
  for (const battery of [false, true]) for (const exportPolicy of ['net-metering', 'net-billing']) {
    const model = saunaModel({ battery, exportPolicy });
    assert.equal(model.monthly.length, 12);
    assert.deepEqual(model.monthly.map(m => m.month), ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
    for (const key of ['solarKwh', 'saunaKwh', 'directSolarKwh', 'batteryKwh', 'gridKwh', 'exportedKwh', 'savingsUsd']) close(sum(model.monthly, key), model.years[1][key]);
    for (const month of model.monthly) close(month.saunaKwh, month.directSolarKwh + month.batteryKwh + month.gridKwh);
  }
});

test('tariff formulas cap annual retail matching at grid imports and never credit battery loss', () => {
  for (const arrayKw of [0.25, 3]) for (const battery of [false, true]) {
    const net = saunaModel({ arrayKw, battery, exportPolicy: 'net-metering' });
    const billing = saunaModel({ arrayKw, battery, exportPolicy: 'net-billing' });
    for (let year = 1; year <= 25; year++) {
      const n = net.years[year], b = billing.years[year];
      const matched = Math.min(n.exportedKwh, n.gridKwh);
      close(n.savingsUsd, (n.directSolarKwh + n.batteryKwh + matched) * n.gridPriceUsdPerKwh
        + Math.max(0, n.exportedKwh - n.gridKwh) * n.exportPriceUsdPerKwh);
      close(b.savingsUsd, (b.directSolarKwh + b.batteryKwh) * b.gridPriceUsdPerKwh + b.exportedKwh * b.exportPriceUsdPerKwh);
      close(n.savingsUsd - b.savingsUsd, matched * (n.gridPriceUsdPerKwh - n.exportPriceUsdPerKwh));
    }
    if (arrayKw === 0.25) {
      assert.ok(net.exportedKwh < net.gridKwh);
      close(net.year1SavingsUsd, (net.annualSolarKwh - net.batteryLossKwh - net.batteryStoredChangeKwh) * 0.16);
    } else assert.ok(net.exportedKwh > net.gridKwh);
  }
});

test('25-year cash flows include zero federal credit, year-13 replacement, escalation and degradation', () => {
  for (const battery of [false, true]) {
    const model = saunaModel({ battery });
    assert.equal(model.federalTaxCreditUsd, 0);
    assert.equal(model.upfrontCostUsd, 9000 + (battery ? 11000 : 0));
    assert.equal(model.years.length, 26);
    assert.equal(model.years[0].cashFlowUsd, -model.upfrontCostUsd);
    let cumulative = 0;
    for (const y of model.years) {
      cumulative += y.cashFlowUsd;
      close(y.cumulativeCashFlowUsd, cumulative);
      close(y.discountedCashFlowUsd, y.cashFlowUsd / 1.05 ** y.year);
      if (y.year === 0) continue;
      close(y.gridPriceUsdPerKwh, 0.16 * 1.03 ** (y.year - 1));
      close(y.exportPriceUsdPerKwh, 0.04 * 1.03 ** (y.year - 1));
      close(y.solarKwh, model.annualSolarKwh * 0.995 ** (y.year - 1));
      assert.equal(y.replacementUsd, battery && y.year === 13 ? 6000 : 0);
      close(y.cashFlowUsd, y.savingsUsd - y.replacementUsd);
    }
    close(model.npvUsd, sum(model.years, 'discountedCashFlowUsd'));
    const undiscounted = saunaModel({ battery, discountRatePct: 0 });
    close(undiscounted.npvUsd, sum(undiscounted.years, 'cashFlowUsd'));
    assert.equal(undiscounted.year1SavingsUsd, model.year1SavingsUsd);
    close(undiscounted.irrPct, model.irrPct);
    close(model.years.reduce((total, y) => total + y.cashFlowUsd / (1 + model.irrPct / 100) ** y.year, 0), 0, 1e-6);
  }
});

test('payback is sustained cumulative recovery and IRR includes replacement cash flows', () => {
  for (const gridPriceUsdPerKwh of [0.16, 0.6, 0.8, 1, 2]) for (const battery of [false, true]) {
    const model = saunaModel({ battery, gridPriceUsdPerKwh });
    if (model.paybackYears === null) {
      assert.ok(model.years.at(-1).cumulativeCashFlowUsd < 0);
    } else {
      const before = Math.ceil(model.paybackYears) - 1;
      const after = before + 1;
      close(model.years[before].cumulativeCashFlowUsd + (model.paybackYears - before) * model.years[after].cashFlowUsd, 0);
      assert.ok(model.years.slice(after).every(y => y.cumulativeCashFlowUsd >= 0));
    }
    if (model.irrPct !== null) close(model.years.reduce((total, y) => total + y.cashFlowUsd / (1 + model.irrPct / 100) ** y.year, 0), 0, 1e-6);
  }
  const reversal = saunaModel({ battery: true, gridPriceUsdPerKwh: 0.8 });
  assert.ok(reversal.years[12].cumulativeCashFlowUsd > 0);
  assert.ok(reversal.years[13].cumulativeCashFlowUsd < 0);
  assert.ok(reversal.paybackYears > 13, 'replacement reverses an earlier apparent payback');
});

test('cached dispatch is isolated from callers and financial sensitivities do not alter physics', () => {
  const first = saunaModel({ battery: true });
  const original = first.daily[50].solarKw;
  first.daily[50].solarKw = -100;
  first.monthly[0].solarKwh = -100;
  first.years[1].solarKwh = -100;
  first.inputs.arrayKw = -100;
  const again = saunaModel({ battery: true, discountRatePct: 8, gridPriceUsdPerKwh: 0.2 });
  assert.equal(again.daily[50].solarKw, original);
  assert.ok(again.monthly[0].solarKwh > 0);
  assert.ok(again.years[1].solarKwh > 0);
  assert.equal(again.inputs.arrayKw, 3);
  assert.equal(again.annualSolarKwh, first.annualSolarKwh);
  assert.notEqual(again.npvUsd, first.npvUsd);
});

test('IRR remains scale invariant for very small finite cash flows', () => {
  const reference = saunaModel({ arrayKw: 0.001 });
  const tiny = saunaModel({ arrayKw: 1e-200 });
  assert.notEqual(tiny.irrPct, null);
  close(tiny.irrPct, reference.irrPct, 1e-6);
});
