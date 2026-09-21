import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../timeline';
import { resolveRetirementPlan } from '../plan';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../scenarios/schema';
import { ISSUE_CODES } from '../../military/status';

/**
 * Integration (military roadmap pass 9): dual TSP contributions flow into
 * separate accounts under one limit validator, tax-exempt basis comes back
 * tax-free, and a mixed FEHB/TRICARE/Medicare household is costed per person.
 */

const AS_OF = { asOfYear: 2026, asOfMonth: 0 };

const scenario = (military = {}, extra = {}) =>
  applyScenarioUpdates(
    normalizeScenario({
      ...createDefaultScenario('tc'),
      profile: { currentAge: 45, separationAge: 57, socialSecurityClaimAge: 67 },
      tsp: { currentBalance: 200000, annualSalary: 104000, monthlyContributionPercent: 10, annualSalaryGrowthRate: 0, inflationRate: 2.5 },
      fers: { yearsOfService: 15, monthsOfService: 0, high3Salary: 100000 },
      fire: { monthlyFireIncomeGoal: 5000, sideHustleIncome: 0 },
      summary: { monthlyExpenses: 4000, socialSecurity: { mode: 'manual', monthlyBenefit: 2400 } },
      ...extra,
    }),
    { military: { connection: 'self', ...military } }
  );

const uniformed = (o = {}) => ({
  enabled: true,
  coverageSystem: 'brs',
  monthsOfService: 120,
  contributing: true,
  monthlyBasicPay: 3000,
  employeePercent: 5,
  contributionType: 'traditional',
  contributionEndAge: 50,
  traditionalTaxableBalance: 40000,
  traditionalTaxExemptBasis: 10000,
  rothBalance: 0,
  payPeriodsPerYear: 12,
  ...o,
});
const row = (t, age) => t.rows.find((r) => r.age === age);

describe('dual TSP accounts on the timeline', () => {
  it('keeps the uniformed account separate while it is funded, with BRS service contributions', () => {
    const t = buildTimeline(scenario({ tsp: { uniformedServices: uniformed() } }), AS_OF);
    const r0 = row(t, 45);
    expect(r0.uniformedTsp.contributions).toMatchObject({ employeeTraditional: 1800, automatic: 360, matching: 1440, employeeRoth: 0 });
    expect(r0.balances.uniformedTsp.total).toBeGreaterThan(50000);
    // The civilian account still gets its own FERS contributions.
    expect(r0.tspEmployeeContribution).toBe(10400);
    expect(r0.tspEmployerContribution).toBeCloseTo(5200, 6);
    // The employee's military deferral is an outflow of the household.
    const without = buildTimeline(scenario({ tsp: { uniformedServices: uniformed({ enabled: false }) } }), AS_OF);
    expect(r0.totalOutflow - row(without, 45).totalOutflow).toBeCloseTo(1800, 6);
    // Total balance counts both accounts.
    expect(r0.balances.total).toBeCloseTo(r0.balances.traditional + r0.balances.roth + r0.balances.taxable + r0.balances.cash + r0.balances.uniformedTsp.total, 6);
  });

  it('merges the account into the pool after separation and returns the tax-exempt basis tax-free', () => {
    const t = buildTimeline(scenario({ tsp: { uniformedServices: uniformed() } }), AS_OF);
    const before = row(t, 56);
    expect(before.balances.uniformedTsp.total).toBeGreaterThan(0);
    expect(before.balances.taxExemptBasis).toBe(0);
    const at = row(t, 57);
    expect(at.uniformedTsp.merged).toBe(true);
    expect(at.balances.uniformedTsp.total).toBe(0);
    expect(at.balances.taxExemptBasis).toBeGreaterThan(0);
    expect(at.balances.taxExemptBasis).toBeLessThanOrEqual(10000);
    // Withdrawal years: part of each traditional draw is the tax-exempt basis.
    const drawing = t.rows.find((r) => r.age > 57 && r.withdrawals.traditional > 0);
    expect(drawing).toBeDefined();
    expect(drawing.uniformedTsp.taxExemptWithdrawn).toBeGreaterThan(0);
    expect(drawing.uniformedTsp.taxExemptWithdrawn).toBeLessThan(drawing.withdrawals.traditional);
    // The basis runs down, never below zero.
    const last = t.rows[t.rows.length - 1];
    expect(last.balances.taxExemptBasis).toBeGreaterThanOrEqual(0);
  });

  it('one validator covers both accounts and the plan carries it', () => {
    const plan = resolveRetirementPlan(scenario({ tsp: { uniformedServices: uniformed({ employeePercent: 60, monthlyBasicPay: 3000 }), civilian: { ytdEmployeeDeferrals: 0 } } }), AS_OF);
    expect(plan.military.tsp).not.toBeNull();
    expect(plan.military.tsp.byAccount.map((a) => a.context)).toEqual(['civilian', 'uniformed_services']);
    expect(plan.military.tsp.byAccount[0].contributionPercents.matching).toBe(4);
    expect(plan.military.tsp.byAccount[1].contributionPercents.matching).toBe(4);
    // 10% of 104,000 plus 60% of 36,000 = 32,000 > 24,500.
    expect(plan.military.tsp.electiveExcess).toBeCloseTo(32000 - 24500, 0);
    expect(plan.military.issues.map((i) => i.code)).toContain(ISSUE_CODES.MIL_TSP_SHARED_LIMIT_EXCEEDED);
    const fine = resolveRetirementPlan(scenario({ tsp: { uniformedServices: uniformed() } }), AS_OF);
    expect(fine.military.tsp.electiveExcess).toBe(0);
    expect(fine.military.issues.map((i) => i.code)).not.toContain(ISSUE_CODES.MIL_TSP_SHARED_LIMIT_EXCEEDED);
  });

  it('with no end age recorded, contributions run to federal separation, or through this year for someone already separated', () => {
    const working = buildTimeline(scenario({ tsp: { uniformedServices: uniformed({ contributionEndAge: null }) } }), AS_OF);
    expect(row(working, 45).uniformedTsp.contributions.employeeTraditional).toBe(1800);
    expect(row(working, 56).uniformedTsp.contributions.employeeTraditional).toBeGreaterThan(0);
    expect(row(working, 57).uniformedTsp.merged).toBe(true);
    const retired = buildTimeline(scenario({ tsp: { uniformedServices: uniformed({ contributionEndAge: null }) } }, { profile: { currentAge: 60, separationAge: 57, socialSecurityClaimAge: 67 } }), AS_OF);
    expect(row(retired, 60).uniformedTsp.merged).toBe(false);
    expect(row(retired, 60).uniformedTsp.contributions.employeeTraditional).toBe(1800);
    expect(row(retired, 61).uniformedTsp.merged).toBe(true);
  });

  it('forfeits unvested BRS automatic money when contributions stop before two years of service', () => {
    const t = buildTimeline(scenario({ tsp: { uniformedServices: uniformed({ monthsOfService: 6, unvestedAutomaticBalance: 200, contributionEndAge: 46, traditionalTaxExemptBasis: 0 }) } }), AS_OF);
    const stop = row(t, 45);
    expect(stop.uniformedTsp.forfeited).toBeGreaterThan(0);
    expect(row(t, 46).balances.uniformedTsp.unvestedAutomatic).toBe(0);
  });
});

