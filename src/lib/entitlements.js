/**
 * What free users get and what Pro adds.
 *
 * The rule: anything a single federal employee needs to answer "when could I
 * leave, and will it hold" is free — the profile, every eligibility path, the
 * pension, the supplement, the deterministic lifetime timeline, the projected
 * sustainable separation age, Social Security claiming, basic federal and
 * state tax, FEHB and Medicare, and the explanation behind every number.
 *
 * Pro is for a second person, a probabilistic answer, a strategy, or a
 * deliverable: household modeling, Monte Carlo and stress tests, 72(t) and
 * Roth-conversion bridge strategies, IRMAA, the career simulator, multi-
 * scenario delta comparison, the PDF report, and unlimited scenarios.
 */

export const FEATURES = Object.freeze({
  UNLIMITED_SCENARIOS: 'unlimited_scenarios',
  PDF_EXPORT: 'pdf_export',
  SCENARIO_COMPARE: 'scenario_compare',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  OPTIMIZATION: 'optimization',
  STRESS_TESTS: 'stress_tests',
  BRIDGE_STRATEGIES: 'bridge_strategies',
  HOUSEHOLD: 'household',
  CAREER_SIMULATOR: 'career_simulator',
  IRMAA: 'irmaa',
});

export const FEATURE_LABELS = Object.freeze({
  [FEATURES.UNLIMITED_SCENARIOS]: 'Unlimited scenarios',
  [FEATURES.PDF_EXPORT]: 'Federal Retirement Projection Report (PDF)',
  [FEATURES.SCENARIO_COMPARE]: 'Compare up to five scenarios with delta view',
  [FEATURES.ADVANCED_ANALYTICS]: 'Monte Carlo durability',
  [FEATURES.OPTIMIZATION]: 'Optimization suggestions',
  [FEATURES.STRESS_TESTS]: 'Named stress tests',
  [FEATURES.BRIDGE_STRATEGIES]: '72(t) and Roth conversion ladder strategies',
  [FEATURES.HOUSEHOLD]: 'Household and dual-fed modeling',
  [FEATURES.CAREER_SIMULATOR]: 'GS career and High-3 simulator',
  [FEATURES.IRMAA]: 'Medicare IRMAA estimates',
});

export const DEFAULT_FREE_SCENARIO_LIMIT = 3;

export function getEntitlements({ isAuthenticated, isProUser }) {
  const pro = Boolean(isAuthenticated && isProUser);

  const features = {};
  for (const key of Object.values(FEATURES)) features[key] = pro;

  return {
    isAuthenticated: Boolean(isAuthenticated),
    isPro: pro,
    scenarioLimit: pro ? Infinity : DEFAULT_FREE_SCENARIO_LIMIT,
    features,
  };
}

export function hasEntitlement(entitlements, featureKey) {
  return Boolean(entitlements?.features?.[featureKey]);
}
