import { describe, expect, it } from 'vitest';
import {
  ENHANCED_MULTIPLIER,
  SPECIAL_PROVISION_TYPES,
  calculateSpecialProvisionAnnuity,
  evaluateSpecialProvisionEligibility,
  evaluateSpecialProvisionRetirement,
  getMandatoryRetirementAge,
} from '../specialProvisions';
import { FEHB_OUTCOMES, evaluateFehbContinuation, meetsFiveYearRule } from '../fehb';

describe('special provision computation', () => {
  // OPM: "1.7% of your high-3 multiplied by your years of service which do not
  // exceed 20, PLUS 1% of your high-3 multiplied by your service exceeding 20."
  it('pays 1.7% on the first 20 years and 1% beyond', () => {
    const r = calculateSpecialProvisionAnnuity({ high3Salary: 100000, totalYearsOfService: 25 });
    expect(r.enhancedPortion).toBeCloseTo(34000, 6); // 100k x 20 x 1.7%
    expect(r.standardPortion).toBeCloseTo(5000, 6); // 100k x 5 x 1%
    expect(r.annualPension).toBeCloseTo(39000, 6);
  });

  it('caps the enhanced rate at 20 years', () => {
    const r = calculateSpecialProvisionAnnuity({ high3Salary: 100000, totalYearsOfService: 35 });
    expect(r.enhancedYears).toBe(20);
    expect(r.standardYears).toBe(15);
  });

  it('applies the enhanced rate to everything below 20 years', () => {
    const r = calculateSpecialProvisionAnnuity({ high3Salary: 100000, totalYearsOfService: 12 });
    expect(r.enhancedYears).toBe(12);
    expect(r.standardYears).toBe(0);
    expect(r.annualPension).toBeCloseTo(100000 * 12 * ENHANCED_MULTIPLIER, 6);
  });

  // Twenty years is worth 34% of high-3 rather than 20% — the reason this group
  // can retire so much earlier.
  it('is worth substantially more than ordinary FERS', () => {
    const r = calculateSpecialProvisionAnnuity({ high3Salary: 100000, totalYearsOfService: 20 });
    expect(r.annualPension).toBeCloseTo(34000, 6);
    expect(r.standardFersEquivalent).toBeCloseTo(20000, 6);
    expect(r.effectiveMultiplier).toBeCloseTo(0.017, 6);
  });
});

describe('special provision eligibility', () => {
  it('opens at 50 with 20 years of covered service', () => {
    const r = evaluateSpecialProvisionEligibility({ age: 50, coveredYears: 20 });
    expect(r.isEligible).toBe(true);
    expect(r.qualifiesUnder).toBe('age_50_with_20');
  });

  it('opens at any age with 25 years of covered service', () => {
    const r = evaluateSpecialProvisionEligibility({ age: 46, coveredYears: 25 });
    expect(r.isEligible).toBe(true);
    expect(r.qualifiesUnder).toBe('any_age_with_25');
  });

  it('refuses 49 with 20 years', () => {
    expect(evaluateSpecialProvisionEligibility({ age: 49, coveredYears: 20 }).isEligible).toBe(false);
  });

  // Retirement is not always a choice for this group.
  it('separates controllers at 56 and everyone else at 57', () => {
    expect(getMandatoryRetirementAge(SPECIAL_PROVISION_TYPES.AIR_TRAFFIC_CONTROLLER)).toBe(56);
    expect(getMandatoryRetirementAge(SPECIAL_PROVISION_TYPES.LAW_ENFORCEMENT)).toBe(57);
    expect(getMandatoryRetirementAge(SPECIAL_PROVISION_TYPES.FIREFIGHTER)).toBe(57);
  });

  it('counts down to mandatory separation', () => {
    const r = evaluateSpecialProvisionEligibility({
      age: 52,
      coveredYears: 22,
      type: SPECIAL_PROVISION_TYPES.AIR_TRAFFIC_CONTROLLER,
    });
    expect(r.yearsUntilMandatory).toBe(4);
    expect(r.isPastMandatoryAge).toBe(false);
  });
});

