import { describe, expect, it } from 'vitest';
import {
  calculateSeppAnnualPayment,
  describeTspAccess,
  isConversionSeasoned,
  isRothQualified,
  isTraditionalPenaltyFree,
  seppEndAge,
  traditionalPenaltyFreeAge,
} from '../tspAccess';

describe('the separation-year rule', () => {
  it('separating at 55 or later opens Traditional TSP immediately', () => {
    expect(traditionalPenaltyFreeAge({ separationAge: 55 })).toBe(55);
    expect(traditionalPenaltyFreeAge({ separationAge: 57 })).toBe(57);
  });

  it('separating before 55 waits for 59½', () => {
    expect(traditionalPenaltyFreeAge({ separationAge: 54 })).toBe(59.5);
    expect(traditionalPenaltyFreeAge({ separationAge: 45 })).toBe(59.5);
  });

  it('public safety employees use 50', () => {
    expect(traditionalPenaltyFreeAge({ separationAge: 50, isSpecialProvision: true })).toBe(50);
    expect(traditionalPenaltyFreeAge({ separationAge: 49, isSpecialProvision: true })).toBe(59.5);
  });

  it('a running 72(t) schedule makes any age penalty-free', () => {
    expect(isTraditionalPenaltyFree({ age: 47, separationAge: 45 })).toBe(false);
    expect(isTraditionalPenaltyFree({ age: 47, separationAge: 45, seppActive: true })).toBe(true);
  });
});

describe('Roth rules', () => {
  it('earnings are qualified at 59½ with five years since the first contribution', () => {
    expect(isRothQualified({ age: 59, firstRothContributionAge: 40 })).toBe(false);
    expect(isRothQualified({ age: 60, firstRothContributionAge: 57 })).toBe(false);
    expect(isRothQualified({ age: 62, firstRothContributionAge: 57 })).toBe(true);
  });

  it('a conversion seasons after five years, or at 59½', () => {
    expect(isConversionSeasoned({ age: 49, conversionAge: 45 })).toBe(false);
    expect(isConversionSeasoned({ age: 50, conversionAge: 45 })).toBe(true);
    expect(isConversionSeasoned({ age: 60, conversionAge: 58 })).toBe(true);
  });
});

describe('72(t)', () => {
  it('runs for the longer of five years or until 59½', () => {
    expect(seppEndAge({ startAge: 50 })).toBe(59.5);
    expect(seppEndAge({ startAge: 57 })).toBe(62);
  });

  it('amortizes the balance over single life expectancy', () => {
    // $500,000 at 50 (36.2 years) at 5%: 500000 × 0.05 / (1 − 1.05^-36.2) ≈ 30,170
    const payment = calculateSeppAnnualPayment({ balance: 500000, startAge: 50, interestRate: 0.05 });
    expect(payment).toBeGreaterThan(29500);
    expect(payment).toBeLessThan(30800);
    expect(calculateSeppAnnualPayment({ balance: 0, startAge: 50 })).toBe(0);
  });
});

describe('describeTspAccess', () => {
  it('reports the penalty gap for an early leaver', () => {
    const d = describeTspAccess({ separationAge: 45 });
    expect(d.traditionalPenaltyFreeAge).toBe(59.5);
    expect(d.penaltyGapYears).toBe(14.5);
    expect(d.seppAvailable).toBe(true);
    expect(d.usesSeparationYearRule).toBe(false);
  });

  it('reports no gap at 55', () => {
    const d = describeTspAccess({ separationAge: 55 });
    expect(d.penaltyGapYears).toBe(0);
    expect(d.usesSeparationYearRule).toBe(true);
    expect(d.seppAvailable).toBe(false);
  });
});
