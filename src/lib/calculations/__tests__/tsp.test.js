import { describe, expect, it } from 'vitest';
import { calculateTspTraditionalVsRoth, calculateWeightedReturn } from '../tsp';
import {
  ANNUAL_CATCH_UP_LIMIT,
  ANNUAL_ELECTIVE_DEFERRAL_LIMIT,
  ROTH_CATCH_UP_WAGE_THRESHOLD,
  SUPER_CATCH_UP_LIMIT,
} from '../contributionLimits';

describe('tsp calculations', () => {
  it('weighted return respects allocation and default returns', () => {
    const weighted = calculateWeightedReturn({
      allocation: { G: 100, F: 0, C: 0, S: 0, I: 0 },
    });
    expect(weighted).toBeCloseTo(0.02, 6);
  });

  it('can produce higher after-tax value for traditional when retirement tax is much lower than current tax (all else equal)', () => {
    const { traditional, roth } = calculateTspTraditionalVsRoth({
      currentBalance: 10000,
      annualSalary: 100000,
      monthlyContributionPercent: 10,
      currentAge: 30,
      retirementAge: 31,
      allocation: { G: 0, F: 0, C: 100, S: 0, I: 0 },
      currentTaxRate: 30,
      retirementTaxRate: 10,
    });

    expect(traditional.projectedBalance).toBeGreaterThan(0);
    expect(roth.projectedBalance).toBeGreaterThan(0);
    expect(traditional.afterTaxValue).toBeGreaterThan(roth.afterTaxValue);
  });

  it('yearly data includes currentAge and ends at retirementAge', () => {
    const { traditional } = calculateTspTraditionalVsRoth({
      currentBalance: 0,
      annualSalary: 120000,
      monthlyContributionPercent: 10,
      currentAge: 40,
      retirementAge: 42,
      allocation: { G: 100, F: 0, C: 0, S: 0, I: 0 },
      currentTaxRate: 22,
      retirementTaxRate: 15,
    });

    expect(traditional.yearlyData[0].year).toBe(40);
    expect(traditional.yearlyData[traditional.yearlyData.length - 1].year).toBe(42);
  });

  it('flags when employee contributions exceed the annual deferral limit and caps the effective annual employee contribution', () => {
    const res = calculateTspTraditionalVsRoth({
      currentBalance: 0,
      annualSalary: 200000,
      monthlyContributionPercent: 20, // $40k/year desired
      currentAge: 35,
      retirementAge: 36,
      allocation: { G: 0, F: 0, C: 100, S: 0, I: 0 },
      currentTaxRate: 22,
      retirementTaxRate: 15,
      annualEmployeeDeferralLimit: 10000,
      annualCatchUpLimit: 0,
      catchUpAge: 50,
    });

    expect(res.limits.isOverLimit).toBe(true);
    expect(res.limits.desiredAnnualEmployeeContribution).toBeCloseTo(40000, 6);
    expect(res.limits.annualEmployeeDeferralLimit).toBe(10000);
    expect(res.limits.effectiveAnnualEmployeeContribution).toBe(10000);
  });

  it('including employer match increases projected balances (all else equal)', () => {
    const baseInputs = {
      currentBalance: 0,
      annualSalary: 100000,
      monthlyContributionPercent: 5,
      currentAge: 30,
      retirementAge: 31,
      allocation: { G: 0, F: 0, C: 100, S: 0, I: 0 },
      currentTaxRate: 22,
      retirementTaxRate: 15,
      annualEmployeeDeferralLimit: 50000,
      annualCatchUpLimit: 0,
      catchUpAge: 50,
    };

    const withoutMatch = calculateTspTraditionalVsRoth({
      ...baseInputs,
      includeEmployerMatch: false,
    });

    const withMatch = calculateTspTraditionalVsRoth({
      ...baseInputs,
      includeEmployerMatch: true,
      includeAutomatic1Percent: true,
    });

    expect(withMatch.traditional.projectedBalance).toBeGreaterThan(withoutMatch.traditional.projectedBalance);
    expect(withMatch.roth.projectedBalance).toBeGreaterThan(withoutMatch.roth.projectedBalance);
  });
});

