/**
 * Optimization suggestions read from the timeline.
 *
 * Each suggestion is one change to the scenario, run through the same model
 * as everything else, with the difference it makes stated as a projection:
 * what the sustainable separation age becomes, what a year buys, what a
 * claiming age is worth, what a 72(t) schedule removes. The wording describes
 * the tradeoff; it never says what to do.
 *
 * Shape:
 *   {
 *     baseline: { separationAge, contributionPct, monthlyExpenses, fireAge, earliestFireAge, isSustainable, path, pathLabel },
 *     suggestions: [{ id, kind, title, detail, updates | null, metrics }],
 *   }
 * `updates` is a scenario patch for applyScenarioUpdates; null means the
 * suggestion is informational.
 */

import { buildTimeline } from '../projection/timeline';
import { findFireDate } from '../projection/fireDate';
import { oneYearDeltas } from '../projection/deltas';
import { applyScenarioUpdates } from '../scenarios/schema';

const MAX_SEARCH_AGE = 72;
export const CONTRIBUTION_STEPS = Object.freeze([2, 5]);
export const CLAIM_AGES = Object.freeze([62, 67, 70]);

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const money = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num(amount));

const pct = (v, digits = 0) => `${num(v).toFixed(digits)}%`;

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Lifetime Social Security in today's dollars: the figure a claiming age changes. */
function lifetimeRealSocialSecurity(timeline) {
  return timeline.rows.reduce((s, r) => s + num(r.socialSecurity) / Math.max(1e-9, num(r.real?.deflator, 1)), 0);
}

function lifetimeRealIncome(timeline) {
  return timeline.rows.reduce((s, r) => s + num(r.real?.totalIncome), 0);
}

// ---------------------------------------------------------------------------
// Individual suggestions
// ---------------------------------------------------------------------------

function contributionSuggestions(scenario, base) {
  const out = [];
  const currentPct = num(scenario.tsp?.monthlyContributionPercent, 0);
  for (const step of CONTRIBUTION_STEPS) {
    const target = Math.min(100, currentPct + step);
    if (target <= currentPct) continue;
    const candidate = applyScenarioUpdates(scenario, { tsp: { monthlyContributionPercent: target } });
    const fire = safe(() => findFireDate(candidate, { maxSeparationAge: MAX_SEARCH_AGE }));
    if (!fire) continue;

    const from = base.fireAge;
    const to = fire.found ? fire.separationAge : null;
    const improves = to != null && (from == null || to < from);
    const sameAge = to != null && from != null && to === from;
    if (!improves && !sameAge) continue;

    const candidateTimeline = safe(() => buildTimeline(candidate));
    const endDelta = candidateTimeline ? candidateTimeline.summary.balanceAtEnd - base.timeline.summary.balanceAtEnd : 0;

    out.push({
      id: `contribution_${target}`,
      kind: 'contribution',
      title: improves
        ? `Raising TSP contributions from ${pct(currentPct)} to ${pct(target)} moves the projected sustainable separation age from ${from == null ? 'none found' : from} to ${to}.`
        : `Raising TSP contributions from ${pct(currentPct)} to ${pct(target)} leaves the projected sustainable separation age at ${to} and changes the portfolio at end age by ${money(endDelta)}.`,
      detail: improves
        ? `Each year of separation is re-run through the full timeline; ${to} is the first age at which no year records a shortfall with the higher contribution.`
        : 'The extra contributions change the ending balance but not the first sustainable age.',
      updates: { tsp: { monthlyContributionPercent: target } },
      metrics: { fromContributionPct: currentPct, toContributionPct: target, fromFireAge: from, toFireAge: to, balanceAtEndDelta: endDelta },
      improvementYears: improves && from != null ? from - to : 0,
    });
    if (improves) break; // The smaller step already moves the age; the larger one is a bigger ask.
  }
  return out;
}