describe('coverage periods per person on the timeline', () => {
  it('a mixed FEHB / TRICARE / Medicare household is costed person by person', () => {
    const coverage = [
      { id: 'me-fehb', ownerId: 'primary', source: 'fehb', startDate: '2026-01-01', endDate: '2045-12-31', enrollmentConfirmed: true, monthlyPremium: 250, outOfPocketAnnual: { base: 1500 } },
      { id: 'me-tfl', ownerId: 'primary', source: 'tfl', startDate: '2046-01-01', enrollmentConfirmed: true, medicare: { partADate: '2046-01-01', partBDate: '2046-01-01' } },
      { id: 'sp-trs', ownerId: 'spouse', source: 'trs', startDate: '2026-01-01', endDate: '2040-12-31', enrollmentConfirmed: true, outOfPocketAnnual: { base: 800 } },
    ];
    const s = scenario({ coverage }, { household: { spouse: { enabled: true, currentAge: 44, annualIncome: 0, isFederal: false } } });
    const plan = resolveRetirementPlan(s, AS_OF);
    expect(plan.military.coverage).toHaveLength(3);
    expect(plan.military.issues.map((i) => i.code)).not.toContain(ISSUE_CODES.MIL_TRS_FEHB_CONFLICT); // spouse is not FEHB-eligible
    const t = buildTimeline(s, { ...AS_OF, plan });
    const r = row(t, 45);
    expect(r.healthcare.coverageType).toBe('coverage_periods');
    expect(r.healthcare.primaryTotal).toBeCloseTo(250 * 12 + 1500, 6);
    expect(r.healthcare.spouse.bySource[0].source).toBe('trs');
    expect(r.healthcare.total).toBeCloseTo(r.healthcare.primaryTotal + r.healthcare.spouse.total, 6);
    // At 65 the primary is on TFL: Part B is the premium, no FEHB.
    const at65 = row(t, 65);
    expect(at65.healthcare.fehbPremium).toBe(0);
    expect(at65.healthcare.medicarePartB).toBeGreaterThan(0);
    expect(at65.healthcare.periods[0].source).toBe('tfl');
    // The spouse's TRS ended in 2040: no spouse cost from 2041.
    expect(row(t, 60).healthcare.spouse).toBeNull();
  });

  it('a Guard member who is a current fed with TRS is blocked, and the block reaches the plan issues', () => {
    const plan = resolveRetirementPlan(scenario({ coverage: [{ id: 'trs', ownerId: 'primary', source: 'trs', startDate: '2026-01-01', enrollmentConfirmed: true }] }), AS_OF);
    expect(plan.military.issues.map((i) => i.code)).toContain(ISSUE_CODES.MIL_TRS_FEHB_CONFLICT);
    expect(plan.military.coverage[0].resolved.blocked).toBe(true);
  });

  it('with no coverage periods the default healthcare model is untouched', () => {
    const t = buildTimeline(scenario(), AS_OF);
    expect(row(t, 45).healthcare.coverageType).toBe('fehb');
    expect(row(t, 45).healthcare.spouse).toBeNull();
  });
});

describe('BRS extras on the plan', () => {
  it('continuation pay from an official offer and a lump sum blocked without the official rate', () => {
    const plan = resolveRetirementPlan(
      scenario({
        tsp: { uniformedServices: uniformed() },
        brs: { continuationPay: { offered: true, multiple: 2.5, monthlyBasicPay: 3000, paymentDate: '2027-06-01', provenance: 'user_entered_official' }, lumpSum: { electionPercent: 25 } },
      }),
      AS_OF
    );
    expect(plan.military.brs.continuationPay.gross).toBe(7500);
    expect(plan.military.brs.lumpSum.blocked).toBe(true);
    const codes = plan.military.issues.map((i) => i.code);
    expect(codes).toContain(ISSUE_CODES.MRT_BRS_CP_FORFEITURE);
    expect(codes).toContain(ISSUE_CODES.MRT_BRS_LSDR_MISSING);
  });
});
