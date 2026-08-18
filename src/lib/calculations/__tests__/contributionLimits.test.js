import { describe, expect, it } from 'vitest';
import {
  ANNUAL_CATCH_UP_LIMIT,
  ANNUAL_ELECTIVE_DEFERRAL_LIMIT,
  SUPER_CATCH_UP_LIMIT,
  getCatchUpLimitForAge,
} from '../contributionLimits';

describe('2026 contribution limits', () => {
  it('matches the published 2026 figures', () => {
    // https://www.tsp.gov/bulletins/25-3/
    expect(ANNUAL_ELECTIVE_DEFERRAL_LIMIT).toBe(24500);
    expect(ANNUAL_CATCH_UP_LIMIT).toBe(8000);
    expect(SUPER_CATCH_UP_LIMIT).toBe(11250);
  });
});

describe('getCatchUpLimitForAge', () => {
  it('gives no catch-up below age 50', () => {
    expect(getCatchUpLimitForAge({ age: 49 })).toBe(0);
    expect(getCatchUpLimitForAge({ age: 30 })).toBe(0);
  });

  it('gives the regular catch-up from age 50 through 59', () => {
    expect(getCatchUpLimitForAge({ age: 50 })).toBe(ANNUAL_CATCH_UP_LIMIT);
    expect(getCatchUpLimitForAge({ age: 59 })).toBe(ANNUAL_CATCH_UP_LIMIT);
  });

  it('gives the SECURE 2.0 higher catch-up for ages 60 through 63', () => {
    for (const age of [60, 61, 62, 63]) {
      expect(getCatchUpLimitForAge({ age })).toBe(SUPER_CATCH_UP_LIMIT);
    }
  });

  it('drops back to the regular catch-up at 64', () => {
    expect(getCatchUpLimitForAge({ age: 64 })).toBe(ANNUAL_CATCH_UP_LIMIT);
  });

  it('does not stack the higher catch-up on top of the regular one', () => {
    expect(getCatchUpLimitForAge({ age: 61 })).toBeLessThan(ANNUAL_CATCH_UP_LIMIT + SUPER_CATCH_UP_LIMIT);
  });

  it('handles missing or invalid ages', () => {
    expect(getCatchUpLimitForAge({})).toBe(0);
    expect(getCatchUpLimitForAge({ age: NaN })).toBe(0);
  });
});
