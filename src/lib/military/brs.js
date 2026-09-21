/**
 * Blended Retirement System extras: the four components that must never be
 * shown as one number (spec §20.8).
 *
 *   1. Defined benefit      High-36 × 2.0% × service: the retired-pay engine.
 *   2. Defined contribution the uniformed-services TSP with automatic and
 *                           matching contributions, vesting, and buckets:
 *                           tspCoordination.js.
 *   3. Continuation pay     a scenario from the member's OFFICIAL offer only.
 *                           There is no generic multiple; it varies by service,
 *                           component, and year.
 *   4. Lump sum             25% or 50% of retired pay through Social Security
 *                           full retirement age, discounted at the annual DoD
 *                           rate. Blocked when that rate is missing or stale.
 *
 * FireFed compares cash flows. It does not say whether to take continuation
 * pay or a lump sum.
 */

import { ISSUE_CODES, INPUT_PROVENANCE, raiseIssue } from './status';
import { parseIsoDate, toIsoDate } from './servicePeriods';

const num = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};
const nonNeg = (v) => Math.max(0, num(v));

/**
 * The annual DoD lump-sum discount rate (10 U.S.C. 1415(b)(2)(B)). Published
 * each year by memorandum; loaded by hand. A year with no entry blocks the
 * lump-sum scenario. Rates here are pending verification against the
 * source memoranda (docs/MILITARY-VERIFICATION.md).
 */
export const BRS_LUMP_SUM_DISCOUNT_RATES = Object.freeze({
  // year: { rate, source, verified }
});

export function lumpSumDiscountRateFor(year) {
  const row = BRS_LUMP_SUM_DISCOUNT_RATES[year];
  return row ? { year, ...row } : null;
}

export const LUMP_SUM_ELECTIONS = Object.freeze([0, 25, 50]);

/** Continuation-pay obligation: four years of additional service (10 U.S.C. 356). */
export const CONTINUATION_PAY_OBLIGATION_YEARS = 4;

/**
 * Continuation pay from an official offer.
 *
 *   offer  { multiple, monthlyBasicPay, paymentDate, installments, obligationYears, provenance }
 *
 * Returns the gross and the schedule, or a block when the offer is not an
 * official one.
 */
export function continuationPayScenario({ offer = null, marginalTaxRate = null } = {}) {
  const issues = [];
  const o = offer ?? {};
  const official = o.provenance === INPUT_PROVENANCE.USER_ENTERED_OFFICIAL;
  const multiple = nonNeg(o.multiple);
  const monthly = nonNeg(o.monthlyBasicPay);
  const payment = parseIsoDate(o.paymentDate);
  if (!official || multiple <= 0 || monthly <= 0 || !payment) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_BRS_CP_OFFER_REQUIRED, { detail: { official, multiple, monthlyBasicPay: monthly, paymentDate: o.paymentDate ?? null } }));
    return { included: false, gross: 0, installments: [], obligationEndDate: null, issues };
  }
  const gross = multiple * monthly;
  const n = Math.max(1, Math.min(4, Math.floor(num(o.installments, 1))));
  const installments = [];
  for (let k = 0; k < n; k += 1) {
    const d = new Date(Date.UTC(payment.getUTCFullYear() + k, payment.getUTCMonth(), payment.getUTCDate()));
    installments.push({ date: toIsoDate(d), amount: gross / n, taxable: true });
  }
  const obligationYears = num(o.obligationYears, CONTINUATION_PAY_OBLIGATION_YEARS);
  const obligationEnd = new Date(Date.UTC(payment.getUTCFullYear() + obligationYears, payment.getUTCMonth(), payment.getUTCDate()));
  const rate = marginalTaxRate === null || marginalTaxRate === undefined ? null : num(marginalTaxRate);
  issues.push(raiseIssue(ISSUE_CODES.MRT_BRS_CP_FORFEITURE, { detail: { obligationEndDate: toIsoDate(obligationEnd), obligationYears } }));
  return {
    included: true,
    gross,
    multiple,
    monthlyBasicPay: monthly,
    installments,
    obligationYears,
    obligationEndDate: toIsoDate(obligationEnd),
    estimatedFederalTax: rate === null ? null : gross * rate,
    afterTaxEstimate: rate === null ? null : gross * (1 - rate),
    issues,
  };
}

/** Months from a start month to the month before Social Security full retirement age. */
function monthsBetween(startIso, endIso) {
  const a = parseIsoDate(startIso);
  const b = parseIsoDate(endIso);
  if (!a || !b) return 0;
  return Math.max(0, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()));
}

/**
 * The 25% or 50% lump-sum scenario (10 U.S.C. 1415).
 *
 *   electionPercent        0 | 25 | 50
 *   grossMonthly           full retired pay at start, first-payment dollars
 *   retiredPayStartDate    ISO
 *   fullRetirementDate     ISO month the SSA full retirement age is reached
 *   officialDiscountRate   { rate, year, source } | null (falls back to the table for asOfYear)
 *   asOfYear               the calendar year the election is made
 *   colaAssumption         decimal, applied each December on the continuing pension
 *   planningDiscountRate   decimal, the user's rate for the present-value comparison
 *   vaOffsetKnown          whether the VA waiver / offset facts are recorded
 *   horizonMonths          how far the comparison runs past FRA (default 20 years)
 *
 * The covered period runs from the retired-pay start to the month before
 * full retirement age. During it the monthly pension is reduced by the
 * elected share; afterwards the full pension is restored. The lump sum is the
 * discounted value of the elected share of each covered month's pension at
 * the official rate. The COLA treatment inside that discounting is pending
 * verification against the DoD technical reference; every result says so.
 */
