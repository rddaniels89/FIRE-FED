import { describe, expect, it } from 'vitest';
import {
  RETIREMENT_PATHS,
  earliestUnreducedDeferredAge,
  evaluateAllRetirementPaths,
  evaluateRetirementPath,
  qualifiesForDeferred,
  qualifiesForImmediateUnreduced,
  qualifiesForMra10,
  qualifiesForVera,
} from '../retirementPaths';

const at = (path, opts) => evaluateRetirementPath({ path, mra: 57, ...opts });

describe('eligibility gates', () => {
  it('opens an unreduced route at MRA+30, 60+20 or 62+5', () => {
    expect(qualifiesForImmediateUnreduced({ age: 57, yearsOfService: 30, mra: 57 })).toBe(true);
    expect(qualifiesForImmediateUnreduced({ age: 60, yearsOfService: 20, mra: 57 })).toBe(true);
    expect(qualifiesForImmediateUnreduced({ age: 62, yearsOfService: 5, mra: 57 })).toBe(true);
    expect(qualifiesForImmediateUnreduced({ age: 57, yearsOfService: 29, mra: 57 })).toBe(false);
  });

  it('treats MRA+10 as the fallback, not an alternative', () => {
    // 30 years at MRA is unreduced, so MRA+10 does not apply to it.
    expect(qualifiesForMra10({ age: 57, yearsOfService: 30, mra: 57 })).toBe(false);
    expect(qualifiesForMra10({ age: 57, yearsOfService: 15, mra: 57 })).toBe(true);
    expect(qualifiesForMra10({ age: 56, yearsOfService: 15, mra: 57 })).toBe(false);
  });

  it('opens VERA at 50 with 20 years, or any age with 25', () => {
    expect(qualifiesForVera({ age: 50, yearsOfService: 20 })).toBe(true);
    expect(qualifiesForVera({ age: 44, yearsOfService: 25 })).toBe(true);
    expect(qualifiesForVera({ age: 49, yearsOfService: 20 })).toBe(false);
  });

  it('needs five years for a deferred annuity', () => {
    expect(qualifiesForDeferred({ yearsOfService: 5 })).toBe(true);
    expect(qualifiesForDeferred({ yearsOfService: 4 })).toBe(false);
  });

  it('sets the unreduced deferred age from service length', () => {
    expect(earliestUnreducedDeferredAge({ yearsOfService: 30, mra: 57 })).toBe(57);
    expect(earliestUnreducedDeferredAge({ yearsOfService: 20, mra: 57 })).toBe(60);
    expect(earliestUnreducedDeferredAge({ yearsOfService: 8, mra: 57 })).toBe(62);
    expect(earliestUnreducedDeferredAge({ yearsOfService: 3, mra: 57 })).toBeNull();
  });
});

describe('immediate unreduced', () => {
  it('carries no reduction, sick leave credit, FEHB and the supplement', () => {
    const r = at(RETIREMENT_PATHS.IMMEDIATE_UNREDUCED, { separationAge: 57, yearsOfService: 30 });
    expect(r.isEligible).toBe(true);
    expect(r.ageReductionPercent).toBe(0);
    expect(r.creditsSickLeave).toBe(true);
    expect(r.keepsFehb).toBe(true);
    expect(r.hasSupplement).toBe(true);
  });

  it('has no supplement to pay from 62, since there is no gap to bridge', () => {
    const r = at(RETIREMENT_PATHS.IMMEDIATE_UNREDUCED, { separationAge: 62, yearsOfService: 20 });
    expect(r.isEligible).toBe(true);
    expect(r.hasSupplement).toBe(false);
  });
});

describe('MRA+10, taken immediately', () => {
  it('is reduced 5% a year under 62 and carries no supplement', () => {
    const r = at(RETIREMENT_PATHS.MRA10_IMMEDIATE, { separationAge: 57, yearsOfService: 15 });
    expect(r.isEligible).toBe(true);
    expect(r.ageReductionPercent).toBeCloseTo(25, 6);
    expect(r.hasSupplement).toBe(false);
    expect(r.keepsFehb).toBe(true);
  });
});

