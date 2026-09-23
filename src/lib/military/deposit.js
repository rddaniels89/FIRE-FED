/**
 * The FERS military service deposit: what is owed, how it grows, and which
 * periods of service it has paid for.
 *
 * Principal. For each calendar-year slice of creditable post-1956 service, the
 * deposit is the basic pay earned in that slice times the deposit rate for
 * that year (depositRates.js). A period that interrupted federal civilian
 * employment and was followed by USERRA reemployment owes the lesser of that
 * figure and the FERS deductions that would have been withheld from the
 * civilian pay for the same months. Pre-1957 service owes nothing.
 *
 * Interest. None accrues until the interest-accrual date (IAD), two years
 * after the first FERS-covered appointment, or after reemployment in a USERRA
 * case. On each anniversary of the IAD the agency assesses a year's interest
 * on whatever balance is then unpaid, compounded (BAL 24-301: "assess
 * interest on the unpaid balance ... on an employee's interest accrual date,
 * and interest is compounded annually"). The rate for that year is OPM's
 * composite: the prior calendar year's rate for the months before 1 January
 * and the new year's rate after, on a 30-day-month count, which is exactly
 * the table OPM attaches to each BAL. A remittance received before the
 * anniversary reduces the balance the interest is assessed on, so a deposit
 * paid in full before its first anniversary carries no interest at all.
 *
 * Payments. Applied on their dates to the oldest unpaid period first. A period
 * earns FERS credit only when its own principal and posted interest are fully
 * paid; a partial payment earns nothing for that period. The agency's
 * paid-in-full record controls over anything computed here.
 *
 * Precedence. An official balance the user enters (with the date it is good
 * through) replaces the computed balance from that date forward. A recorded
 * agency status of paid in full credits every creditable period whatever the
 * arithmetic says.
 *
 * Sources: 5 U.S.C. 8422(e); CSRS/FERS Handbook chapters 22 and 23; OPM BALs
 * 17-306 through 26-301 and their composite-rate attachments. What remains
 * to be checked against an agency computation is in docs/MILITARY-VERIFICATION.md.
 */

import { getFersContributionRate } from '../calculations/fers';
import {
  DEPOSIT_INTEREST_FREE_YEARS,
  fersDepositInterestRate,
  fersMilitaryDepositRate,
} from './depositRates';
import { ISSUE_CODES, raiseIssue } from './status';
import { normalizeMilitaryServicePeriods, parseIsoDate, toIsoDate } from './servicePeriods';

export const DEPOSIT_MODES = Object.freeze({ ESTIMATE: 'estimate', OFFICIAL_BALANCE: 'official_balance' });
export const DEPOSIT_METHODS = Object.freeze({ STANDARD: 'standard', USERRA_LOWER_OF: 'userra_lower_of' });

const PAID_IN_FULL = 'paid_in_full';
const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ------------------------------------------------------------- principal

/**
 * Principal by period from the year segments normalizeMilitaryServicePeriods
 * produces. Segments that need a deposit but have no basic pay recorded make
 * the period's principal incomplete and raise MIL_DEPOSIT_EARNINGS_MISSING.
 */
