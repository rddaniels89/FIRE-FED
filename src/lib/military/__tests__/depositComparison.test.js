import { describe, expect, it } from 'vitest';
import { compareMilitaryDeposit, depositSensitivity, withDepositPaid, withoutDeposit } from '../depositComparison';
import { buildTimeline } from '../../projection/timeline';
import { resolveRetirementPlan } from '../../projection/plan';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../scenarios/schema';

const AS_OF = { asOfYear: 2026, asOfMonth: 8 };

const PERIOD = {
  id: 'ad',
  dutyStatus: 'active_duty',
  startDate: '1998-01-01',
  endDate: '2001-12-31',
  characterStatus: 'confirmed_honorable_conditions',
  documentationStatus: 'dd214',
  inputProvenance: 'user_entered_official',
  earningsByYear: { 1998: 18000, 1999: 19000, 2000: 20000, 2001: 21000 },
};

const scenario = ({ currentAge = 50, separationAge = 57, yearsOfService = 19, deposit = {}, periods = [PERIOD] } = {}) =>
  applyScenarioUpdates(
    normalizeScenario({
      ...createDefaultScenario('cmp'),
      profile: { currentAge, separationAge, socialSecurityClaimAge: 67 },
      tsp: { currentBalance: 400000, annualSalary: 110000, monthlyContributionPercent: 10, annualSalaryGrowthRate: 2, inflationRate: 2.5 },
      fers: { yearsOfService, monthsOfService: 0, high3Salary: 105000 },
      fire: { monthlyFireIncomeGoal: 5000, sideHustleIncome: 0, cashBalance: 20000 },
      summary: { monthlyExpenses: 4500, socialSecurity: { mode: 'manual', monthlyBenefit: 2400 } },
    }),
    { military: { connection: 'self', servicePeriods: periods, deposit: { firstFersCoverageDate: '2008-03-01', ...deposit } } }
  );

describe('the two scenarios', () => {
  it('baseline credits nothing and the credit case credits everything creditable', () => {
    const s = scenario();
    const a = resolveRetirementPlan(withoutDeposit(s), AS_OF);
    const b = resolveRetirementPlan(withDepositPaid(s), AS_OF);
    expect(a.service.militaryCreditYears).toBe(0);
    expect(b.service.militaryCreditYears).toBeCloseTo(4, 10);
  });
});