function separationShiftSuggestions(scenario, base) {
  const deltas = safe(() => oneYearDeltas(scenario, { baseTimeline: base.timeline }));
  if (!deltas) return [];
  const out = [];

  const later = deltas.later;
  if (later) {
    const gained = later.thresholdChanges.filter((c) => c.direction === 'gained' && c.key !== 'path').map((c) => c.label);
    const parts = [];
    if (gained.length) parts.push(gained.join(', '));
    const pensionDelta = later.deltas.pensionAnnualAtStart.delta;
    if (Math.abs(pensionDelta) >= 1) parts.push(`${money(pensionDelta)} a year more pension at start`);
    const salaryDelta = later.deltas.lifetimeSalary.delta;
    if (salaryDelta > 0) parts.push(`${money(salaryDelta)} more lifetime salary`);
    const endDelta = later.deltas.balanceAtEnd.delta;
    if (Math.abs(endDelta) >= 1000) parts.push(`${money(endDelta)} at end age`);
    if (!base.isSustainable && later.to.isSustainable) parts.unshift('a sustainable plan');
    out.push({
      id: 'stay_one_more_year',
      kind: 'separation_later',
      title: `Staying one more year (to ${later.to.separationAge}) gains: ${parts.length ? parts.join('; ') : 'no threshold change'}.`,
      detail: later.to.pathLabel !== base.pathLabel ? `The retirement path changes from ${base.pathLabel} to ${later.to.pathLabel}.` : `The retirement path stays ${base.pathLabel}.`,
      updates: { profile: { separationAge: later.to.separationAge } },
      metrics: { gained, pensionDelta, salaryDelta, balanceAtEndDelta: endDelta, sustainable: later.to.isSustainable },
      improvementYears: 0,
    });
  }

  const earlier = deltas.earlier;
  if (earlier && earlier.to.isSustainable) {
    const lost = earlier.thresholdChanges.filter((c) => c.direction === 'lost').map((c) => c.label);
    const pensionDelta = earlier.deltas.pensionAnnualAtStart.delta;
    const parts = [];
    if (lost.length) parts.push(`loses ${lost.join(', ')}`);
    if (Math.abs(pensionDelta) >= 1) parts.push(`${money(Math.abs(pensionDelta))} a year less pension at start`);
    parts.push(`${money(earlier.to.balanceAtEnd)} at end age`);
    out.push({
      id: 'leave_one_year_earlier',
      kind: 'separation_earlier',
      title: `Leaving one year earlier (at ${earlier.to.separationAge}) still holds through the end age: ${parts.join('; ')}.`,
      detail: 'Sustainable means no year in the timeline records a shortfall under the stated assumptions.',
      updates: { profile: { separationAge: earlier.to.separationAge } },
      metrics: { lost, pensionDelta, balanceAtEnd: earlier.to.balanceAtEnd, sustainable: true },
      improvementYears: 1,
    });
  }
  return out;
}

function socialSecuritySuggestion(scenario, base) {
  const plan = base.timeline.plan;
  if (num(plan.socialSecurity?.piaMonthlyAtFra) <= 0) return [];
  const currentClaim = num(scenario.profile?.socialSecurityClaimAge, 67);
  const fra = Math.round(num(plan.socialSecurity?.fra?.decimal, 67));
  const candidates = [...new Set([...CLAIM_AGES, fra])].filter((a) => a !== currentClaim);

  const baseSs = lifetimeRealSocialSecurity(base.timeline);
  const baseIncome = lifetimeRealIncome(base.timeline);
  let best = null;
  for (const claimAge of candidates) {
    const candidate = applyScenarioUpdates(scenario, { profile: { socialSecurityClaimAge: claimAge } });
    const t = safe(() => buildTimeline(candidate));
    if (!t) continue;
    const ssDelta = lifetimeRealSocialSecurity(t) - baseSs;
    const incomeDelta = lifetimeRealIncome(t) - baseIncome;
    const result = { claimAge, ssDelta, incomeDelta, sustainable: t.summary.isSustainable, balanceAtEnd: t.summary.balanceAtEnd, firstShortfallAge: t.summary.firstShortfallAge };
    // Prefer the age that adds the most lifetime real Social Security without breaking a sustainable plan.
    const acceptable = !base.isSustainable || result.sustainable;
    if (acceptable && ssDelta > 0 && (!best || ssDelta > best.ssDelta)) best = result;
  }
  if (!best) return [];
  return [
    {
      id: `ss_claim_${best.claimAge}`,
      kind: 'social_security_claim',
      title: `Claiming Social Security at ${best.claimAge} instead of ${currentClaim} raises lifetime real income by ${money(best.incomeDelta)} through the end age (${money(best.ssDelta)} of it Social Security).`,
      detail: best.sustainable
        ? `The portfolio at end age becomes ${money(best.balanceAtEnd)}. Lifetime figures depend on the end age (${base.timeline.rows[base.timeline.rows.length - 1].age}); a shorter life favours claiming earlier.`
        : `The plan is not sustainable at either claiming age; the first shortfall moves to ${best.firstShortfallAge}.`,
      updates: { profile: { socialSecurityClaimAge: best.claimAge } },
      metrics: { fromClaimAge: currentClaim, toClaimAge: best.claimAge, lifetimeRealIncomeDelta: best.incomeDelta, lifetimeRealSocialSecurityDelta: best.ssDelta },
      improvementYears: 0,
    },
  ];
}

