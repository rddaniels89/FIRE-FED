import { describe, expect, it } from 'vitest';
import {
  FERS_MINIMUM_CIVILIAN_YEARS,
  calculateFersResults,
  evaluateFersRegularEligibility,
  findEarliestFersImmediateRetirementAge,
} from '../fers';
import { RETIREMENT_PATHS, evaluateAllRetirementPaths, evaluateRetirementPath } from '../retirementPaths';
import { calculateSrs } from '../srs';

/**
 * Military service credited by a paid deposit is a third service bucket. These
 * tests pin what it may and may not do inside the FERS engine, independent of
 * how the plan resolves it (see projection/__tests__/militaryCredit.test.js).
 */

describe('eligibility: military credit opens doors but cannot vest', () => {
  it('counts toward MRA+30, 60/20, and 62/5', () => {
    expect(evaluateFersRegularEligibility({ age: 57, totalYearsOfService: 30, civilianYearsOfService: 26 }).isEligibleImmediateUnreduced).toBe(true);
    expect(evaluateFersRegularEligibility({ age: 60, totalYearsOfService: 20, civilianYearsOfService: 16 }).isEligibleImmediateUnreduced).toBe(true);
    expect(evaluateFersRegularEligibility({ age: 62, totalYearsOfService: 9, civilianYearsOfService: 5 }).isEligibleImmediateUnreduced).toBe(true);
    expect(evaluateFersRegularEligibility({ age: 57, totalYearsOfService: 12, civilianYearsOfService: 8 }).isEligibleImmediateMra10).toBe(true);
  });

  it('cannot supply the five civilian years, for any door including deferred', () => {
    expect(FERS_MINIMUM_CIVILIAN_YEARS).toBe(5);
    const r = evaluateFersRegularEligibility({ age: 62, totalYearsOfService: 14, civilianYearsOfService: 4 });
    expect(r.isEligibleImmediate).toBe(false);
    expect(r.isEligibleDeferred).toBe(false);
    expect(r.meetsCivilianMinimum).toBe(false);
    expect(r.messages[0]).toMatch(/5 years of civilian service/);
  });

  it('is unchanged for callers that never mention civilian service', () => {
    const before = evaluateFersRegularEligibility({ age: 62, totalYearsOfService: 6 });
    expect(before.isEligibleImmediateUnreduced).toBe(true);
    expect(before.civilianYearsOfService).toBe(6);
  });

  it('brings the earliest immediate age forward, with only the civilian years growing', () => {
    // 55 with 5 civilian years: 7 at 57 is short of MRA+10, which opens at 60 with 10.
    // Four credited military years make it 11 at 57, so MRA+10 opens at the MRA.
    expect(findEarliestFersImmediateRetirementAge({ currentAge: 55, totalYearsOfService: 5, mra: 57 })).toBe(60);
    expect(findEarliestFersImmediateRetirementAge({ currentAge: 55, totalYearsOfService: 5, militaryCreditYears: 4, mra: 57 })).toBe(57);
  });

  it('never lets the credit bring the earliest age before five civilian years exist', () => {
    // 61 with 1 civilian year reaches 5 at 65; ten military years do not change that.
    expect(findEarliestFersImmediateRetirementAge({ currentAge: 61, totalYearsOfService: 1, mra: 57 })).toBe(65);
    expect(findEarliestFersImmediateRetirementAge({ currentAge: 61, totalYearsOfService: 1, militaryCreditYears: 10, mra: 57 })).toBe(65);
  });
});

describe('retirement paths: the civilian minimum gates every door', () => {
  it('closes every path when civilian service is under five years, whatever the total', () => {
    const paths = evaluateAllRetirementPaths({ separationAge: 62, yearsOfService: 14, civilianYearsOfService: 4, mra: 57, isVeraOffered: true });
    for (const p of paths) {
      expect(p.isEligible, p.path).toBe(false);
      expect(p.reason).toMatch(/civilian service/);
    }
  });

  it('opens the unreduced door when the credit completes MRA+30', () => {
    const p = evaluateRetirementPath({ path: RETIREMENT_PATHS.IMMEDIATE_UNREDUCED, separationAge: 57, yearsOfService: 30, civilianYearsOfService: 26, mra: 57 });
    expect(p.isEligible).toBe(true);
    const without = evaluateRetirementPath({ path: RETIREMENT_PATHS.IMMEDIATE_UNREDUCED, separationAge: 57, yearsOfService: 26, civilianYearsOfService: 26, mra: 57 });
    expect(without.isEligible).toBe(false);
  });

  it('defaults the civilian figure to the total for existing callers', () => {
    expect(evaluateRetirementPath({ path: RETIREMENT_PATHS.DEFERRED, separationAge: 40, yearsOfService: 5 }).isEligible).toBe(true);
  });
});

