import { describe, expect, it } from 'vitest';
import {
  DEPOSIT_METHODS,
  DEPOSIT_MODES,
  compareDepositInCalculator,
  computeMilitaryDepositPrincipal,
  days360,
  estimateMilitaryDeposit,
  projectMilitaryDepositBalance,
} from '../deposit';
import {
  FERS_DEPOSIT_INTEREST_RATES,
  FIRST_DEPOSIT_INTEREST_RATE_YEAR,
  LAST_DEPOSIT_INTEREST_RATE_YEAR,
  currentDepositInterestRateFromParameters,
  fersDepositInterestRate,
  fersMilitaryDepositRate,
} from '../depositRates';
import { CHARACTER_STATUS, DOCUMENTATION_STATUS, DUTY_STATUS, createServicePeriod, normalizeMilitaryServicePeriods } from '../servicePeriods';
import { INPUT_PROVENANCE, ISSUE_CODES, ISSUE_SEVERITY } from '../status';
import { createDefaultMilitary } from '../../scenarios/schema';
import { calculateFersResults } from '../../calculations/fers';

/**
 * Deposit cases from spec §14.1 (1–10, 16–17), plus goldens that reproduce
 * OPM's published composite-rate tables. docs/MILITARY-VERIFICATION.md lists
 * the Handbook worked examples still to be reproduced.
 */

const official = (overrides = {}) =>
  createServicePeriod({
    id: 'p1',
    dutyStatus: DUTY_STATUS.ACTIVE_DUTY,
    startDate: '1998-01-01',
    endDate: '2001-12-31',
    characterStatus: CHARACTER_STATUS.CONFIRMED_HONORABLE_CONDITIONS,
    documentationStatus: DOCUMENTATION_STATUS.DD214,
    inputProvenance: INPUT_PROVENANCE.USER_ENTERED_OFFICIAL,
    earningsByYear: { 1998: 18000, 1999: 19000, 2000: 20000, 2001: 21000 },
    ...overrides,
  });

const military = (deposit = {}, periods = [official()]) => ({
  ...createDefaultMilitary(),
  servicePeriods: periods,
  deposit: { ...createDefaultMilitary().deposit, ...deposit },
});

const codes = (r) => r.issues.map((i) => i.code);

describe('rate tables', () => {
  it('uses 3% except 3.25% for 1999 and 3.40% for 2000', () => {
    expect(fersMilitaryDepositRate(1985)).toBe(0.03);
    expect(fersMilitaryDepositRate(1999)).toBe(0.0325);
    expect(fersMilitaryDepositRate(2000)).toBe(0.034);
    expect(fersMilitaryDepositRate(2001)).toBe(0.03);
    expect(fersMilitaryDepositRate('default')).toBe(0.03);
  });

  it('carries a verified rate with a named source for every year from 1985 to the current year', () => {
    for (let y = FIRST_DEPOSIT_INTEREST_RATE_YEAR; y <= LAST_DEPOSIT_INTEREST_RATE_YEAR; y += 1) {
      const row = FERS_DEPOSIT_INTEREST_RATES[y];
      expect(row, `rate for ${y}`).toBeDefined();
      expect(row.rate).toBeGreaterThan(0);
      expect(row.rate).toBeLessThan(0.2);
      expect(row.verified, `${y} verified`).toBe(true);
      expect(row.source, `${y} source`).toMatch(/BAL|reference materials|composite/);
    }
    // The three figures corrected on verification, pinned to their letters.
    expect(FERS_DEPOSIT_INTEREST_RATES[2018].rate).toBe(0.02125);
    expect(FERS_DEPOSIT_INTEREST_RATES[2023].rate).toBe(0.01875);
    expect(FERS_DEPOSIT_INTEREST_RATES[2024].rate).toBe(0.0375);
  });

  it('agrees with the annual-parameters figure for the current year', () => {
    expect(fersDepositInterestRate(2026).rate).toBe(currentDepositInterestRateFromParameters());
  });

  it('carries the latest rate forward as an assumption and refuses years before the table', () => {
    const future = fersDepositInterestRate(LAST_DEPOSIT_INTEREST_RATE_YEAR + 3);
    expect(future.rate).toBe(FERS_DEPOSIT_INTEREST_RATES[LAST_DEPOSIT_INTEREST_RATE_YEAR].rate);
    expect(future.assumed).toBe(true);
    expect(future.verified).toBe(false);
    expect(fersDepositInterestRate(1970)).toBeNull();
  });

  it('counts days the way OPM does: 30-day months', () => {
    const d = (iso) => new Date(`${iso}T00:00:00Z`);
    expect(days360(d('2024-03-01'), d('2025-01-01'))).toBe(300);
    expect(days360(d('2024-01-01'), d('2024-02-01'))).toBe(30);
    expect(days360(d('2024-02-01'), d('2024-03-01'))).toBe(30);
    expect(days360(d('2024-01-31'), d('2024-02-28'))).toBe(28);
    expect(days360(d('2023-12-01'), d('2024-12-01'))).toBe(360);
  });
});

