import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEATURES, LAUNCH_GATED_FEATURES, getEntitlements, hasEntitlement, militaryLaunchGatesActive } from '../entitlements';

/**
 * Decision 2026-09-20: keep the beta Free/Pro split for the military module
 * and gate the PDF and the BRS suite at public launch. Until the launch
 * switch is on, everyone has both; after it, only Pro.
 */
describe('military launch gates', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('names exactly the PDF and the BRS suite', () => {
    expect(LAUNCH_GATED_FEATURES).toEqual([FEATURES.MILITARY_PDF, FEATURES.MILITARY_BRS]);
  });

  it('before launch every user has them, including an anonymous visitor', () => {
    vi.stubEnv('VITE_MILITARY_LAUNCH_GATES', '');
    expect(militaryLaunchGatesActive()).toBe(false);
    const anonymous = getEntitlements({ isAuthenticated: false, isProUser: false });
    const free = getEntitlements({ isAuthenticated: true, isProUser: false });
    for (const f of LAUNCH_GATED_FEATURES) {
      expect(hasEntitlement(anonymous, f)).toBe(true);
      expect(hasEntitlement(free, f)).toBe(true);
      expect(hasEntitlement(undefined, f)).toBe(true);
    }
    // The beta split is unchanged: scenarios and analysis stay Pro.
    expect(hasEntitlement(free, FEATURES.MILITARY_SCENARIOS)).toBe(false);
    expect(hasEntitlement(free, FEATURES.MILITARY_ANALYSIS)).toBe(false);
  });

  it('after launch only Pro has them, and nothing else changes', () => {
    vi.stubEnv('VITE_MILITARY_LAUNCH_GATES', 'true');
    expect(militaryLaunchGatesActive()).toBe(true);
    const anonymous = getEntitlements({ isAuthenticated: false, isProUser: false });
    const free = getEntitlements({ isAuthenticated: true, isProUser: false });
    const pro = getEntitlements({ isAuthenticated: true, isProUser: true });
    for (const f of LAUNCH_GATED_FEATURES) {
      expect(hasEntitlement(anonymous, f)).toBe(false);
      expect(hasEntitlement(free, f)).toBe(false);
      expect(hasEntitlement(pro, f)).toBe(true);
    }
    expect(hasEntitlement(free, FEATURES.MILITARY_SCENARIOS)).toBe(false);
    expect(hasEntitlement(pro, FEATURES.MILITARY_SCENARIOS)).toBe(true);
  });
});
