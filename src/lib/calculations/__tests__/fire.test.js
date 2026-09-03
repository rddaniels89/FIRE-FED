import { describe, expect, it } from 'vitest';
import { calculateFireGap } from '../fire';

describe('fire calculations', () => {
  it('computes a gap and readiness correctly', () => {
    const gap = calculateFireGap({
      tspProjectedBalance: 1200000, // 4% => 48k/yr => 4k/mo
      pensionMonthly: 1000,
      fire: { monthlyFireIncomeGoal: 4000, sideHustleIncome: 0, spouseIncome: 0 },
    });

    expect(gap.totalPassiveIncome).toBeCloseTo(5000, 0);
    expect(gap.isFireReady).toBe(true);
  });

  it('excludes pension at desired FIRE age if pension starts later and computes bridge', () => {
    const gap = calculateFireGap({
      tspProjectedBalance: 1200000, // 4% => 4k/mo
      pensionMonthly: 1000,
      fire: { monthlyFireIncomeGoal: 4500, sideHustleIncome: 0, spouseIncome: 0 },
      safeWithdrawalRate: 0.04,
      desiredFireAge: 55,
      pensionStartAge: 62,
    });

    expect(gap.pension?.pensionMonthlyAtDesiredAge).toBe(0);
    expect(gap.totalPassiveIncomeAtDesiredAge).toBeCloseTo(4000, 0);
    expect(gap.isFireReadyAtDesiredAge).toBe(false);

    expect(gap.pension?.pensionMonthlyAfterStart).toBe(1000);
    expect(gap.totalPassiveIncomeAfterPension).toBeCloseTo(5000, 0);
    expect(gap.isFireReadyAfterPension).toBe(true);

    expect(gap.bridge?.yearsToBridge).toBe(7);
    // Shortfall is $500/mo for 7 years => $42,000 bridge estimate
    expect(gap.bridge?.monthlyShortfall).toBeCloseTo(500, 0);
    expect(gap.bridge?.requiredBridgeAssets).toBeCloseTo(42000, 0);
  });
});



describe('the Special Retirement Supplement as bridge income', () => {
  const base = {
    tspProjectedBalance: 600000,
    pensionMonthly: 2500,
    fire: { monthlyFireIncomeGoal: 6000, sideHustleIncome: 0, spouseIncome: 0 },
    safeWithdrawalRate: 0.04,
    desiredFireAge: 57,
    pensionStartAge: 57,
  };

  // The gap this closes: the supplement was modelled and displayed on the FERS
  // page but invisible to the calculation that answers "can I retire early?".
  it('counts toward income before 62', () => {
    const without = calculateFireGap(base);
    const with_ = calculateFireGap({ ...base, supplementMonthly: 1500, supplementStartAge: 57 });

    expect(with_.totalPassiveIncomeAtDesiredAge - without.totalPassiveIncomeAtDesiredAge).toBeCloseTo(1500, 6);
    expect(with_.monthlyGapAtDesiredAge).toBeGreaterThan(without.monthlyGapAtDesiredAge);
  });

  it('can be the difference between ready and not ready', () => {
    const tight = { ...base, fire: { ...base.fire, monthlyFireIncomeGoal: 5500 } };
    expect(calculateFireGap(tight).isFireReadyAtDesiredAge).toBe(false);
    expect(calculateFireGap({ ...tight, supplementMonthly: 1500, supplementStartAge: 57 }).isFireReadyAtDesiredAge).toBe(true);
  });

  // Planning to the pre-62 figure and discovering the drop later is the specific
  // mistake this is meant to prevent.
  it('reports the income cliff when it stops at 62', () => {
    const r = calculateFireGap({ ...base, supplementMonthly: 1500, supplementStartAge: 57 });

    expect(r.supplement.payableAtDesiredAge).toBe(true);
    expect(r.supplement.yearsPayableFromDesiredAge).toBe(5);
    expect(r.supplement.incomeCliffAt62).toBeCloseTo(1500, 6);
    expect(r.totalPassiveIncomeAtDesiredAge - r.totalPassiveIncomeAfterSupplementEnds).toBeCloseTo(1500, 6);
  });

  it('pays nothing to someone already 62 or older', () => {
    const r = calculateFireGap({
      ...base,
      desiredFireAge: 62,
      pensionStartAge: 62,
      supplementMonthly: 1500,
      supplementStartAge: 62,
    });
    expect(r.supplement.payableAtDesiredAge).toBe(false);
    expect(r.supplement.monthlyAtDesiredAge).toBe(0);
  });

  it('pays nothing before its start age', () => {
    const r = calculateFireGap({ ...base, desiredFireAge: 52, supplementMonthly: 1500, supplementStartAge: 57 });
    expect(r.supplement.payableAtDesiredAge).toBe(false);
  });

  it('shrinks the bridge it has to cover', () => {
    const gapped = { ...base, desiredFireAge: 52, pensionStartAge: 57 };
    const without = calculateFireGap(gapped);
    const with_ = calculateFireGap({ ...gapped, supplementMonthly: 1200, supplementStartAge: 52 });
    expect(with_.bridge.requiredBridgeAssets).toBeLessThan(without.bridge.requiredBridgeAssets);
  });

  it('changes nothing when no supplement is passed', () => {
    const r = calculateFireGap(base);
    expect(r.supplement.monthly).toBe(0);
    expect(r.totalPassiveIncomeAtDesiredAge).toBeCloseTo(r.totalPassiveIncomeAfterSupplementEnds, 6);
  });
});
