/**
 * Named stress tests: the timeline with one assumption bent.
 *
 * Each test answers a question a retiree actually asks — "what if the market
 * falls the year I leave" — by rerunning the same model with that one change,
 * so the difference between the base and the stressed result is attributable
 * to the change alone.
 */

import { buildTimeline, resolveExpectedReturn } from '../projection/timeline';
import { DEFAULT_TRUST_FUND_HAIRCUT } from '../calculations/socialSecurity';

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function returnsWith(scenario, endAge, fn) {
  const r = resolveExpectedReturn(scenario);
  const years = Math.max(1, endAge - num(scenario.profile.currentAge) + 1);
  return Array.from({ length: years }, (_, i) => fn(i, r));
}

export const STRESS_TESTS = Object.freeze([
  {
    key: 'poor_first_decade',
    label: 'Poor first decade',
    description: 'Returns 3 points below expectation for the ten years after separation.',
    build: (scenario, { endAge }) => {
      const sep = num(scenario.profile.separationAge) - num(scenario.profile.currentAge);
      return { returnsByYear: returnsWith(scenario, endAge, (i, r) => (i >= sep && i < sep + 10 ? r - 0.03 : r)) };
    },
  },
  {
    key: 'crash_at_separation',
    label: 'Crash at separation',
    description: 'A 30% loss in the year of separation, then expected returns.',
    build: (scenario, { endAge }) => {
      const sep = num(scenario.profile.separationAge) - num(scenario.profile.currentAge);
      return { returnsByYear: returnsWith(scenario, endAge, (i, r) => (i === sep ? -0.3 : r)) };
    },
  },
  {
    key: 'high_inflation',
    label: 'High inflation',
    description: 'Inflation at 4.5% for the whole plan instead of the assumed rate.',
    build: () => ({ overrides: { inflationPercent: 4.5 } }),
  },
  {
    key: 'live_to_100',
    label: 'Live to 100',
    description: 'The plan has to last to 100 rather than the assumed end age.',
    build: () => ({ endAge: 100 }),
  },
  {
    key: 'healthcare_costs',
    label: 'Healthcare at 9%',
    description: 'Premiums and out-of-pocket costs grow 9% a year.',
    build: () => ({ overrides: { healthcarePremiumGrowthPercent: 9 } }),
  },
  {
    key: 'social_security_cut',
    label: 'Social Security cut',
    description: `Benefits cut ${DEFAULT_TRUST_FUND_HAIRCUT.percent}% from ${DEFAULT_TRUST_FUND_HAIRCUT.startYear}, the Trustees' depletion projection.`,
    build: () => ({ overrides: { trustFundHaircut: DEFAULT_TRUST_FUND_HAIRCUT } }),
  },
  {
    key: 'spend_10_more',
    label: 'Spend 10% more',
    description: 'Retirement spending 10% above the goal every year.',
    build: () => ({ overrides: { spendingMultiplier: 1.1 } }),
  },
]);

function outcome(timeline) {
  const s = timeline.summary;
  return {
    isSustainable: s.isSustainable,
    firstShortfallAge: s.firstShortfallAge,
    minBalance: s.minBalance,
    minBalanceAge: s.minBalanceAge,
    balanceAtEnd: s.balanceAtEnd,
    balanceAtEndReal: s.balanceAtEndReal,
    cumulativeShortfall: s.cumulativeShortfall,
    bridgeFundedPercent: s.bridge.fundedPercent,
  };
}

/** Runs every stress test against the scenario and reports each beside the base. */
export function runStressTests(scenario, options = {}) {
  const endAge = num(options.endAge ?? scenario?.summary?.assumptions?.endAge, 95);
  const base = options.baseTimeline ?? buildTimeline(scenario, { ...options, endAge });
  const baseOutcome = outcome(base);

  const results = STRESS_TESTS.map((test) => {
    const built = test.build(scenario, { endAge });
    const timeline = buildTimeline(scenario, {
      ...options,
      endAge: built.endAge ?? endAge,
      returnsByYear: built.returnsByYear ?? options.returnsByYear,
      overrides: { ...(options.overrides ?? {}), ...(built.overrides ?? {}) },
    });
    const o = outcome(timeline);
    return {
      key: test.key,
      label: test.label,
      description: test.description,
      ...o,
      survives: o.isSustainable,
      balanceAtEndDelta: o.balanceAtEnd - baseOutcome.balanceAtEnd,
      minBalanceDelta: o.minBalance - baseOutcome.minBalance,
    };
  });

  const survived = results.filter((r) => r.survives).length;
  const weakest = results.reduce((w, r) => (w === null || r.minBalance < w.minBalance ? r : w), null);

  return {
    base: baseOutcome,
    results,
    survivedCount: survived,
    totalCount: results.length,
    weakest,
  };
}