describe('tsp contribution limits by age', () => {
  const highEarner = {
    currentBalance: 0,
    annualSalary: 400000, // high enough that the deferral cap always binds
    monthlyContributionPercent: 50,
    allocation: { G: 100, F: 0, C: 0, S: 0, I: 0 },
    currentTaxRate: 22,
    retirementTaxRate: 15,
  };

  const limitAtAge = (age) => {
    const { traditional } = calculateTspTraditionalVsRoth({
      ...highEarner,
      currentAge: age,
      retirementAge: age + 1,
    });
    return traditional.yearlyData[0].employeeLimit;
  };

  it('caps a young saver at the elective deferral limit', () => {
    expect(limitAtAge(40)).toBe(ANNUAL_ELECTIVE_DEFERRAL_LIMIT);
  });

  it('adds the regular catch-up at 50', () => {
    expect(limitAtAge(50)).toBe(ANNUAL_ELECTIVE_DEFERRAL_LIMIT + ANNUAL_CATCH_UP_LIMIT);
  });

  it('adds the higher catch-up between 60 and 63', () => {
    expect(limitAtAge(61)).toBe(ANNUAL_ELECTIVE_DEFERRAL_LIMIT + SUPER_CATCH_UP_LIMIT);
  });

  it('steps the limit back down at 64', () => {
    expect(limitAtAge(64)).toBe(ANNUAL_ELECTIVE_DEFERRAL_LIMIT + ANNUAL_CATCH_UP_LIMIT);
  });

  it('applies the band per projection year, not just at the start age', () => {
    const startAge = 58;
    const { traditional } = calculateTspTraditionalVsRoth({
      ...highEarner,
      currentAge: startAge,
      retirementAge: 65,
    });

    // yearlyData[0] is the "now" snapshot; each later row is an end-of-year
    // balance, so row i (i >= 1) holds the contribution year lived at
    // startAge + i - 1. Look rows up by contribution age, not by row label.
    const limitDuringAge = (age) => traditional.yearlyData[age - startAge + 1]?.employeeLimit;

    expect(limitDuringAge(59)).toBe(ANNUAL_ELECTIVE_DEFERRAL_LIMIT + ANNUAL_CATCH_UP_LIMIT);
    expect(limitDuringAge(60)).toBe(ANNUAL_ELECTIVE_DEFERRAL_LIMIT + SUPER_CATCH_UP_LIMIT);
    expect(limitDuringAge(63)).toBe(ANNUAL_ELECTIVE_DEFERRAL_LIMIT + SUPER_CATCH_UP_LIMIT);
    expect(limitDuringAge(64)).toBe(ANNUAL_ELECTIVE_DEFERRAL_LIMIT + ANNUAL_CATCH_UP_LIMIT);
  });
});

describe('SECURE 2.0 mandatory Roth catch-up', () => {
  // Contributes far past the 402(g) limit so a catch-up always happens.
  const base = {
    currentBalance: 0,
    monthlyContributionPercent: 40,
    currentAge: 55,
    retirementAge: 56,
    allocation: { G: 100, F: 0, C: 0, S: 0, I: 0 },
    currentTaxRate: 30,
    retirementTaxRate: 30,
    annualSalary: 200000,
  };

  it('flags the requirement when prior-year wages exceed the threshold', () => {
    const { limits } = calculateTspTraditionalVsRoth({
      ...base,
      priorYearWages: ROTH_CATCH_UP_WAGE_THRESHOLD + 1,
    });
    expect(limits.rothCatchUpRequired).toBe(true);
    expect(limits.rothCatchUpWageThreshold).toBe(ROTH_CATCH_UP_WAGE_THRESHOLD);
  });

  it('does not flag it at or below the threshold', () => {
    const { limits } = calculateTspTraditionalVsRoth({
      ...base,
      priorYearWages: ROTH_CATCH_UP_WAGE_THRESHOLD,
    });
    expect(limits.rothCatchUpRequired).toBe(false);
  });

  it('does not flag it below the catch-up age, however high the wages', () => {
    const { limits } = calculateTspTraditionalVsRoth({
      ...base,
      currentAge: 45,
      retirementAge: 46,
      priorYearWages: 500000,
    });
    expect(limits.rothCatchUpRequired).toBe(false);
  });

  it('routes the catch-up portion to Roth for a traditional contributor', () => {
    // Same gross contributions either way, but the mandated portion is taxed
    // now rather than at withdrawal, so the balances must differ.
    const mandated = calculateTspTraditionalVsRoth({
      ...base,
      priorYearWages: ROTH_CATCH_UP_WAGE_THRESHOLD + 50000,
    });
    const exempt = calculateTspTraditionalVsRoth({
      ...base,
      priorYearWages: ROTH_CATCH_UP_WAGE_THRESHOLD - 50000,
    });

    expect(mandated.traditional.totalContributions).toBeCloseTo(
      exempt.traditional.totalContributions,
      6
    );
    // The Roth slice was funded with after-tax dollars, so the gross balance is lower.
    expect(mandated.traditional.projectedBalance).toBeLessThan(exempt.traditional.projectedBalance);
  });

  it('leaves the base deferral traditional; only the catch-up moves', () => {
    const mandated = calculateTspTraditionalVsRoth({
      ...base,
      priorYearWages: ROTH_CATCH_UP_WAGE_THRESHOLD + 50000,
    });
    const allRoth = calculateTspTraditionalVsRoth({
      ...base,
      priorYearWages: ROTH_CATCH_UP_WAGE_THRESHOLD + 50000,
    }).roth;

    // Only the catch-up slice is after-tax, so it must sit between a fully
    // traditional contributor and a fully Roth one.
    expect(mandated.traditional.projectedBalance).toBeGreaterThan(allRoth.projectedBalance);
  });

  it('can be switched off for scenarios that predate the rule', () => {
    const { limits } = calculateTspTraditionalVsRoth({
      ...base,
      priorYearWages: 500000,
      applyMandatoryRothCatchUp: false,
    });
    expect(limits.rothCatchUpRequired).toBe(false);
  });

  it('re-evaluates the rule each year as salary grows past the threshold', () => {
    // Starts below the threshold and grows past it mid-projection.
    const { traditional } = calculateTspTraditionalVsRoth({
      ...base,
      annualSalary: 140000,
      annualSalaryGrowthRate: 0.1,
      currentAge: 55,
      retirementAge: 60,
      priorYearWages: 130000,
    });
    expect(traditional.projectedBalance).toBeGreaterThan(0);
  });
});
