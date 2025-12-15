import { describe, expect, it } from 'vitest';
import {
  calculateFersMultiplier,
  calculateFersResults,
  calculateMra10ReductionPercent,
  evaluateFersRegularEligibility,
  findEarliestFersImmediateRetirementAge,
} from '../fers';

describe('fers calculations', () => {
  it('uses 1.1% multiplier when age >= 62 and service >= 20', () => {
    const multiplier = calculateFersMultiplier({ retirementAge: 62, totalYearsOfService: 20 });
    expect(multiplier).toBeCloseTo(0.011, 6);
  });

  it('projects future service when includeFutureService is true', () => {
    const res = calculateFersResults({
      yearsOfService: 10,
      monthsOfService: 0,
      high3Salary: 100000,
      currentAge: 40,
      retirementAge: 60,
      showComparison: false,
      privateJobSalary: 0,
      privateJobYears: 0,
      includeFutureService: true,
    });
    expect(res.projectedYears).toBeCloseTo(30, 6);
    expect(res.stayFed.annualPension).toBeGreaterThan(0);
  });

  it('computes a simplified MRA+10 reduction percent for annuity start under 62', () => {
    const reductionAt57 = calculateMra10ReductionPercent({ annuityStartAge: 57, mra: 57 });
    expect(reductionAt57).toBeCloseTo(25, 6); // 5 years under 62
    const reductionAt62 = calculateMra10ReductionPercent({ annuityStartAge: 62, mra: 57 });
    expect(reductionAt62).toBeCloseTo(0, 6);
  });

  it('detects MRA+10 immediate eligibility when age >= MRA and service >= 10 (and not otherwise fully eligible)', () => {
    const res = evaluateFersRegularEligibility({ age: 57, totalYearsOfService: 10, mra: 57 });
    expect(res.isEligibleImmediate).toBe(true);
    expect(res.isEligibleImmediateMra10).toBe(true);
    expect(res.isEligibleImmediateUnreduced).toBe(false);
  });

  it('finds earliest immediate retirement age given current age + service projection', () => {
    const earliest = findEarliestFersImmediateRetirementAge({
      currentAge: 40,
      totalYearsOfService: 10,
      mra: 57,
      maxAgeToCheck: 70,
    });
    // 40 + 17 years => 57 age, 27 years service => not immediate (needs 30), but MRA+10 is eligible at 57.
    expect(earliest).toBe(57);
  });
});


