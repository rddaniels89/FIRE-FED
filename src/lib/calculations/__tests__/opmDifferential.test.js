/**
 * Differential test: FireFed against OPM's own published figures.
 *
 * Every expected value here is taken from a primary source, not from what
 * FireFed happens to produce. Where the two disagree, the source wins and the
 * test is written to fail until the code is corrected.
 *
 * Sources, all fetched and read on 2026-09-07:
 *   CSRS/FERS Handbook Chapter 50, "Computation of Annuity Under the General
 *     Formula" (173pp)
 *     https://www.opm.gov/retirement-center/publications-forms/csrsfers-handbook/c050.pdf
 *   CSRS/FERS Handbook Chapter 51, "Retiree Annuity Supplement" (40pp)
 *     https://www.opm.gov/retirement-center/publications-forms/csrsfers-handbook/c051.pdf
 *   OPM FERS eligibility / MRA table
 *     https://www.opm.gov/retirement-center/fers-information/eligibility/
 *
 * FERSGUIDE was the other intended comparator. Its calculator and guide sit
 * behind a paid membership, so it cannot be driven programmatically and is not
 * used here. OPM's handbook is the stronger authority in any case: it is the
 * document FERSGUIDE and every other tool are themselves working from.
 */

import { describe, expect, it } from 'vitest';
import {
  SICK_LEAVE_HOURS_PER_WORK_YEAR,
  calculateFersMultiplier,
  calculateMra10ReductionPercent,
  convertSickLeaveHoursToServiceYears,
} from '../fers';
import { birthYearFromAgeAndMonths, minimumRetirementAge, minimumRetirementAgeForCurrentAge } from '../mra';
import { calculateSrsMonthly, evaluateSrsEligibility } from '../srs';
import { calculateSpecialProvisionAnnuity } from '../specialProvisions';

describe('OPM Chapter 50: the general formula', () => {
  // "1.1 percent of the high-3 average pay x the total years and months of
  // creditable service under FERS" for employees age 62 with at least 20 years.
  it('applies 1.1% at 62 with 20 years, and 1% otherwise', () => {
    expect(calculateFersMultiplier({ retirementAge: 62, totalYearsOfService: 20 })).toBe(0.011);
    expect(calculateFersMultiplier({ retirementAge: 62, totalYearsOfService: 19.92 })).toBe(0.01);
    expect(calculateFersMultiplier({ retirementAge: 61, totalYearsOfService: 30 })).toBe(0.01);
  });

  // Chapter 50, Chart 7 is the 1.1% accrual factor table. A 20-year, 0-month
  // entry is 0.22 of high-3; 25 years is 0.275.
  it('reproduces Chart 7 factors', () => {
    const factorFor = (years) => calculateFersMultiplier({ retirementAge: 62, totalYearsOfService: years }) * years;
    expect(factorFor(20)).toBeCloseTo(0.22, 10);
    expect(factorFor(25)).toBeCloseTo(0.275, 10);
    // $100,000 high-3, 25 years, age 62 → $27,500.
    expect(100000 * factorFor(25)).toBeCloseTo(27500, 6);
  });

  // Chapter 50, NOTE 1 under the 1.1% rule: "The 1.1 percent formula does not
  // apply to individuals who are retiring under the special provisions for
  // Members of Congress, Congressional employees, military reserve
  // technicians, law enforcement officers, firefighters, or air traffic
  // controllers."
  it('never applies 1.1% to a special provision computation', () => {
    const a = calculateSpecialProvisionAnnuity({ high3Salary: 100000, totalYearsOfService: 25 });
    // 1.7% on the first 20 years, 1.0% beyond: 34,000 + 5,000 = 39,000.
    expect(a.annualPension).toBeCloseTo(39000, 6);
    // Not the 1.1% figure of 27,500, and not 1.1% layered on top.
    expect(a.annualPension).not.toBeCloseTo(27500, 0);
  });

  // Chapter 50, section 50A2.1-3F: "2,087 hours = 1 year". The worked example
  // is "2,000 hours of unused sick leave = 11 months and 15 days of service."
  it('converts unused sick leave at 2,087 hours to the year', () => {
    expect(SICK_LEAVE_HOURS_PER_WORK_YEAR).toBe(2087);
    expect(convertSickLeaveHoursToServiceYears(2087)).toBeCloseTo(1, 10);

    // 11 months and 15 days, on OPM's 30-day month, is 11.5 months.
    const years = convertSickLeaveHoursToServiceYears(2000);
    expect(years * 12).toBeCloseTo(11.5, 1);
  });

  // Chapter 50, Chart 8, the FERS 5% age reduction: 5/12 of one percent for
  // each full month under 62.
  it('reduces an MRA+10 annuity by 5/12 of 1% per month under 62', () => {
    expect(calculateMra10ReductionPercent({ annuityStartAge: 57, mra: 57 })).toBeCloseTo(25, 6);
    expect(calculateMra10ReductionPercent({ annuityStartAge: 61, mra: 57 })).toBeCloseTo(5, 6);
    expect(calculateMra10ReductionPercent({ annuityStartAge: 62, mra: 57 })).toBe(0);
  });
});

