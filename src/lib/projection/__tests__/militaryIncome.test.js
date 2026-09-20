import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../timeline';
import { resolveRetirementPlan } from '../plan';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../scenarios/schema';
import { ISSUE_CODES } from '../../military/status';

/**
 * Military and VA income through the whole plan (spec §14.3): a VA stream
 * lowers withdrawals without touching taxable income; CRDP and CRSC of equal
 * gross tax differently; streams start and stop on the timeline.
 */

const AS_OF = { asOfYear: 2026, asOfMonth: 8 };

const scenario = ({ streams = [], deathAges = null, state = 'NONE', extra = {} } = {}) =>
  applyScenarioUpdates(
    normalizeScenario({
      ...createDefaultScenario('mi'),
      profile: { currentAge: 55, separationAge: 62, socialSecurityClaimAge: 67 },
      tsp: { currentBalance: 300000, annualSalary: 100000, monthlyContributionPercent: 8, annualSalaryGrowthRate: 2, inflationRate: 2.5 },
      fers: { yearsOfService: 25, monthsOfService: 0, high3Salary: 98000 },
      fire: { monthlyFireIncomeGoal: 6000, sideHustleIncome: 0 },
      taxes: { filingStatus: 'single', includeStateTax: state !== 'NONE', state: { code: state, rate: state === 'NONE' ? 0 : 0.05, exemptsFederalPension: false, exemptsSocialSecurity: true, pensionExclusion: 0 } },
      summary: { monthlyExpenses: 4500, socialSecurity: { mode: 'manual', monthlyBenefit: 2400 } },
      ...extra,
    }),
    { military: { connection: 'self', incomeStreams: streams }, household: deathAges ? { deathAges } : {} }
  );

const va = (monthly = 1500) => ({ id: 'va', type: 'va_disability', grossAmount: monthly, frequency: 'monthly', amountStatus: 'official', officialAmountAsOfDate: '2026-01-01' });
const row = (t, age) => t.rows.find((r) => r.age === age);

describe('VA compensation on the timeline', () => {
  it('reduces portfolio withdrawals but not taxable income', () => {
    const without = buildTimeline(scenario(), AS_OF);
    const withVa = buildTimeline(scenario({ streams: [va(1500)] }), AS_OF);
    const age = 64;
    expect(row(withVa, age).militaryIncome.taxExempt).toBeCloseTo(1500 * 12 * 1.025 ** (age - 55), 4);
    expect(row(withVa, age).guaranteedIncome - row(without, age).guaranteedIncome).toBeCloseTo(row(withVa, age).militaryIncome.total, 6);
    expect(row(withVa, age).withdrawals.total).toBeLessThan(row(without, age).withdrawals.total);
    // Taxes fall or hold (fewer taxable withdrawals), never rise.
    expect(row(withVa, age).taxes.total).toBeLessThanOrEqual(row(without, age).taxes.total + 1e-6);
    expect(withVa.summary.balanceAtEnd).toBeGreaterThan(without.summary.balanceAtEnd);
  });

  it('appears in the income-start list with its tax class', () => {
    const t = buildTimeline(scenario({ streams: [va()] }), AS_OF);
    const start = t.summary.bridge.incomeStarts.find((s) => s.streamId === 'va');
    expect(start).toMatchObject({ source: 'VA disability compensation', age: 55, federalTaxClass: 'tax_exempt' });
  });
});

