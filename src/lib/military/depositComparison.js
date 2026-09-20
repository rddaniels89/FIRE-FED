/**
 * The military deposit as a whole-plan comparison.
 *
 * A deposit is not "3% of old pay against 1% of High-3 for life". It can move
 * the door the person retires through, remove an MRA+10 reduction, start the
 * supplement, cross the 20-year line for 1.1% at 62, change the survivor
 * annuity, and change every tax year after it. So the comparison is the whole
 * plan run twice on the same timeline:
 *
 *   baseline   nothing paid, nothing credited
 *   credit     the deposit paid in full on the payment date (a one-off cash
 *              outflow that year) and every creditable period credited
 *
 * and the result is the difference between the two, not a formula. Break-even
 * and net present value are reported at a discount rate the user can see and
 * change. Nothing here recommends; it shows what each scenario produces.
 */

import { buildTimeline } from '../projection/timeline';
import { resolveRetirementPlan } from '../projection/plan';
import { applyScenarioUpdates } from '../scenarios/schema';
import { DEPOSIT_STATUSES } from '../scenarios/schema';
import { parseIsoDate } from './servicePeriods';

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** The age (whole years) at which an ISO date falls, given today's age and the as-of date. */
function ageAtDate({ isoDate, currentAge, currentAgeMonths = 0, asOfDate }) {
  const d = parseIsoDate(isoDate);
  if (!d) return null;
  const now = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
  const nowMonths = now.getFullYear() * 12 + now.getMonth();
  const birthMonths = nowMonths - Math.floor(num(currentAge)) * 12 - Math.min(11, Math.max(0, Math.floor(num(currentAgeMonths))));
  const targetMonths = d.getUTCFullYear() * 12 + d.getUTCMonth();
  return Math.floor((targetMonths - birthMonths) / 12);
}

/** The scenario with no deposit paid and none planned. */
export function withoutDeposit(scenario) {
  return applyScenarioUpdates(scenario, {
    military: {
      deposit: {
        ...(scenario.military?.deposit ?? {}),
        status: DEPOSIT_STATUSES.NOT_REQUESTED,
        mode: 'estimate',
        payments: [],
        plannedPaymentDate: null,
        officialBalance: null,
      },
    },
  });
}

/** The scenario with the deposit recorded as paid in full (the credit case). */
export function withDepositPaid(scenario) {
  return applyScenarioUpdates(scenario, { military: { deposit: { ...(scenario.military?.deposit ?? {}), status: DEPOSIT_STATUSES.PAID_IN_FULL } } });
}

/**
 * Runs the comparison.
 *
 *   options.asOfYear       pins the plan year (tests)
 *   options.discountRate   annual rate for the discounted figures; defaults to
 *                          the scenario's inflation assumption
 *   options.paymentDate    ISO date the deposit is paid; defaults to the planned
 *                          payment date, else the as-of date
 *   options.includeFireDate  also compare FIRE dates (slower)
 *
 * Returns null when the scenario has no creditable military service to compare.
 */