describe('the full special provision picture', () => {
  const base = { age: 50, coveredYears: 20, totalYearsOfService: 20, high3Salary: 120000, mra: 57 };

  it('pays COLA immediately rather than waiting for 62', () => {
    expect(evaluateSpecialProvisionRetirement(base).receivesColaImmediately).toBe(true);
  });

  // The exemption most easily missed: a second career straight after retiring
  // does not touch the supplement until MRA.
  it('exempts the supplement from the earnings test until MRA', () => {
    expect(evaluateSpecialProvisionRetirement(base).supplementExemptFromEarningsTestUntilMra).toBe(true);
    expect(
      evaluateSpecialProvisionRetirement({ ...base, age: 58 }).supplementExemptFromEarningsTestUntilMra
    ).toBe(false);
  });

  it('quantifies the advantage over ordinary FERS', () => {
    expect(evaluateSpecialProvisionRetirement(base).annuityAdvantage).toBeCloseTo(120000 * 20 * 0.007, 4);
  });
});

describe('the FEHB five-year rule', () => {
  it('needs five years, or enrolment since the first opportunity', () => {
    expect(meetsFiveYearRule({ yearsEnrolled: 5 })).toBe(true);
    expect(meetsFiveYearRule({ yearsEnrolled: 4.9 })).toBe(false);
    expect(meetsFiveYearRule({ yearsEnrolled: 2, enrolledSinceFirstOpportunity: true })).toBe(true);
  });

  it('counts TRICARE toward the five years', () => {
    expect(meetsFiveYearRule({ yearsEnrolled: 2, tricareYears: 4 })).toBe(true);
  });

  it('continues coverage on an ordinary immediate retirement', () => {
    const r = evaluateFehbContinuation({ yearsEnrolled: 10 });
    expect(r.outcome).toBe(FEHB_OUTCOMES.CONTINUES);
    expect(r.continues).toBe(true);
  });

  // The most expensive fact in the module: deferring ends coverage regardless
  // of how long you were enrolled, and it cannot be bought back.
  it('ends coverage permanently on a deferred annuity, five years or not', () => {
    const r = evaluateFehbContinuation({ yearsEnrolled: 25, isDeferred: true });
    expect(r.outcome).toBe(FEHB_OUTCOMES.LOST_PERMANENTLY);
    expect(r.continues).toBe(false);
    expect(r.meetsFiveYearRule).toBe(true); // met, and still lost
    expect(r.message).toMatch(/cannot be reinstated/i);
  });

  it('suspends and reinstates on a postponed annuity', () => {
    const r = evaluateFehbContinuation({ yearsEnrolled: 10, isPostponed: true, annuityStartAge: 62 });
    expect(r.outcome).toBe(FEHB_OUTCOMES.SUSPENDED_THEN_REINSTATED);
    expect(r.continues).toBe(true);
    expect(r.message).toMatch(/62/);
  });

  it('says how much longer someone short of five years needs', () => {
    const r = evaluateFehbContinuation({ yearsEnrolled: 3.5 });
    expect(r.outcome).toBe(FEHB_OUTCOMES.NOT_ENROLLED_LONG_ENOUGH);
    expect(r.yearsShort).toBeCloseTo(1.5, 6);
    expect(r.message).toMatch(/1\.5 years short/);
  });

  // Postponing versus deferring is the same separation with opposite outcomes,
  // which is exactly why they are modelled apart.
  it('separates postponing from deferring', () => {
    const postponed = evaluateFehbContinuation({ yearsEnrolled: 10, isPostponed: true });
    const deferred = evaluateFehbContinuation({ yearsEnrolled: 10, isDeferred: true });
    expect(postponed.continues).toBe(true);
    expect(deferred.continues).toBe(false);
  });
});
