/**
 * The Federal FIRE Date: the earliest separation age at which the timeline
 * never runs dry.
 *
 * "Financially optional" is defined by the model, not by a rule of thumb: the
 * person leaves at the candidate age, every income source starts when the
 * rules say it starts, every withdrawal pays the tax and penalty the rules
 * impose, and the plan is sustainable if no year records a shortfall through
 * the end age. The result is a projection under stated assumptions, which is
 * why the app calls it a projected sustainable separation age rather than a
 * recommendation.
 */

import { buildTimeline } from './timeline';
import { applyScenarioUpdates } from '../scenarios/schema';
import { resolveRetirementPlan } from './plan';

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** The scenario with a different separation age and the annuity start reset to the path default. */
export function withSeparationAge(scenario, separationAge) {
  const requested = scenario?.profile?.annuityStartAge;
  const keepStart = requested != null && num(requested) > num(separationAge);
  return applyScenarioUpdates(scenario, {
    profile: { separationAge, annuityStartAge: keepStart ? requested : null },
  });
}

/**
 * Searches separation ages from today upward and returns the first sustainable
 * one, with the timeline for it. Ages are whole years; the search stops at
 * `maxSeparationAge` (default 75).
 */
export function findFireDate(scenario, options = {}) {
  const currentAge = Math.ceil(num(scenario?.profile?.currentAge));
  // Special provision employees cannot separate after the mandatory age.
  const mandatory = resolveRetirementPlan(scenario).mandatoryRetirementAge;
  const maxAge = Math.min(num(options.maxSeparationAge, 75), mandatory ?? Infinity);
  const tried = [];

  for (let age = currentAge; age <= maxAge; age++) {
    const candidate = withSeparationAge(scenario, age);
    const timeline = buildTimeline(candidate, options);
    const s = timeline.summary;
    tried.push({
      separationAge: age,
      isSustainable: s.isSustainable,
      firstShortfallAge: s.firstShortfallAge,
      minBalance: s.minBalance,
      balanceAtEnd: s.balanceAtEnd,
      bridgeFundedPercent: s.bridge.fundedPercent,
      path: timeline.plan.path,
    });
    if (s.isSustainable) {
      return {
        found: true,
        separationAge: age,
        yearsFromNow: age - currentAge,
        timeline,
        tried,
      };
    }
  }

  return { found: false, separationAge: null, yearsFromNow: null, timeline: null, tried };
}
