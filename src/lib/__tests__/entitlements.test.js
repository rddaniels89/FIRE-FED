import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FREE_SCENARIO_LIMIT,
  FEATURES,
  getEntitlements,
  hasEntitlement,
} from '../entitlements';

const PRO = getEntitlements({ isAuthenticated: true, isProUser: true });
const FREE = getEntitlements({ isAuthenticated: true, isProUser: false });
const ANON = getEntitlements({ isAuthenticated: false, isProUser: true });

describe('entitlements', () => {
  // Guards the class of bug where a component gates on FEATURES.SOMETHING that
  // getEntitlements never populates: the lookup silently yields undefined and
  // the feature stays locked for everyone, Pro subscribers included.
  it('populates every declared feature key for Pro', () => {
    for (const key of Object.values(FEATURES)) {
      expect(PRO.features).toHaveProperty(key);
      expect(hasEntitlement(PRO, key)).toBe(true);
    }
  });

  it('withholds every declared feature from free users', () => {
    for (const key of Object.values(FEATURES)) {
      expect(FREE.features).toHaveProperty(key);
      expect(hasEntitlement(FREE, key)).toBe(false);
    }
  });

  it('does not grant Pro to an unauthenticated caller', () => {
    expect(ANON.isPro).toBe(false);
    expect(hasEntitlement(ANON, FEATURES.OPTIMIZATION)).toBe(false);
  });

  it('caps free scenarios and uncaps Pro', () => {
    expect(FREE.scenarioLimit).toBe(DEFAULT_FREE_SCENARIO_LIMIT);
    expect(PRO.scenarioLimit).toBe(Infinity);
  });

  it('treats an unknown feature key as denied', () => {
    expect(hasEntitlement(PRO, 'not_a_feature')).toBe(false);
    expect(hasEntitlement(PRO, undefined)).toBe(false);
    expect(hasEntitlement(undefined, FEATURES.PDF_EXPORT)).toBe(false);
  });
});
