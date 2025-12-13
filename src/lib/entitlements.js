export const FEATURES = Object.freeze({
  UNLIMITED_SCENARIOS: 'unlimited_scenarios',
  PDF_EXPORT: 'pdf_export',
  SCENARIO_COMPARE: 'scenario_compare',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  AI_INSIGHTS: 'ai_insights',
});

export const DEFAULT_FREE_SCENARIO_LIMIT = 3;

export function getEntitlements({ isAuthenticated, isProUser }) {
  const pro = Boolean(isAuthenticated && isProUser);

  return {
    isAuthenticated: Boolean(isAuthenticated),
    isPro: pro,
    scenarioLimit: pro ? Infinity : DEFAULT_FREE_SCENARIO_LIMIT,
    features: {
      [FEATURES.UNLIMITED_SCENARIOS]: pro,
      [FEATURES.PDF_EXPORT]: pro,
      [FEATURES.SCENARIO_COMPARE]: pro,
      [FEATURES.ADVANCED_ANALYTICS]: pro,
      [FEATURES.AI_INSIGHTS]: pro,
    },
  };
}

export function hasEntitlement(entitlements, featureKey) {
  return Boolean(entitlements?.features?.[featureKey]);
}