describe('principal (cases 1, 2, 3, 11, 16)', () => {
  const principalFor = (period, hireCohort = 'fers_frae') => {
    const n = normalizeMilitaryServicePeriods([period]);
    return computeMilitaryDepositPrincipal({ segments: n.segments, periods: n.periods, hireCohort });
  };

  it('case 1: post-1956 service with complete basic pay is 3% of it', () => {
    const p = principalFor(official({ startDate: '2001-01-01', endDate: '2002-12-31', earningsByYear: { 2001: 20000, 2002: 22000 } }));
    expect(p.total).toBeCloseTo(0.03 * 42000, 2);
    expect(p.complete).toBe(true);
    expect(p.issues).toEqual([]);
  });

  it('case 2: service split across the 1999 and 2000 rate years uses each year\'s rate', () => {
    const p = principalFor(official());
    const expected = 18000 * 0.03 + 19000 * 0.0325 + 20000 * 0.034 + 21000 * 0.03;
    expect(p.total).toBeCloseTo(expected, 2);
    expect(p.byPeriod.p1.segments.map((s) => s.rate)).toEqual([0.03, 0.0325, 0.034, 0.03]);
  });

  it('case 3: a year with no basic pay leaves the principal incomplete and blocks', () => {
    const p = principalFor(official({ earningsByYear: { 1998: 18000, 1999: 19000 } }));
    expect(p.complete).toBe(false);
    expect(p.byPeriod.p1.principal).toBeCloseTo(18000 * 0.03 + 19000 * 0.0325, 2);
    expect(p.issues[0].code).toBe(ISSUE_CODES.MIL_DEPOSIT_EARNINGS_MISSING);
    expect(p.issues[0].severity).toBe(ISSUE_SEVERITY.BLOCK);
    expect(p.issues[0].detail.yearsMissing).toEqual([2000, 2001]);
  });

  it('case 11: pre-1957 service owes nothing', () => {
    const p = principalFor(official({ startDate: '1954-01-01', endDate: '1955-12-31', earningsByYear: { 1954: 2000, 1955: 2100 } }));
    expect(p.total).toBe(0);
    expect(p.complete).toBe(true);
  });

  it('case 16: a USERRA interruption owes the lesser of 3% of military pay and the civilian deductions', () => {
    // 4.4% of $50,000 civilian pay = $2,200 beats 3% of $80,000 military pay = $2,400.
    const cheaper = principalFor(
      official({ startDate: '2020-01-01', endDate: '2020-12-31', interruptedFederalService: true, earningsByYear: { 2020: 80000 }, civilianBasicPayByYear: { 2020: 50000 } }),
      'fers_frae'
    );
    expect(cheaper.total).toBeCloseTo(2200, 2);
    expect(cheaper.byPeriod.p1.method).toBe(DEPOSIT_METHODS.USERRA_LOWER_OF);
    // A 0.8% contributor: $400 civilian deductions, lower still.
    expect(principalFor(official({ startDate: '2020-01-01', endDate: '2020-12-31', interruptedFederalService: true, earningsByYear: { 2020: 80000 }, civilianBasicPayByYear: { 2020: 50000 } }), 'fers').total).toBeCloseTo(400, 2);
    // Military pay lower than the civilian deductions: the standard 3% stands.
    const standard = principalFor(
      official({ startDate: '2020-01-01', endDate: '2020-12-31', interruptedFederalService: true, earningsByYear: { 2020: 30000 }, civilianBasicPayByYear: { 2020: 50000 } }),
      'fers_frae'
    );
    expect(standard.total).toBeCloseTo(900, 2);
    expect(standard.byPeriod.p1.method).toBe(DEPOSIT_METHODS.STANDARD);
  });
});