describe('CRDP versus CRSC', () => {
  const crdp = { id: 'cr', type: 'crdp', grossAmount: 1200, frequency: 'monthly', amountStatus: 'official', officialAmountAsOfDate: '2026-01-01' };
  const crsc = { ...crdp, type: 'crsc' };

  it('equal gross amounts produce different tax results', () => {
    const a = buildTimeline(scenario({ streams: [crdp] }), AS_OF);
    const b = buildTimeline(scenario({ streams: [crsc] }), AS_OF);
    const age = 65;
    expect(row(a, age).militaryIncome.total).toBeCloseTo(row(b, age).militaryIncome.total, 6);
    expect(row(a, age).militaryIncome.militaryRetiredPay).toBeGreaterThan(0);
    expect(row(b, age).militaryIncome.taxExempt).toBeGreaterThan(0);
    expect(row(a, age).taxes.total).toBeGreaterThan(row(b, age).taxes.total);
  });

  it('an estimated CRDP amount is excluded and the plan says so', () => {
    const plan = resolveRetirementPlan(scenario({ streams: [{ ...crdp, amountStatus: 'estimated' }] }), AS_OF);
    const s = plan.military.incomeStreams[0];
    expect(s.resolved.included).toBe(false);
    expect(plan.military.issues.map((i) => i.code)).toContain(ISSUE_CODES.MIL_CRDP_CRSC_MANUAL);
    const t = buildTimeline(scenario({ streams: [{ ...crdp, amountStatus: 'estimated' }] }), AS_OF);
    expect(row(t, 65).militaryIncome.total).toBe(0);
  });
});

describe('military retired pay and state tax', () => {
  const retiredPay = { id: 'rp', type: 'longevity_retired_pay', grossAmount: 2800, frequency: 'monthly', amountStatus: 'official', officialAmountAsOfDate: '2026-01-01' };

  it('is taxed at state level and flagged while the state rule is unverified', () => {
    const plan = resolveRetirementPlan(scenario({ streams: [retiredPay], state: 'VA' }), AS_OF);
    expect(plan.military.stateMilitaryRetiredPay).toMatchObject({ state: 'VA', applied: false, verified: false, reason: 'unverified' });
    expect(plan.military.issues.map((i) => i.code)).toContain(ISSUE_CODES.MIL_STATE_TAX_UNVERIFIED);
    const t = buildTimeline(scenario({ streams: [retiredPay], state: 'VA' }), AS_OF);
    expect(row(t, 64).taxes.state).toBeGreaterThan(0);
  });

  it('raises no state flag in a no-income-tax state or when state tax is off', () => {
    expect(resolveRetirementPlan(scenario({ streams: [retiredPay], state: 'TX' }), AS_OF).military.issues.map((i) => i.code)).not.toContain(ISSUE_CODES.MIL_STATE_TAX_UNVERIFIED);
    expect(resolveRetirementPlan(scenario({ streams: [retiredPay], state: 'NONE' }), AS_OF).military.stateMilitaryRetiredPay).toBeNull();
  });
});

describe('case 48 on the timeline: death stops the owner\'s streams and starts the survivor\'s', () => {
  it('switches retired pay and VA off and SBP and DIC on after the modelled death', () => {
    const streams = [
      { id: 'rp', type: 'longevity_retired_pay', grossAmount: 2800, frequency: 'monthly', amountStatus: 'official', officialAmountAsOfDate: '2026-01-01' },
      va(1500),
      { id: 'sbp', type: 'sbp', grossAmount: 1540, frequency: 'monthly', amountStatus: 'official', ownerId: 'spouse', startsOnDeathOf: 'primary', officialAmountAsOfDate: '2026-01-01' },
      { id: 'dic', type: 'va_dic', grossAmount: 1699.36, frequency: 'monthly', amountStatus: 'official', ownerId: 'spouse', startsOnDeathOf: 'primary', officialAmountAsOfDate: '2026-01-01' },
    ];
    const t = buildTimeline(
      scenario({ streams, deathAges: { primary: 80, spouse: null }, extra: { household: { spouse: { enabled: true, currentAge: 53 } } } }),
      AS_OF
    );
    const before = row(t, 79).militaryIncome;
    const after = row(t, 81).militaryIncome;
    expect(before.byStream.map((s) => s.id).sort()).toEqual(['rp', 'va']);
    expect(after.byStream.map((s) => s.id).sort()).toEqual(['dic', 'sbp']);
    expect(after.survivorIncome).toBeGreaterThan(0);
    expect(after.taxExempt).toBeGreaterThan(0); // DIC, not offset by SBP
    expect(after.taxablePension).toBeGreaterThan(0); // SBP
  });
});
