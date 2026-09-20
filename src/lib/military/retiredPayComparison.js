/**
 * The retired-pay waiver as a whole-plan comparison (spec §6.7).
 *
 * Three scenarios, each the full plan and timeline:
 *
 *   keep       retired pay continues; the military service is not credited
 *              (the plan of record for someone who must waive)
 *   waive      retired pay and CRDP stop when the FERS annuity begins, the
 *              deposit is paid, the creditable service is credited; the
 *              waiver is hypothetical and every result says so
 *   exception  retired pay continues AND the service is credited; offered
 *              only when the user has confirmed a chapter 1223 or combat /
 *              instrumentality-of-war exception
 *
 * The comparison reports, for each: gross income, after-tax income, income in
 * today's dollars, the survivor figures, and lifetime totals, plus the
 * differences against `keep`. It never says which to choose, and it is always
 * rendered under RETIRED_PAY_WAIVER_WARNING.
 */

import { buildTimeline } from '../projection/timeline';
import { resolveRetirementPlan } from '../projection/plan';
import { applyScenarioUpdates } from '../scenarios/schema';
import { ISSUE_CODES, raiseIssue } from './status';
import {
  RETIRED_PAY_PATHS,
  RETIRED_PAY_WAIVER_WARNING,
  applyRetiredPayWaiver,
  evaluateRetiredPayGate,
  retiredPayStreamIds,
} from './retiredPayWaiver';

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** The scenario with retired pay kept and nothing credited: the waiver undone, the deposit left as recorded. */
export function withRetiredPayKept(scenario) {
  const rp = scenario.military?.retiredPay ?? {};
  return applyScenarioUpdates(scenario, {
    military: {
      retiredPay: { ...rp, waiver: { mode: 'none', effectiveAge: null } },
      hypotheticalWaiver: false,
    },
  });
}

/** The scenario with a hypothetical waiver effective at `effectiveAge`. */
export function withRetiredPayWaived(scenario, { effectiveAge }) {
  return applyScenarioUpdates(scenario, { military: applyRetiredPayWaiver(scenario.military, { effectiveAge, hypothetical: true }) });
}

/**
 * Runs the comparison. Returns null when the person receives no retired pay
 * or when the type is unknown (there is nothing lawful to compare). For a
 * chapter 61 award only the `keep` scenario is returned, with the block.
 *
 *   options.asOfYear, asOfMonth   pin the plan year (tests)
 *   options.waiverAge             override the FERS annuity start as the waiver date
 */
export function compareRetiredPayWaiver(scenario, options = {}) {
  const asOfYear = num(options.asOfYear, new Date().getFullYear());
  const asOfDate = options.asOfDate ?? new Date(asOfYear, options.asOfMonth ?? new Date().getMonth(), 1);
  const gate = evaluateRetiredPayGate(scenario.military);
  if (gate.path === RETIRED_PAY_PATHS.NO_RETIRED_PAY || gate.path === RETIRED_PAY_PATHS.TYPE_UNKNOWN) return null;

  const streamIds = retiredPayStreamIds(scenario.military);
  const issues = [...gate.issues];

  const keepScenario = withRetiredPayKept(scenario);
  const keepPlan = resolveRetirementPlan(keepScenario, { asOfYear, asOfDate });
  const keep = run(keepScenario, keepPlan, asOfYear);

  const result = {
    warning: RETIRED_PAY_WAIVER_WARNING,
    path: gate.path,
    retiredPayStreamIds: streamIds.retiredPay,
    crdpStreamIds: streamIds.crdp,
    keep,
    waive: null,
    exception: null,
    delta: { waive: null, exception: null },
    issues,
  };

  // Chapter 61 never enters the automated waiver path.
  if (!gate.waiverScenarioAllowed && gate.path !== RETIRED_PAY_PATHS.EXCEPTION) return result;

  if (gate.waiverScenarioAllowed) {
    // The waiver is effective when the FERS annuity begins under the credited
    // plan, which can differ from the uncredited plan's start age, so the
    // credited plan is resolved first to find it.
    const probe = resolveRetirementPlan(withRetiredPayWaived(scenario, { effectiveAge: null }), { asOfYear, asOfDate });
    const effectiveAge = options.waiverAge ?? probe.annuityStartAge ?? keepPlan.separationAge;
    const waiveScenario = withRetiredPayWaived(scenario, { effectiveAge });
    const waivePlan = resolveRetirementPlan(waiveScenario, { asOfYear, asOfDate });
    const waive = run(waiveScenario, waivePlan, asOfYear);
    waive.effectiveAge = effectiveAge;
    waive.hypothetical = true;
    waive.issues = [raiseIssue(ISSUE_CODES.MIL_WAIVER_HYPOTHETICAL, { detail: { effectiveAge } }), ...waivePlan.military.issues];
    result.waive = waive;
    result.delta.waive = diff(waive, keep);
  }

  if (gate.path === RETIRED_PAY_PATHS.EXCEPTION) {
    // Retired pay continues and the service is credited: the plan as the
    // gate already allows it, with the deposit paid.
    const exceptionScenario = applyScenarioUpdates(scenario, { military: { deposit: { ...(scenario.military?.deposit ?? {}), status: 'paid_in_full' } } });
    const exceptionPlan = resolveRetirementPlan(exceptionScenario, { asOfYear, asOfDate });
    const exception = run(exceptionScenario, exceptionPlan, asOfYear);
    exception.issues = exceptionPlan.military.issues;
    result.exception = exception;
    result.delta.exception = diff(exception, keep);
  }

  return result;
}

