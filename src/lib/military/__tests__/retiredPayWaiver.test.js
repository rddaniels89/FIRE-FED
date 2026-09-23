import { describe, expect, it } from 'vitest';
import {
  CHAPTER_61_EXCEPTION,
  DETERMINATION_STATUSES,
  RETIRED_PAY_PATHS,
  RETIRED_PAY_RECEIPT,
  RETIRED_PAY_TYPES,
  RETIRED_PAY_WAIVER_WARNING,
  WAIVER_MODES,
  applyRetiredPayWaiver,
  createDefaultRetiredPay,
  evaluateRetiredPayGate,
  retiredPayStreamIds,
} from '../retiredPayWaiver';
import { compareRetiredPayWaiver } from '../retiredPayComparison';
import { CREDIT_REASONS, resolveMilitaryFersCredit } from '../fersCredit';
import { ISSUE_CODES, ISSUE_SEVERITY } from '../status';
import { createDefaultMilitary, applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../scenarios/schema';
import { resolveRetirementPlan } from '../../projection/plan';
import { buildTimeline } from '../../projection/timeline';

const T = RETIRED_PAY_TYPES;
const D = DETERMINATION_STATUSES;

const retiredPay = (over = {}) => ({ ...createDefaultRetiredPay(), receives: RETIRED_PAY_RECEIPT.YES, ...over });
const military = (rp, extra = {}) => ({ ...createDefaultMilitary(), retiredPay: rp, ...extra });
const codes = (r) => r.issues.map((i) => i.code);

describe('the gate (spec §4.3; cases 24, 25, 27)', () => {
  it('path 1: no retired pay allows credit with no issues', () => {
    const g = evaluateRetiredPayGate(military(createDefaultRetiredPay()));
    expect(g).toMatchObject({ path: RETIRED_PAY_PATHS.NO_RETIRED_PAY, allowsCredit: true, waiverScenarioAllowed: false });
    expect(g.issues).toEqual([]);
    expect(evaluateRetiredPayGate(undefined).allowsCredit).toBe(true);
  });

  it('case 24: retired pay of unknown type blocks the credit and offers no scenario', () => {
    for (const rp of [retiredPay({ type: T.UNKNOWN }), retiredPay({ type: null }), retiredPay({ receives: RETIRED_PAY_RECEIPT.UNKNOWN, type: T.REGULAR_LONGEVITY })]) {
      const g = evaluateRetiredPayGate(military(rp));
      expect(g).toMatchObject({ path: RETIRED_PAY_PATHS.TYPE_UNKNOWN, allowsCredit: false, waiverScenarioAllowed: false });
      expect(g.issues[0]).toMatchObject({ code: ISSUE_CODES.MIL_RETIRED_PAY_TYPE_UNKNOWN, severity: ISSUE_SEVERITY.BLOCK });
    }
  });

  it('path 2: regular retired pay requires a waiver; the plan credits nothing but a scenario is allowed', () => {
    for (const type of [T.REGULAR_LONGEVITY, T.TERA, T.OTHER]) {
      const g = evaluateRetiredPayGate(military(retiredPay({ type })));
      expect(g, type).toMatchObject({ path: RETIRED_PAY_PATHS.WAIVER_REQUIRED, allowsCredit: false, waiverScenarioAllowed: true });
      expect(g.issues[0].code).toBe(ISSUE_CODES.MIL_WAIVER_CONFIRMATION_REQUIRED);
    }
  });

  it('path 2: an elected waiver counts only with the agency determination confirmed', () => {
    const unconfirmed = evaluateRetiredPayGate(military(retiredPay({ type: T.REGULAR_LONGEVITY, waiver: { mode: WAIVER_MODES.ELECTED, effectiveAge: 62 } })));
    expect(unconfirmed.allowsCredit).toBe(false);
    const confirmed = evaluateRetiredPayGate(
      military(retiredPay({ type: T.REGULAR_LONGEVITY, officialDeterminationStatus: D.CONFIRMED, waiver: { mode: WAIVER_MODES.ELECTED, effectiveAge: 62 } }))
    );
    expect(confirmed).toMatchObject({ path: RETIRED_PAY_PATHS.WAIVER_ELECTED, allowsCredit: true, waiverElected: true });
    expect(codes(confirmed)).toEqual([ISSUE_CODES.MIL_WAIVER_ELECTED]);
    // A hypothetical mode is never an election.
    expect(evaluateRetiredPayGate(military(retiredPay({ type: T.REGULAR_LONGEVITY, officialDeterminationStatus: D.CONFIRMED, waiver: { mode: WAIVER_MODES.HYPOTHETICAL } }))).allowsCredit).toBe(false);
  });

  it('case 25: chapter 1223 Reserve retired pay is credited without a waiver only once confirmed and acknowledged', () => {
    const unconfirmed = evaluateRetiredPayGate(military(retiredPay({ type: T.RESERVE_NONREGULAR })));
    expect(unconfirmed).toMatchObject({ path: RETIRED_PAY_PATHS.DETERMINATION_REQUIRED, allowsCredit: false, waiverScenarioAllowed: false });
    expect(unconfirmed.issues[0].code).toBe(ISSUE_CODES.MIL_RESERVE_RETIRED_PAY_CONFIRMATION);
    const confirmedOnly = evaluateRetiredPayGate(military(retiredPay({ type: T.RESERVE_NONREGULAR, officialDeterminationStatus: D.CONFIRMED })));
    expect(confirmedOnly.allowsCredit).toBe(false);
    const both = evaluateRetiredPayGate(military(retiredPay({ type: T.RESERVE_NONREGULAR, officialDeterminationStatus: D.CONFIRMED, exceptionAcknowledged: true })));
    expect(both).toMatchObject({ path: RETIRED_PAY_PATHS.EXCEPTION, allowsCredit: true, exceptionApplied: true });
    expect(both.issues[0]).toMatchObject({ code: ISSUE_CODES.MIL_RETIRED_PAY_EXCEPTION_APPLIED, detail: { exception: 'chapter_1223' } });
  });

  it('case 27: chapter 61 never enters the automated waiver path and is credited only under an official exception finding', () => {
    const unknown = evaluateRetiredPayGate(military(retiredPay({ type: T.DISABILITY_CHAPTER_61 })));
    expect(unknown).toMatchObject({ path: RETIRED_PAY_PATHS.DETERMINATION_REQUIRED, allowsCredit: false, waiverScenarioAllowed: false });
    expect(unknown.issues[0]).toMatchObject({ code: ISSUE_CODES.MIL_CH61_OFFICIAL_INPUT_REQUIRED, severity: ISSUE_SEVERITY.BLOCK });
    // Even an elected waiver does not open it.
    const elected = evaluateRetiredPayGate(military(retiredPay({ type: T.DISABILITY_CHAPTER_61, officialDeterminationStatus: D.CONFIRMED, waiver: { mode: WAIVER_MODES.ELECTED } })));
    expect(elected.allowsCredit).toBe(false);
    expect(elected.waiverScenarioAllowed).toBe(false);
    const notApplicable = evaluateRetiredPayGate(military(retiredPay({ type: T.DISABILITY_CHAPTER_61, chapter61Exception: CHAPTER_61_EXCEPTION.NOT_APPLICABLE, officialDeterminationStatus: D.CONFIRMED, exceptionAcknowledged: true })));
    expect(notApplicable.allowsCredit).toBe(false);
    const exception = evaluateRetiredPayGate(military(retiredPay({ type: T.DISABILITY_CHAPTER_61, chapter61Exception: CHAPTER_61_EXCEPTION.CONFIRMED, officialDeterminationStatus: D.CONFIRMED, exceptionAcknowledged: true })));
    expect(exception).toMatchObject({ path: RETIRED_PAY_PATHS.EXCEPTION, allowsCredit: true, exceptionApplied: true });
  });
});

describe('the gate inside the credit resolver', () => {
  const PERIOD = { id: 'ad', dutyStatus: 'active_duty', startDate: '1998-01-01', endDate: '2001-12-31', characterStatus: 'confirmed_honorable_conditions', documentationStatus: 'dd214', inputProvenance: 'user_entered_official', earningsByYear: { 1998: 18000, 1999: 19000, 2000: 20000, 2001: 21000 } };
  const withDeposit = (rp) => military(rp, { servicePeriods: [PERIOD], deposit: { ...createDefaultMilitary().deposit, status: 'paid_in_full' } });

  it('a paid deposit credits nothing while regular retired pay is unwaived, and says why', () => {
    const r = resolveMilitaryFersCredit(withDeposit(retiredPay({ type: T.REGULAR_LONGEVITY })), { asOfDate: '2026-09-01' });
    expect(r.creditYears).toBe(0);
    expect(r.status).toBeNull();
    expect(r.reason).toBe(CREDIT_REASONS.RETIRED_PAY_WAIVER_REQUIRED);
    expect(r.retiredPayGate).toMatchObject({ path: RETIRED_PAY_PATHS.WAIVER_REQUIRED, gatedCredit: true, waiverScenarioAllowed: true });
    expect(codes(r)).toContain(ISSUE_CODES.MIL_WAIVER_CONFIRMATION_REQUIRED);
    // The deposit figures are still there for the screens.
    expect(r.deposit.principal).toBeGreaterThan(0);
  });

  it('credits with an elected, confirmed waiver, and under a confirmed chapter 1223 exception', () => {
    const waived = resolveMilitaryFersCredit(withDeposit(retiredPay({ type: T.REGULAR_LONGEVITY, officialDeterminationStatus: D.CONFIRMED, waiver: { mode: WAIVER_MODES.ELECTED, effectiveAge: 60 } })), { asOfDate: '2026-09-01' });
    expect(waived.creditYears).toBeCloseTo(4, 10);
    expect(waived.retiredPayGate.waiverElected).toBe(true);
    const reserve = resolveMilitaryFersCredit(withDeposit(retiredPay({ type: T.RESERVE_NONREGULAR, officialDeterminationStatus: D.CONFIRMED, exceptionAcknowledged: true })), { asOfDate: '2026-09-01' });
    expect(reserve.creditYears).toBeCloseTo(4, 10);
    expect(reserve.retiredPayGate.exceptionApplied).toBe(true);
  });

  it('reports the unknown-type and determination reasons', () => {
    expect(resolveMilitaryFersCredit(withDeposit(retiredPay({ type: T.UNKNOWN })), { asOfDate: '2026-09-01' }).reason).toBe(CREDIT_REASONS.RETIRED_PAY_TYPE_UNKNOWN);
    expect(resolveMilitaryFersCredit(withDeposit(retiredPay({ type: T.DISABILITY_CHAPTER_61 })), { asOfDate: '2026-09-01' }).reason).toBe(CREDIT_REASONS.RETIRED_PAY_DETERMINATION_REQUIRED);
  });

  it('does not gate a spouse\'s periods on the primary\'s retired pay', () => {
    const m = military(retiredPay({ type: T.REGULAR_LONGEVITY }), { servicePeriods: [{ ...PERIOD, ownerId: 'spouse' }], deposit: { ...createDefaultMilitary().deposit, status: 'paid_in_full' } });
    expect(resolveMilitaryFersCredit(m, { ownerId: 'spouse', asOfDate: '2026-09-01' }).creditYears).toBeCloseTo(4, 10);
  });
});

describe('case 26: applying the waiver stops the right streams', () => {
  const streams = [
    { id: 'rp', type: 'longevity_retired_pay', grossAmount: 2800, frequency: 'monthly', amountStatus: 'official' },
    { id: 'crdp', type: 'crdp', grossAmount: 900, frequency: 'monthly', amountStatus: 'official' },
    { id: 'crsc', type: 'crsc', grossAmount: 500, frequency: 'monthly', amountStatus: 'official' },
    { id: 'va', type: 'va_disability', grossAmount: 1500, frequency: 'monthly', amountStatus: 'official' },
    { id: 'spouse_rp', type: 'longevity_retired_pay', ownerId: 'spouse', grossAmount: 2000, frequency: 'monthly', amountStatus: 'official' },
  ];

  it('identifies the primary retired-pay and CRDP streams', () => {
    expect(retiredPayStreamIds({ incomeStreams: streams })).toEqual({ retiredPay: ['rp'], crdp: ['crdp'] });
  });

  it('ends retired pay and CRDP the year before the waiver, leaves CRSC, VA, and the spouse alone, and marks everything hypothetical', () => {
    const m = applyRetiredPayWaiver(military(retiredPay({ type: T.REGULAR_LONGEVITY }), { incomeStreams: streams }), { effectiveAge: 62 });
    const byId = Object.fromEntries(m.incomeStreams.map((s) => [s.id, s]));
    expect(byId.rp.endAge).toBe(61);
    expect(byId.crdp.endAge).toBe(61);
    expect(byId.rp.waivedForFersCredit).toBe(true);
    expect(byId.crsc.endAge).toBeUndefined();
    expect(byId.va.endAge).toBeUndefined();
    expect(byId.spouse_rp.endAge).toBeUndefined();
    expect(m.retiredPay.waiver).toMatchObject({ mode: WAIVER_MODES.ELECTED, effectiveAge: 62, hypothetical: true });
    expect(m.retiredPay.officialDeterminationStatus).toBe(D.CONFIRMED);
    expect(m.deposit.status).toBe('paid_in_full');
    expect(m.hypotheticalWaiver).toBe(true);
  });

  it('keeps an earlier end age a stream already had', () => {
    const m = applyRetiredPayWaiver(military(retiredPay({ type: T.REGULAR_LONGEVITY }), { incomeStreams: [{ ...streams[0], endAge: 58 }] }), { effectiveAge: 62 });
    expect(m.incomeStreams[0].endAge).toBe(58);
  });
});

describe('the waiver comparison (spec §6.7)', () => {
  const AS_OF = { asOfYear: 2026, asOfMonth: 8 };
  const PERIOD = { id: 'ad', dutyStatus: 'active_duty', startDate: '1990-01-01', endDate: '2009-12-31', characterStatus: 'confirmed_honorable_conditions', documentationStatus: 'dd214', inputProvenance: 'user_entered_official', earningsByYear: Object.fromEntries(Array.from({ length: 20 }, (_, k) => [1990 + k, 25000 + 1500 * k])) };
  const scenario = ({ type = T.REGULAR_LONGEVITY, rp = {}, survivor = 'full' } = {}) =>
    applyScenarioUpdates(
      normalizeScenario({
        ...createDefaultScenario('w'),
        profile: { currentAge: 52, separationAge: 62, socialSecurityClaimAge: 67 },
        tsp: { currentBalance: 350000, annualSalary: 105000, monthlyContributionPercent: 8, annualSalaryGrowthRate: 2, inflationRate: 2.5 },
        fers: { yearsOfService: 8, monthsOfService: 0, high3Salary: 100000, survivorElection: survivor },
        fire: { monthlyFireIncomeGoal: 6500, sideHustleIncome: 0 },
        summary: { monthlyExpenses: 5000, socialSecurity: { mode: 'manual', monthlyBenefit: 2600 } },
      }),
      {
        military: {
          connection: 'self',
          servicePeriods: [PERIOD],
          deposit: { firstFersCoverageDate: '2018-03-01' },
          retiredPay: retiredPay({ type, ...rp }),
          incomeStreams: [
            { id: 'rp', type: 'longevity_retired_pay', grossAmount: 3200, frequency: 'monthly', amountStatus: 'official', officialAmountAsOfDate: '2026-01-01' },
            { id: 'va', type: 'va_disability', grossAmount: 1200, frequency: 'monthly', amountStatus: 'official', officialAmountAsOfDate: '2026-01-01' },
          ],
        },
      }
    );

  it('returns null with no retired pay or an unknown type', () => {
    expect(compareRetiredPayWaiver(scenario({ rp: { receives: 'no' } }), AS_OF)).toBeNull();
    expect(compareRetiredPayWaiver(scenario({ type: T.UNKNOWN }), AS_OF)).toBeNull();
  });

  it('carries the §6.7 warning and never recommends', () => {
    const r = compareRetiredPayWaiver(scenario(), AS_OF);
    expect(r.warning).toBe(RETIRED_PAY_WAIVER_WARNING);
    expect(r.warning).toMatch(/not a waiver determination or recommendation/);
    expect(JSON.stringify(r).toLowerCase()).not.toMatch(/you should|recommend(ed)? (that|to)|best option|waive your/);
  });

  it('keep credits nothing; waive stops retired pay at the FERS start, credits twenty years, and moves the door', () => {
    const r = compareRetiredPayWaiver(scenario(), AS_OF);
    expect(r.path).toBe(RETIRED_PAY_PATHS.WAIVER_REQUIRED);
    expect(r.keep.militaryCreditYears).toBe(0);
    // 18 civilian years at 62 without credit: 62/5 unreduced but 1.0%. With 20 more: 38 years at 62 → 1.1%.
    expect(r.waive.militaryCreditYears).toBeCloseTo(20, 6);
    expect(r.waive.hypothetical).toBe(true);
    expect(r.waive.effectiveAge).toBe(r.waive.annuityStartAge);
    expect(r.waive.multiplier).toBe(0.011);
    expect(r.keep.multiplier).toBe(0.01);
    expect(r.delta.waive.annuityAnnualAtStart).toBeGreaterThan(0);
    expect(r.waive.issues.map((i) => i.code)).toContain(ISSUE_CODES.MIL_WAIVER_HYPOTHETICAL);
    // Retired pay is paid up to the year before the annuity, then gone.
    const before = r.waive.byAge.find((b) => b.age === r.waive.effectiveAge - 1);
    const at = r.waive.byAge.find((b) => b.age === r.waive.effectiveAge);
    expect(before.militaryIncome).toBeGreaterThan(0);
    expect(at.militaryIncome).toBeLessThan(before.militaryIncome); // VA continues; retired pay does not
    expect(at.pension).toBeGreaterThan(0);
    expect(r.exception).toBeNull();
  });

  it('flows through survivor and tax projections', () => {
    const r = compareRetiredPayWaiver(scenario({ survivor: 'full' }), AS_OF);
    // A larger FERS annuity means a larger FERS survivor annuity.
    expect(r.delta.waive.survivorAnnual).toBeGreaterThan(0);
    expect(r.waive.survivorAnnual).toBeCloseTo(r.waive.annuityAnnualAtStart / 0.9 * 0.5, 0);
    // Taxes differ because taxable retired pay is replaced by a taxable annuity of a different size.
    expect(r.delta.waive.lifetimeTaxes).not.toBe(0);
    expect(r.waive.lifetime.afterTaxNominal).toBeGreaterThan(0);
    expect(r.keep.lifetime.militaryIncomeNominal).toBeGreaterThan(r.waive.lifetime.militaryIncomeNominal);
  });

  it('offers only the keep scenario for a chapter 61 award', () => {
    const r = compareRetiredPayWaiver(scenario({ type: T.DISABILITY_CHAPTER_61 }), AS_OF);
    expect(r.path).toBe(RETIRED_PAY_PATHS.DETERMINATION_REQUIRED);
    expect(r.waive).toBeNull();
    expect(r.exception).toBeNull();
    expect(r.issues.map((i) => i.code)).toContain(ISSUE_CODES.MIL_CH61_OFFICIAL_INPUT_REQUIRED);
  });

  it('adds the exception scenario for confirmed chapter 1223 pay: retired pay continues and the service is credited', () => {
    const r = compareRetiredPayWaiver(scenario({ type: T.RESERVE_NONREGULAR, rp: { officialDeterminationStatus: D.CONFIRMED, exceptionAcknowledged: true } }), AS_OF);
    expect(r.path).toBe(RETIRED_PAY_PATHS.EXCEPTION);
    expect(r.exception.militaryCreditYears).toBeCloseTo(20, 6);
    expect(r.exception.lifetime.militaryIncomeNominal).toBeCloseTo(r.keep.lifetime.militaryIncomeNominal, 0);
    expect(r.delta.exception.annuityAnnualAtStart).toBeGreaterThan(0);
    expect(r.waive).toBeNull();
  });

  it('the plan of record for an unwaived regular retiree credits nothing and exposes the path', () => {
    const plan = resolveRetirementPlan(scenario(), AS_OF);
    expect(plan.service.militaryCreditYears).toBe(0);
    expect(plan.military.retiredPay).toMatchObject({ path: RETIRED_PAY_PATHS.WAIVER_REQUIRED, allowsCredit: false, waiverScenarioAllowed: true, receives: 'yes', type: T.REGULAR_LONGEVITY, hypotheticalWaiver: false });
    const t = buildTimeline(scenario(), AS_OF);
    expect(t.rows.find((r) => r.age === 70).militaryIncome.militaryRetiredPay).toBeGreaterThan(0);
  });
});