export function compareMilitaryDeposit(scenario, options = {}) {
  const asOfYear = num(options.asOfYear, new Date().getFullYear());
  const asOfDate = options.asOfDate ?? new Date(asOfYear, options.asOfMonth ?? new Date().getMonth(), 1);
  const profile = scenario.profile;

  const baselineScenario = withoutDeposit(scenario);
  const creditScenario = withDepositPaid(scenario);

  const baselinePlan = resolveRetirementPlan(baselineScenario, { asOfYear, asOfDate });
  const creditPlan = resolveRetirementPlan(creditScenario, { asOfYear, asOfDate });

  const deposit = baselinePlan.military.deposit;
  const creditYears = creditPlan.service.militaryCreditYears - baselinePlan.service.militaryCreditYears;
  if (creditYears <= 0) return null;

  // What is paid, and when.
  const paymentDate = options.paymentDate ?? scenario.military?.deposit?.plannedPaymentDate ?? null;
  const paymentAge = paymentDate
    ? ageAtDate({ isoDate: paymentDate, currentAge: profile.currentAge, currentAgeMonths: profile.currentAgeMonths, asOfDate })
    : num(profile.currentAge);
  const amountPaid = num(deposit.balance, 0);
  const paidAfterSeparation = paymentAge != null && paymentAge > num(profile.separationAge);

  const baseline = buildTimeline(baselineScenario, { asOfYear, plan: baselinePlan });
  const credit = buildTimeline(creditScenario, {
    asOfYear,
    plan: creditPlan,
    oneTimeOutflowsByAge: paymentAge != null && amountPaid > 0 ? { [Math.max(paymentAge, num(profile.currentAge))]: amountPaid } : {},
  });

  const discountRate = options.discountRate === undefined ? num(scenario.tsp?.inflationRate, 2.5) / 100 : num(options.discountRate);
  const currentAge = num(profile.currentAge);
  const payYearIndex = Math.max(0, (paymentAge ?? currentAge) - currentAge);

  // Year by year: the guaranteed-income delta (pension, supplement) and the
  // after-tax delta (income less taxes), nominal and discounted.
  const byAge = [];
  let cumulativeNominal = 0;
  let cumulativeDiscounted = 0;
  let simpleBreakEvenAge = null;
  let discountedBreakEvenAge = null;
  const depositDiscounted = amountPaid / Math.pow(1 + discountRate, payYearIndex);
  for (const b of baseline.rows) {
    const c = credit.rows.find((r) => r.age === b.age);
    if (!c) continue;
    const pensionDelta = c.pension - b.pension;
    const srsDelta = c.srs - b.srs;
    const taxDelta = c.taxes.total - b.taxes.total;
    const afterTaxDelta = pensionDelta + srsDelta - taxDelta;
    const t = b.age - currentAge;
    cumulativeNominal += afterTaxDelta;
    cumulativeDiscounted += afterTaxDelta / Math.pow(1 + discountRate, t);
    if (simpleBreakEvenAge === null && amountPaid > 0 && cumulativeNominal >= amountPaid) simpleBreakEvenAge = b.age;
    if (discountedBreakEvenAge === null && amountPaid > 0 && cumulativeDiscounted >= depositDiscounted) discountedBreakEvenAge = b.age;
    byAge.push({ age: b.age, pensionDelta, srsDelta, taxDelta, afterTaxDelta, cumulativeAfterTax: cumulativeNominal, balanceDelta: c.balances.total - b.balances.total });
  }

  const survivorDelta =
    (creditPlan.annuity.survivor?.survivorAnnualBenefit ?? 0) - (baselinePlan.annuity.survivor?.survivorAnnualBenefit ?? 0);

  const wholePlan =
    creditPlan.path !== baselinePlan.path ||
    creditPlan.annuityStartAge !== baselinePlan.annuityStartAge ||
    creditPlan.srs.isEligible !== baselinePlan.srs.isEligible ||
    creditPlan.annuity.multiplier !== baselinePlan.annuity.multiplier;

  let fireDate = null;
  if (options.includeFireDate) {
    // Loaded lazily so the ordinary comparison stays cheap.
    const { findFireDate } = options.fireDateModule ?? {};
    if (typeof findFireDate === 'function') {
      const a = findFireDate(baselineScenario, { asOfYear });
      const b = findFireDate(creditScenario, { asOfYear });
      fireDate = { baseline: a.found ? a.separationAge : null, credit: b.found ? b.separationAge : null };
    }
  }

  return {
    creditYears,
    deposit: {
      amount: amountPaid,
      paymentDate: paymentDate ?? null,
      paymentAge,
      paidAfterSeparation,
      principal: deposit.principal,
      interest: deposit.interest,
      interestAccrualDate: deposit.interestAccrualDate,
      projectionDate: deposit.projectionDate,
      principalComplete: deposit.principalComplete,
    },
    baseline: summarizePlan(baselinePlan, baseline),
    credit: summarizePlan(creditPlan, credit),
    delta: {
      annuityAnnualAtStart: creditPlan.annuity.annualAtStart - baselinePlan.annuity.annualAtStart,
      annuityStartAge: (creditPlan.annuityStartAge ?? null) !== null && (baselinePlan.annuityStartAge ?? null) !== null ? creditPlan.annuityStartAge - baselinePlan.annuityStartAge : null,
      pathChanged: creditPlan.path !== baselinePlan.path,
      multiplierChanged: creditPlan.annuity.multiplier !== baselinePlan.annuity.multiplier,
      ageReductionPercent: creditPlan.annuity.ageReductionPercent - baselinePlan.annuity.ageReductionPercent,
      srsAnnual: creditPlan.srs.annual - baselinePlan.srs.annual,
      survivorAnnual: survivorDelta,
      lifetimeAfterTaxNominal: cumulativeNominal,
      lifetimeAfterTaxDiscounted: cumulativeDiscounted,
      netPresentValue: cumulativeDiscounted - depositDiscounted,
      simpleBreakEvenAge,
      discountedBreakEvenAge,
      balanceAtEnd: credit.summary.balanceAtEnd - baseline.summary.balanceAtEnd,
      isSustainable: { baseline: baseline.summary.isSustainable, credit: credit.summary.isSustainable },
      firstShortfallAge: { baseline: baseline.summary.firstShortfallAge, credit: credit.summary.firstShortfallAge },
    },
    discountRate,
    wholePlan,
    label: wholePlan ? 'Whole-plan comparison' : 'Annuity comparison',
    fireDate,
    byAge,
    issues: creditPlan.military.issues,
  };
}

