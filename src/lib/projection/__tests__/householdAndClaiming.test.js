import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../timeline';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../scenarios/schema';

/**
 * Household and claiming-age cases (ROADMAP 55).
 *
 * The timeline carries two people and three claiming decisions (the primary's
 * Social Security, the spouse's, and the spouse's own pension), and it files
 * one tax return for the pair. These tests pin the rules that decide when each
 * income row switches on and by how much, using figures that can be checked by
 * hand from SSA's published factors:
 *
 *   claim 62, FRA 67 -> 0.70 of PIA   (36 x 5/9% + 24 x 5/12% = 30% reduction)
 *   claim 70, FRA 67 -> 1.24 of PIA   (36 x 2/3% = 24% credit)
 *
 * https://www.ssa.gov/benefits/retirement/planner/agereduction.html
 * https://www.ssa.gov/benefits/retirement/planner/delayret.html
 *
 * Everyone here is born after 1960 (age 45 in 2026 is a 1981 birth year), so
 * full retirement age is 67 throughout.
 */

const AS_OF_YEAR = 2026;
const PIA = 2500;

const base = (updates = {}) =>
  applyScenarioUpdates(
    normalizeScenario(createDefaultScenario('household')),
    applyDeep(
      {
        profile: { currentAge: 45, separationAge: 57, annuityStartAge: null, socialSecurityClaimAge: 67, hireCohort: 'fers_frae' },
        tsp: { currentBalance: 600000, annualSalary: 120000, monthlyContributionPercent: 10, annualSalaryGrowthRate: 2, inflationRate: 2.5 },
        fers: { yearsOfService: 18, monthsOfService: 0, high3Salary: 115000 },
        fire: { monthlyFireIncomeGoal: 5000, sideHustleIncome: 0 },
        summary: { monthlyExpenses: 4500, socialSecurity: { mode: 'manual', monthlyBenefit: PIA, trustFundHaircut: null } },
      },
      updates
    )
  );

/** Shallow-by-block merge so a test can override one field without restating the block. */
function applyDeep(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b)) {
    out[k] = a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) && b[k] && typeof b[k] === 'object' ? applyDeep(a[k], b[k]) : b[k];
  }
  return out;
}

const row = (t, age) => t.rows.find((r) => r.age === age);

/** A row's Social Security in today's dollars per month, for comparison against the PIA. */
const realMonthlySs = (r) => r.socialSecurity / r.real.deflator / 12;

describe('claiming age', () => {
  it('claiming at 62 pays 70% of PIA and claiming at 70 pays 124%, in today\'s dollars', () => {
    const at62 = buildTimeline(base({ profile: { socialSecurityClaimAge: 62 } }), { asOfYear: AS_OF_YEAR });
    const at70 = buildTimeline(base({ profile: { socialSecurityClaimAge: 70 } }), { asOfYear: AS_OF_YEAR });

    // Both are paying at 71, so the rows compare like for like.
    expect(realMonthlySs(row(at62, 71))).toBeCloseTo(PIA * 0.7, 4);
    expect(realMonthlySs(row(at70, 71))).toBeCloseTo(PIA * 1.24, 4);
    expect(row(at70, 71).socialSecurity / row(at62, 71).socialSecurity).toBeCloseTo(1.24 / 0.7, 6);
  });

  it('starts the row at the claim age and not before', () => {
    const at62 = buildTimeline(base({ profile: { socialSecurityClaimAge: 62 } }), { asOfYear: AS_OF_YEAR });
    const at70 = buildTimeline(base({ profile: { socialSecurityClaimAge: 70 } }), { asOfYear: AS_OF_YEAR });

    expect(row(at62, 61).socialSecurity).toBe(0);
    expect(row(at62, 62).socialSecurity).toBeGreaterThan(0);
    expect(row(at70, 69).socialSecurity).toBe(0);
    expect(row(at70, 70).socialSecurity).toBeGreaterThan(0);

    expect(at62.summary.bridge.incomeStarts).toContainEqual(expect.objectContaining({ source: 'Social Security', age: 62 }));
    expect(at70.summary.bridge.incomeStarts).toContainEqual(expect.objectContaining({ source: 'Social Security', age: 70 }));
  });

  it('claiming at FRA pays exactly the PIA', () => {
    const t = buildTimeline(base({ profile: { socialSecurityClaimAge: 67 } }), { asOfYear: AS_OF_YEAR });
    expect(realMonthlySs(row(t, 67))).toBeCloseTo(PIA, 4);
    expect(realMonthlySs(row(t, 80))).toBeCloseTo(PIA, 4);
  });
});

