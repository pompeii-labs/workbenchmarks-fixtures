import { HOURLY_RESOURCE, RESOURCE_PROVENANCE } from './data/minneapolis-tmy.js';

export const DEFAULTS = Object.freeze({
  arrayKw: 3,
  exportPolicy: 'net-metering',
  battery: false,
  gridPriceUsdPerKwh: 0.16,
  discountRatePct: 5,
});

// Public documentation object, not an array of UI labels.
export const MODEL_NOTES = Object.freeze({
  source: 'European Commission JRC PVGIS 5.3, ERA5 hourly typical meteorological year (2005-2023), Minneapolis 44.98 N, 93.27 W. Reanalysis-derived resource, not on-site measurements or a 2027 forecast.',
  sourceUrl: RESOURCE_PROVENANCE.sourceUrl,
  provenance: RESOURCE_PROVENANCE,
  method: 'Hourly GHI/DNI/DHI and air temperature; NOAA solar geometry at the PVGIS irradiance offset (+0.5 hour); south-facing 35 degree plane, isotropic sky diffuse and 0.20 ground albedo. Cell temperature = air temperature + POA * (45-20)/800 (NOCT 45 C); crystalline-silicon power coefficient -0.004/C relative to 25 C. Apply 14% aggregate system losses, then clip AC output at array nameplate (1:1 DC:AC). Each hourly AC power is held constant for four quarters, conserving hourly energy.',
  solarGeometrySourceUrl: 'https://gml.noaa.gov/grad/solcalc/solareqns.PDF',
  calendar: 'January-December 2027 in America/Chicago, including DST: 208 Tuesday/Thursday/Saturday/Sunday sessions. Each session is 18:30-19:15 at 8 kW and 19:15-20:00 at 4 kW (9 kWh). UTC TMY hours wrap at year boundaries. Only sauna load is modeled, not the rest of the house.',
  timing: 'Spring 2027 purchase is year 0. Year 1 is an annualized first full operating year using the complete 2027 calendar, not a claim of January production before installation. The same 2027 weather and weekday calendar repeat for 25 operating years; partial installation-year production is excluded. Operating cash flows are at year end.',
  battery: '13.5 kWh usable stored energy, 5 kW AC charge and discharge limits, sqrt(0.90) efficiency in each direction. Solar-only charging, no grid charging or battery export: direct solar first, surplus charges battery, residual exports; battery serves remaining sauna load. Starts empty only in year 1 and carries SOC between years. End-of-year-13 replacement costs $6,000 nominal, discards remaining stored energy as a loss, and starts year 14 empty. No other battery fade, standby consumption, or reserve. batteryKw is positive for AC discharge, negative for AC charging; daily SOC is end-of-quarter.',
  tariff: 'Annual net metering: (direct solar + battery-delivered energy + min(exports, grid imports))*retail + max(exports-grid imports, 0)*export price. Net billing: (direct solar + battery-delivered energy)*retail + exports*export price. Export price starts at $0.04/kWh. Both prices escalate 3% annually. Battery losses are never credited. Monthly net-metering savings allocate the annual export settlement in proportion to each month\'s exports, not independent monthly netting. This is a specified tariff scenario, not verification of utility eligibility.',
  finance: 'PV costs $3,000/kW and battery $11,000. PV output degrades 0.5% per operating year; dispatch is rerun each year. 25 years, no loan, maintenance, additional incentives, fixed utility charges, salvage value, or taxes on export revenue. Discount rate is nominal. Payback is undiscounted sustained recovery (last negative cumulative balance, interpolated within the following year), accounting for replacement; null if unrecovered within 25 years. IRR is returned only for a unique sign-changing root in -99.99% to 1,000,000%; null for no/ambiguous roots. Zero-investment/no-cash-flow payback is 0 and IRR is null.',
  federalCredit: 'Zero for a spring 2027 installation: IRS states the Residential Clean Energy Credit is unavailable for property placed in service after December 31, 2025. Verified November 10, 2026.',
  federalCreditSourceUrl: 'https://www.irs.gov/credits-deductions/residential-clean-energy-credit',
  limitations: 'TMY is representative historical weather, not actual 2027 weather. Isotropic transposition and NOCT are simplified engineering models, not a bankable production forecast. No site-specific trees, obstructions, snow cover, detailed module/inverter model, or separate snow-loss profile; 14% is the aggregate loss assumption. Sub-hourly cloud variability is not resolved. Daily example is June 22, 2027, not an annual average.',
  inputs: 'Finite numeric values (including numeric form strings) are accepted; negative array size, retail price, and discount rate normalize to zero; nonnumeric values use defaults. Battery is enabled only by boolean true. Export policy is net-metering or net-billing; unknown values use the default.',
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOURS = 8760;
const STEPS = HOURS * 4;
const EFFICIENCY = Math.sqrt(0.9);
const DAILY_DATE = '2027-06-22';
let schedule;
const dispatchCache = new Map();

function numericInput(value, fallback) {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function getSchedule() {
  if (schedule) return schedule;
  const solar = new Float64Array(HOURS);
  const radians = Math.PI / 180;
  const latitude = 44.98 * radians;
  const tilt = 35 * radians;
  for (let h = 0; h < HOURS; h++) {
    const [ghi, dni, dhi, airC] = HOURLY_RESOURCE[h];
    const day = Math.floor(h / 24) + 1;
    const hour = h % 24 + RESOURCE_PROVENANCE.inputs.location.irradiance_time_offset;
    const gamma = 2 * Math.PI / 365 * (day - 1 + (hour - 12) / 24);
    const equationMinutes = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
      - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
    const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
      - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
      - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
    const hourAngle = (hour * 15 + equationMinutes / 4 - 93.27 - 180) * radians;
    const cosZenith = Math.sin(latitude) * Math.sin(declination)
      + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
    const cosIncidence = Math.sin(latitude - tilt) * Math.sin(declination)
      + Math.cos(latitude - tilt) * Math.cos(declination) * Math.cos(hourAngle);
    const poa = (cosZenith > 0 ? dni * Math.max(0, cosIncidence) : 0)
      + dhi * (1 + Math.cos(tilt)) / 2 + ghi * 0.2 * (1 - Math.cos(tilt)) / 2;
    const cellC = airC + poa * (45 - 20) / 800;
    solar[h] = Math.min(1, Math.max(0, poa / 1000 * (1 - 0.004 * (cellC - 25)) * 0.86));
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  });
  const pv = new Float64Array(STEPS);
  const load = new Float64Array(STEPS);
  const month = new Uint8Array(STEPS);
  const dailyIndex = new Int16Array(STEPS).fill(-1);
  // Local January 1 midnight is 06:00 UTC. Iterate real UTC hours through both DST transitions.
  const start = Date.UTC(2027, 0, 1, 6);
  for (let h = 0; h < HOURS; h++) {
    const parts = Object.fromEntries(formatter.formatToParts(start + h * 3600000).map(p => [p.type, p.value]));
    const localHour = Number(parts.hour);
    const isSession = ['Tue', 'Thu', 'Sat', 'Sun'].includes(parts.weekday);
    const isDaily = `${parts.year}-${parts.month}-${parts.day}` === DAILY_DATE;
    for (let q = 0; q < 4; q++) {
      const i = h * 4 + q;
      const clock = localHour + q / 4;
      pv[i] = solar[(h + 6) % HOURS];
      load[i] = !isSession ? 0 : clock >= 18.5 && clock < 19.25 ? 8 : clock >= 19.25 && clock < 20 ? 4 : 0;
      month[i] = Number(parts.month) - 1;
      if (isDaily) dailyIndex[i] = localHour * 4 + q;
    }
  }
  schedule = { pv, load, month, dailyIndex };
  return schedule;
}

function simulate(arrayKw, hasBattery) {
  const key = `${arrayKw}:${hasBattery}`;
  if (dispatchCache.has(key)) return dispatchCache.get(key);
  const { pv, load, month, dailyIndex } = getSchedule();
  const monthly = MONTHS.map(month => ({ month, solarKwh: 0, saunaKwh: 0, directSolarKwh: 0, batteryKwh: 0, gridKwh: 0, exportedKwh: 0 }));
  const daily = [];
  const years = [];
  let soc = 0;
  for (let year = 1; year <= 25; year++) {
    const scale = arrayKw * 0.995 ** (year - 1);
    const initialSoc = soc;
    let solarKwh = 0, saunaKwh = 0, directSolarKwh = 0, batteryKwh = 0, gridKwh = 0, exportedKwh = 0, batteryLossKwh = 0;
    for (let i = 0; i < STEPS; i++) {
      const solar = pv[i] * scale * 0.25;
      const demand = load[i] * 0.25;
      const direct = Math.min(solar, demand);
      let charge = 0, discharge = 0;
      if (hasBattery) {
        charge = Math.min(solar - direct, 5 * 0.25, Math.max(0, 13.5 - soc) / EFFICIENCY);
        soc += charge * EFFICIENCY;
        discharge = Math.min(demand - direct, 5 * 0.25, soc * EFFICIENCY);
        soc -= discharge / EFFICIENCY;
        batteryLossKwh += charge * (1 - EFFICIENCY) + discharge * (1 / EFFICIENCY - 1);
      }
      const grid = demand - direct - discharge;
      const exported = solar - direct - charge;
      solarKwh += solar;
      saunaKwh += demand;
      directSolarKwh += direct;
      batteryKwh += discharge;
      gridKwh += grid;
      exportedKwh += exported;
      if (year === 1) {
        const m = monthly[month[i]];
        m.solarKwh += solar;
        m.saunaKwh += demand;
        m.directSolarKwh += direct;
        m.batteryKwh += discharge;
        m.gridKwh += grid;
        m.exportedKwh += exported;
        const d = dailyIndex[i];
        if (d >= 0) daily[d] = {
          hour: (d + 0.5) / 4, solarKw: solar * 4, loadKw: demand * 4,
          batteryKw: (discharge - charge) * 4, gridKw: grid * 4, exportKw: exported * 4, socKwh: soc,
        };
      }
    }
    // Retiring a charged battery destroys stored energy; do not silently reset the energy ledger.
    if (hasBattery && year === 13) {
      batteryLossKwh += soc;
      soc = 0;
    }
    years.push({ year, solarKwh, saunaKwh, directSolarKwh, batteryKwh, gridKwh, exportedKwh,
      batteryLossKwh, batteryStoredChangeKwh: soc - initialSoc, endingSocKwh: soc });
  }
  const result = { years, monthly, daily };
  if (dispatchCache.size >= 8) dispatchCache.delete(dispatchCache.keys().next().value);
  dispatchCache.set(key, result);
  return result;
}

function calculateIrr(flows) {
  if (!flows.some(v => v < 0) || !flows.some(v => v > 0)) return null;
  // Scan log(1+r), rather than assuming a replacement cash flow has only one IRR.
  const value = logRate => {
    const factor = Math.exp(-logRate);
    let total = flows.at(-1);
    for (let i = flows.length - 2; i >= 0; i--) total = total * factor + flows[i];
    return total;
  };
  const roots = [];
  const min = Math.log(0.0001), max = Math.log(10001), count = 2048;
  let left = min, leftValue = value(left);
  for (let i = 1; i <= count; i++) {
    const right = min + (max - min) * i / count;
    const rightValue = value(right);
    if (leftValue === 0) roots.push(Math.expm1(left) * 100);
    if (leftValue * rightValue < 0) {
      let lo = left, hi = right, loValue = leftValue;
      for (let iteration = 0; iteration < 70; iteration++) {
        const mid = (lo + hi) / 2, midValue = value(mid);
        if ((midValue > 0) === (loValue > 0)) { lo = mid; loValue = midValue; } else hi = mid;
      }
      roots.push(Math.expm1((lo + hi) / 2) * 100);
    }
    left = right;
    leftValue = rightValue;
  }
  return roots.length === 1 ? roots[0] : null;
}

/** Pure synchronous model. Energies are AC kWh except stored SOC/change; dollars are nominal USD. */
export function saunaModel(options = {}) {
  options = options ?? {};
  const inputs = {
    arrayKw: numericInput(options.arrayKw, DEFAULTS.arrayKw),
    exportPolicy: ['net-metering', 'net-billing'].includes(options.exportPolicy) ? options.exportPolicy : DEFAULTS.exportPolicy,
    battery: options.battery === true,
    gridPriceUsdPerKwh: numericInput(options.gridPriceUsdPerKwh, DEFAULTS.gridPriceUsdPerKwh),
    discountRatePct: numericInput(options.discountRatePct, DEFAULTS.discountRatePct),
  };
  const physical = simulate(inputs.arrayKw, inputs.battery);
  const upfrontCostUsd = inputs.arrayKw * 3000 + (inputs.battery ? 11000 : 0);
  const years = [{
    year: 0, solarKwh: 0, saunaKwh: 0, gridKwh: 0, exportedKwh: 0,
    gridPriceUsdPerKwh: inputs.gridPriceUsdPerKwh, exportPriceUsdPerKwh: 0.04,
    savingsUsd: 0, replacementUsd: 0, cashFlowUsd: -upfrontCostUsd,
    discountedCashFlowUsd: -upfrontCostUsd, cumulativeCashFlowUsd: -upfrontCostUsd,
  }];
  let cumulative = -upfrontCostUsd;
  for (const annual of physical.years) {
    const escalation = 1.03 ** (annual.year - 1);
    const retail = inputs.gridPriceUsdPerKwh * escalation;
    const exportPrice = 0.04 * escalation;
    const matched = inputs.exportPolicy === 'net-metering' ? Math.min(annual.exportedKwh, annual.gridKwh) : 0;
    const savingsUsd = (annual.directSolarKwh + annual.batteryKwh + matched) * retail
      + (annual.exportedKwh - matched) * exportPrice;
    const replacementUsd = inputs.battery && annual.year === 13 ? 6000 : 0;
    const cashFlowUsd = savingsUsd - replacementUsd;
    cumulative += cashFlowUsd;
    years.push({ ...annual, gridPriceUsdPerKwh: retail, exportPriceUsdPerKwh: exportPrice,
      savingsUsd, replacementUsd, cashFlowUsd,
      discountedCashFlowUsd: cashFlowUsd / (1 + inputs.discountRatePct / 100) ** annual.year,
      cumulativeCashFlowUsd: cumulative });
  }
  const first = years[1];
  const matchedFraction = inputs.exportPolicy === 'net-metering' && first.exportedKwh > 0
    ? Math.min(first.exportedKwh, first.gridKwh) / first.exportedKwh : 0;
  const monthly = physical.monthly.map(m => ({ ...m,
    savingsUsd: (m.directSolarKwh + m.batteryKwh) * inputs.gridPriceUsdPerKwh
      + m.exportedKwh * (matchedFraction * inputs.gridPriceUsdPerKwh + (1 - matchedFraction) * 0.04),
  }));
  let lastNegative = -1;
  for (let i = 0; i < years.length; i++) if (years[i].cumulativeCashFlowUsd < 0) lastNegative = i;
  const paybackYears = lastNegative === -1 ? 0 : lastNegative === 25 ? null
    : lastNegative - years[lastNegative].cumulativeCashFlowUsd / years[lastNegative + 1].cashFlowUsd;
  return {
    inputs, annualSolarKwh: first.solarKwh, annualSaunaKwh: first.saunaKwh,
    directSolarKwh: first.directSolarKwh, batteryKwh: first.batteryKwh, gridKwh: first.gridKwh,
    exportedKwh: first.exportedKwh, batteryLossKwh: first.batteryLossKwh,
    batteryStoredChangeKwh: first.batteryStoredChangeKwh,
    federalTaxCreditUsd: 0, upfrontCostUsd, year1SavingsUsd: first.savingsUsd,
    npvUsd: years.reduce((sum, year) => sum + year.discountedCashFlowUsd, 0),
    paybackYears, irrPct: calculateIrr(years.map(y => y.cashFlowUsd)),
    monthly, years, daily: physical.daily.map(d => ({ ...d })), dailyDate: DAILY_DATE,
  };
}

export default saunaModel;