describe('OPM FERS eligibility: the minimum retirement age table', () => {
  // https://www.opm.gov/retirement-center/fers-information/eligibility/
  // Corroborated by Chapter 51 Example 3, where a retiree born 04-23-1965 has
  // an MRA of "56 and 2 months".
  const table = [
    [1947, 55],
    [1952, 55 + 10 / 12],
    [1953, 56],
    [1964, 56],
    [1965, 56 + 2 / 12],
    [1966, 56 + 4 / 12],
    [1967, 56 + 6 / 12],
    [1968, 56 + 8 / 12],
    [1969, 56 + 10 / 12],
    [1970, 57],
    [1985, 57],
  ];

  it.each(table)('birth year %i has an MRA of %f', (birthYear, expected) => {
    expect(minimumRetirementAge(birthYear)).toBeCloseTo(expected, 6);
  });

  it('matches Chapter 51 Example 3 exactly: born 1965, MRA 56 years 2 months', () => {
    expect(minimumRetirementAge(1965)).toBeCloseTo(56 + 2 / 12, 10);
  });

  // An age in whole years cannot settle the birth year, and the MRA is a
  // year-of-birth rule. Two people who are both "60" in September 2026 were
  // born in different years and have MRAs four months apart.
  it('separates two 60-year-olds that whole years cannot tell apart', () => {
    const asOfDate = new Date(2026, 8, 7);

    const birthdayPassed = birthYearFromAgeAndMonths({ currentAge: 60, currentAgeMonths: 4, asOfDate });
    const birthdayComing = birthYearFromAgeAndMonths({ currentAge: 60, currentAgeMonths: 11, asOfDate });
    expect(birthdayPassed).toBe(1966);
    expect(birthdayComing).toBe(1965);

    expect(minimumRetirementAgeForCurrentAge({ currentAge: 60, currentAgeMonths: 4, asOfDate })).toBeCloseTo(56 + 4 / 12, 10);
    expect(minimumRetirementAgeForCurrentAge({ currentAge: 60, currentAgeMonths: 11, asOfDate })).toBeCloseTo(56 + 2 / 12, 10);
  });

  // Both SSA and OPM count a 1 January birthday as the previous year. The day
  // is never collected, so the user declares it.
  it('honours a 1 January birthday by using the previous year', () => {
    const asOfDate = new Date(2026, 8, 7);
    // Born January 1970 would otherwise take the 1970-onward row of 57.
    expect(minimumRetirementAgeForCurrentAge({ currentAge: 56, currentAgeMonths: 8, asOfDate })).toBe(57);
    expect(
      minimumRetirementAgeForCurrentAge({ currentAge: 56, currentAgeMonths: 8, asOfDate, bornOnJanuaryFirst: true })
    ).toBeCloseTo(56 + 10 / 12, 10);
  });
});

describe('OPM Chapter 51: the retiree annuity supplement', () => {
  // The supplement approximates the FERS portion of a Social Security benefit.
  // OPM's published shorthand: benefit at 62 x years of FERS service / 40.
  it('prorates the age-62 benefit by service over 40', () => {
    // OPM's own illustration: $1,000 benefit, 30 years → $750.
    expect(calculateSrsMonthly({ socialSecurityAt62Monthly: 1000, civilianYearsOfService: 30 })).toBeCloseTo(750, 6);
    // 35 years on $15,000 a year → $13,125 a year.
    expect(calculateSrsMonthly({ socialSecurityAt62Monthly: 15000 / 12, civilianYearsOfService: 35 }) * 12).toBeCloseTo(13125, 4);
  });

  // Chapter 51, section 51A1.1: payable to those who retire before 62 on an
  // immediate annuity. Age 62 or over is never eligible.
  it('is not payable at or after 62', () => {
    expect(evaluateSrsEligibility({ retirementAge: 62, creditableYearsOfService: 30 }).isEligible).toBe(false);
    expect(evaluateSrsEligibility({ retirementAge: 57, creditableYearsOfService: 30 }).isEligible).toBe(true);
  });

  // Chapter 51 Example 3: Lawrence Kasdan, involuntarily separated at 55 years
  // 4 months under discontinued service retirement, "is not eligible to
  // receive the retiree annuity supplement until he attains his minimum
  // retirement age (56 and 2 months)."
  it('defers the supplement to MRA on a discontinued service retirement', () => {
    const mra = minimumRetirementAge(1965);
    const r = evaluateSrsEligibility({
      retirementAge: 55 + 4 / 12,
      creditableYearsOfService: 25,
      mra,
      isDiscontinuedService: true,
    });
    expect(r.isEligible).toBe(true);
    expect(r.isPayableNow).toBe(false);
    expect(r.payableFromAge).toBeCloseTo(mra, 6);
  });

  // Chapter 51 Example 3 (Bruce, firefighter): retired at 52 under the
  // firefighter provisions, "started receiving an annuity supplement
  // immediately. It was not subject to the earnings test until he reached his
  // MRA."
  it('pays a special provision retiree immediately, before MRA', () => {
    const r = evaluateSrsEligibility({
      retirementAge: 52,
      creditableYearsOfService: 25,
      mra: 57,
      isSpecialProvision: true,
    });
    expect(r.isEligible).toBe(true);
    expect(r.isPayableNow).toBe(true);
    expect(r.payableFromAge).toBeCloseTo(52, 6);
  });

  // Chapter 51: an early-out retiree qualifies but is not paid until MRA.
  it('defers the supplement to MRA on a voluntary early retirement', () => {
    const r = evaluateSrsEligibility({
      retirementAge: 52,
      creditableYearsOfService: 25,
      mra: 57,
      isVoluntaryEarlyRetirement: true,
    });
    expect(r.isEligible).toBe(true);
    expect(r.isPayableNow).toBe(false);
    expect(r.payableFromAge).toBe(57);
  });

  // Chapter 51: never payable on MRA+10, deferred or postponed retirement.
  it('is never payable on a reduced, deferred or postponed annuity', () => {
    expect(
      evaluateSrsEligibility({ retirementAge: 57, creditableYearsOfService: 15, mra: 57 }).isEligible
    ).toBe(false);
    expect(
      evaluateSrsEligibility({ retirementAge: 57, creditableYearsOfService: 30, mra: 57, isDeferredOrPostponed: true })
        .isEligible
    ).toBe(false);
  });
});