describe('a spouse\'s Social Security', () => {
  const withSpouse = (spouseClaimAge, primaryClaimAge = 70) =>
    base({
      profile: { socialSecurityClaimAge: primaryClaimAge },
      household: {
        spouse: {
          enabled: true,
          currentAge: 40, // five years younger than the primary
          annualIncome: 60000,
          incomeEndAge: 60,
          socialSecurity: { piaMonthlyAtFra: 1800, claimAge: spouseClaimAge },
        },
      },
      taxes: { filingStatus: 'married_joint' },
    });

  it('starts at the spouse\'s claim age, not the primary\'s', () => {
    // Spouse claims at 62, which is the primary's age 67. Primary claims at 70.
    const t = buildTimeline(withSpouse(62, 70), { asOfYear: AS_OF_YEAR });

    expect(row(t, 66).spouseAge).toBe(61);
    expect(row(t, 66).spouseSocialSecurity).toBe(0);
    expect(row(t, 67).spouseAge).toBe(62);
    expect(row(t, 67).spouseSocialSecurity).toBeGreaterThan(0);

    // The primary's own row has not started yet.
    expect(row(t, 67).socialSecurity).toBe(0);
    expect(row(t, 69).socialSecurity).toBe(0);
    expect(row(t, 70).socialSecurity).toBeGreaterThan(0);

    expect(t.summary.bridge.incomeStarts).toContainEqual(expect.objectContaining({ source: 'Spouse Social Security', age: 67 }));
    expect(t.summary.bridge.incomeStarts).toContainEqual(expect.objectContaining({ source: 'Social Security', age: 70 }));
  });

  it('applies the spouse\'s own claiming factor to the spouse\'s PIA', () => {
    const t = buildTimeline(withSpouse(62, 70), { asOfYear: AS_OF_YEAR });
    const r = row(t, 67); // spouse is 62
    expect(r.spouseSocialSecurity / r.real.deflator / 12).toBeCloseTo(1800 * 0.7, 4);

    const late = buildTimeline(withSpouse(70, 70), { asOfYear: AS_OF_YEAR });
    expect(row(late, 74).spouseSocialSecurity).toBe(0); // spouse 69
    const r75 = row(late, 75); // spouse 70
    expect(r75.spouseSocialSecurity / r75.real.deflator / 12).toBeCloseTo(1800 * 1.24, 4);
  });
});

describe('filing status', () => {
  it('married filing jointly owes less federal tax than single on the same income', () => {
    const single = buildTimeline(base({ taxes: { filingStatus: 'single' } }), { asOfYear: AS_OF_YEAR });
    const joint = buildTimeline(base({ taxes: { filingStatus: 'married_joint' } }), { asOfYear: AS_OF_YEAR });

    // A working year: identical wages, wider brackets and a larger standard deduction.
    const s45 = row(single, 45);
    const j45 = row(joint, 45);
    expect(s45.salary).toBe(j45.salary);
    expect(s45.taxes.fica).toBe(j45.taxes.fica); // FICA does not depend on filing status
    expect(j45.taxes.federal).toBeLessThan(s45.taxes.federal);
    expect(j45.taxes.federal).toBeGreaterThan(0);

    // And a retired year, where pension plus supplement is the taxable income.
    const s58 = row(single, 58);
    const j58 = row(joint, 58);
    expect(s58.pension).toBe(j58.pension);
    expect(j58.taxes.federal).toBeLessThan(s58.taxes.federal);

    expect(joint.summary.cumulativeTaxes).toBeLessThan(single.summary.cumulativeTaxes);
  });
});

