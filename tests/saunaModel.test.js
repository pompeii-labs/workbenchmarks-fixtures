import { describe, it, expect } from 'vitest';
import {
  saunaModel,
  evaluateScenario,
  evaluateFastSummary,
  DEFAULT_INPUTS,
} from '../src/model/saunaModel.js';

describe('saunaModel verification suite', () => {
  it('returns all required fields with valid types on default inputs', () => {
    const res = saunaModel();
    const expectedKeys = [
      'annualSolarKwh',
      'annualSaunaKwh',
      'directSolarKwh',
      'batteryKwh',
      'gridKwh',
      'exportedKwh',
      'federalTaxCreditUsd',
      'upfrontCostUsd',
      'year1SavingsUsd',
      'npvUsd',
      'paybackYears',
      'irrPct',
    ];
    for (const k of expectedKeys) {
      expect(res).toHaveProperty(k);
    }

    // 208 sauna evenings (Tue/Thu/Sat/Sun in 2027) * 9 kWh = 1,872 kWh
    expect(res.annualSaunaKwh).toBeCloseTo(1872, 6);
    // 3.0 kW * 1,397.62 kWh/kW = 4,192.86 kWh
    expect(res.annualSolarKwh).toBeCloseTo(3.0 * 1397.62, 1);

    // Spring 2027 homeowner purchase: IRC § 25D expired Dec 31, 2025 -> $0 federal credit
    expect(res.federalTaxCreditUsd).toBe(0);
    expect(res.upfrontCostUsd).toBe(9000);
    expect(res.batteryKwh).toBe(0);

    // Exact sauna energy balance
    expect(res.directSolarKwh + res.batteryKwh + res.gridKwh).toBeCloseTo(res.annualSaunaKwh, 6);
    // Exact solar energy balance without battery
    expect(res.directSolarKwh + res.exportedKwh).toBeCloseTo(res.annualSolarKwh, 6);
  });

  it('matches partial inputs merged with page defaults', () => {
    const def = saunaModel({});
    const explicit = saunaModel(DEFAULT_INPUTS);
    expect(def).toEqual(explicit);
  });

  it('conserves both sauna and solar energy with 90% RTE battery enabled', () => {
    const det = evaluateScenario({ arrayKw: 2.5, battery: true, exportPolicy: 'net-billing' }, { detailed: true });
    const s = det.summary;
    const d1 = det.year1Dispatch;

    expect(s.annualSaunaKwh).toBeCloseTo(1872, 6);
    expect(s.directSolarKwh + s.batteryKwh + s.gridKwh).toBeCloseTo(1872, 6);

    // Round-trip efficiency in cyclic steady state must equal 90.0%
    expect(s.batteryKwh / d1.solarChargedToBatteryKwh).toBeCloseTo(0.9, 6);
    expect(s.directSolarKwh + d1.solarChargedToBatteryKwh + s.exportedKwh).toBeCloseTo(s.annualSolarKwh, 6);

    // Even with huge array + full 13.5 kWh battery, 8 kW preheat > 5 kW battery cap forces grid import
    const big = saunaModel({ arrayKw: 8.0, battery: true, exportPolicy: 'net-billing' });
    expect(big.gridKwh).toBeGreaterThan(390);
    expect(big.upfrontCostUsd).toBe(8.0 * 3000 + 11000);
  });

  it('verifies net-metering vs net-billing tariff math and NPV/IRR consistency', () => {
    // 1.4 kW under net metering (no battery) is positive NPV
    const sweet = saunaModel({ arrayKw: 1.4, exportPolicy: 'net-metering', battery: false });
    expect(sweet.npvUsd).toBeGreaterThan(1350);
    expect(sweet.irrPct).toBeGreaterThan(7.5);
    expect(sweet.paybackYears).toBeGreaterThan(11);
    expect(sweet.paybackYears).toBeLessThan(12.5);

    // Net billing without battery never pays back in 25 years -> paybackYears === null
    const nb = saunaModel({ arrayKw: 2.0, exportPolicy: 'net-billing', battery: false });
    expect(nb.npvUsd).toBeLessThan(-3500);
    expect(nb.paybackYears).toBeNull();
    expect(nb.irrPct).toBeLessThan(0);

    // At discountRatePct === irrPct, NPV must equal 0!
    const atIrr = saunaModel({
      arrayKw: 3.0,
      exportPolicy: 'net-metering',
      battery: false,
      discountRatePct: saunaModel({ arrayKw: 3.0, exportPolicy: 'net-metering', battery: false }).irrPct,
    });
    expect(atIrr.npvUsd).toBeCloseTo(0, 4);
  });

  it('handles zero-investment and impossible-IRR edge cases cleanly', () => {
    const zero = saunaModel({ arrayKw: 0, battery: false });
    expect(zero.annualSolarKwh).toBe(0);
    expect(zero.upfrontCostUsd).toBe(0);
    expect(zero.year1SavingsUsd).toBe(0);
    expect(zero.npvUsd).toBeCloseTo(0, 8);
    expect(zero.paybackYears).toBeNull();
    expect(zero.irrPct).toBeNull();

    const battOnly = saunaModel({ arrayKw: 0, battery: true });
    expect(battOnly.batteryKwh).toBe(0);
    expect(battOnly.upfrontCostUsd).toBe(11000);
    expect(battOnly.paybackYears).toBeNull();
    expect(battOnly.irrPct).toBeNull();
  });

  it('verifies fast lookup summary closely matches exact simulation', () => {
    const exact = saunaModel({ arrayKw: 2.35, battery: true, exportPolicy: 'net-billing' });
    const fast = evaluateFastSummary({ arrayKw: 2.35, battery: true, exportPolicy: 'net-billing' });
    expect(Math.abs(exact.npvUsd - fast.npvUsd)).toBeLessThan(2.0);
  });
});