export function computeMilitaryDepositPrincipal({ segments = [], periods = [], hireCohort } = {}) {
  const byPeriod = {};
  const issues = [];
  const civilianRate = getFersContributionRate(hireCohort);
  const periodById = Object.fromEntries(periods.map((p) => [p.id, p]));

  for (const seg of segments) {
    const entry = (byPeriod[seg.periodId] ??= { periodId: seg.periodId, principal: 0, complete: true, segments: [], method: DEPOSIT_METHODS.STANDARD });
    if (!seg.depositRequired) {
      entry.segments.push({ year: seg.year, days: seg.days, basicPay: seg.basicPay, rate: 0, amount: 0, method: 'pre_1957' });
      continue;
    }
    if (seg.basicPay === null || seg.basicPay === undefined) {
      entry.complete = false;
      entry.segments.push({ year: seg.year, days: seg.days, basicPay: null, rate: fersMilitaryDepositRate(seg.year), amount: null, method: DEPOSIT_METHODS.STANDARD });
      continue;
    }
    const rate = fersMilitaryDepositRate(seg.year);
    let amount = seg.basicPay * rate;
    let method = DEPOSIT_METHODS.STANDARD;
    const period = periodById[seg.periodId];
    const civilianPay = num(period?.civilianBasicPayByYear?.[seg.year]);
    if (seg.interruptedFederalService && civilianPay !== null) {
      const civilianDeductions = civilianPay * civilianRate;
      if (civilianDeductions < amount) {
        amount = civilianDeductions;
        method = DEPOSIT_METHODS.USERRA_LOWER_OF;
        entry.method = DEPOSIT_METHODS.USERRA_LOWER_OF;
      }
    }
    entry.principal += amount;
    entry.segments.push({ year: seg.year, days: seg.days, basicPay: seg.basicPay, rate, amount, method, civilianBasicPay: civilianPay, civilianRate });
  }

  for (const entry of Object.values(byPeriod)) {
    entry.principal = round2(entry.principal);
    if (!entry.complete) {
      issues.push(raiseIssue(ISSUE_CODES.MIL_DEPOSIT_EARNINGS_MISSING, { entity: { type: 'servicePeriod', id: entry.periodId }, detail: { yearsMissing: entry.segments.filter((s) => s.amount === null).map((s) => s.year) } }));
    }
  }

  const complete = Object.values(byPeriod).every((e) => e.complete);
  const total = round2(Object.values(byPeriod).reduce((s, e) => s + e.principal, 0));
  return { byPeriod, total, complete, issues };
}

// -------------------------------------------------------------- interest

