import { describe, expect, it } from 'vitest';
import { buildTimeline, resolveExpectedReturn } from '../timeline';
import { resolveRetirementPlan, serviceAtSeparation } from '../plan';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../scenarios/schema';

const base = () =>
  normalizeScenario({
    ...createDefaultScenario('t'),
    profile: { currentAge: 45, separationAge: 57, annuityStartAge: null, socialSecurityClaimAge: 67, hireCohort: 'fers_frae' },
    tsp: { currentBalance: 400000, annualSalary: 120000, monthlyContributionPercent: 10, annualSalaryGrowthRate: 2, inflationRate: 2.5 },
    fers: { yearsOfService: 18, monthsOfService: 0, high3Salary: 115000 },
    fire: { monthlyFireIncomeGoal: 6000, sideHustleIncome: 0 },
    summary: { monthlyExpenses: 5000, socialSecurity: { mode: 'manual', monthlyBenefit: 2500 } },
  });

describe('plan resolution', () => {
  it('carries months of service into eligibility', () => {
    expect(serviceAtSeparation({ yearsOfService: 29, monthsOfService: 6, currentAge: 57, separationAge: 57 })).toBeCloseTo(29.5, 5);
    const notYet = resolveRetirementPlan(
      applyScenarioUpdates(base(), { profile: { currentAge: 57, separationAge: 57 }, fers: { yearsOfService: 29, monthsOfService: 6 } })
    );
    expect(notYet.path).toBe('mra10_immediate');
    const yes = resolveRetirementPlan(
      applyScenarioUpdates(base(), { profile: { currentAge: 57, separationAge: 57 }, fers: { yearsOfService: 29, monthsOfService: 12 } })
    );
    expect(yes.path).toBe('immediate_unreduced');
  });

  it('a 45-year-old with 18 years leaving at 57 has MRA+30 and the supplement', () => {
    const plan = resolveRetirementPlan(base());
    expect(plan.service.eligibilityYears).toBe(30);
    expect(plan.path).toBe('immediate_unreduced');
    expect(plan.annuityStartAge).toBe(57);
    expect(plan.srs.isEligible).toBe(true);
    expect(plan.keepsFehb).toBe(true);
    expect(plan.tspAccess.traditionalPenaltyFreeAge).toBe(57);
    expect(plan.annuity.annualAtStart).toBeGreaterThan(0);
  });

  it('leaving at 50 with 23 years is a deferred annuity, frozen until 60', () => {
    const plan = resolveRetirementPlan(applyScenarioUpdates(base(), { profile: { separationAge: 50 } }));
    expect(plan.path).toBe('deferred');
    expect(plan.annuityStartAge).toBe(60);
    expect(plan.annuity.nominalFreezeYears).toBe(10);
    expect(plan.annuity.purchasingPowerLostToFreeze).toBeGreaterThan(0.2);
    expect(plan.srs.isEligible).toBe(false);
    expect(plan.keepsFehb).toBe(false);
    expect(plan.tspAccess.traditionalPenaltyFreeAge).toBe(59.5);
  });

  it('a refund is only offered when no annuity is taken, and the annual leave payout is bridge cash', () => {
    const plan = resolveRetirementPlan(
      applyScenarioUpdates(base(), {
        profile: { separationAge: 48 },
        fers: { takeRefundOfContributions: true, annualLeaveHoursAtSeparation: 240 },
      })
    );
    expect(plan.path).toBe('deferred');
    expect(plan.refund).toBeNull(); // eligible for a deferred annuity, so the refund is not modeled
    expect(plan.annualLeave.grossPayment).toBeGreaterThan(10000);

    const tooShort = resolveRetirementPlan(
      applyScenarioUpdates(base(), { profile: { currentAge: 40, separationAge: 42 }, fers: { yearsOfService: 2, takeRefundOfContributions: true } })
    );
    expect(tooShort.isEligibleForAnnuity).toBe(false);
    expect(tooShort.refund.refundAmount).toBeGreaterThan(0);
  });

  it('VERA is only a path when offered', () => {
    const s = applyScenarioUpdates(base(), { profile: { currentAge: 50, separationAge: 52 }, fers: { yearsOfService: 22 } });
    expect(resolveRetirementPlan(s).path).toBe('deferred');
    const offered = applyScenarioUpdates(s, { profile: { isVeraOffered: true } });
    const plan = resolveRetirementPlan(offered);
    expect(plan.path).toBe('vera');
    expect(plan.srs.isEligible).toBe(true);
    expect(plan.srs.startAge).toBe(57);
  });
});

