import { describe, expect, it } from 'vitest';
import { brsValueStack, continuationPayScenario, lumpSumScenario, lumpSumDiscountRateFor } from '../brs';
import { INPUT_PROVENANCE, ISSUE_CODES, ISSUE_SEVERITY } from '../status';

const OFFICIAL = INPUT_PROVENANCE.USER_ENTERED_OFFICIAL;

describe('continuation pay (spec §20.8)', () => {
  it('requires an official offer; a generic multiple is excluded and blocked', () => {
    const generic = continuationPayScenario({ offer: { multiple: 2.5, monthlyBasicPay: 5000, paymentDate: '2027-03-01', provenance: INPUT_PROVENANCE.USER_ESTIMATE } });
    expect(generic.included).toBe(false);
    expect(generic.issues.map((i) => i.code)).toEqual([ISSUE_CODES.MRT_BRS_CP_OFFER_REQUIRED]);
    expect(generic.issues[0].severity).toBe(ISSUE_SEVERITY.BLOCK);
    expect(continuationPayScenario({ offer: null }).included).toBe(false);
  });

  it('computes the official offer with installments, the obligation end, and the forfeiture warning', () => {
    const r = continuationPayScenario({ offer: { multiple: 2.5, monthlyBasicPay: 5000, paymentDate: '2027-03-01', installments: 2, obligationYears: 4, provenance: OFFICIAL }, marginalTaxRate: 0.22 });
    expect(r.included).toBe(true);
    expect(r.gross).toBe(12500);
    expect(r.installments.map((i) => i.date)).toEqual(['2027-03-01', '2028-03-01']);
    expect(r.installments[0].amount).toBe(6250);
    expect(r.obligationEndDate).toBe('2031-03-01');
    expect(r.afterTaxEstimate).toBeCloseTo(9750, 6);
    expect(r.issues.map((i) => i.code)).toEqual([ISSUE_CODES.MRT_BRS_CP_FORFEITURE]);
  });
});

describe('lump sum (10 U.S.C. 1415)', () => {
  const base = { electionPercent: 50, grossMonthly: 2000, retiredPayStartDate: '2040-01-01', fullRetirementDate: '2060-01-01', asOfYear: 2026, colaAssumption: 0, vaOffsetKnown: true };

  it('is blocked when the official discount rate is missing or stale, never substituted', () => {
    expect(lumpSumDiscountRateFor(2026)).toBeNull();
    const missing = lumpSumScenario(base);
    expect(missing.blocked).toBe(true);
    expect(missing.issues.map((i) => i.code)).toEqual([ISSUE_CODES.MRT_BRS_LSDR_MISSING]);
    const stale = lumpSumScenario({ ...base, officialDiscountRate: { rate: 0.065, year: 2025 } });
    expect(stale.blocked).toBe(true);
    expect(lumpSumScenario({ ...base, electionPercent: 0 }).elected).toBe(false);
  });

  it('discounts the elected share through full retirement age and restores the pension after', () => {
    const r = lumpSumScenario({ ...base, officialDiscountRate: { rate: 0.06, year: 2026, source: 'memo' } });
    expect(r.blocked).toBe(false);
    expect(r.coveredMonths).toBe(240);
    expect(r.reducedMonthlyAtStart).toBe(1000);
    // PV of 1,000 a month for 240 months at 6% nominal compounded monthly-equivalent.
    const mr = Math.pow(1.06, 1 / 12) - 1;
    const expected = (1000 * (1 - Math.pow(1 + mr, -240))) / mr * (1 + mr); // annuity-due: first payment undiscounted
    expect(r.lumpSum).toBeCloseTo(expected, 0);
    // Restored after FRA: the first schedule row past the covered period is the full pension.
    const after = r.schedule.find((s) => !s.covered);
    expect(after.reducedMonthly).toBe(after.fullMonthly);
    // The nominal comparison and the algorithm flag.
    expect(r.nominal.withoutLumpSum).toBeGreaterThan(r.nominal.withLumpSum);
    expect(r.breakEvenMonthsFromStart).toBeGreaterThanOrEqual(240);
    expect(r.algorithmVerified).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual([ISSUE_CODES.MRT_BRS_LUMP_SUM_ALGORITHM_UNVERIFIED]);
  });

  it('warns that the scenario is gross when the VA offset facts are unknown', () => {
    const r = lumpSumScenario({ ...base, vaOffsetKnown: false, officialDiscountRate: { rate: 0.06, year: 2026 } });
    expect(r.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_BRS_LUMP_SUM_VA_IMPACT);
  });
});

describe('value stack', () => {
  it('keeps the four components apart and adds only the one-time amounts', () => {
    const cp = continuationPayScenario({ offer: { multiple: 2, monthlyBasicPay: 4000, paymentDate: '2027-01-01', provenance: OFFICIAL } });
    const stack = brsValueStack({ definedBenefitAnnual: 30000, definedContributionBalance: 250000, continuationPay: cp, lumpSum: { elected: true, blocked: true } });
    expect(stack.components.map((c) => c.id)).toEqual(['defined_benefit', 'defined_contribution', 'continuation_pay', 'lump_sum']);
    expect(stack.components[2].amount).toBe(8000);
    expect(stack.components[3].amount).toBe(0);
    expect(stack.oneTimeTotal).toBe(8000);
  });
});