function addYears(date, years) {
  const d = new Date(date.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

/**
 * Days from `a` to `b` on OPM's 30-day-month, 360-day-year count, which is the
 * convention the composite-rate tables attached to each BAL are built on: a
 * full month counts 30 whatever the calendar says, the day of the month moves
 * the composite by 1/360 of the rate difference, and the 31st of any month is
 * the 30th (the tables' 31 January 2020 and 31 December 2022 values only
 * reconcile that way, so this is the "30E/360" form rather than the US one).
 */
export function days360(a, b) {
  const d1 = Math.min(30, a.getUTCDate());
  const d2 = Math.min(30, b.getUTCDate());
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 360 + (b.getUTCMonth() - a.getUTCMonth()) * 30 + (d2 - d1);
}

/**
 * Interest on `balance` over the half-open interval [from, to), at each
 * calendar year's variable rate for its own 30/360 days. Over a whole accrual
 * year this reproduces OPM's published composite rate for that IAD. Returns
 * the interest and the rate rows used, so a missing rate can be reported.
 */
function accrueInterest(balance, from, to) {
  let interest = 0;
  const used = [];
  let missing = false;
  let cursor = from;
  while (cursor.getTime() < to.getTime()) {
    const year = cursor.getUTCFullYear();
    const nextYear = new Date(Date.UTC(year + 1, 0, 1));
    const end = nextYear.getTime() < to.getTime() ? nextYear : to;
    const days = Math.max(0, days360(cursor, end));
    const row = fersDepositInterestRate(year);
    if (!row) missing = true;
    else {
      interest += balance * row.rate * (days / 360);
      used.push(row);
    }
    cursor = end;
  }
  return { interest, used, missing };
}

/**
 * Projects a deposit forward from the interest-accrual date, applying interest
 * postings and payments in date order, to `asOfDate`.
 *
 *   principalByPeriod   { [periodId]: { principal } }
 *   periodOrder         period ids oldest first; payments fill in this order
 *   interestAccrualDate ISO date; null means interest cannot be computed
 *   payments            [{ id, date, amount }]
 *   asOfDate            ISO date the balance is wanted for
 *
 * Interest accrues on the outstanding balance between events and is posted on
 * each anniversary of the IAD, spread across the periods still owing in
 * proportion to their balances. A payment that clears the whole balance
 * before a posting forgives the interest accrued since the last one, which is
 * how a deposit paid in full within the first accrual year carries none.
 */
export function projectMilitaryDepositBalance({
  principalByPeriod = {},
  periodOrder = [],
  interestAccrualDate,
  payments = [],
  asOfDate,
} = {}) {
  const asOf = parseIsoDate(asOfDate) ?? new Date();
  const iad = parseIsoDate(interestAccrualDate);
  const accounts = periodOrder
    .filter((id) => principalByPeriod[id])
    .map((id) => ({ periodId: id, principal: round2(principalByPeriod[id].principal), interest: 0, paid: 0, balance: round2(principalByPeriod[id].principal), paidInFullDate: null }));
  const ledger = [];
  const ratesUsed = new Map();
  let ratesMissing = false;
  let pending = 0; // interest accrued since the last posting, not yet owed

  const totalBalance = () => accounts.reduce((s, a) => s + a.balance, 0);

  const accrue = (from, to) => {
    if (!from || to.getTime() <= from.getTime()) return;
    const r = accrueInterest(totalBalance(), from, to);
    pending += r.interest;
    r.used.forEach((row) => ratesUsed.set(row.year, row));
    if (r.missing) ratesMissing = true;
  };

  const applyPayment = (date, amount, paymentId) => {
    let remaining = amount;
    for (const a of accounts) {
      if (remaining <= 0) break;
      if (a.balance <= 0) continue;
      const take = Math.min(a.balance, remaining);
      a.balance = round2(a.balance - take);
      a.paid = round2(a.paid + take);
      remaining -= take;
      if (a.balance <= 0.005) {
        a.balance = 0;
        a.paidInFullDate = toIsoDate(date);
      }
    }
    if (totalBalance() <= 0) pending = 0;
    ledger.push({ date: toIsoDate(date), type: 'payment', id: paymentId, amount, balanceAfter: round2(totalBalance()), unapplied: round2(Math.max(0, remaining)) });
  };

  const post = (date) => {
    const total = totalBalance();
    const amount = total > 0 ? round2(pending) : 0;
    if (amount > 0) {
      for (const a of accounts) {
        const share = round2(amount * (a.balance / total));
        a.interest = round2(a.interest + share);
        a.balance = round2(a.balance + share);
      }
    }
    pending = 0;
    ledger.push({ date: toIsoDate(date), type: 'interest', amount, balanceAfter: round2(totalBalance()) });
  };

  const validPayments = (payments ?? [])
    .map((p) => ({ id: p.id ?? null, date: parseIsoDate(p.date), amount: Math.max(0, Number(p.amount) || 0) }))
    .filter((p) => p.date && p.amount > 0 && p.date.getTime() <= asOf.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Events in date order: payments, and anniversaries of the IAD after it.
  const events = validPayments.map((p) => ({ date: p.date, kind: 'payment', payment: p }));
  if (iad) {
    for (let k = 1; ; k += 1) {
      const anniversary = addYears(iad, k);
      if (anniversary.getTime() > asOf.getTime()) break;
      events.push({ date: anniversary, kind: 'posting' });
    }
  }
  // A payment on a posting date is applied after the posting.
  events.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.kind === 'posting' ? -1 : 1));

  let cursor = iad;
  for (const e of events) {
    if (iad && e.date.getTime() > iad.getTime()) {
      accrue(cursor, e.date);
      cursor = e.date;
    }
    if (e.kind === 'payment') applyPayment(e.payment.date, e.payment.amount, e.payment.id);
    else post(e.date);
  }
  if (iad && asOf.getTime() > iad.getTime()) accrue(cursor, asOf);

  let ratesUnverified = false;
  for (const r of ratesUsed.values()) if (!r.verified) ratesUnverified = true;

  return {
    interestAccrualDate: iad ? toIsoDate(iad) : null,
    asOfDate: toIsoDate(asOf),
    byPeriod: Object.fromEntries(accounts.map((a) => [a.periodId, { ...a }])),
    totalPrincipal: round2(accounts.reduce((s, a) => s + a.principal, 0)),
    totalInterest: round2(accounts.reduce((s, a) => s + a.interest, 0)),
    totalPaid: round2(accounts.reduce((s, a) => s + a.paid, 0)),
    balance: round2(totalBalance()),
    /** Interest accrued since the last posting; owed at the next one unless the balance is cleared first. */
    unpostedInterest: totalBalance() > 0 ? round2(pending) : 0,
    nextPostingDate: iad ? toIsoDate(nextAnniversaryAfter(iad, asOf)) : null,
    ledger,
    ratesUsed: [...ratesUsed.values()].sort((a, b) => a.year - b.year),
    ratesMissing,
    ratesUnverified,
  };
}

function nextAnniversaryAfter(iad, date) {
  for (let k = 0; k < 200; k += 1) {
    const a = addYears(iad, k);
    if (a.getTime() > date.getTime()) return a;
  }
  return addYears(iad, 200);
}

// ------------------------------------------------------------ estimate

/**
 * The deposit for one household member's recorded service, in whichever mode
 * the user is working, projected to the date that matters: the planned payment
 * date if there is one, otherwise the as-of date.
 *
 * Returns
 *   mode, status            estimate or official balance; what the figures rest on
 *   principal, interest     computed figures (estimate mode)
 *   balance                 owed on the projection date
 *   projectionDate          the date `balance` is good for
 *   interestAccrualDate     two years after first FERS coverage, or the override
 *   creditedPeriodIds       periods whose deposit is (or will be, on the planned
 *                           date) paid in full, plus pre-1957 periods
 *   plannedPaymentAssumed   true when credit rests on the planned payment
 *   byPeriod, ledger        detail for the screens
 *   issues                  every issue raised
 */
export function estimateMilitaryDeposit({
  military,
  periods,
  hireCohort,
  asOfDate,
  separationDate = null,
} = {}) {
  const deposit = military?.deposit ?? {};
  const asOf = parseIsoDate(asOfDate) ?? new Date();
  const own = periods ?? military?.servicePeriods ?? [];
  const normalized = normalizeMilitaryServicePeriods(own);
  const issues = [];

  const paidInFullRecorded = deposit.status === PAID_IN_FULL;
  const principal = computeMilitaryDepositPrincipal({ segments: normalized.segments, periods: normalized.periods, hireCohort });
  // When the agency's record says paid in full, the estimate's own gaps are
  // not the user's problem: the official record controls the credit.
  if (!paidInFullRecorded) issues.push(...principal.issues);

  // Periods in service order, oldest first; only those that carry credit have segments.
  const periodOrder = [...new Set(normalized.segments.map((s) => s.periodId))].sort((a, b) => {
    const pa = normalized.periods.find((p) => p.id === a);
    const pb = normalized.periods.find((p) => p.id === b);
    return (parseIsoDate(pa?.startDate)?.getTime() ?? 0) - (parseIsoDate(pb?.startDate)?.getTime() ?? 0);
  });
  const needsDeposit = new Set(normalized.segments.filter((s) => s.depositRequired).map((s) => s.periodId));

  const overrideIad = parseIsoDate(deposit.interestAccrualDate);
  const coverage = parseIsoDate(deposit.firstFersCoverageDate);
  const iad = overrideIad ?? (coverage ? addYears(coverage, DEPOSIT_INTEREST_FREE_YEARS) : null);

  const planned = parseIsoDate(deposit.plannedPaymentDate);
  const separation = parseIsoDate(separationDate);
  const projectionDate = planned && planned.getTime() > asOf.getTime() ? planned : asOf;

  const mode = deposit.mode === DEPOSIT_MODES.OFFICIAL_BALANCE ? DEPOSIT_MODES.OFFICIAL_BALANCE : DEPOSIT_MODES.ESTIMATE;

  let projection;
  let officialBalanceUsed = null;
  if (mode === DEPOSIT_MODES.OFFICIAL_BALANCE && num(deposit.officialBalance) !== null) {
    // The official balance stands in for the computed balance from its
    // through-date. It is one figure for all periods, so it is carried as a
    // single account and credit follows the paid-in-full record or a full
    // planned payment.
    const through = parseIsoDate(deposit.officialBalanceThroughDate) ?? asOf;
    officialBalanceUsed = { balance: round2(num(deposit.officialBalance)), throughDate: toIsoDate(through) };
    const laterPayments = (deposit.payments ?? []).filter((p) => (parseIsoDate(p.date)?.getTime() ?? 0) > through.getTime());
    projection = projectMilitaryDepositBalance({
      principalByPeriod: { official: { principal: officialBalanceUsed.balance, complete: true } },
      periodOrder: ['official'],
      interestAccrualDate: iad && iad.getTime() > through.getTime() ? toIsoDate(iad) : toIsoDate(through),
      payments: laterPayments,
      asOfDate: toIsoDate(projectionDate),
    });
    issues.push(raiseIssue(ISSUE_CODES.MIL_DEPOSIT_OFFICIAL_BALANCE, { detail: officialBalanceUsed }));
  } else {
    projection = projectMilitaryDepositBalance({
      principalByPeriod: principal.byPeriod,
      periodOrder,
      interestAccrualDate: iad ? toIsoDate(iad) : null,
      payments: deposit.payments ?? [],
      asOfDate: toIsoDate(projectionDate),
    });
    if (!iad && needsDeposit.size > 0 && !paidInFullRecorded) {
      issues.push(raiseIssue(ISSUE_CODES.MIL_DEPOSIT_INTEREST_UNVERIFIED, { detail: { reason: 'interest_accrual_date_unknown' } }));
    }
  }
  if ((projection.ratesMissing || projection.ratesUnverified) && !paidInFullRecorded) {
    issues.push(
      raiseIssue(ISSUE_CODES.MIL_DEPOSIT_INTEREST_UNVERIFIED, {
        detail: { reason: projection.ratesMissing ? 'rate_missing' : 'rate_unverified', years: projection.ratesUsed.filter((r) => !r.verified).map((r) => r.year) },
      })
    );
  }

  // Which periods have their deposit paid. Credit is then decided per year
  // segment: a pre-1957 segment is credited whatever the deposit says, a
  // post-1956 segment only when its period is paid.
  const paidPeriodIds = new Set();
  let plannedPaymentAssumed = false;
  let plannedAfterSeparation = false;
  if (paidInFullRecorded) {
    periodOrder.forEach((id) => paidPeriodIds.add(id));
  } else if (mode === DEPOSIT_MODES.ESTIMATE) {
    for (const [id, acct] of Object.entries(projection.byPeriod)) {
      if (acct.paidInFullDate && (!separation || parseIsoDate(acct.paidInFullDate).getTime() <= separation.getTime())) paidPeriodIds.add(id);
    }
  } else if (projection.balance <= 0) {
    periodOrder.forEach((id) => paidPeriodIds.add(id));
  }
  if (planned && !paidInFullRecorded && projection.balance > 0) {
    if (separation && planned.getTime() > separation.getTime()) {
      plannedAfterSeparation = true;
      issues.push(raiseIssue(ISSUE_CODES.MIL_DEPOSIT_AFTER_SEPARATION, { detail: { plannedPaymentDate: toIsoDate(planned), separationDate: toIsoDate(separation) } }));
    } else if (mode === DEPOSIT_MODES.ESTIMATE ? principal.complete : true) {
      plannedPaymentAssumed = true;
      periodOrder.forEach((id) => paidPeriodIds.add(id));
      issues.push(raiseIssue(ISSUE_CODES.MIL_DEPOSIT_PLANNED, { detail: { plannedPaymentDate: toIsoDate(planned), balance: projection.balance } }));
    }
  }

  const isSegmentCredited = (seg) => !seg.depositRequired || paidPeriodIds.has(seg.periodId);
  const creditedSegments = normalized.segments.filter(isSegmentCredited);
  const credited = new Set(periodOrder.filter((id) => normalized.segments.filter((s) => s.periodId === id).every(isSegmentCredited)));
  const partlyCredited = new Set(creditedSegments.map((s) => s.periodId).filter((id) => !credited.has(id)));
  for (const id of periodOrder) {
    if (!paidPeriodIds.has(id) && needsDeposit.has(id)) {
      issues.push(raiseIssue(ISSUE_CODES.MIL_DEPOSIT_PARTIAL, { entity: { type: 'servicePeriod', id }, detail: { balance: projection.byPeriod[id]?.balance ?? null } }));
    }
  }

  return {
    mode,
    principalComplete: principal.complete,
    principal: mode === DEPOSIT_MODES.ESTIMATE ? principal.total : null,
    principalByPeriod: principal.byPeriod,
    interest: mode === DEPOSIT_MODES.ESTIMATE ? projection.totalInterest : null,
    officialBalance: officialBalanceUsed,
    balance: projection.balance,
    unpostedInterest: projection.unpostedInterest,
    projectionDate: projection.asOfDate,
    interestAccrualDate: projection.interestAccrualDate,
    nextPostingDate: projection.nextPostingDate,
    totalPaid: projection.totalPaid,
    byPeriod: projection.byPeriod,
    ledger: projection.ledger,
    ratesUsed: projection.ratesUsed,
    creditedPeriodIds: [...credited],
    /** Periods whose pre-1957 days are credited while the post-1956 deposit is unpaid. */
    partlyCreditedPeriodIds: [...partlyCredited],
    creditedSegments,
    paidPeriodIds: [...paidPeriodIds],
    plannedPaymentAssumed,
    plannedAfterSeparation,
    paidInFullRecorded,
    needsDepositPeriodIds: [...needsDeposit],
    issues,
    normalized,
  };
}

/** The date `years` after an ISO date, as ISO; for callers building schedules. */
export function isoYearsAfter(isoDate, years) {
  const d = parseIsoDate(isoDate);
  return d ? toIsoDate(addYears(d, years)) : null;
}

// ------------------------------------------------ pension calculator view

/**
 * The deposit question as the stand-alone pension calculator can answer it:
 * it has years and total basic pay but no dates, no coverage date, and no
 * household timeline. So it runs the FERS engine twice, with and without the
 * credit, and reports the principal and what changes. Interest is not
 * estimated without dates; the note says so, and the agency's figure controls.
 *
 * Nothing here says whether to pay. It says what each scenario produces.
 */
export function compareDepositInCalculator({ militaryYears, militaryBasicPay, calculateFers, fersInputs } = {}) {
  const years = Math.max(0, Number(militaryYears) || 0);
  const basicPay = Math.max(0, Number(militaryBasicPay) || 0);
  if (years <= 0 || typeof calculateFers !== 'function') return null;

  const principal = round2(basicPay * fersMilitaryDepositRate('default'));
  const without = calculateFers({ ...fersInputs, militaryCreditYears: 0 });
  const withCredit = calculateFers({ ...fersInputs, militaryCreditYears: years });

  const annualIncrease = (withCredit.stayFed?.annualPension ?? 0) - (without.stayFed?.annualPension ?? 0);
  const eligibilityChanged = Boolean(withCredit.stayFed?.isEligible) !== Boolean(without.stayFed?.isEligible);
  const multiplierChanged = (withCredit.stayFed?.multiplier ?? 0) !== (without.stayFed?.multiplier ?? 0);

  return {
    militaryYears: years,
    principal,
    principalNote:
      basicPay > 0
        ? "Principal at 3% of the basic pay entered. Service in 1999 or 2000 carries 3.25% and 3.40%; interest depends on the date you first became covered by FERS and is not estimated here. Your agency's figure controls."
        : 'Enter the total basic pay earned during the service to estimate the principal.',
    without: { isEligible: Boolean(without.stayFed?.isEligible), annualPension: without.stayFed?.annualPension ?? 0, multiplier: without.stayFed?.multiplier ?? 0, message: without.stayFed?.eligibilityMessage ?? '' },
    withCredit: { isEligible: Boolean(withCredit.stayFed?.isEligible), annualPension: withCredit.stayFed?.annualPension ?? 0, multiplier: withCredit.stayFed?.multiplier ?? 0, message: withCredit.stayFed?.eligibilityMessage ?? '' },
    annualIncrease,
    monthlyIncrease: annualIncrease / 12,
    eligibilityChanged,
    multiplierChanged,
    /** Years of the increased annuity that equal the principal; null when there is no increase. */
    simpleBreakEvenYears: annualIncrease > 0 && principal > 0 ? principal / annualIncrease : null,
  };
}