export function lumpSumScenario({
  electionPercent = 0,
  grossMonthly = 0,
  retiredPayStartDate = null,
  fullRetirementDate = null,
  officialDiscountRate = null,
  asOfYear = new Date().getFullYear(),
  colaAssumption = 0.025,
  planningDiscountRate = 0.03,
  vaOffsetKnown = false,
  horizonMonths = 240,
} = {}) {
  const issues = [];
  const pct = LUMP_SUM_ELECTIONS.includes(num(electionPercent)) ? num(electionPercent) : 0;
  if (pct === 0) return { elected: false, electionPercent: 0, issues };

  const rateRow = officialDiscountRate && Number.isFinite(Number(officialDiscountRate.rate)) ? { ...officialDiscountRate, year: num(officialDiscountRate.year, null) } : lumpSumDiscountRateFor(asOfYear);
  const stale = !rateRow || rateRow.year === null || rateRow.year < asOfYear;
  if (stale) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_BRS_LSDR_MISSING, { detail: { asOfYear, rateYear: rateRow?.year ?? null } }));
    return { elected: true, electionPercent: pct, blocked: true, issues };
  }
  const monthly = nonNeg(grossMonthly);
  const covered = monthsBetween(retiredPayStartDate, fullRetirementDate);
  if (monthly <= 0 || covered <= 0) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_BRS_LSDR_MISSING, { detail: { reason: covered <= 0 ? 'no_covered_period' : 'no_retired_pay' } }));
    return { elected: true, electionPercent: pct, blocked: true, issues };
  }
  if (!vaOffsetKnown) issues.push(raiseIssue(ISSUE_CODES.MRT_BRS_LUMP_SUM_VA_IMPACT));
  issues.push(raiseIssue(ISSUE_CODES.MRT_BRS_LUMP_SUM_ALGORITHM_UNVERIFIED, { detail: { rateYear: rateRow.year } }));

  const share = pct / 100;
  const monthlyRate = Math.pow(1 + num(rateRow.rate), 1 / 12) - 1;
  const planningMonthly = Math.pow(1 + num(planningDiscountRate), 1 / 12) - 1;
  const start = parseIsoDate(retiredPayStartDate);
  let full = monthly;
  let lumpSum = 0;
  const schedule = [];
  let cumulativeWith = 0;
  let cumulativeWithout = 0;
  let pvWith = 0;
  let pvWithout = 0;
  let breakEvenMonth = null;
  const total = covered + Math.max(0, num(horizonMonths));
  for (let m = 0; m < total; m += 1) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1));
    // COLA each December after the first full year.
    if (m > 0 && d.getUTCMonth() === 11) full *= 1 + num(colaAssumption);
    const inCovered = m < covered;
    const reduced = inCovered ? full * (1 - share) : full;
    if (inCovered) lumpSum += (full * share) / Math.pow(1 + monthlyRate, m);
    cumulativeWith += reduced;
    cumulativeWithout += full;
    pvWith += reduced / Math.pow(1 + planningMonthly, m);
    pvWithout += full / Math.pow(1 + planningMonthly, m);
    if (breakEvenMonth === null && m >= covered && cumulativeWithout > cumulativeWith + lumpSum) breakEvenMonth = m;
    if (m < covered || m % 12 === 0) schedule.push({ month: toIsoDate(d), fullMonthly: full, reducedMonthly: reduced, covered: inCovered });
  }
  return {
    elected: true,
    electionPercent: pct,
    blocked: false,
    discountRate: { rate: rateRow.rate, year: rateRow.year, source: rateRow.source ?? null, verified: Boolean(rateRow.verified) },
    coveredMonths: covered,
    restorationDate: fullRetirementDate,
    lumpSum: Math.round(lumpSum * 100) / 100,
    reducedMonthlyAtStart: monthly * (1 - share),
    nominal: { withLumpSum: cumulativeWith + lumpSum, withoutLumpSum: cumulativeWithout, horizonMonths: total },
    presentValue: { withLumpSum: pvWith + lumpSum, withoutLumpSum: pvWithout, planningDiscountRate },
    breakEvenMonthsFromStart: breakEvenMonth,
    schedule,
    algorithmVerified: false,
    issues,
  };
}

/**
 * The value stack: four components, separately and together, never one
 * unlabeled "retirement benefit".
 */
export function brsValueStack({ definedBenefitAnnual = 0, definedContributionBalance = 0, continuationPay = null, lumpSum = null } = {}) {
  const cp = continuationPay?.included ? nonNeg(continuationPay.gross) : 0;
  const ls = lumpSum && lumpSum.elected && !lumpSum.blocked ? nonNeg(lumpSum.lumpSum) : 0;
  return {
    components: [
      { id: 'defined_benefit', label: 'Defined benefit (retired pay, first year)', amount: nonNeg(definedBenefitAnnual), kind: 'annual' },
      { id: 'defined_contribution', label: 'Defined contribution (uniformed-services TSP balance)', amount: nonNeg(definedContributionBalance), kind: 'balance' },
      { id: 'continuation_pay', label: 'Continuation pay (official offer)', amount: cp, kind: 'one_time', included: Boolean(continuationPay?.included) },
      { id: 'lump_sum', label: `Lump sum (${lumpSum?.electionPercent ?? 0}% election)`, amount: ls, kind: 'one_time', included: ls > 0 },
    ],
    /** One-time amounts only; the annual benefit and the balance are different units and are not added. */
    oneTimeTotal: cp + ls,
  };
}
