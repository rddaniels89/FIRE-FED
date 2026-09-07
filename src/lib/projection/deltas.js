/**
 * What one more year, or one fewer, actually changes.
 *
 * The question a federal employee asks is rarely "what is my pension" but
 * "what does staying until next June buy me". The answer is a set of
 * thresholds as much as a number: the 1.1% multiplier at 62 with 20 years,
 * the supplement at MRA with 30, FEHB at five years enrolled, penalty-free TSP
 * at 55. This module compares two separations and reports every one of them.
 */

import { buildTimeline } from './timeline';
import { withSeparationAge } from './fireDate';

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function snapshot(timeline) {
  const { plan, summary, rows } = timeline;
  const sep = plan.separationAge;
  const rowAt = (age) => rows.find((r) => r.age === age);
  const lifetimeSalary = rows.reduce((s, r) => s + r.salary, 0);
  const lifetimePension = rows.reduce((s, r) => s + r.pension, 0);
  const lifetimeSrs = rows.reduce((s, r) => s + r.srs, 0);
  return {
    separationAge: sep,
    path: plan.path,
    pathLabel: plan.pathLabel,
    annuityStartAge: plan.annuityStartAge,
    eligibilityYears: plan.service.eligibilityYears,
    computationYears: plan.service.computationYears,
    sickLeaveCredited: plan.service.creditsSickLeave && plan.service.sickLeaveYears > 0,
    multiplier: plan.annuity.multiplier,
    high3: plan.high3.high3AtSeparation,
    pensionAnnualAtStart: plan.annuity.annualAtStart,
    pensionRealAtStart: plan.annuity.realValueAtStartInTodaysDollars,
    ageReductionPercent: plan.annuity.ageReductionPercent,
    srsEligible: plan.srs.isEligible,
    srsAnnual: plan.srs.annual,
    keepsFehb: plan.keepsFehb,
    fehbOutcome: plan.fehb.outcome,
    tspPenaltyFreeAge: plan.tspAccess.traditionalPenaltyFreeAge,
    balanceAtSeparation: summary.balanceAtSeparation,
    balanceAtEnd: summary.balanceAtEnd,
    minBalance: summary.minBalance,
    minBalanceAge: summary.minBalanceAge,
    isSustainable: summary.isSustainable,
    firstShortfallAge: summary.firstShortfallAge,
    bridgeYears: summary.bridge.years,
    bridgeFundedPercent: summary.bridge.fundedPercent,
    cumulativeTaxes: summary.cumulativeTaxes,
    cumulativePenalties: summary.cumulativePenalties,
    lifetimeSalary,
    lifetimePension,
    lifetimeSrs,
    balanceAt62: rowAt(62)?.balances.total ?? null,
  };
}

const THRESHOLDS = [
  { key: 'multiplier', label: '1.1% multiplier', gained: (a, b) => a.multiplier < 0.011 && b.multiplier >= 0.011, lost: (a, b) => a.multiplier >= 0.011 && b.multiplier < 0.011 },
  { key: 'srs', label: 'Special Retirement Supplement', gained: (a, b) => !a.srsEligible && b.srsEligible, lost: (a, b) => a.srsEligible && !b.srsEligible },
  { key: 'fehb', label: 'FEHB in retirement', gained: (a, b) => !a.keepsFehb && b.keepsFehb, lost: (a, b) => a.keepsFehb && !b.keepsFehb },
  { key: 'sick_leave', label: 'Sick leave credit', gained: (a, b) => !a.sickLeaveCredited && b.sickLeaveCredited, lost: (a, b) => a.sickLeaveCredited && !b.sickLeaveCredited },
  { key: 'age_reduction', label: 'MRA+10 age reduction', gained: (a, b) => a.ageReductionPercent > 0 && b.ageReductionPercent === 0, lost: (a, b) => a.ageReductionPercent === 0 && b.ageReductionPercent > 0 },
  { key: 'tsp_access', label: 'Penalty-free TSP at separation', gained: (a, b) => a.tspPenaltyFreeAge > a.separationAge && b.tspPenaltyFreeAge <= b.separationAge, lost: (a, b) => a.tspPenaltyFreeAge <= a.separationAge && b.tspPenaltyFreeAge > b.separationAge },
  { key: 'sustainable', label: 'Plan sustainable', gained: (a, b) => !a.isSustainable && b.isSustainable, lost: (a, b) => a.isSustainable && !b.isSustainable },
  { key: 'path', label: 'Retirement path', gained: (a, b) => a.path !== b.path, lost: () => false },
];

/** Compares the scenario's separation with the same scenario shifted by `years`. */
export function compareSeparationShift(scenario, years, options = {}) {
  const baseTimeline = options.baseTimeline ?? buildTimeline(scenario, options);
  const shiftedAge = num(scenario.profile.separationAge) + years;
  if (shiftedAge < num(scenario.profile.currentAge)) return null;
  const shifted = buildTimeline(withSeparationAge(scenario, shiftedAge), options);

  const a = snapshot(baseTimeline);
  const b = snapshot(shifted);

  const changes = [];
  for (const t of THRESHOLDS) {
    if (t.gained(a, b)) changes.push({ key: t.key, label: t.label, direction: 'gained', from: a[t.key === 'path' ? 'pathLabel' : 'separationAge'], to: b[t.key === 'path' ? 'pathLabel' : 'separationAge'] });
    else if (t.lost(a, b)) changes.push({ key: t.key, label: t.label, direction: 'lost' });
  }

  const numeric = (key) => ({ from: a[key], to: b[key], delta: num(b[key]) - num(a[key]) });

  return {
    years,
    from: a,
    to: b,
    thresholdChanges: changes,
    deltas: {
      high3: numeric('high3'),
      pensionAnnualAtStart: numeric('pensionAnnualAtStart'),
      pensionRealAtStart: numeric('pensionRealAtStart'),
      srsAnnual: numeric('srsAnnual'),
      balanceAtSeparation: numeric('balanceAtSeparation'),
      balanceAtEnd: numeric('balanceAtEnd'),
      minBalance: numeric('minBalance'),
      lifetimeSalary: numeric('lifetimeSalary'),
      lifetimePension: numeric('lifetimePension'),
      cumulativeTaxes: numeric('cumulativeTaxes'),
      cumulativePenalties: numeric('cumulativePenalties'),
      bridgeYears: numeric('bridgeYears'),
      bridgeFundedPercent: numeric('bridgeFundedPercent'),
    },
    timeline: shifted,
  };
}

/** The pair of cards: leave one year earlier, leave one year later. */
export function oneYearDeltas(scenario, options = {}) {
  const baseTimeline = options.baseTimeline ?? buildTimeline(scenario, options);
  return {
    base: snapshot(baseTimeline),
    earlier: compareSeparationShift(scenario, -1, { ...options, baseTimeline }),
    later: compareSeparationShift(scenario, 1, { ...options, baseTimeline }),
  };
}

/** Snapshots for every separation age in a range, for the slider and the comparison chart. */
export function separationSweep(scenario, { fromAge, toAge, ...options } = {}) {
  const start = Math.ceil(num(fromAge, scenario.profile.currentAge));
  const end = num(toAge, Math.min(70, start + 25));
  const out = [];
  for (let age = start; age <= end; age++) {
    out.push(snapshot(buildTimeline(withSeparationAge(scenario, age), options)));
  }
  return out;
}
