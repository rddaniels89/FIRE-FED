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