describe('a dual-federal household', () => {
  // Spouse is 50 with 15 years and a 90,000 high-3, leaving at 60 with 25
  // years: 1% x 25 x 90,000 = 22,500, unreduced under the 60+20 door. The
  // primary is 52, so the spouse turns 60 when the primary is 62.
  const dualFed = () =>
    base({
      profile: { currentAge: 52, separationAge: 57 },
      fers: { yearsOfService: 25 },
      household: {
        spouse: {
          enabled: true,
          currentAge: 50,
          annualIncome: 90000,
          incomeEndAge: 60,
          isFederal: true,
          fers: { yearsOfService: 15, monthsOfService: 0, high3Salary: 90000, separationAge: 60, annuityStartAge: null, unusedSickLeaveHours: 0 },
          socialSecurity: { piaMonthlyAtFra: 2000, claimAge: 67 },
        },
      },
      taxes: { filingStatus: 'married_joint' },
    });

  it('pays the spouse\'s FERS annuity from the spouse\'s start age', () => {
    const t = buildTimeline(dualFed(), { asOfYear: AS_OF_YEAR });

    expect(row(t, 61).spouseAge).toBe(59);
    expect(row(t, 61).spousePension).toBe(0);
    expect(row(t, 62).spouseAge).toBe(60);
    expect(row(t, 62).spousePension).toBeCloseTo(22500, 6);
    expect(row(t, 63).spousePension).toBeCloseTo(22500, 6); // no COLA before the spouse is 62

    expect(t.summary.bridge.incomeStarts).toContainEqual(expect.objectContaining({ source: 'Spouse pension', age: 62 }));
  });

  it('grows the spouse\'s annuity at the diet COLA once the spouse is 62', () => {
    const t = buildTimeline(dualFed(), { asOfYear: AS_OF_YEAR });
    // Spouse is 62 at primary age 64 and 63 at 65; the 2% diet COLA on 2.5% CPI
    // lands from the first year after 62.
    expect(row(t, 64).spousePension).toBeCloseTo(22500, 6);
    expect(row(t, 65).spousePension).toBeCloseTo(22500 * 1.02, 6);
    expect(row(t, 66).spousePension).toBeCloseTo(22500 * 1.02 * 1.02, 6);
  });

  it('counts the spouse\'s annuity as pension income on the joint return', () => {
    const withPension = buildTimeline(dualFed(), { asOfYear: AS_OF_YEAR });
    const without = buildTimeline(
      applyScenarioUpdates(dualFed(), { household: { spouse: { isFederal: false, fers: { yearsOfService: 0 } } } }),
      { asOfYear: AS_OF_YEAR }
    );
    expect(row(without, 62).spousePension).toBe(0);
    expect(row(withPension, 62).taxes.federal).toBeGreaterThan(row(without, 62).taxes.federal);
    expect(row(withPension, 62).guaranteedIncome - row(without, 62).guaranteedIncome).toBeCloseTo(22500, 6);
  });
});

describe('the trust-fund haircut', () => {
  // A 23% cut from 2045. The primary is 45 in 2026, so 2045 is age 64.
  const haircut = { startYear: 2045, percent: 23 };

  it('reduces Social Security in every row from the start year, including benefits already in payment', () => {
    const cut = buildTimeline(base({ profile: { socialSecurityClaimAge: 62 }, summary: { socialSecurity: { trustFundHaircut: haircut } } }), { asOfYear: AS_OF_YEAR });
    const full = buildTimeline(base({ profile: { socialSecurityClaimAge: 62 } }), { asOfYear: AS_OF_YEAR });

    expect(cut.plan.socialSecurity.trustFundHaircut).toEqual(haircut);

    // 62 and 63 are 2043 and 2044: untouched.
    expect(row(cut, 62).year).toBe(2043);
    expect(row(cut, 62).socialSecurity).toBeCloseTo(row(full, 62).socialSecurity, 6);
    expect(row(cut, 63).socialSecurity).toBeCloseTo(row(full, 63).socialSecurity, 6);

    // 64 onward is 2045 onward: 77% of the scheduled benefit.
    for (const age of [64, 65, 70, 80, 95]) {
      expect(row(cut, age).year).toBeGreaterThanOrEqual(2045);
      expect(row(cut, age).socialSecurity).toBeCloseTo(row(full, age).socialSecurity * 0.77, 6);
    }
  });

  it('applies to the spouse\'s benefit in the same years', () => {
    const spouse = { enabled: true, currentAge: 40, annualIncome: 0, incomeEndAge: 60, socialSecurity: { piaMonthlyAtFra: 1800, claimAge: 62 } };
    const cut = buildTimeline(base({ household: { spouse }, summary: { socialSecurity: { trustFundHaircut: haircut } } }), { asOfYear: AS_OF_YEAR });
    const full = buildTimeline(base({ household: { spouse } }), { asOfYear: AS_OF_YEAR });

    // Spouse claims at 62 = primary 67 = year 2048, already inside the cut.
    expect(row(cut, 67).year).toBe(2048);
    expect(row(cut, 67).spouseSocialSecurity).toBeCloseTo(row(full, 67).spouseSocialSecurity * 0.77, 6);
  });

  it('is a no-op when the start year is beyond the plan or the percent is zero', () => {
    const full = buildTimeline(base({ profile: { socialSecurityClaimAge: 62 } }), { asOfYear: AS_OF_YEAR });
    const late = buildTimeline(base({ profile: { socialSecurityClaimAge: 62 }, summary: { socialSecurity: { trustFundHaircut: { startYear: 2200, percent: 23 } } } }), { asOfYear: AS_OF_YEAR });
    const zero = buildTimeline(base({ profile: { socialSecurityClaimAge: 62 }, summary: { socialSecurity: { trustFundHaircut: { startYear: 2030, percent: 0 } } } }), { asOfYear: AS_OF_YEAR });
    expect(row(late, 80).socialSecurity).toBeCloseTo(row(full, 80).socialSecurity, 6);
    expect(row(zero, 80).socialSecurity).toBeCloseTo(row(full, 80).socialSecurity, 6);
  });
});
