/**
 * Monte Carlo over the timeline.
 *
 * Each simulation is the same year-by-year model with a different sequence of
 * returns drawn from the allocation's mean and volatility. Because every
 * simulation is the real timeline rather than a simplified copy of it, the
 * pension, the supplement, the penalty rules, taxes and healthcare all behave
 * exactly as they do in the deterministic view. The output is the spread of
 * balances by age, the probability the money lasts, and where the plan is most
 * fragile.
 */

import { mulberry32, normal01 } from './random';
import { summarizePercentiles } from './stats';
import { buildTimeline, resolveExpectedReturn } from '../projection/timeline';
import { resolveRetirementPlan } from '../projection/plan';

const FUND_STDDEV = Object.freeze({
  // Coarse annualised volatility per fund, used to approximate portfolio volatility.
  G: 0.01,
  F: 0.05,
  C: 0.16,
  S: 0.18,
  I: 0.17,
});

function clampNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toWeightMap(allocationPct) {
  const a = allocationPct || {};
  const entries = ['G', 'F', 'C', 'S', 'I'].map((k) => [k, clampNumber(a[k], 0)]);
  const sum = entries.reduce((acc, [, v]) => acc + v, 0);
  if (sum <= 0) return { G: 0.1, F: 0.2, C: 0.4, S: 0.2, I: 0.1 };
  const weights = {};
  for (const [k, v] of entries) weights[k] = v / sum;
  return weights;
}

export function portfolioStdDev({ weights }) {
  // Naive approximation (ignores correlations): sqrt(sum((w*sd)^2))
  const varApprox = ['G', 'F', 'C', 'S', 'I'].reduce((s, k) => s + Math.pow(weights[k] * FUND_STDDEV[k], 2), 0);
  return Math.sqrt(varApprox);
}

/**
 * Runs the simulation. `settings.simulations` (default 750), `settings.endAge`
 * (default the scenario's), `settings.seed` for reproducibility.
 *
 * The legacy arguments (pensionMonthly and the Social Security pair) are
 * accepted and ignored: the timeline derives them from the scenario.
 */
export function runMonteCarloAnalytics({ scenario, settings } = {}) {
  if (!scenario?.profile) throw new Error('A normalized scenario with a profile is required.');
  const tsp = scenario.tsp ?? {};
  const plan = resolveRetirementPlan(scenario);

  const sims = Math.max(100, Math.floor(clampNumber(settings?.simulations ?? 750, 750)));
  const endAge = Math.max(plan.separationAge + 1, clampNumber(settings?.endAge ?? scenario.summary?.assumptions?.endAge, 95));
  const currentAge = plan.currentAge;
  const years = endAge - currentAge + 1;

  const weights = toWeightMap(tsp.allocation);
  const mu = resolveExpectedReturn(scenario);
  const sigma = clampNumber(settings?.stdDev, portfolioStdDev({ weights }));
  const seed = clampNumber(settings?.seed, 20260101);

  const balancesByAge = Array.from({ length: years }, () => []);
  const balancesAtSeparation = [];
  const balancesAtEnd = [];
  const minBalances = [];
  const minBalanceAges = [];
  const succeededToEnd = [];
  const bridgeFunded = [];
  const firstShortfallAges = [];

  for (let s = 0; s < sims; s++) {
    const rng = mulberry32(seed + s * 7919);
    const returnsByYear = new Array(years);
    for (let i = 0; i < years; i++) {
      returnsByYear[i] = Math.max(-0.65, Math.min(0.65, mu + sigma * normal01(rng)));
    }
    const t = buildTimeline(scenario, { plan, endAge, returnsByYear });
    t.rows.forEach((r, i) => balancesByAge[i].push(r.balances.total));
    balancesAtSeparation.push(t.summary.balanceAtSeparation);
    balancesAtEnd.push(t.summary.balanceAtEnd);
    minBalances.push(t.summary.minBalance);
    minBalanceAges.push(t.summary.minBalanceAge);
    succeededToEnd.push(t.summary.isSustainable);
    bridgeFunded.push(t.summary.bridge.fundedPercent >= 100);
    if (t.summary.firstShortfallAge !== null) firstShortfallAges.push(t.summary.firstShortfallAge);
  }

  const byAge = balancesByAge.map((values, i) => ({ age: currentAge + i, ...summarizePercentiles(values) }));

  // The most vulnerable period: where the 10th-percentile path is closest to
  // zero after separation, expressed as the age and the years of spending it
  // has left.
  const afterSeparation = byAge.filter((b) => b.age >= plan.separationAge);
  let vulnerable = afterSeparation[0] ?? null;
  for (const b of afterSeparation) if (b.p10 < (vulnerable?.p10 ?? Infinity)) vulnerable = b;

  const pSuccess = succeededToEnd.filter(Boolean).length / sims;
  const pBridge = bridgeFunded.filter(Boolean).length / sims;

  const shortfallHistogram = firstShortfallAges.reduce((acc, age) => {
    acc[age] = (acc[age] ?? 0) + 1;
    return acc;
  }, {});

  return {
    inputs: {
      simulations: sims,
      currentAge,
      retirementAge: plan.separationAge,
      desiredFireAge: plan.separationAge,
      endAge,
      meanReturn: mu,
      portfolioStdDev: sigma,
      seed,
    },
    outcomes: {
      // Kept for the existing analytics panel.
      probabilityFireByDesiredAge: pBridge,
      probabilityFundsLastToEndAge: pSuccess,
      balanceAtRetirement: summarizePercentiles(balancesAtSeparation),
      balanceAtDesiredFireAge: summarizePercentiles(balancesAtSeparation),
      // New.
      balanceAtEnd: summarizePercentiles(balancesAtEnd),
      minBalance: summarizePercentiles(minBalances),
      medianMinBalanceAge: summarizePercentiles(minBalanceAges)?.p50 ?? null,
      mostVulnerableAge: vulnerable?.age ?? null,
      mostVulnerableP10Balance: vulnerable?.p10 ?? null,
      firstShortfallAgeHistogram: shortfallHistogram,
      medianFirstShortfallAge: firstShortfallAges.length > 0 ? summarizePercentiles(firstShortfallAges).p50 : null,
    },
    byAge,
  };
}

/** Monte Carlo success across a range of separation ages. */
export function monteCarloBySeparationAge(scenario, { fromAge, toAge, settings, withSeparationAge } = {}) {
  const start = Math.ceil(clampNumber(fromAge, scenario.profile.currentAge));
  const end = clampNumber(toAge, Math.min(70, start + 20));
  const out = [];
  for (let age = start; age <= end; age++) {
    const s = withSeparationAge(scenario, age);
    const r = runMonteCarloAnalytics({ scenario: s, settings: { ...(settings ?? {}), simulations: Math.min(clampNumber(settings?.simulations, 300), 400) } });
    out.push({
      separationAge: age,
      probabilityFundsLastToEndAge: r.outcomes.probabilityFundsLastToEndAge,
      probabilityBridgeFunded: r.outcomes.probabilityFireByDesiredAge,
      minBalanceP10: r.outcomes.minBalance?.p10 ?? null,
      balanceAtEndP50: r.outcomes.balanceAtEnd?.p50 ?? null,
    });
  }
  return out;
}