function seppSuggestion(scenario, base) {
  const { plan, rows, summary } = base.timeline;
  if (scenario.strategies?.sepp?.enabled) return [];
  if (!plan.tspAccess?.seppAvailable) return [];
  const penaltyRows = rows.filter((r) => r.phase !== 'working' && num(r.penalties) > 0 && num(r.withdrawals?.traditional) > 0);
  if (penaltyRows.length === 0 || num(summary.cumulativePenalties) <= 0) return [];

  const withSepp = safe(() => buildTimeline(scenario, { strategies: { sepp: { enabled: true, interestRate: num(scenario.strategies?.sepp?.interestRate, 0.05) } } }));
  if (!withSepp) return [];
  const removed = summary.cumulativePenalties - withSepp.summary.cumulativePenalties;
  if (removed <= 0) return [];
  const first = penaltyRows[0].age;
  const last = penaltyRows[penaltyRows.length - 1].age;
  return [
    {
      id: 'sepp_schedule',
      kind: 'sepp',
      title: `The bridge has ${penaltyRows.length} ${penaltyRows.length === 1 ? 'year' : 'years'} of Traditional TSP withdrawals under the 10% penalty (ages ${first} to ${last}); a 72(t) schedule would remove ${money(removed)} of penalties.`,
      detail: `A 72(t) schedule fixes the annual payment for five years or until 59½, whichever is longer. With it, the portfolio at end age is ${money(withSepp.summary.balanceAtEnd)} against ${money(summary.balanceAtEnd)} without.`,
      updates: { strategies: { sepp: { enabled: true } } },
      metrics: { penaltyYears: penaltyRows.length, firstPenaltyAge: first, lastPenaltyAge: last, penaltiesRemoved: removed, balanceAtEndDelta: withSepp.summary.balanceAtEnd - summary.balanceAtEnd },
      improvementYears: 0,
    },
  ];
}

function deferredFreezeSuggestion(base) {
  const annuity = base.timeline.plan.annuity;
  const years = num(annuity?.nominalFreezeYears);
  if (years <= 0) return [];
  const lost = num(annuity.purchasingPowerLostToFreeze) * 100;
  return [
    {
      id: 'deferred_freeze',
      kind: 'deferred_freeze',
      title: `Deferring locks the annuity at separation-day dollars for ${years} ${years === 1 ? 'year' : 'years'}: ${pct(lost)} of its purchasing power is gone by the time it starts.`,
      detail: `The ${money(annuity.annualAtStart)} annuity starting at ${base.timeline.plan.annuityStartAge} is worth ${money(annuity.realValueAtStartInTodaysDollars)} in today's dollars, and the FERS COLA does not begin until it is paying.`,
      updates: null,
      metrics: { freezeYears: years, purchasingPowerLostPercent: lost, annualAtStart: annuity.annualAtStart, realValueAtStart: annuity.realValueAtStartInTodaysDollars },
      improvementYears: 0,
    },
  ];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function buildOptimizationSuggestions(scenario) {
  if (!scenario?.profile) {
    return { baseline: null, suggestions: [] };
  }

  const timeline = safe(() => buildTimeline(scenario));
  if (!timeline) return { baseline: null, suggestions: [] };

  const fire = safe(() => findFireDate(scenario, { maxSeparationAge: MAX_SEARCH_AGE }));
  const base = {
    timeline,
    fireAge: fire?.found ? fire.separationAge : null,
    isSustainable: timeline.summary.isSustainable,
    pathLabel: timeline.plan.pathLabel,
  };

  const suggestions = [
    ...contributionSuggestions(scenario, base),
    ...separationShiftSuggestions(scenario, base),
    ...socialSecuritySuggestion(scenario, base),
    ...seppSuggestion(scenario, base),
    ...deferredFreezeSuggestion(base),
  ];

  return {
    baseline: {
      separationAge: timeline.plan.separationAge,
      // Legacy alias kept for the panel's existing copy.
      retirementAge: timeline.plan.separationAge,
      contributionPct: num(scenario.tsp?.monthlyContributionPercent, 0),
      monthlyExpenses: num(scenario.summary?.monthlyExpenses, 0),
      fireAge: base.fireAge,
      earliestFireAge: base.fireAge,
      fireYearsFromNow: fire?.found ? fire.yearsFromNow : null,
      isSustainable: base.isSustainable,
      firstShortfallAge: timeline.summary.firstShortfallAge,
      path: timeline.plan.path,
      pathLabel: base.pathLabel,
      balanceAtEnd: timeline.summary.balanceAtEnd,
    },
    suggestions,
  };
}