function summarizePlan(plan, timeline) {
  return {
    path: plan.path,
    pathLabel: plan.pathLabel,
    isEligibleForAnnuity: plan.isEligibleForAnnuity,
    annuityStartAge: plan.annuityStartAge,
    annuityAnnualAtStart: plan.annuity.annualAtStart,
    multiplier: plan.annuity.multiplier,
    ageReductionPercent: plan.annuity.ageReductionPercent,
    eligibilityYears: plan.service.eligibilityYears,
    militaryCreditYears: plan.service.militaryCreditYears,
    srs: { isEligible: plan.srs.isEligible, annual: plan.srs.annual },
    survivorAnnual: plan.annuity.survivor?.survivorAnnualBenefit ?? 0,
    balanceAtEnd: timeline.summary.balanceAtEnd,
    isSustainable: timeline.summary.isSustainable,
    firstShortfallAge: timeline.summary.firstShortfallAge,
  };
}

/**
 * The same comparison across payment ages and discount rates, for the
 * sensitivity view. Each row is a full comparison; keep the grids small.
 */
export function depositSensitivity(scenario, { paymentAges = [], discountRates = [], ...options } = {}) {
  const rows = [];
  const profile = scenario.profile;
  const asOfYear = num(options.asOfYear, new Date().getFullYear());
  for (const age of paymentAges.length > 0 ? paymentAges : [num(profile.currentAge)]) {
    const monthsAhead = Math.max(0, (age - num(profile.currentAge)) * 12);
    const asOf = new Date(asOfYear, options.asOfMonth ?? new Date().getMonth(), 1);
    const pay = new Date(asOf.getFullYear(), asOf.getMonth() + monthsAhead, 1);
    const paymentDate = `${pay.getFullYear()}-${String(pay.getMonth() + 1).padStart(2, '0')}-01`;
    const withPlanned = applyScenarioUpdates(scenario, { military: { deposit: { ...(scenario.military?.deposit ?? {}), plannedPaymentDate: paymentDate } } });
    for (const rate of discountRates.length > 0 ? discountRates : [undefined]) {
      const r = compareMilitaryDeposit(withPlanned, { ...options, asOfYear, paymentDate, discountRate: rate });
      if (r) rows.push({ paymentAge: age, discountRate: r.discountRate, depositAmount: r.deposit.amount, netPresentValue: r.delta.netPresentValue, simpleBreakEvenAge: r.delta.simpleBreakEvenAge, discountedBreakEvenAge: r.delta.discountedBreakEvenAge, annuityDelta: r.delta.annuityAnnualAtStart });
    }
  }
  return rows;
}
