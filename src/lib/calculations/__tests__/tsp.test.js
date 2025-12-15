import { describe, expect, it } from 'vitest';
import { calculateTspTraditionalVsRoth, calculateWeightedReturn } from '../tsp';

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


