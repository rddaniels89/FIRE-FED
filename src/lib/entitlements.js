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
  /** Retired-pay waiver scenarios and alternative deposit payment scenarios. */
  MILITARY_SCENARIOS: 'military_scenarios',
  /** Discounted break-even, NPV, sensitivity, and year-by-year deltas for the deposit. */
  MILITARY_ANALYSIS: 'military_analysis',
  /** The Military Retirement Report PDF and the military section of the household report. Launch-gated. */
  MILITARY_PDF: 'military_pdf',
  /** The BRS suite: continuation pay, the lump-sum scenario, and the value stack. Launch-gated. */
  MILITARY_BRS: 'military_brs',
});

/**
 * Features that become Pro when the military module launches publicly
 * (decision 2026-09-20: keep the beta split, gate the PDF and the BRS suite
 * at launch). Until VITE_MILITARY_LAUNCH_GATES is "true" every user,
 * including an anonymous calculator visitor, has them. Flipping the variable
 * is the whole launch change; nothing else moves.
 */
export const LAUNCH_GATED_FEATURES = Object.freeze([FEATURES.MILITARY_PDF, FEATURES.MILITARY_BRS]);

export function militaryLaunchGatesActive() {
  return String(import.meta.env.VITE_MILITARY_LAUNCH_GATES ?? '').toLowerCase() === 'true';
}

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
  [FEATURES.MILITARY_SCENARIOS]: 'Military retired-pay waiver and deposit-timing scenarios',
  [FEATURES.MILITARY_ANALYSIS]: 'Deposit present value, discounted break-even, and sensitivity',
  [FEATURES.MILITARY_PDF]: 'Military Retirement Report (PDF) and the military pages of the household report',
  [FEATURES.MILITARY_BRS]: 'BRS suite: continuation pay, lump-sum scenario, and the value stack',
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
  // Launch-gated military features are open to everyone until the switch is on.
  if (LAUNCH_GATED_FEATURES.includes(featureKey) && !militaryLaunchGatesActive()) return true;
  return Boolean(entitlements?.features?.[featureKey]);
}
