import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../timeline';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../scenarios/schema';
import { projectMilitaryIncomeForYear, resolveMilitaryIncomeStreams } from '../../military/incomeStreams';
import { estimateFicaTax } from '../../taxes/index';

/** Fixes from the PR #32 review of the income projection. */

const AS_OF = { asOfYear: 2026, asOfMonth: 0 };

const scenario = (military = {}, extra = {}) =>
  applyScenarioUpdates(
    normalizeScenario({
      ...createDefaultScenario('rf'),
      profile: { currentAge: 50, separationAge: 57, socialSecurityClaimAge: 67 },
      tsp: { currentBalance: 300000, annualSalary: 100000, monthlyContributionPercent: 8, annualSalaryGrowthRate: 0, inflationRate: 2.5 },
      fers: { yearsOfService: 20, monthsOfService: 0, high3Salary: 98000 },
      fire: { monthlyFireIncomeGoal: 5000, sideHustleIncome: 0 },
      summary: { monthlyExpenses: 4500, socialSecurity: { mode: 'manual', monthlyBenefit: 2400 } },
      ...extra,
    }),
    { military: { connection: 'self', ...military } }
  );
const row = (t, age) => t.rows.find((r) => r.age === age);

describe('a linked calculation is in first-payment dollars', () => {
  it('starts its COLAs at the payment year, not today', () => {
    const military = {
      ...createDefaultScenario('x').military,
      connection: 'self',
      retirementScenarios: [{ id: 's', currentCalculationId: 'c', calculations: [{ id: 'c', rulesVersion: '2026.1', projectedMonthly: 3000, retiredPayStartDate: '2036-05-01' }] }],
      incomeStreams: [{ id: 'l', type: 'reserve_retired_pay', sourceCalculationId: 'c' }],
    };
    const resolved = resolveMilitaryIncomeStreams(military);
    expect(resolved.streams[0].resolved.colaAnchorYear).toBe(2036);
    const profile = { currentAge: 50, currentAgeMonths: 0 };
    const asOfDate = new Date(2026, 0, 1);
    const at = (year) => projectMilitaryIncomeForYear({ resolved, yearsFromNow: year - 2026, asOfYear: 2026, year, ages: { primary: 50 + (year - 2026) }, inflation: 0.025, profile, asOfDate });
    expect(at(2035).total).toBe(0);
    expect(at(2036).total).toBeCloseTo(36000, 6); // not 36,000 × 1.025^10
    expect(at(2037).total).toBeCloseTo(36000 * 1.025, 6);
    // An entered amount is today's money and still adjusts from now.
    const entered = resolveMilitaryIncomeStreams({ ...military, retirementScenarios: [], incomeStreams: [{ id: 'e', type: 'longevity_retired_pay', grossAmount: 3000, frequency: 'monthly', startAge: 60 }] });
    const enteredAt = projectMilitaryIncomeForYear({ resolved: entered, yearsFromNow: 10, asOfYear: 2026, year: 2036, ages: { primary: 60 }, inflation: 0.025, profile, asOfDate });
    expect(enteredAt.total).toBeCloseTo(36000 * 1.025 ** 10, 6);
  });
});

describe('a dated spouse stream follows the spouse, not the primary', () => {
  it('starts on the spouse’s own age for the date, or on the calendar year when no spouse profile is known', () => {
    const military = { ...createDefaultScenario('x').military, connection: 'other_member', incomeStreams: [{ id: 'sp', type: 'longevity_retired_pay', ownerId: 'spouse', grossAmount: 2000, frequency: 'monthly', startDate: '2031-01-01' }] };
    const resolved = resolveMilitaryIncomeStreams(military);
    const asOfDate = new Date(2026, 0, 1);
    const primary = { currentAge: 50, currentAgeMonths: 0 };
    const spouse = { currentAge: 40, currentAgeMonths: 0 }; // ten years younger: 2031 is spouse age 45
    const args = { resolved, asOfYear: 2026, inflation: 0, profile: primary, spouseProfile: spouse, asOfDate };
    expect(projectMilitaryIncomeForYear({ ...args, yearsFromNow: 4, year: 2030, ages: { primary: 54, spouse: 44 } }).total).toBe(0);
    expect(projectMilitaryIncomeForYear({ ...args, yearsFromNow: 5, year: 2031, ages: { primary: 55, spouse: 45 } }).total).toBe(24000);
    // Without a spouse profile the calendar year decides, never the primary's age.
    const noProfile = { ...args, spouseProfile: null };
    expect(projectMilitaryIncomeForYear({ ...noProfile, yearsFromNow: 4, year: 2030, ages: { primary: 54, spouse: 44 } }).total).toBe(0);
    expect(projectMilitaryIncomeForYear({ ...noProfile, yearsFromNow: 5, year: 2031, ages: { primary: 55, spouse: 45 } }).total).toBe(24000);
  });

  it('the timeline hands the spouse profile through', () => {
    const s = scenario(
      { connection: 'other_member', incomeStreams: [{ id: 'sp', type: 'longevity_retired_pay', ownerId: 'spouse', grossAmount: 2000, frequency: 'monthly', startDate: '2031-01-01', amountStatus: 'official' }] },
      { household: { spouse: { enabled: true, currentAge: 40, annualIncome: 0, isFederal: false } } }
    );
    const t = buildTimeline(s, AS_OF);
    expect(row(t, 54).militaryIncome.total).toBe(0);
    expect(row(t, 55).militaryIncome.total).toBeGreaterThan(0);
  });
});

describe('military wages pay FICA', () => {
  it('drill pay adds payroll tax on the timeline; retired pay and VA do not', () => {
    const base = buildTimeline(scenario(), AS_OF);
    const drill = buildTimeline(scenario({ incomeStreams: [{ id: 'd', type: 'drill_pay', grossAmount: 1000, frequency: 'monthly', amountStatus: 'official', endAge: 56 }] }), AS_OF);
    const expected = estimateFicaTax({ wages: 100000 + 12000 }).totalTax - estimateFicaTax({ wages: 100000 }).totalTax;
    expect(row(drill, 50).taxes.fica - row(base, 50).taxes.fica).toBeCloseTo(expected, 2);
    const va = buildTimeline(scenario({ incomeStreams: [{ id: 'v', type: 'va_disability', grossAmount: 1000, frequency: 'monthly', amountStatus: 'official' }] }), AS_OF);
    expect(row(va, 50).taxes.fica).toBeCloseTo(row(base, 50).taxes.fica, 6);
  });
});
