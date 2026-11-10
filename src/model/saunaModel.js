import { HOURLY_AC_WATTS_PER_KW, SOLAR_RESOURCE_META } from '../data/pvwattsMinneapolis.js';

export const MODEL_CONSTANTS = {
  solarCostPerWattUsd: 3.0,
  solarCostPerKwUsd: 3000.0,
  federalItcRate2027: 0.0, // IRC § 25D terminated Dec 31, 2025 under P.L. 119-21 (OBBBA)
  exportCreditYear1UsdPerKwh: 0.04,
  priceEscalationRate: 0.03, // 3%/yr from Year 2 onward on both retail & export prices
  panelDegradationRate: 0.005, // 0.5%/yr output decline from Year 2 onward
  analysisYears: 25,
  saunaPreHeatKw: 8.0,
  saunaPreHeatHours: 0.75,
  saunaSessionKw: 4.0,
  saunaSessionHours: 0.75,
  saunaKwhPerUse: 9.0,
  batteryUsableKwh: 13.5,
  batteryMaxPowerKw: 5.0,
  batteryRoundTripEff: 0.9,
  batteryUpfrontCostUsd: 11000.0,
  batteryReplacementYear: 13,
  batteryReplacementCostUsd: 6000.0,
};

export const DEFAULT_INPUTS = {
  arrayKw: 3.0,
  exportPolicy: 'net-metering',
  battery: false,
  gridPriceUsdPerKwh: 0.16,
  discountRatePct: 5.0,
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Precompute the 365-day calendar metadata for 2027 (non-leap year matching 8,760-hr TMY).
 * - Jan 1, 2027 is Friday.
 * - Sauna evenings: Tuesday (2), Thursday (4), Saturday (6), Sunday (0) in JS getUTCDay() -> 208 days/yr = 1,872 kWh.
 * - US Central Daylight Time (CDT, UTC-5) in 2027 begins Sun Mar 14 and ends Sun Nov 7 at 2:00 am.
 *   Since PVWatts TMY hours are indexed in Local Standard Time (CST, UTC-6):
 *   - During CDT (Mar 14 .. Nov 6 evenings): 6:30 pm wall clock = 17:30 CST (sauna CST hours 17 and 18).
 *   - During CST (Jan 1 .. Mar 13 & Nov 7 .. Dec 31 evenings): 6:30 pm wall clock = 18:30 CST (sauna CST hours 18 and 19).
 */
const CALENDAR_2027 = (() => {
  const days = new Array(365);
  const dstStartMs = Date.UTC(2027, 2, 14); // Mar 14, 2027
  const dstEndMs = Date.UTC(2027, 10, 7);   // Nov 7, 2027 (at 6:30 pm Nov 7, clocks are back on CST)

  for (let day = 0; day < 365; day++) {
    const ms = Date.UTC(2027, 0, 1 + day);
    const dt = new Date(ms);
    const dow = dt.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    const isSaunaDay = dow === 0 || dow === 2 || dow === 4 || dow === 6;
    const isDst = ms >= dstStartMs && ms < dstEndMs;
    const saunaCstStartHour = isDst ? 17 : 18;
    days[day] = {
      dayIndex: day,
      month: dt.getUTCMonth(),
      dayOfMonth: dt.getUTCDate(),
      dow,
      isSaunaDay,
      isDst,
      saunaCstStartHour,
      acKwPerKw: HOURLY_AC_WATTS_PER_KW.slice(day * 24, day * 24 + 24).map((w) => w / 1000.0),
    };
  }
  return days;
})();

export function normalizeInputs(rawInputs = {}) {
  const src = rawInputs && typeof rawInputs === 'object' ? rawInputs : {};
  const arrayKw =
    src.arrayKw !== undefined && src.arrayKw !== null && !Number.isNaN(Number(src.arrayKw))
      ? Math.max(0, Number(src.arrayKw))
      : DEFAULT_INPUTS.arrayKw;

  const exportPolicy =
    src.exportPolicy === 'net-billing' || src.exportPolicy === 'net-metering'
      ? src.exportPolicy
      : DEFAULT_INPUTS.exportPolicy;

  const battery =
    src.battery !== undefined && src.battery !== null ? Boolean(src.battery) : DEFAULT_INPUTS.battery;

  const gridPriceUsdPerKwh =
    src.gridPriceUsdPerKwh !== undefined &&
    src.gridPriceUsdPerKwh !== null &&
    !Number.isNaN(Number(src.gridPriceUsdPerKwh))
      ? Math.max(0, Number(src.gridPriceUsdPerKwh))
      : DEFAULT_INPUTS.gridPriceUsdPerKwh;

  const discountRatePct =
    src.discountRatePct !== undefined &&
    src.discountRatePct !== null &&
    !Number.isNaN(Number(src.discountRatePct))
      ? Number(src.discountRatePct)
      : DEFAULT_INPUTS.discountRatePct;

  return {
    arrayKw,
    exportPolicy,
    battery,
    gridPriceUsdPerKwh,
    discountRatePct,
  };
}

/**
 * Simulates 1 full year (365 days) of sub-hourly solar, sauna, and optional battery dispatch
 * for an effective array capacity `effArrayKw` (incorporating degradation in years 2..25).
 *
 * When `battery` is true, runs a cyclic warm-up pass so Jan 1 00:00 begins at the periodic
 * steady-state SOC from Dec 31 24:00 (ensuring exact conservation of energy with ΔSOC = 0).
 */
export function simulateDispatchYear(effArrayKw, battery, captureDetailed = false) {
  const { batteryUsableKwh, batteryMaxPowerKw, batteryRoundTripEff } = MODEL_CONSTANTS;

  let soc = 0.0;
  const passes = battery && effArrayKw > 0 ? 2 : 1;

  let annualSolarKwh = 0;
  let annualSaunaKwh = 0;
  let directSolarKwh = 0;
  let batteryKwh = 0;
  let solarChargedToBatteryKwh = 0;
  let gridKwh = 0;
  let powerCapGridKwh = 0;
  let exportedKwh = 0;

  let monthly = null;
  let socAtDayStart = null;

  for (let pass = 0; pass < passes; pass++) {
    const isFinalPass = pass === passes - 1;
    annualSolarKwh = 0;
    annualSaunaKwh = 0;
    directSolarKwh = 0;
    batteryKwh = 0;
    solarChargedToBatteryKwh = 0;
    gridKwh = 0;
    powerCapGridKwh = 0;
    exportedKwh = 0;

    if (isFinalPass && captureDetailed) {
      socAtDayStart = new Float64Array(365);
      monthly = MONTH_NAMES.map((name, idx) => ({
        monthIndex: idx,
        month: name,
        solarKwh: 0,
        saunaKwh: 0,
        directSolarKwh: 0,
        batteryKwh: 0,
        batteryLossKwh: 0,
        gridKwh: 0,
        exportedKwh: 0,
      }));
    }

    for (let day = 0; day < 365; day++) {
      const dInfo = CALENDAR_2027[day];
      const acProfile = dInfo.acKwPerKw;
      const sHr = dInfo.saunaCstStartHour;
      const mBucket = isFinalPass && captureDetailed ? monthly[dInfo.month] : null;
      if (isFinalPass && captureDetailed) {
        socAtDayStart[day] = soc;
      }

      for (let hr = 0; hr < 24; hr++) {
        const pSolar = acProfile[hr] * effArrayKw;

        // Only split into sub-hourly slices during the two sauna CST hours on sauna evenings
        if (dInfo.isSaunaDay && (hr === sHr || hr === sHr + 1)) {
          const steps =
            hr === sHr
              ? [
                  [0.5, 0.0],
                  [0.5, 8.0],
                ]
              : [
                  [0.25, 8.0],
                  [0.75, 4.0],
                ];

          for (let s = 0; s < 2; s++) {
            const dt = steps[s][0];
            const pLoad = steps[s][1];
            const eSolar = pSolar * dt;
            const eLoad = pLoad * dt;
            annualSolarKwh += eSolar;
            annualSaunaKwh += eLoad;

            const pDirect = pSolar < pLoad ? pSolar : pLoad;
            const eDirect = pDirect * dt;
            directSolarKwh += eDirect;

            const surplusKw = pSolar - pDirect;
            const remLoadKw = pLoad - pDirect;

            if (battery) {
              if (surplusKw > 0) {
                const pChargeCap = surplusKw < batteryMaxPowerKw ? surplusKw : batteryMaxPowerKw;
                const roomIn = (batteryUsableKwh - soc) / batteryRoundTripEff;
                const eIn = Math.min(pChargeCap * dt, roomIn);
                soc += eIn * batteryRoundTripEff;
                solarChargedToBatteryKwh += eIn;
                const eExp = surplusKw * dt - eIn;
                exportedKwh += eExp;
                if (mBucket) {
                  mBucket.solarKwh += eSolar;
                  mBucket.saunaKwh += eLoad;
                  mBucket.directSolarKwh += eDirect;
                  mBucket.batteryLossKwh += eIn * (1 - batteryRoundTripEff);
                  mBucket.exportedKwh += eExp;
                }
              } else if (remLoadKw > 0) {
                const pDisCap = remLoadKw < batteryMaxPowerKw ? remLoadKw : batteryMaxPowerKw;
                const eOut = Math.min(pDisCap * dt, soc);
                soc -= eOut;
                batteryKwh += eOut;
                const eGrid = remLoadKw * dt - eOut;
                gridKwh += eGrid;
                // Portion of grid import strictly due to 5 kW inverter ceiling (remLoadKw > 5 kW)
                const ePowerGap = Math.max(0, remLoadKw - batteryMaxPowerKw) * dt;
                powerCapGridKwh += Math.min(eGrid, ePowerGap);
                if (mBucket) {
                  mBucket.solarKwh += eSolar;
                  mBucket.saunaKwh += eLoad;
                  mBucket.directSolarKwh += eDirect;
                  mBucket.batteryKwh += eOut;
                  mBucket.gridKwh += eGrid;
                }
              } else if (mBucket) {
                mBucket.solarKwh += eSolar;
                mBucket.saunaKwh += eLoad;
                mBucket.directSolarKwh += eDirect;
              }
            } else {
              const eExp = surplusKw * dt;
              const eGrid = remLoadKw * dt;
              exportedKwh += eExp;
              gridKwh += eGrid;
              if (mBucket) {
                mBucket.solarKwh += eSolar;
                mBucket.saunaKwh += eLoad;
                mBucket.directSolarKwh += eDirect;
                mBucket.exportedKwh += eExp;
                mBucket.gridKwh += eGrid;
              }
            }
          }
        } else {
          // Idle sauna hour (pLoad = 0, dt = 1.0 h)
          annualSolarKwh += pSolar;
          if (battery && pSolar > 0) {
            const pChargeCap = pSolar < batteryMaxPowerKw ? pSolar : batteryMaxPowerKw;
            const roomIn = (batteryUsableKwh - soc) / batteryRoundTripEff;
            const eIn = Math.min(pChargeCap, roomIn);
            soc += eIn * batteryRoundTripEff;
            solarChargedToBatteryKwh += eIn;
            const eExp = pSolar - eIn;
            exportedKwh += eExp;
            if (mBucket) {
              mBucket.solarKwh += pSolar;
              mBucket.batteryLossKwh += eIn * (1 - batteryRoundTripEff);
              mBucket.exportedKwh += eExp;
            }
          } else {
            exportedKwh += pSolar;
            if (mBucket) {
              mBucket.solarKwh += pSolar;
              mBucket.exportedKwh += pSolar;
            }
          }
        }
      }
    }
  }

  return {
    annualSolarKwh,
    annualSaunaKwh,
    directSolarKwh,
    batteryKwh,
    solarChargedToBatteryKwh,
    batteryLossKwh: Math.max(0, solarChargedToBatteryKwh - batteryKwh),
    gridKwh,
    powerCapGridKwh,
    energyShortfallGridKwh: Math.max(0, gridKwh - powerCapGridKwh),
    exportedKwh,
    monthly,
    socAtDayStart,
  };
}

/**
 * Generates 96 quarter-hour intervals (00:00 to 24:00 wall-clock time) for a specific day of 2027.
 */
export function simulateSingleDayWallClock(dayIndex, arrayKw, battery, initialSoc = 0) {
  const dInfo = CALENDAR_2027[dayIndex];
  const prevDay = CALENDAR_2027[(dayIndex + 364) % 365];
  const { batteryUsableKwh, batteryMaxPowerKw, batteryRoundTripEff } = MODEL_CONSTANTS;

  let soc = battery ? initialSoc : 0;
  const intervals = [];

  for (let q = 0; q < 96; q++) {
    const clockHour = Math.floor(q / 4);
    const clockMinute = (q % 4) * 15;
    // Map wall-clock hour back to CST hour (during CDT, wall clock = CST + 1)
    let pSolar = 0;
    if (dInfo.isDst) {
      if (clockHour === 0) {
        pSolar = prevDay.acKwPerKw[23] * arrayKw;
      } else {
        pSolar = dInfo.acKwPerKw[clockHour - 1] * arrayKw;
      }
    } else {
      pSolar = dInfo.acKwPerKw[clockHour] * arrayKw;
    }

    // Sauna switches on at 6:30 pm (q = 74) on the wall clock every sauna day:
    // q = 74, 75, 76 (6:30-7:15 pm): 8.0 kW; q = 77, 78, 79 (7:15-8:00 pm): 4.0 kW
    let pLoad = 0;
    if (dInfo.isSaunaDay) {
      if (q >= 74 && q < 77) pLoad = 8.0;
      else if (q >= 77 && q < 80) pLoad = 4.0;
    }

    const dt = 0.25;
    const pDirect = Math.min(pSolar, pLoad);
    const surplusKw = pSolar - pDirect;
    const remLoadKw = pLoad - pDirect;

    let pBatteryChargeIn = 0;
    let pBatteryDischargeOut = 0;
    let pExport = 0;
    let pGridImport = 0;

    if (battery) {
      if (surplusKw > 0) {
        const capKw = Math.min(surplusKw, batteryMaxPowerKw);
        const eIn = Math.min(capKw * dt, (batteryUsableKwh - soc) / batteryRoundTripEff);
        soc += eIn * batteryRoundTripEff;
        pBatteryChargeIn = eIn / dt;
        pExport = surplusKw - pBatteryChargeIn;
      } else if (remLoadKw > 0) {
        const capKw = Math.min(remLoadKw, batteryMaxPowerKw);
        const eOut = Math.min(capKw * dt, soc);
        soc -= eOut;
        pBatteryDischargeOut = eOut / dt;
        pGridImport = remLoadKw - pBatteryDischargeOut;
      }
    } else {
      pExport = surplusKw;
      pGridImport = remLoadKw;
    }

    const hh = String(clockHour).padStart(2, '0');
    const mm = String(clockMinute).padStart(2, '0');
    intervals.push({
      q,
      timeLabel: `${hh}:${mm}`,
      hourDecimal: clockHour + clockMinute / 60,
      solarKw: pSolar,
      saunaKw: pLoad,
      directKw: pDirect,
      batteryChargeKw: pBatteryChargeIn,
      batteryDischargeKw: pBatteryDischargeOut,
      exportKw: pExport,
      gridImportKw: pGridImport,
      socKwh: soc,
    });
  }

  return {
    dayIndex,
    isDst: dInfo.isDst,
    isSaunaDay: dInfo.isSaunaDay,
    intervals,
  };
}

/**
 * Computes annual utility bill & savings given energy flows and prices.
 */
export function computeTariffSettlement(
  { annualSaunaKwh, saunaKwh, directSolarKwh, batteryKwh, gridKwh, exportedKwh },
  exportPolicy,
  gridPrice,
  exportPrice
) {
  const totalSaunaKwh = annualSaunaKwh !== undefined ? annualSaunaKwh : saunaKwh;
  const baselineBillUsd = totalSaunaKwh * gridPrice;
  let postSolarBillUsd;
  let retailOffsetKwh;
  let surplusExportKwh;

  if (exportPolicy === 'net-metering') {
    const netImportedKwh = Math.max(0, gridKwh - exportedKwh);
    surplusExportKwh = Math.max(0, exportedKwh - gridKwh);
    retailOffsetKwh = totalSaunaKwh - netImportedKwh;
    postSolarBillUsd = netImportedKwh * gridPrice - surplusExportKwh * exportPrice;
  } else {
    retailOffsetKwh = directSolarKwh + batteryKwh;
    surplusExportKwh = exportedKwh;
    postSolarBillUsd = gridKwh * gridPrice - exportedKwh * exportPrice;
  }

  const billSavingsUsd = baselineBillUsd - postSolarBillUsd;
  return {
    baselineBillUsd,
    postSolarBillUsd,
    billSavingsUsd,
    retailOffsetKwh,
    surplusExportKwh,
  };
}

/**
 * Solves for simple undiscounted payback (years) over the 25-year horizon, or null if never paid back.
 */
export function computeSimplePaybackYears(cashFlows) {
  if (!cashFlows || cashFlows.length < 2) return null;
  if (cashFlows[0] >= 0) return null;

  let cum = cashFlows[0];
  const cums = [cum];
  for (let y = 1; y < cashFlows.length; y++) {
    cum += cashFlows[y];
    cums.push(cum);
  }

  // Must finish the 25-year horizon non-negative (handles Year 13 battery replacement dip)
  if (cums[cums.length - 1] < -1e-9) {
    return null;
  }

  // Find the point after which cumulative undiscounted cash flow permanently stays >= 0
  let crossingYear = null;
  for (let y = 1; y < cums.length; y++) {
    if (cums[y - 1] < 0 && cums[y] >= 0) {
      crossingYear = y;
    }
  }
  if (crossingYear === null) return null;

  const prevCum = cums[crossingYear - 1];
  const cf = cashFlows[crossingYear];
  if (cf <= 0) return crossingYear;
  return crossingYear - 1 + -prevCum / cf;
}

/**
 * Solves for Internal Rate of Return (%) over 25 years, or null if no valid real IRR exists.
 */
export function computeIrrPct(cashFlows) {
  if (!cashFlows || cashFlows.length < 2) return null;
  const hasNegative = cashFlows.some((v) => v < -1e-9);
  const hasPositive = cashFlows.some((v) => v > 1e-9);
  if (!hasNegative || !hasPositive) return null;

  const npvAt = (rate) => {
    let total = 0;
    const base = 1 + rate;
    let denom = 1;
    for (let t = 0; t < cashFlows.length; t++) {
      if (t > 0) denom *= base;
      total += cashFlows[t] / denom;
    }
    return total;
  };

  // Scan brackets across (-99%, +1000%)
  const grid = [];
  for (let r = -0.98; r <= -0.1; r += 0.02) grid.push(r);
  for (let r = -0.095; r <= 0.5; r += 0.005) grid.push(r);
  for (let r = 0.55; r <= 5.0; r += 0.05) grid.push(r);

  const roots = [];
  let prevR = grid[0];
  let prevVal = npvAt(prevR);

  for (let i = 1; i < grid.length; i++) {
    const curR = grid[i];
    const curVal = npvAt(curR);
    if (Math.abs(curVal) < 1e-12) {
      roots.push(curR);
    } else if ((prevVal < 0 && curVal > 0) || (prevVal > 0 && curVal < 0)) {
      let lo = prevR;
      let hi = curR;
      let vLo = prevVal;
      for (let iter = 0; iter < 80; iter++) {
        const mid = 0.5 * (lo + hi);
        const vMid = npvAt(mid);
        if (Math.abs(vMid) < 1e-13) {
          lo = mid;
          hi = mid;
          break;
        }
        if ((vLo < 0 && vMid > 0) || (vLo > 0 && vMid < 0)) {
          hi = mid;
        } else {
          lo = mid;
          vLo = vMid;
        }
      }
      roots.push(0.5 * (lo + hi));
    }
    prevR = curR;
    prevVal = curVal;
  }

  if (roots.length !== 1) {
    return roots.length === 0 ? null : roots[roots.length - 1] * 100;
  }
  return roots[0] * 100;
}

/**
 * Core evaluation engine shared by `window.saunaModel(inputs)` and the interactive UI.
 */
export function evaluateScenario(rawInputs = {}, { detailed = false } = {}) {
  const inputs = normalizeInputs(rawInputs);
  const { arrayKw, exportPolicy, battery, gridPriceUsdPerKwh, discountRatePct } = inputs;
  const {
    solarCostPerKwUsd,
    federalItcRate2027,
    exportCreditYear1UsdPerKwh,
    priceEscalationRate,
    panelDegradationRate,
    analysisYears,
    batteryUpfrontCostUsd,
    batteryReplacementYear,
    batteryReplacementCostUsd,
  } = MODEL_CONSTANTS;

  const grossCapexUsd = arrayKw * solarCostPerKwUsd + (battery ? batteryUpfrontCostUsd : 0);
  const federalTaxCreditUsd = grossCapexUsd * federalItcRate2027;
  const upfrontCostUsd = grossCapexUsd - federalTaxCreditUsd;

  const discountRate = discountRatePct / 100.0;
  const cashFlows = [-upfrontCostUsd];
  const yearlySchedule = [];

  let cumNominalUsd = -upfrontCostUsd;
  let cumDiscountedUsd = -upfrontCostUsd;

  if (detailed) {
    yearlySchedule.push({
      year: 0,
      calendarYear: 2027,
      degradationFactor: 1.0,
      solarKwh: 0,
      saunaKwh: 0,
      directSolarKwh: 0,
      batteryKwh: 0,
      batteryLossKwh: 0,
      gridKwh: 0,
      exportedKwh: 0,
      gridPrice: gridPriceUsdPerKwh,
      exportPrice: exportCreditYear1UsdPerKwh,
      baselineBillUsd: 0,
      postSolarBillUsd: 0,
      billSavingsUsd: 0,
      capexOrReplacementUsd: -upfrontCostUsd,
      netCashFlowUsd: -upfrontCostUsd,
      discountFactor: 1.0,
      discountedCashFlowUsd: -upfrontCostUsd,
      cumNominalUsd,
      cumDiscountedUsd,
    });
  }

  let year1Dispatch = null;
  let year1Settlement = null;
  let npvUsd = -upfrontCostUsd;
  let pvBaselineSaunaBillsUsd = 0;

  for (let yr = 1; yr <= analysisYears; yr++) {
    const degradationFactor = Math.pow(1 - panelDegradationRate, yr - 1);
    const effArrayKw = arrayKw * degradationFactor;
    const dispatch = simulateDispatchYear(effArrayKw, battery, detailed && yr === 1);

    const escalation = Math.pow(1 + priceEscalationRate, yr - 1);
    const gridPrice = gridPriceUsdPerKwh * escalation;
    const exportPrice = exportCreditYear1UsdPerKwh * escalation;

    const settlement = computeTariffSettlement(dispatch, exportPolicy, gridPrice, exportPrice);
    const capexOrReplacementUsd = battery && yr === batteryReplacementYear ? -batteryReplacementCostUsd : 0;
    const netCashFlowUsd = settlement.billSavingsUsd + capexOrReplacementUsd;

    const discountFactor = 1 / Math.pow(1 + discountRate, yr);
    const discountedCashFlowUsd = netCashFlowUsd * discountFactor;

    cashFlows.push(netCashFlowUsd);
    npvUsd += discountedCashFlowUsd;
    cumNominalUsd += netCashFlowUsd;
    cumDiscountedUsd += discountedCashFlowUsd;
    pvBaselineSaunaBillsUsd += settlement.baselineBillUsd * discountFactor;

    if (yr === 1) {
      year1Dispatch = dispatch;
      year1Settlement = settlement;
    }

    if (detailed) {
      yearlySchedule.push({
        year: yr,
        calendarYear: 2026 + yr,
        degradationFactor,
        solarKwh: dispatch.annualSolarKwh,
        saunaKwh: dispatch.annualSaunaKwh,
        directSolarKwh: dispatch.directSolarKwh,
        batteryKwh: dispatch.batteryKwh,
        batteryLossKwh: dispatch.batteryLossKwh,
        gridKwh: dispatch.gridKwh,
        exportedKwh: dispatch.exportedKwh,
        gridPrice,
        exportPrice,
        baselineBillUsd: settlement.baselineBillUsd,
        postSolarBillUsd: settlement.postSolarBillUsd,
        billSavingsUsd: settlement.billSavingsUsd,
        capexOrReplacementUsd,
        netCashFlowUsd,
        discountFactor,
        discountedCashFlowUsd,
        cumNominalUsd,
        cumDiscountedUsd,
      });
    }
  }

  const paybackYears = computeSimplePaybackYears(cashFlows);
  const irrPct = computeIrrPct(cashFlows);

  const summary = {
    annualSolarKwh: year1Dispatch.annualSolarKwh,
    annualSaunaKwh: year1Dispatch.annualSaunaKwh,
    directSolarKwh: year1Dispatch.directSolarKwh,
    batteryKwh: year1Dispatch.batteryKwh,
    gridKwh: year1Dispatch.gridKwh,
    exportedKwh: year1Dispatch.exportedKwh,
    federalTaxCreditUsd,
    upfrontCostUsd,
    year1SavingsUsd: year1Settlement.billSavingsUsd,
    npvUsd,
    paybackYears,
    irrPct,
  };

  if (!detailed) {
    return { inputs, summary };
  }

  // Representative 24-hour profiles (wall-clock 15-min intervals)
  // Day 172 = Tue Jun 22, 2027 (CDT sauna night)
  // Day 76  = Thu Mar 18, 2027 (CDT spring sauna night)
  // Day 354 = Tue Dec 21, 2027 (CST winter solstice sauna night)
  // Day 173 = Wed Jun 23, 2027 (CDT sunny idle day)
  const socStarts = year1Dispatch.socAtDayStart;
  const dailyProfiles = {
    summerSolstice: {
      id: 'summerSolstice',
      label: 'Summer Solstice Sauna (Tue, Jun 22 · CDT)',
      shortLabel: 'Jun 22 (Tue Sauna)',
      ...simulateSingleDayWallClock(172, arrayKw, battery, socStarts[172]),
    },
    springEquinox: {
      id: 'springEquinox',
      label: 'Spring Equinox Sauna (Thu, Mar 18 · CDT)',
      shortLabel: 'Mar 18 (Thu Sauna)',
      ...simulateSingleDayWallClock(76, arrayKw, battery, socStarts[76]),
    },
    winterSolstice: {
      id: 'winterSolstice',
      label: 'Winter Solstice Sauna (Tue, Dec 21 · CST)',
      shortLabel: 'Dec 21 (Tue Sauna)',
      ...simulateSingleDayWallClock(354, arrayKw, battery, socStarts[354]),
    },
    sunnyIdleDay: {
      id: 'sunnyIdleDay',
      label: 'Midweek Non-Sauna Day (Wed, Jun 23 · CDT)',
      shortLabel: 'Jun 23 (Wed Idle)',
      ...simulateSingleDayWallClock(173, arrayKw, battery, socStarts[173]),
    },
  };

  return {
    inputs,
    summary,
    solarMeta: SOLAR_RESOURCE_META,
    grossCapexUsd,
    year1Dispatch,
    year1Settlement,
    pvBaselineSaunaBillsUsd,
    cumNominal25Usd: cumNominalUsd,
    yearlySchedule,
    dailyProfiles,
  };
}

/**
 * Public verification contract exposed as `window.saunaModel(inputs)`.
 */
export function saunaModel(inputs = {}) {
  return evaluateScenario(inputs, { detailed: false }).summary;
}

/**
 * Precompute fast lookup knot table for battery dispatch as a function of effective kW (0..12 kW)
 * so interactive multi-curve sizing charts & 35-cell sensitivity matrices render in < 2ms,
 * while the active scenario and `window.saunaModel` always execute the exact uninterpolated model.
 */
let batteryDispatchLookup = null;
function getFastDispatch(effArrayKw, battery) {
  if (!battery) {
    return simulateDispatchYear(effArrayKw, false, false);
  }
  if (!batteryDispatchLookup) {
    const knots = [];
    for (let i = 0; i <= 60; i++) {
      const kw = i <= 40 ? i * 0.15 : 6.0 + (i - 40) * 0.3; // 0..6 kW every 0.15 kW, 6..12 kW every 0.3 kW
      knots.push({ kw, d: simulateDispatchYear(kw, true, false) });
    }
    batteryDispatchLookup = knots;
  }
  const knots = batteryDispatchLookup;
  if (effArrayKw <= 0) return knots[0].d;
  if (effArrayKw >= knots[knots.length - 1].kw) {
    return simulateDispatchYear(effArrayKw, true, false);
  }
  let hi = 1;
  while (hi < knots.length - 1 && knots[hi].kw < effArrayKw) hi++;
  const lo = hi - 1;
  const k0 = knots[lo];
  const k1 = knots[hi];
  const t = k1.kw === k0.kw ? 0 : (effArrayKw - k0.kw) / (k1.kw - k0.kw);
  const lerp = (a, b) => a + (b - a) * t;
  return {
    annualSolarKwh: lerp(k0.d.annualSolarKwh, k1.d.annualSolarKwh),
    annualSaunaKwh: 1872,
    directSolarKwh: lerp(k0.d.directSolarKwh, k1.d.directSolarKwh),
    batteryKwh: lerp(k0.d.batteryKwh, k1.d.batteryKwh),
    gridKwh: lerp(k0.d.gridKwh, k1.d.gridKwh),
    exportedKwh: lerp(k0.d.exportedKwh, k1.d.exportedKwh),
  };
}

export function evaluateFastSummary(rawInputs) {
  const inputs = normalizeInputs(rawInputs);
  const { arrayKw, exportPolicy, battery, gridPriceUsdPerKwh, discountRatePct } = inputs;
  const {
    solarCostPerKwUsd,
    exportCreditYear1UsdPerKwh,
    priceEscalationRate,
    panelDegradationRate,
    analysisYears,
    batteryUpfrontCostUsd,
    batteryReplacementYear,
    batteryReplacementCostUsd,
  } = MODEL_CONSTANTS;

  const upfrontCostUsd = arrayKw * solarCostPerKwUsd + (battery ? batteryUpfrontCostUsd : 0);
  const discountRate = discountRatePct / 100.0;
  const cashFlows = [-upfrontCostUsd];
  let npvUsd = -upfrontCostUsd;
  let yr1Sav = 0;

  for (let yr = 1; yr <= analysisYears; yr++) {
    const effKw = arrayKw * Math.pow(1 - panelDegradationRate, yr - 1);
    const disp = getFastDispatch(effKw, battery);
    const esc = Math.pow(1 + priceEscalationRate, yr - 1);
    const set = computeTariffSettlement(
      disp,
      exportPolicy,
      gridPriceUsdPerKwh * esc,
      exportCreditYear1UsdPerKwh * esc
    );
    if (yr === 1) yr1Sav = set.billSavingsUsd;
    const cf = set.billSavingsUsd + (battery && yr === batteryReplacementYear ? -batteryReplacementCostUsd : 0);
    cashFlows.push(cf);
    npvUsd += cf / Math.pow(1 + discountRate, yr);
  }

  return {
    upfrontCostUsd,
    year1SavingsUsd: yr1Sav,
    npvUsd,
    paybackYears: computeSimplePaybackYears(cashFlows),
    irrPct: computeIrrPct(cashFlows),
  };
}

/**
 * Solves break-even thresholds for the active scenario so the essay can tell the reader
 * exactly what would have to change for the verdict to flip.
 */
export function computeBreakEvenThresholds(inputs, detailedResult) {
  const { arrayKw, exportPolicy, battery, gridPriceUsdPerKwh, discountRatePct } = inputs;
  const discountRate = discountRatePct / 100.0;

  // 1. Break-even Solar Cost ($/W): since solar CapEx only affects Year 0 linearly!
  // Current NPV = -arrayKw*3000 - battCapex + PV(operating cash flows).
  // Setting NPV = 0 => allowable solar CapEx = currentSolarCapex + npvUsd!
  const currentSolarCapex = arrayKw * 3000;
  const breakEvenSolarCapex = currentSolarCapex + detailedResult.summary.npvUsd;
  const breakEvenCostPerWatt = arrayKw > 0 ? breakEvenSolarCapex / (arrayKw * 1000) : null;

  // 2. Counterfactual NPV if the pre-2026 30% Federal Residential Clean Energy Credit (§ 25D) still existed
  const itc30CreditUsd = detailedResult.grossCapexUsd * 0.3;
  const npvWith30PctItc = detailedResult.summary.npvUsd + itc30CreditUsd;

  // 3. Break-even Grid Electricity Price ($/kWh) via bisection on [0.01, 2.50]
  let breakEvenGridPrice = null;
  if (arrayKw > 0) {
    const fPrice = (gp) => evaluateFastSummary({ ...inputs, gridPriceUsdPerKwh: gp }).npvUsd;
    const vLo = fPrice(0.01);
    const vHi = fPrice(2.5);
    if (vLo <= 0 && vHi >= 0) {
      let lo = 0.01;
      let hi = 2.5;
      for (let i = 0; i < 45; i++) {
        const mid = 0.5 * (lo + hi);
        if (fPrice(mid) >= 0) hi = mid;
        else lo = mid;
      }
      breakEvenGridPrice = 0.5 * (lo + hi);
    } else if (vLo > 0) {
      breakEvenGridPrice = 0.01;
    }
  }

  // 4. Incremental PV value of adding the 13.5 kWh battery (vs Solar Only at same kW & tariff)
  const noBattSummary = saunaModel({ ...inputs, battery: false });
  const withBattSummary = battery ? detailedResult.summary : saunaModel({ ...inputs, battery: true });
  const batteryCapexPv = 11000 + 6000 / Math.pow(1 + discountRate, 13);
  // Since withBattNpv - noBattNpv = PV(incremental bill savings of battery) - batteryCapexPv:
  const batteryIncrementalBillPv = withBattSummary.npvUsd - noBattSummary.npvUsd + batteryCapexPv;

  return {
    breakEvenCostPerWatt,
    breakEvenGridPrice,
    itc30CreditUsd,
    npvWith30PctItc,
    batteryCapexPv,
    batteryIncrementalBillPv,
    batteryNetNpvDelta: withBattSummary.npvUsd - noBattSummary.npvUsd,
  };
}