function run(scenario, plan, asOfYear) {
  const timeline = buildTimeline(scenario, { asOfYear, plan });
  const rows = timeline.rows;
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const grossIncome = (r) => r.totalIncome;
  const afterTax = (r) => r.totalIncome - r.taxes.total;
  return {
    path: plan.path,
    pathLabel: plan.pathLabel,
    annuityStartAge: plan.annuityStartAge,
    isEligibleForAnnuity: plan.isEligibleForAnnuity,
    militaryCreditYears: plan.service.militaryCreditYears,
    annuityAnnualAtStart: plan.annuity.annualAtStart,
    multiplier: plan.annuity.multiplier,
    srsAnnual: plan.srs.annual,
    survivorAnnual: plan.annuity.survivor?.survivorAnnualBenefit ?? 0,
    depositBalance: plan.military.deposit.balance,
    lifetime: {
      grossNominal: sum(grossIncome),
      afterTaxNominal: sum(afterTax),
      grossReal: sum((r) => grossIncome(r) / r.real.deflator),
      afterTaxReal: sum((r) => afterTax(r) / r.real.deflator),
      militaryIncomeNominal: sum((r) => r.militaryIncome?.total ?? 0),
      taxesNominal: sum((r) => r.taxes.total),
    },
    balanceAtEnd: timeline.summary.balanceAtEnd,
    isSustainable: timeline.summary.isSustainable,
    firstShortfallAge: timeline.summary.firstShortfallAge,
    byAge: rows.map((r) => ({ age: r.age, pension: r.pension, militaryIncome: r.militaryIncome?.total ?? 0, taxes: r.taxes.total, afterTax: afterTax(r), balance: r.balances.total })),
  };
}

function diff(a, b) {
  return {
    annuityAnnualAtStart: a.annuityAnnualAtStart - b.annuityAnnualAtStart,
    annuityStartAge: a.annuityStartAge != null && b.annuityStartAge != null ? a.annuityStartAge - b.annuityStartAge : null,
    pathChanged: a.path !== b.path,
    militaryCreditYears: a.militaryCreditYears - b.militaryCreditYears,
    srsAnnual: a.srsAnnual - b.srsAnnual,
    survivorAnnual: a.survivorAnnual - b.survivorAnnual,
    lifetimeGrossNominal: a.lifetime.grossNominal - b.lifetime.grossNominal,
    lifetimeAfterTaxNominal: a.lifetime.afterTaxNominal - b.lifetime.afterTaxNominal,
    lifetimeGrossReal: a.lifetime.grossReal - b.lifetime.grossReal,
    lifetimeAfterTaxReal: a.lifetime.afterTaxReal - b.lifetime.afterTaxReal,
    lifetimeTaxes: a.lifetime.taxesNominal - b.lifetime.taxesNominal,
    balanceAtEnd: a.balanceAtEnd - b.balanceAtEnd,
    isSustainable: { a: a.isSustainable, b: b.isSustainable },
  };
}