describe('interest and payments (cases 4–10, 17)', () => {
  const project = (over = {}) =>
    projectMilitaryDepositBalance({
      principalByPeriod: { p1: { principal: 1000 } },
      periodOrder: ['p1'],
      interestAccrualDate: '2024-03-01',
      payments: [],
      asOfDate: '2026-03-01',
      ...over,
    });

  it('case 5: charges nothing before the interest-accrual date', () => {
    const r = project({ asOfDate: '2024-02-28' });
    expect(r.balance).toBe(1000);
    expect(r.totalInterest).toBe(0);
    expect(r.ledger).toEqual([]);
  });

  it('case 6: the first posting is on the first anniversary of the IAD, at the composite of the two calendar years', () => {
    const r = project({ asOfDate: '2025-03-01' });
    // 1 Mar 2024 → 1 Jan 2025 is ten 30-day months at the 2024 rate, then two months of 2025.
    const expected = 1000 * (0.0375 * (300 / 360) + 0.04375 * (60 / 360));
    expect(r.totalInterest).toBeCloseTo(expected, 2);
    expect(r.ledger).toHaveLength(1);
    expect(r.ledger[0]).toMatchObject({ date: '2025-03-01', type: 'interest' });
    expect(r.balance).toBeCloseTo(1000 + expected, 2);
  });

  it('case 7: compounds annually across different rates', () => {
    const one = project({ asOfDate: '2025-03-01' });
    const two = project({ asOfDate: '2026-03-01' });
    const secondYear = one.balance * (0.04375 * (300 / 360) + 0.0425 * (60 / 360));
    expect(two.totalInterest).toBeCloseTo(one.totalInterest + secondYear, 1);
    expect(two.ledger).toHaveLength(2);
    expect(two.ratesUsed.map((r) => r.year)).toEqual([2024, 2025, 2026]);
    expect(two.ratesUnverified).toBe(false);
  });

  it('a payoff within the first accrual year carries no interest at all', () => {
    const r = project({ payments: [{ id: 'x', date: '2024-12-15', amount: 1000 }], asOfDate: '2026-03-01' });
    expect(r.totalInterest).toBe(0);
    expect(r.balance).toBe(0);
    expect(r.byPeriod.p1.paidInFullDate).toBe('2024-12-15');
    expect(r.unpostedInterest).toBe(0);
  });

  it('a partial payment reduces the balance the next posting is computed on', () => {
    const partial = project({ payments: [{ date: '2024-09-01', amount: 500 }], asOfDate: '2025-03-01' });
    // Interest: 1 Mar → 1 Sep on 1000 (six months), then 1 Sep → 1 Mar on 500 (four months of 2024, two of 2025).
    const first = 1000 * 0.0375 * (180 / 360);
    const second = 500 * (0.0375 * (120 / 360) + 0.04375 * (60 / 360));
    expect(partial.totalInterest).toBeCloseTo(first + second, 2);
    expect(partial.byPeriod.p1.paidInFullDate).toBeNull();
    expect(partial.balance).toBeCloseTo(500 + first + second, 2);
  });

  it('case 9: with two periods, payments fill the oldest first and only a fully paid period is marked paid', () => {
    const r = projectMilitaryDepositBalance({
      principalByPeriod: { early: { principal: 600 }, late: { principal: 900 } },
      periodOrder: ['early', 'late'],
      interestAccrualDate: '2030-01-01',
      payments: [{ date: '2026-06-01', amount: 800 }],
      asOfDate: '2027-01-01',
    });
    expect(r.byPeriod.early).toMatchObject({ balance: 0, paid: 600, paidInFullDate: '2026-06-01' });
    expect(r.byPeriod.late).toMatchObject({ balance: 700, paid: 200, paidInFullDate: null });
  });

  it('reports interest accrued since the last posting without owing it yet', () => {
    const r = project({ asOfDate: '2025-09-01' });
    expect(r.ledger).toHaveLength(1);
    expect(r.unpostedInterest).toBeGreaterThan(0);
    expect(r.nextPostingDate).toBe('2026-03-01');
  });

  it('cannot compute interest without an IAD but still applies payments', () => {
    const r = project({ interestAccrualDate: null, payments: [{ date: '2025-01-01', amount: 400 }] });
    expect(r.interestAccrualDate).toBeNull();
    expect(r.totalInterest).toBe(0);
    expect(r.balance).toBe(600);
  });
});