describe('the timeline', () => {
  it('has one row per age from now to the end age', () => {
    const t = buildTimeline(base());
    expect(t.rows[0].age).toBe(45);
    expect(t.rows[t.rows.length - 1].age).toBe(95);
    expect(t.rows).toHaveLength(51);
  });

  it('pays salary while working and pension, supplement, and Social Security when they start', () => {
    const t = buildTimeline(base());
    const at50 = t.rows.find((r) => r.age === 50);
    expect(at50.phase).toBe('working');
    expect(at50.salary).toBeGreaterThan(120000);
    expect(at50.pension).toBe(0);
    expect(at50.fersContribution).toBeCloseTo(at50.salary * 0.044, 2);

    const at58 = t.rows.find((r) => r.age === 58);
    expect(at58.salary).toBe(0);
    expect(at58.pension).toBeGreaterThan(0);
    expect(at58.srs).toBeGreaterThan(0);
    expect(at58.socialSecurity).toBe(0);
    expect(at58.taxes.fica).toBe(0);

    const at62 = t.rows.find((r) => r.age === 62);
    expect(at62.srs).toBe(0);

    const at67 = t.rows.find((r) => r.age === 67);
    expect(at67.socialSecurity).toBeGreaterThan(0);
    // FERS COLA runs from 62, so the pension at 67 exceeds the pension at 58.
    expect(at67.pension).toBeGreaterThan(at58.pension);
  });

  it('applies the 10% penalty on Traditional withdrawals before the penalty-free age', () => {
    const s = applyScenarioUpdates(base(), { profile: { separationAge: 50 }, fire: { monthlyFireIncomeGoal: 7000 } });
    const t = buildTimeline(s);
    const at52 = t.rows.find((r) => r.age === 52);
    expect(at52.phase).toBe('bridge');
    expect(at52.withdrawals.traditional).toBeGreaterThan(0);
    expect(at52.penalties).toBeCloseTo(at52.withdrawals.traditional * 0.1, 0);
    const at60 = t.rows.find((r) => r.age === 60);
    expect(at60.penalties).toBe(0);
  });

  it('a 72(t) schedule removes the penalty', () => {
    const s = applyScenarioUpdates(base(), { profile: { separationAge: 50 }, fire: { monthlyFireIncomeGoal: 7000 } });
    const t = buildTimeline(s, { strategies: { sepp: { enabled: true } } });
    const at52 = t.rows.find((r) => r.age === 52);
    expect(at52.withdrawals.sepp).toBeGreaterThan(0);
    expect(at52.penalties).toBe(0);
    expect(t.summary.cumulativePenalties).toBeLessThan(buildTimeline(s).summary.cumulativePenalties);
  });

  it('a Roth conversion ladder converts in low-bracket years and seasons after five years', () => {
    const s = applyScenarioUpdates(base(), { profile: { separationAge: 50 }, fire: { monthlyFireIncomeGoal: 3000, cashBalance: 200000 } });
    const t = buildTimeline(s, { strategies: { rothConversion: { enabled: true, targetBracketRate: 0.12 } } });
    const at51 = t.rows.find((r) => r.age === 51);
    expect(at51.rothConversion).toBeGreaterThan(0);
    expect(at51.taxes.federal).toBeGreaterThan(0);
    expect(t.rows.find((r) => r.age === 56).withdrawals.conversions).toBeGreaterThanOrEqual(0);
  });

  it('records a shortfall when assets run out', () => {
    const s = applyScenarioUpdates(base(), {
      profile: { separationAge: 47 },
      tsp: { currentBalance: 20000 },
      fire: { monthlyFireIncomeGoal: 8000 },
    });
    const t = buildTimeline(s);
    expect(t.summary.isSustainable).toBe(false);
    expect(t.summary.firstShortfallAge).toBeLessThan(55);
    expect(t.summary.bridge.fundedPercent).toBeLessThan(100);
  });

  it('a well-funded MRA+30 plan is sustainable and has a bridge only until the supplement and pension cover spending', () => {
    const t = buildTimeline(applyScenarioUpdates(base(), { tsp: { currentBalance: 900000 } }));
    expect(t.summary.isSustainable).toBe(true);
    expect(t.summary.balanceAtSeparation).toBeGreaterThan(900000);
    expect(t.summary.bridge.startAge).toBe(57);
    expect(t.summary.milestones.map((m) => m.key)).toContain('separation');
    expect(t.summary.milestones.map((m) => m.key)).toContain('age_62');
  });

  it('deflates to real dollars', () => {
    const t = buildTimeline(base());
    const r = t.rows.find((x) => x.age === 65);
    expect(r.real.deflator).toBeCloseTo(Math.pow(1.025, 20), 6);
    expect(r.real.spending).toBeCloseTo(r.spending / r.real.deflator, 6);
  });

  it('accepts per-year returns for a Monte Carlo run', () => {
    const s = base();
    const flat = buildTimeline(s, { returnsByYear: new Array(60).fill(0) });
    const good = buildTimeline(s, { returnsByYear: new Array(60).fill(0.08) });
    expect(good.rows.find((r) => r.age === 70).balances.total).toBeGreaterThan(flat.rows.find((r) => r.age === 70).balances.total);
  });

  it('includes a spouse: income until their end age and Social Security at their claim age', () => {
    const s = applyScenarioUpdates(base(), {
      household: { spouse: { enabled: true, currentAge: 43, annualIncome: 60000, incomeEndAge: 60, socialSecurity: { piaMonthlyAtFra: 1800, claimAge: 67 } } },
      taxes: { filingStatus: 'married_joint' },
    });
    const t = buildTimeline(s);
    const at50 = t.rows.find((r) => r.age === 50);
    expect(at50.spouseIncome).toBeGreaterThan(60000);
    const at63 = t.rows.find((r) => r.age === 63); // spouse 61
    expect(at63.spouseIncome).toBe(0);
    const at69 = t.rows.find((r) => r.age === 69); // spouse 67
    expect(at69.spouseSocialSecurity).toBeGreaterThan(0);
    expect(t.rows.find((r) => r.age === 68).spouseSocialSecurity).toBe(0);
  });

  it('derives the expected return from the allocation', () => {
    const s = base();
    // 10% G at 2, 20% F at 3, 40% C at 7, 20% S at 8, 10% I at 6 = 0.2+0.6+2.8+1.6+0.6 = 5.8%
    expect(resolveExpectedReturn(s)).toBeCloseTo(0.058, 6);
  });
});
