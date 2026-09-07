import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../timeline';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../scenarios/schema';

/**
 * Timeline regression fixtures (ROADMAP 53).
 *
 * Four representative scenarios are run through buildTimeline and a compact
 * fingerprint of each — eight key rows and the summary — is pinned as an inline
 * snapshot. The fixtures exist to catch UNINTENDED changes: a refactor of the
 * tax engine, the healthcare projection, the withdrawal order, or the plan
 * resolver that moves any of these numbers will fail here, and the diff says
 * exactly which age and which figure moved.
 *
 * They are not a statement that the numbers are correct — the golden cases in
 * src/lib/calculations/__tests__/goldenCases.test.js are for that. When a model
 * change is intentional, review the diff, then update the snapshots
 * deliberately with:
 *
 *   npx vitest run src/lib/projection/__tests__/timelineFixtures.test.js -u
 *
 * and include the updated snapshot in the same commit as the change so the
 * reviewer sees the before and after together.
 *
 * Everything that could vary between runs is pinned: `asOfYear` is fixed at
 * 2026, and the scenario id / createdAt from createDefaultScenario do not enter
 * the projection.
 */

const AS_OF_YEAR = 2026;

const scenario = (updates) => applyScenarioUpdates(normalizeScenario(createDefaultScenario('fixture')), updates);

const round = (v) => Math.round(Number(v) || 0);

/** The ages whose rows are pinned: now, separation, the year after, then the milestones. */
const fixtureAges = (t) => {
  const sep = t.plan.separationAge;
  const ages = [t.rows[0].age, sep, sep + 1, 62, 65, 67, 75, 90];
  return [...new Set(ages)].filter((a) => t.rows.some((r) => r.age === a));
};

function fingerprint(t) {
  const rows = {};
  for (const age of fixtureAges(t)) {
    const r = t.rows.find((x) => x.age === age);
    rows[age] = {
      phase: r.phase,
      salary: round(r.salary),
      pension: round(r.pension),
      srs: round(r.srs),
      socialSecurity: round(r.socialSecurity),
      healthcare: round(r.healthcare.total),
      taxes: round(r.taxes.total),
      withdrawals: round(r.withdrawals.total),
      balance: round(r.balances.total),
    };
  }
  const s = t.summary;
  return {
    path: t.plan.path,
    annuityStartAge: t.plan.annuityStartAge,
    rows,
    summary: {
      isSustainable: s.isSustainable,
      firstShortfallAge: s.firstShortfallAge,
      bridgeYears: s.bridge.years,
      bridgeFundedPercent: round(s.bridge.fundedPercent),
      minBalanceAge: s.minBalanceAge,
    },
  };
}