describe('calculateFersResults: the three buckets', () => {
  const base = { yearsOfService: 17, monthsOfService: 0, high3Salary: 100000, currentAge: 62, retirementAge: 62, mra: 57 };

  it('case 21: credited military service can complete the 20 years behind 1.1% at 62', () => {
    const without = calculateFersResults(base);
    const withCredit = calculateFersResults({ ...base, militaryCreditYears: 4 });
    expect(without.stayFed.multiplier).toBe(0.01);
    expect(withCredit.stayFed.multiplier).toBe(0.011);
    expect(withCredit.service).toMatchObject({ civilianYears: 17, militaryCreditYears: 4, eligibilityYears: 21, computationYears: 21 });
    expect(withCredit.stayFed.annualPensionBeforeReductions).toBeCloseTo(100000 * 21 * 0.011, 6);
  });

  it('adds to the computation and to eligibility, but sick leave still adds only to the computation', () => {
    const r = calculateFersResults({ ...base, militaryCreditYears: 4, unusedSickLeaveHours: 2087 });
    expect(r.service.eligibilityYears).toBe(21);
    expect(r.service.computationYears).toBeCloseTo(22, 10);
    expect(r.stayFed.multiplier).toBe(0.011);
  });

  it('case 18: cannot make an annuity out of four civilian years', () => {
    const r = calculateFersResults({ ...base, yearsOfService: 4, militaryCreditYears: 10 });
    expect(r.stayFed.isEligible).toBe(false);
    expect(r.service.meetsCivilianMinimum).toBe(false);
    expect(r.stayFed.eligibilityMessage).toMatch(/civilian service/);
  });

  it('keeps the High-3 out of it: the input passes straight through', () => {
    const a = calculateFersResults({ ...base, militaryCreditYears: 0 });
    const b = calculateFersResults({ ...base, militaryCreditYears: 12 });
    // The pension ratio is exactly the service ratio at the same multiplier, so no High-3 effect hides in it.
    const ratio = b.stayFed.annualPensionBeforeReductions / a.stayFed.annualPensionBeforeReductions;
    expect(ratio).toBeCloseTo((29 * 0.011) / (17 * 0.01), 10);
  });

  it('is unchanged when the credit is omitted', () => {
    const r = calculateFersResults(base);
    expect(r.service.militaryCreditYears).toBe(0);
    expect(r.service.civilianYears).toBe(17);
    expect(r.service.eligibilityYears).toBe(17);
  });
});

describe('case 22: the supplement numerator is civilian service only', () => {
  it('uses the military years for eligibility and the civilian years for the amount', () => {
    const r = calculateSrs({ retirementAge: 57, creditableYearsOfService: 30, civilianYearsOfService: 26, socialSecurityAt62Monthly: 2000, mra: 57 });
    expect(r.isEligible).toBe(true);
    expect(r.monthlyBeforeEarningsTest).toBeCloseTo((2000 * 26) / 40, 10);
    const noCredit = calculateSrs({ retirementAge: 57, creditableYearsOfService: 26, civilianYearsOfService: 26, socialSecurityAt62Monthly: 2000, mra: 57 });
    expect(noCredit.isEligible).toBe(false);
  });

  it('defaults to the creditable figure when no civilian figure is given', () => {
    const r = calculateSrs({ retirementAge: 57, creditableYearsOfService: 30, socialSecurityAt62Monthly: 2000, mra: 57 });
    expect(r.monthlyBeforeEarningsTest).toBeCloseTo((2000 * 30) / 40, 10);
  });
});
