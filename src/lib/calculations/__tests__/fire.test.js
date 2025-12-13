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
});