describe('compareMilitaryDeposit', () => {
  it('is a whole-plan comparison when the credit changes the door, and the deltas point the right way', () => {
    const r = compareMilitaryDeposit(scenario(), AS_OF);
    expect(r).not.toBeNull();
    expect(r.creditYears).toBeCloseTo(4, 10);
    expect(r.baseline.path).toBe('mra10_immediate');
    expect(r.credit.path).toBe('immediate_unreduced');
    expect(r.wholePlan).toBe(true);
    expect(r.label).toBe('Whole-plan comparison');
    expect(r.delta.pathChanged).toBe(true);
    expect(r.delta.ageReductionPercent).toBeLessThan(0);
    expect(r.delta.annuityAnnualAtStart).toBeGreaterThan(0);
    expect(r.delta.srsAnnual).toBeGreaterThan(0);
    expect(r.delta.lifetimeAfterTaxNominal).toBeGreaterThan(r.deposit.amount);
    expect(r.delta.simpleBreakEvenAge).toBeGreaterThanOrEqual(57);
    expect(r.delta.discountedBreakEvenAge).toBeGreaterThanOrEqual(r.delta.simpleBreakEvenAge);
    expect(r.delta.netPresentValue).toBeGreaterThan(0);
  });

  it('charges the deposit as a one-off outflow in the payment year, so the credit case starts poorer and ends richer', () => {
    const r = compareMilitaryDeposit(scenario(), AS_OF);
    expect(r.deposit.amount).toBeGreaterThan(0);
    expect(r.deposit.paymentAge).toBe(50);
    const first = r.byAge[0];
    expect(first.balanceDelta).toBeLessThan(0);
    expect(Math.abs(first.balanceDelta)).toBeGreaterThanOrEqual(r.deposit.amount * 0.9);
    // Once the larger annuity and the supplement are paying, the credit case catches up.
    const later = r.byAge.filter((b) => b.age >= 60).map((b) => b.balanceDelta);
    expect(Math.max(...later)).toBeGreaterThan(first.balanceDelta);
    expect(r.delta.balanceAtEnd).toBeGreaterThanOrEqual(0);
    // And it never runs dry sooner than the baseline.
    const base = r.delta.firstShortfallAge.baseline;
    const credit = r.delta.firstShortfallAge.credit;
    expect(credit === null || (base !== null && credit >= base)).toBe(true);
  });

  it('is an annuity-only comparison when nothing but the computation changes', () => {
    // 62 with 25 civilian years: unreduced either way, 1.1% either way, no supplement at 62.
    const r = compareMilitaryDeposit(scenario({ currentAge: 60, separationAge: 62, yearsOfService: 23 }), AS_OF);
    expect(r.wholePlan).toBe(false);
    expect(r.label).toBe('Annuity comparison');
    expect(r.delta.pathChanged).toBe(false);
    expect(r.delta.multiplierChanged).toBe(false);
    expect(r.delta.annuityAnnualAtStart).toBeCloseTo(r.credit.annuityAnnualAtStart - r.baseline.annuityAnnualAtStart, 6);
  });

  it('honours a planned payment date and flags one after separation', () => {
    const later = compareMilitaryDeposit(scenario({ deposit: { plannedPaymentDate: '2030-01-01' } }), AS_OF);
    expect(later.deposit.paymentAge).toBe(53);
    expect(later.deposit.paidAfterSeparation).toBe(false);
    const tooLate = compareMilitaryDeposit(scenario({ deposit: { plannedPaymentDate: '2040-01-01' } }), AS_OF);
    expect(tooLate.deposit.paidAfterSeparation).toBe(true);
  });

  it('uses the disclosed discount rate, and a higher rate lowers the present value', () => {
    const low = compareMilitaryDeposit(scenario(), { ...AS_OF, discountRate: 0.01 });
    const high = compareMilitaryDeposit(scenario(), { ...AS_OF, discountRate: 0.08 });
    expect(low.discountRate).toBe(0.01);
    expect(high.discountRate).toBe(0.08);
    expect(high.delta.netPresentValue).toBeLessThan(low.delta.netPresentValue);
    expect(high.delta.lifetimeAfterTaxNominal).toBeCloseTo(low.delta.lifetimeAfterTaxNominal, 6);
  });

  it('returns null when there is nothing creditable to compare', () => {
    expect(compareMilitaryDeposit(scenario({ periods: [] }), AS_OF)).toBeNull();
    expect(compareMilitaryDeposit(scenario({ periods: [{ ...PERIOD, characterStatus: 'unknown' }] }), AS_OF)).toBeNull();
  });

  it('never contains recommendation language', () => {
    const r = compareMilitaryDeposit(scenario(), AS_OF);
    expect(JSON.stringify(r).toLowerCase()).not.toMatch(/you should|worth paying|buy back|recommend/);
  });

  it('the sensitivity grid returns one row per payment age and discount rate', () => {
    const rows = depositSensitivity(scenario(), { ...AS_OF, paymentAges: [50, 55], discountRates: [0.02, 0.05] });
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.paymentAge))).toEqual(new Set([50, 55]));
    // Paying later costs more interest, so the deposit amount does not fall.
    const at50 = rows.find((r) => r.paymentAge === 50 && r.discountRate === 0.02);
    const at55 = rows.find((r) => r.paymentAge === 55 && r.discountRate === 0.02);
    expect(at55.depositAmount).toBeGreaterThanOrEqual(at50.depositAmount);
  });
});

describe('timeline one-off outflows', () => {
  it('reduces the balance by the outflow in that year and nothing else', () => {
    const s = scenario({ periods: [] });
    const a = buildTimeline(s, AS_OF);
    const b = buildTimeline(s, { ...AS_OF, oneTimeOutflowsByAge: { 52: 10000 } });
    const at = (t, age) => t.rows.find((r) => r.age === age);
    expect(at(a, 51).balances.total).toBeCloseTo(at(b, 51).balances.total, 6);
    expect(at(b, 52).oneTimeOutflow).toBe(10000);
    expect(at(b, 52).totalOutflow - at(a, 52).totalOutflow).toBeCloseTo(10000, 6);
    expect(at(a, 52).balances.total - at(b, 52).balances.total).toBeGreaterThan(9000);
  });
});