describe('golden: reproduces OPM\'s published composite-rate tables', () => {
  /** The composite for an IAD is the interest on $1 over the accrual year ending that day. */
  const composite = (iadIso) => {
    const [y, m, d] = iadIso.split('-').map(Number);
    const start = `${y - 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const r = projectMilitaryDepositBalance({ principalByPeriod: { p: { principal: 100000 } }, periodOrder: ['p'], interestAccrualDate: start, asOfDate: iadIso });
    return r.totalInterest / 100000;
  };

  it('BAL 24-301 attachment: interest accrual dates in 2024', () => {
    expect(composite('2024-01-01')).toBeCloseTo(0.01875, 5);
    expect(composite('2024-02-01')).toBeCloseTo(0.02031, 4);
    expect(composite('2024-02-02')).toBeCloseTo(0.02036, 4);
    expect(composite('2024-03-01')).toBeCloseTo(0.02188, 4);
    expect(composite('2024-07-01')).toBeCloseTo(0.02813, 4);
    expect(composite('2024-12-01')).toBeCloseTo(0.03594, 4);
  });

  it('2020 attachment: interest accrual dates in 2020', () => {
    expect(composite('2020-01-01')).toBeCloseTo(0.0275, 5);
    expect(composite('2020-12-01')).toBeCloseTo(0.02292, 4);
    expect(composite('2020-01-31')).toBeCloseTo(0.0271, 4);
  });

  it('2022 attachment: a flat year when both rates are equal', () => {
    expect(composite('2022-01-01')).toBeCloseTo(0.01375, 5);
    expect(composite('2022-06-15')).toBeCloseTo(0.01375, 5);
    expect(composite('2022-12-31')).toBeCloseTo(0.01375, 5);
  });

  it('BAL 25-301 Table 1: interest accrual dates in 2025', () => {
    expect(composite('2025-01-01')).toBeCloseTo(0.0375, 5);
    expect(composite('2025-07-01')).toBeCloseTo(0.04063, 4);
    expect(composite('2025-12-01')).toBeCloseTo(0.04323, 4);
  });
});

describe('estimateMilitaryDeposit: modes, credit, and issues', () => {
  const AS_OF = '2026-09-01';

  it('derives the IAD from the first FERS coverage date and credits nothing while unpaid', () => {
    const r = estimateMilitaryDeposit({ military: military({ firstFersCoverageDate: '2020-05-15' }), hireCohort: 'fers_frae', asOfDate: AS_OF });
    expect(r.mode).toBe(DEPOSIT_MODES.ESTIMATE);
    expect(r.interestAccrualDate).toBe('2022-05-15');
    expect(r.principal).toBeCloseTo(18000 * 0.03 + 19000 * 0.0325 + 20000 * 0.034 + 21000 * 0.03, 2);
    expect(r.interest).toBeGreaterThan(0);
    expect(r.balance).toBeCloseTo(r.principal + r.interest, 2);
    expect(r.creditedPeriodIds).toEqual([]);
    expect(codes(r)).toContain(ISSUE_CODES.MIL_DEPOSIT_PARTIAL);
    // Every rate in the window is verified, so no interest warning is raised.
    expect(codes(r)).not.toContain(ISSUE_CODES.MIL_DEPOSIT_INTEREST_UNVERIFIED);
  });

  it('warns when the interest-accrual date is unknown', () => {
    const r = estimateMilitaryDeposit({ military: military({}), hireCohort: 'fers_frae', asOfDate: AS_OF });
    expect(r.interestAccrualDate).toBeNull();
    expect(r.interest).toBe(0);
    const issue = r.issues.find((i) => i.code === ISSUE_CODES.MIL_DEPOSIT_INTEREST_UNVERIFIED);
    expect(issue.detail.reason).toBe('interest_accrual_date_unknown');
  });

  it('case 4: an official balance overrides the estimate and is projected from its through-date', () => {
    const r = estimateMilitaryDeposit({
      military: military({ mode: 'official_balance', officialBalance: 2500, officialBalanceThroughDate: '2026-01-01', firstFersCoverageDate: '2020-05-15' }),
      hireCohort: 'fers_frae',
      asOfDate: AS_OF,
    });
    expect(r.mode).toBe(DEPOSIT_MODES.OFFICIAL_BALANCE);
    expect(r.officialBalance).toEqual({ balance: 2500, throughDate: '2026-01-01' });
    expect(r.principal).toBeNull();
    // Interest since 1 Jan 2026 has accrued but not posted, so the balance is still the official figure.
    expect(r.balance).toBe(2500);
    expect(r.unpostedInterest).toBeGreaterThan(0);
    expect(codes(r)).toContain(ISSUE_CODES.MIL_DEPOSIT_OFFICIAL_BALANCE);
    expect(codes(r)).not.toContain(ISSUE_CODES.MIL_DEPOSIT_EARNINGS_MISSING);
  });

  it('a recorded paid-in-full status credits every creditable period and silences the estimate\'s gaps', () => {
    const r = estimateMilitaryDeposit({ military: military({ status: 'paid_in_full' }, [official({ earningsByYear: null })]), hireCohort: 'fers_frae', asOfDate: AS_OF });
    expect(r.creditedPeriodIds).toEqual(['p1']);
    expect(r.paidInFullRecorded).toBe(true);
    expect(codes(r)).not.toContain(ISSUE_CODES.MIL_DEPOSIT_EARNINGS_MISSING);
    expect(codes(r)).not.toContain(ISSUE_CODES.MIL_DEPOSIT_INTEREST_UNVERIFIED);
    expect(codes(r)).not.toContain(ISSUE_CODES.MIL_DEPOSIT_PARTIAL);
  });

  it('case 8: a partial payment earns no credit for the period', () => {
    const r = estimateMilitaryDeposit({
      military: military({ firstFersCoverageDate: '2020-05-15', payments: [{ id: 'a', date: '2021-01-01', amount: 1000 }] }),
      hireCohort: 'fers_frae',
      asOfDate: AS_OF,
    });
    expect(r.totalPaid).toBe(1000);
    expect(r.creditedPeriodIds).toEqual([]);
    expect(codes(r)).toContain(ISSUE_CODES.MIL_DEPOSIT_PARTIAL);
  });

  it('a payment that clears the balance credits the period from its date', () => {
    const r = estimateMilitaryDeposit({
      military: military({ firstFersCoverageDate: '2020-05-15', payments: [{ id: 'a', date: '2021-06-01', amount: 5000 }] }),
      hireCohort: 'fers_frae',
      asOfDate: AS_OF,
    });
    expect(r.balance).toBe(0);
    expect(r.interest).toBe(0);
    expect(r.creditedPeriodIds).toEqual(['p1']);
    expect(r.byPeriod.p1.paidInFullDate).toBe('2021-06-01');
    expect(r.ledger.find((l) => l.type === 'payment').unapplied).toBeGreaterThan(0);
  });

  it('a planned payment before separation is assumed made, labelled, and the credit rests on it', () => {
    const r = estimateMilitaryDeposit({
      military: military({ firstFersCoverageDate: '2020-05-15', plannedPaymentDate: '2028-03-01' }),
      hireCohort: 'fers_frae',
      asOfDate: AS_OF,
      separationDate: '2035-06-01',
    });
    expect(r.projectionDate).toBe('2028-03-01');
    expect(r.plannedPaymentAssumed).toBe(true);
    expect(r.creditedPeriodIds).toEqual(['p1']);
    expect(codes(r)).toContain(ISSUE_CODES.MIL_DEPOSIT_PLANNED);
    expect(codes(r)).not.toContain(ISSUE_CODES.MIL_DEPOSIT_PARTIAL);
  });

  it('case 10: a planned payment after separation blocks and credits nothing', () => {
    const r = estimateMilitaryDeposit({
      military: military({ firstFersCoverageDate: '2020-05-15', plannedPaymentDate: '2036-01-01' }),
      hireCohort: 'fers_frae',
      asOfDate: AS_OF,
      separationDate: '2035-06-01',
    });
    expect(r.plannedAfterSeparation).toBe(true);
    expect(r.creditedPeriodIds).toEqual([]);
    const issue = r.issues.find((i) => i.code === ISSUE_CODES.MIL_DEPOSIT_AFTER_SEPARATION);
    expect(issue.severity).toBe(ISSUE_SEVERITY.BLOCK);
    expect(issue.detail).toEqual({ plannedPaymentDate: '2036-01-01', separationDate: '2035-06-01' });
  });

  it('a planned payment with incomplete earnings is not assumed made', () => {
    const r = estimateMilitaryDeposit({
      military: military({ firstFersCoverageDate: '2020-05-15', plannedPaymentDate: '2028-03-01' }, [official({ earningsByYear: { 1998: 18000 } })]),
      hireCohort: 'fers_frae',
      asOfDate: AS_OF,
      separationDate: '2035-06-01',
    });
    expect(r.plannedPaymentAssumed).toBe(false);
    expect(r.creditedPeriodIds).toEqual([]);
    expect(codes(r)).toContain(ISSUE_CODES.MIL_DEPOSIT_EARNINGS_MISSING);
  });

  it('credits the pre-1957 days of a straddling period while its post-1956 tail is unpaid', () => {
    const r = estimateMilitaryDeposit({
      military: military({}, [official({ startDate: '1956-01-01', endDate: '1957-12-31', earningsByYear: { 1956: 2000, 1957: 2100 } })]),
      hireCohort: 'fers',
      asOfDate: AS_OF,
    });
    expect(r.creditedPeriodIds).toEqual([]);
    expect(r.partlyCreditedPeriodIds).toEqual(['p1']);
    expect(r.creditedSegments.map((s) => s.year)).toEqual([1956]);
    expect(r.principal).toBeCloseTo(2100 * 0.03, 2);
  });

  it('case 17: a USERRA period is not double-counted; its segments carry the interruption flag once', () => {
    const r = estimateMilitaryDeposit({
      military: military({ status: 'paid_in_full' }, [official({ startDate: '2020-01-01', endDate: '2020-12-31', interruptedFederalService: true, earningsByYear: { 2020: 80000 } })]),
      hireCohort: 'fers_frae',
      asOfDate: AS_OF,
    });
    expect(r.normalized.segments).toHaveLength(1);
    expect(r.normalized.segments[0].interruptedFederalService).toBe(true);
    expect(r.normalized.totals.creditableYears).toBeCloseTo(1, 6);
  });
});

describe('the pension calculator\'s two scenarios', () => {
  const fersInputs = { yearsOfService: 17, monthsOfService: 0, high3Salary: 100000, currentAge: 62, retirementAge: 62, includeFutureService: true };

  it('runs the engine twice and reports what changes, with no recommendation', () => {
    const r = compareDepositInCalculator({ militaryYears: 4, militaryBasicPay: 80000, calculateFers: calculateFersResults, fersInputs });
    expect(r.principal).toBe(2400);
    expect(r.without.multiplier).toBe(0.01);
    expect(r.withCredit.multiplier).toBe(0.011);
    expect(r.multiplierChanged).toBe(true);
    expect(r.annualIncrease).toBeCloseTo(100000 * 21 * 0.011 - 100000 * 17 * 0.01, 6);
    expect(r.simpleBreakEvenYears).toBeCloseTo(2400 / r.annualIncrease, 10);
    expect(Object.keys(r)).not.toContain('isWorthPaying');
    expect(JSON.stringify(r).toLowerCase()).not.toMatch(/worth|should/);
  });

  it('returns null with no military service, and a principal note without basic pay', () => {
    expect(compareDepositInCalculator({ militaryYears: 0, militaryBasicPay: 80000, calculateFers: calculateFersResults, fersInputs })).toBeNull();
    const r = compareDepositInCalculator({ militaryYears: 4, militaryBasicPay: 0, calculateFers: calculateFersResults, fersInputs });
    expect(r.principal).toBe(0);
    expect(r.principalNote).toMatch(/Enter the total basic pay/);
    expect(r.simpleBreakEvenYears).toBeNull();
  });
});
