import { describe, expect, it } from 'vitest';
import { currentMarginalRate, resolveTspTaxRates } from '../taxRates';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../scenarios/schema';

const base = () =>
  normalizeScenario({
    ...createDefaultScenario('t'),
    profile: { currentAge: 45, separationAge: 57 },
    tsp: { currentBalance: 400000, annualSalary: 120000, monthlyContributionPercent: 10 },
    fers: { yearsOfService: 18, high3Salary: 115000 },
    summary: { socialSecurity: { mode: 'manual', monthlyBenefit: 2500 } },
  });

describe('TSP tax rates from the bracket engine', () => {
  it('a 120,000 single filer deferring 10% is in the 22% bracket', () => {
    // 120,000 − 12,000 deferral − 16,100 standard deduction = 91,900 → 22% (50,400–105,700)
    expect(currentMarginalRate(base())).toBe(0.22);
  });

  it('married filing jointly lands lower', () => {
    // 120,000 − 12,000 − 32,200 = 75,800 → 12% (24,800–100,800)
    expect(currentMarginalRate(applyScenarioUpdates(base(), { taxes: { filingStatus: 'married_joint' } }))).toBe(0.12);
  });

  it('taxes Social Security through the worksheet, not at a flat 85%', () => {
    // A modest retirement income keeps provisional income below the top tier,
    // so far less than 85% of the benefit is taxable. Assuming the ceiling
    // overstated the retirement rate and biased the Roth comparison.
    const modest = applyScenarioUpdates(base(), {
      fers: { yearsOfService: 8, high3Salary: 60000 },
      tsp: { currentBalance: 60000, annualSalary: 60000 },
      fire: { monthlyFireIncomeGoal: 2500 },
      summary: { monthlyExpenses: 2200, socialSecurity: { mode: 'manual', monthlyBenefit: 1500 } },
    });
    const r = resolveTspTaxRates(modest);
    expect(r.retirementTaxRate).toBeLessThanOrEqual(12);
  });

  it('the retirement rate comes from the timeline and is lower than the working rate here', () => {
    const r = resolveTspTaxRates(base());
    expect(r.currentTaxRate).toBe(22);
    expect(r.retirementTaxRate).toBeLessThanOrEqual(22);
    expect(r.retirementTaxRate).toBeGreaterThanOrEqual(0);
    expect(r.retirementRateAge).toBe(58);
    expect(r.basis).toBe('bracket_engine');
  });
});