describe('MRA+10, postponed', () => {
  // Postponing is the lever that makes MRA+10 survivable, and the reason to
  // postpone rather than defer is that FEHB comes back.
  it('shrinks the reduction as the start age rises', () => {
    const now = at(RETIREMENT_PATHS.MRA10_POSTPONED, { separationAge: 57, yearsOfService: 15, annuityStartAge: 57 });
    const later = at(RETIREMENT_PATHS.MRA10_POSTPONED, { separationAge: 57, yearsOfService: 15, annuityStartAge: 60 });
    expect(now.ageReductionPercent).toBeCloseTo(25, 6);
    expect(later.ageReductionPercent).toBeCloseTo(10, 6);
  });

  it('removes the reduction entirely at 62', () => {
    const r = at(RETIREMENT_PATHS.MRA10_POSTPONED, { separationAge: 57, yearsOfService: 15, annuityStartAge: 62 });
    expect(r.ageReductionPercent).toBe(0);
  });

  it('keeps FEHB, which is the point of postponing over deferring', () => {
    const postponed = at(RETIREMENT_PATHS.MRA10_POSTPONED, { separationAge: 57, yearsOfService: 15, annuityStartAge: 62 });
    const deferred = at(RETIREMENT_PATHS.DEFERRED, { separationAge: 57, yearsOfService: 15, annuityStartAge: 62 });
    expect(postponed.keepsFehb).toBe(true);
    expect(deferred.keepsFehb).toBe(false);
  });

  it('cannot start before separation', () => {
    const r = at(RETIREMENT_PATHS.MRA10_POSTPONED, { separationAge: 58, yearsOfService: 15, annuityStartAge: 50 });
    expect(r.annuityStartAge).toBe(58);
  });
});

describe('deferred', () => {
  // The three losses that make deferring expensive, and none of them are the
  // annuity figure people compare.
  it('loses FEHB, sick leave credit and the supplement', () => {
    const r = at(RETIREMENT_PATHS.DEFERRED, { separationAge: 45, yearsOfService: 15, annuityStartAge: 62 });
    expect(r.isEligible).toBe(true);
    expect(r.keepsFehb).toBe(false);
    expect(r.creditsSickLeave).toBe(false);
    expect(r.hasSupplement).toBe(false);
  });

  it('is unreduced from the age its service length allows', () => {
    const r = at(RETIREMENT_PATHS.DEFERRED, { separationAge: 45, yearsOfService: 20, annuityStartAge: 60 });
    expect(r.ageReductionPercent).toBe(0);
  });

  it('is reduced when claimed early with 10 to 29 years', () => {
    const r = at(RETIREMENT_PATHS.DEFERRED, { separationAge: 45, yearsOfService: 15, annuityStartAge: 57 });
    expect(r.ageReductionPercent).toBeCloseTo(25, 6);
  });

  it('is refused below five years of service', () => {
    const r = at(RETIREMENT_PATHS.DEFERRED, { separationAge: 40, yearsOfService: 4 });
    expect(r.isEligible).toBe(false);
    expect(r.reason).toMatch(/5 years/);
  });
});

describe('VERA', () => {
  it('needs an offer, not just the age and service', () => {
    const noOffer = at(RETIREMENT_PATHS.VERA, { separationAge: 50, yearsOfService: 25 });
    expect(noOffer.isEligible).toBe(false);
    expect(noOffer.reason).toMatch(/early out/i);
  });

  // The rule that makes an early out worth taking: FERS applies no penalty
  // where CSRS would have cut 2% a year under 55.
  it('applies no age reduction under FERS', () => {
    const r = at(RETIREMENT_PATHS.VERA, { separationAge: 50, yearsOfService: 25, isVeraOffered: true });
    expect(r.isEligible).toBe(true);
    expect(r.ageReductionPercent).toBe(0);
    expect(r.creditsSickLeave).toBe(true);
    expect(r.keepsFehb).toBe(true);
  });

  it('says the supplement waits for MRA when leaving before it', () => {
    const r = at(RETIREMENT_PATHS.VERA, { separationAge: 50, yearsOfService: 25, isVeraOffered: true });
    expect(r.hasSupplement).toBe(true);
    expect(r.notes.join(' ')).toMatch(/not until your MRA at 57/);
  });
});

describe('comparing every path at once', () => {
  it('puts the eligible routes first', () => {
    const paths = evaluateAllRetirementPaths({ separationAge: 57, yearsOfService: 15, mra: 57 });
    const firstIneligible = paths.findIndex((p) => !p.isEligible);
    expect(paths.slice(0, firstIneligible).every((p) => p.isEligible)).toBe(true);
  });

  it('offers MRA+10, postponement and deferral to someone at MRA with 15 years', () => {
    const eligible = evaluateAllRetirementPaths({ separationAge: 57, yearsOfService: 15, mra: 57 })
      .filter((p) => p.isEligible)
      .map((p) => p.path);

    expect(eligible).toContain(RETIREMENT_PATHS.MRA10_IMMEDIATE);
    expect(eligible).toContain(RETIREMENT_PATHS.MRA10_POSTPONED);
    expect(eligible).toContain(RETIREMENT_PATHS.DEFERRED);
    expect(eligible).not.toContain(RETIREMENT_PATHS.IMMEDIATE_UNREDUCED);
  });

  it('offers only deferral to someone who leaves young', () => {
    const eligible = evaluateAllRetirementPaths({ separationAge: 40, yearsOfService: 12, mra: 57 })
      .filter((p) => p.isEligible)
      .map((p) => p.path);
    expect(eligible).toEqual([RETIREMENT_PATHS.DEFERRED]);
  });
});