describe('timeline regression fixtures', () => {
  it('a 30-year-old early saver leaving at 45 on a deferred annuity', () => {
    const t = buildTimeline(
      scenario({
        profile: { currentAge: 30, separationAge: 45, annuityStartAge: null, socialSecurityClaimAge: 67, hireCohort: 'fers_frae' },
        tsp: { currentBalance: 200000, annualSalary: 95000, monthlyContributionPercent: 15, annualSalaryGrowthRate: 3, inflationRate: 2.5 },
        fers: { yearsOfService: 7, monthsOfService: 0, high3Salary: 90000 },
        fire: { monthlyFireIncomeGoal: 4000, sideHustleIncome: 0, taxableBrokerageBalance: 250000, annualTaxableSavings: 12000, cashBalance: 30000 },
        summary: { monthlyExpenses: 3000, socialSecurity: { mode: 'manual', monthlyBenefit: 2200 } },
      }),
      { asOfYear: AS_OF_YEAR }
    );

    expect(t.plan.path).toBe('deferred');
    expect(t.summary).toMatchObject({
      isSustainable: expect.any(Boolean),
      bridge: expect.objectContaining({ startAge: 45 }),
    });
    expect(fingerprint(t)).toMatchInlineSnapshot(`
      {
        "annuityStartAge": 60,
        "path": "deferred",
        "rows": {
          "30": {
            "balance": 547543,
            "healthcare": 5400,
            "pension": 0,
            "phase": "working",
            "salary": 95000,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 15283,
            "withdrawals": 0,
          },
          "45": {
            "balance": 2144815,
            "healthcare": 24116,
            "pension": 0,
            "phase": "bridge",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 0,
            "withdrawals": 93634,
          },
          "46": {
            "balance": 2165323,
            "healthcare": 25321,
            "pension": 0,
            "phase": "bridge",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 0,
            "withdrawals": 96578,
          },
          "62": {
            "balance": 1843892,
            "healthcare": 55273,
            "pension": 31613,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 35560,
            "withdrawals": 165000,
          },
          "65": {
            "balance": 1641064,
            "healthcare": 24462,
            "pension": 33548,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 27618,
            "withdrawals": 132446,
          },
          "67": {
            "balance": 1606047,
            "healthcare": 26970,
            "pension": 34903,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 65824,
            "srs": 0,
            "taxes": 27149,
            "withdrawals": 73071,
          },
          "75": {
            "balance": 1602783,
            "healthcare": 39847,
            "pension": 40895,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 80201,
            "srs": 0,
            "taxes": 38932,
            "withdrawals": 103503,
          },
          "90": {
            "balance": 178813,
            "healthcare": 82838,
            "pension": 55039,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 116154,
            "srs": 0,
            "taxes": 87985,
            "withdrawals": 210820,
          },
        },
        "summary": {
          "bridgeFundedPercent": 90,
          "bridgeYears": 51,
          "firstShortfallAge": 91,
          "isSustainable": false,
          "minBalanceAge": 91,
        },
      }
    `);
  });

  it('a 45-year-old leaving at 57 under MRA+30', () => {
    const t = buildTimeline(
      scenario({
        profile: { currentAge: 45, separationAge: 57, annuityStartAge: null, socialSecurityClaimAge: 67, hireCohort: 'fers_frae' },
        tsp: { currentBalance: 400000, annualSalary: 120000, monthlyContributionPercent: 10, annualSalaryGrowthRate: 2, inflationRate: 2.5 },
        fers: { yearsOfService: 18, monthsOfService: 0, high3Salary: 115000 },
        fire: { monthlyFireIncomeGoal: 6000, sideHustleIncome: 0 },
        summary: { monthlyExpenses: 5000, socialSecurity: { mode: 'manual', monthlyBenefit: 2500 } },
      }),
      { asOfYear: AS_OF_YEAR }
    );

    expect(t.plan.path).toBe('immediate_unreduced');
    expect(t.plan.srs.isEligible).toBe(true);
    expect(fingerprint(t)).toMatchInlineSnapshot(`
      {
        "annuityStartAge": 57,
        "path": "immediate_unreduced",
        "rows": {
          "45": {
            "balance": 456903,
            "healthcare": 5400,
            "pension": 0,
            "phase": "working",
            "salary": 120000,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 22948,
            "withdrawals": 0,
          },
          "57": {
            "balance": 1319427,
            "healthcare": 9698,
            "pension": 44761,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 15750,
            "taxes": 5081,
            "withdrawals": 51100,
          },
          "58": {
            "balance": 1336446,
            "healthcare": 10183,
            "pension": 44761,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 15750,
            "taxes": 5081,
            "withdrawals": 54005,
          },
          "62": {
            "balance": 1318221,
            "healthcare": 12377,
            "pension": 44761,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 23398,
            "withdrawals": 100570,
          },
          "65": {
            "balance": 1191386,
            "healthcare": 20788,
            "pension": 47501,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 27776,
            "withdrawals": 119043,
          },
          "67": {
            "balance": 1117350,
            "healthcare": 22919,
            "pension": 49420,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 51647,
            "srs": 0,
            "taxes": 28004,
            "withdrawals": 73809,
          },
          "75": {
            "balance": 830898,
            "healthcare": 33862,
            "pension": 57904,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 62927,
            "srs": 0,
            "taxes": 39574,
            "withdrawals": 103630,
          },
          "90": {
            "balance": 0,
            "healthcare": 70396,
            "pension": 77931,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 91137,
            "srs": 0,
            "taxes": 25255,
            "withdrawals": 0,
          },
        },
        "summary": {
          "bridgeFundedPercent": 61,
          "bridgeYears": 39,
          "firstShortfallAge": 83,
          "isSustainable": false,
          "minBalanceAge": 83,
        },
      }
    `);
  });

  it('a 55-year-old leaving at 60 with 20 years', () => {
    const t = buildTimeline(
      scenario({
        profile: { currentAge: 55, separationAge: 60, annuityStartAge: null, socialSecurityClaimAge: 67, hireCohort: 'fers' },
        tsp: { currentBalance: 550000, annualSalary: 140000, monthlyContributionPercent: 15, annualSalaryGrowthRate: 2, inflationRate: 2.5 },
        fers: { yearsOfService: 15, monthsOfService: 0, high3Salary: 135000, unusedSickLeaveHours: 1200, annualLeaveHoursAtSeparation: 240 },
        fire: { monthlyFireIncomeGoal: 7000, sideHustleIncome: 0 },
        summary: { monthlyExpenses: 6000, socialSecurity: { mode: 'manual', monthlyBenefit: 3000 } },
      }),
      { asOfYear: AS_OF_YEAR }
    );

    expect(t.plan.path).toBe('immediate_unreduced');
    expect(t.plan.service.eligibilityYears).toBe(20);
    expect(fingerprint(t)).toMatchInlineSnapshot(`
      {
        "annuityStartAge": 60,
        "path": "immediate_unreduced",
        "rows": {
          "55": {
            "balance": 624444,
            "healthcare": 5400,
            "pension": 0,
            "phase": "working",
            "salary": 140000,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 27814,
            "withdrawals": 0,
          },
          "60": {
            "balance": 989145,
            "healthcare": 6892,
            "pension": 31179,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 12600,
            "taxes": 5207,
            "withdrawals": 45582,
          },
          "61": {
            "balance": 973366,
            "healthcare": 7237,
            "pension": 31179,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 12600,
            "taxes": 8268,
            "withdrawals": 69139,
          },
          "62": {
            "balance": 929155,
            "healthcare": 7598,
            "pension": 31179,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 18879,
            "withdrawals": 95148,
          },
          "65": {
            "balance": 755260,
            "healthcare": 12762,
            "pension": 33088,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 21555,
            "withdrawals": 108756,
          },
          "67": {
            "balance": 650006,
            "healthcare": 14070,
            "pension": 34425,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 48416,
            "srs": 0,
            "taxes": 21432,
            "withdrawals": 65632,
          },
          "75": {
            "balance": 207942,
            "healthcare": 20788,
            "pension": 40334,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 58990,
            "srs": 0,
            "taxes": 31393,
            "withdrawals": 90500,
          },
          "90": {
            "balance": 0,
            "healthcare": 43217,
            "pension": 54284,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 85435,
            "srs": 0,
            "taxes": 14606,
            "withdrawals": 0,
          },
        },
        "summary": {
          "bridgeFundedPercent": 45,
          "bridgeYears": 36,
          "firstShortfallAge": 78,
          "isSustainable": false,
          "minBalanceAge": 78,
        },
      }
    `);
  });

  it('a married couple: one federal, one private, filing jointly', () => {
    const t = buildTimeline(
      scenario({
        profile: { currentAge: 48, separationAge: 57, annuityStartAge: null, socialSecurityClaimAge: 70, hireCohort: 'fers_rae' },
        tsp: { currentBalance: 350000, annualSalary: 125000, monthlyContributionPercent: 12, annualSalaryGrowthRate: 2.5, inflationRate: 2.5 },
        fers: { yearsOfService: 21, monthsOfService: 6, high3Salary: 120000, survivorElection: 'full' },
        fire: { monthlyFireIncomeGoal: 8000, sideHustleIncome: 0, taxableBrokerageBalance: 80000 },
        household: {
          spouse: {
            enabled: true,
            currentAge: 46,
            annualIncome: 70000,
            incomeEndAge: 62,
            socialSecurity: { piaMonthlyAtFra: 2000, claimAge: 67 },
            pensionAnnual: 12000,
            pensionStartAge: 65,
          },
        },
        taxes: { filingStatus: 'married_joint' },
        healthcare: { fehbEnrollmentType: 'selfPlusOne' },
        summary: { monthlyExpenses: 6500, socialSecurity: { mode: 'manual', monthlyBenefit: 2800 } },
      }),
      { asOfYear: AS_OF_YEAR }
    );

    expect(t.plan.path).toBe('immediate_unreduced');
    expect(t.rows.find((r) => r.age === 50).spouseIncome).toBeGreaterThan(0);
    expect(fingerprint(t)).toMatchInlineSnapshot(`
      {
        "annuityStartAge": 57,
        "path": "immediate_unreduced",
        "rows": {
          "48": {
            "balance": 530993,
            "healthcare": 9600,
            "pension": 0,
            "phase": "working",
            "salary": 125000,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 36005,
            "withdrawals": 0,
          },
          "57": {
            "balance": 1601827,
            "healthcare": 14893,
            "pension": 41806,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 18228,
            "taxes": 21468,
            "withdrawals": 8796,
          },
          "58": {
            "balance": 1662646,
            "healthcare": 15637,
            "pension": 41806,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 18228,
            "taxes": 22116,
            "withdrawals": 11001,
          },
          "62": {
            "balance": 1904392,
            "healthcare": 19007,
            "pension": 41806,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 20864,
            "withdrawals": 34802,
          },
          "65": {
            "balance": 1895382,
            "healthcare": 27584,
            "pension": 44365,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 452,
            "withdrawals": 129746,
          },
          "67": {
            "balance": 1839980,
            "healthcare": 30411,
            "pension": 46158,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 0,
            "srs": 0,
            "taxes": 1784,
            "withdrawals": 120324,
          },
          "75": {
            "balance": 2164707,
            "healthcare": 44931,
            "pension": 54081,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 81153,
            "srs": 0,
            "taxes": 34455,
            "withdrawals": 61020,
          },
          "90": {
            "balance": 2700709,
            "healthcare": 93409,
            "pension": 72786,
            "phase": "retired",
            "salary": 0,
            "socialSecurity": 117534,
            "srs": 0,
            "taxes": 74980,
            "withdrawals": 147329,
          },
        },
        "summary": {
          "bridgeFundedPercent": 100,
          "bridgeYears": 39,
          "firstShortfallAge": null,
          "isSustainable": true,
          "minBalanceAge": 48,
        },
      }
    `);
  });
});
