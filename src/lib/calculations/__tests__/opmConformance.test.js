import { describe, expect, it } from 'vitest';
import {
  SURVIVOR_ELECTIONS,
  calculateFersMultiplier,
  calculateMra10ReductionPercent,
  calculateSurvivorBenefit,
  convertSickLeaveHoursToServiceYears,
} from '../fers';
import { applySrsEarningsTest, calculateSrsMonthly, evaluateSrsEligibility } from '../srs';

/**
 * Conformance against OPM's published rules, quoted inline.
 *
 * The free tier promises a correct answer, and people now pay for the tier above
 * it. These tests exist so that promise is checked by CI rather than resting on
 * one reading of the regulations on one afternoon. Each quote is the wording
 * that justifies the assertion beneath it; if OPM changes a rule, the quote is
 * where to start.
 *
 * Verified 2026-09-03 against the pages below. Where a rule could not be
 * confirmed from them, the test says so rather than implying it was.
 *
 * Sources:
 *   https://www.opm.gov/retirement-center/fers-information/computation/
 *   https://www.opm.gov/retirement-center/fers-information/types-of-retirement/
 *   https://www.opm.gov/retirement-center/fers-information/creditable-service/
 */

describe('OPM: FERS basic annuity formula', () => {
  // "Under Age 62 at Separation for Retirement, OR Age 62 or Older With Less
  //  Than 20 Years of Service — 1 percent of your high-3 average salary for each
  //  year of service. Age 62 or Older at Separation With 20 or More Years of
  //  Service — 1.1 percent."
  it('applies 1.1% only at 62 or older with 20 or more years', () => {
    expect(calculateFersMultiplier({ retirementAge: 62, totalYearsOfService: 20 })).toBeCloseTo(0.011, 6);
    expect(calculateFersMultiplier({ retirementAge: 65, totalYearsOfService: 25 })).toBeCloseTo(0.011, 6);
  });

  it('applies 1% below 62 regardless of service length', () => {
    expect(calculateFersMultiplier({ retirementAge: 61, totalYearsOfService: 30 })).toBeCloseTo(0.01, 6);
    expect(calculateFersMultiplier({ retirementAge: 57, totalYearsOfService: 40 })).toBeCloseTo(0.01, 6);
  });

  it('applies 1% at 62 or older with fewer than 20 years', () => {
    expect(calculateFersMultiplier({ retirementAge: 62, totalYearsOfService: 19 })).toBeCloseTo(0.01, 6);
  });
});

describe('OPM: MRA+10 age reduction', () => {
  // "your benefit will be reduced by 5/12 of 1% for each full month (5% per
  //  year) that you were under age 62 on the date your annuity began."
  it('reduces 5% for each year under 62', () => {
    expect(calculateMra10ReductionPercent({ annuityStartAge: 57, mra: 57 })).toBeCloseTo(25, 6);
    expect(calculateMra10ReductionPercent({ annuityStartAge: 60, mra: 57 })).toBeCloseTo(10, 6);
    expect(calculateMra10ReductionPercent({ annuityStartAge: 62, mra: 57 })).toBeCloseTo(0, 6);
  });
});

describe('OPM: survivor annuity elections', () => {
  // "If the total of the survivor benefit(s) you elect equals 50% of your
  //  benefit, your annuity is reduced by 10%. If the total equals 25%, the
  //  reduction is 5%."
  it('charges 10% for a 50% survivor benefit', () => {
    const r = calculateSurvivorBenefit({
      annualPensionBeforeSurvivorReduction: 40000,
      election: SURVIVOR_ELECTIONS.FULL,
    });
    expect(r.reductionPercent).toBe(10);
    expect(r.survivorPercent).toBe(50);
    expect(r.annualPensionAfterReduction).toBeCloseTo(36000, 6);
    expect(r.survivorAnnualBenefit).toBeCloseTo(20000, 6);
  });

  it('charges 5% for a 25% survivor benefit', () => {
    const r = calculateSurvivorBenefit({
      annualPensionBeforeSurvivorReduction: 40000,
      election: SURVIVOR_ELECTIONS.PARTIAL,
    });
    expect(r.reductionPercent).toBe(5);
    expect(r.survivorPercent).toBe(25);
    expect(r.survivorAnnualBenefit).toBeCloseTo(10000, 6);
  });
});

describe('OPM: unused sick leave', () => {
  // "Unused Sick Leave under FERS can be used to increase an individual's total
  //  creditable service for annuity computation purposes only"
  //
  // The "computation purposes only" half is asserted in fers.test.js, where the
  // annuity rises while eligibility service does not.
  //
  // CAVEAT, deliberately recorded: the 2,087-hour rate is NOT stated on the OPM
  // pages cited above. It is the statutory federal work year and is the basis of
  // OPM's sick leave conversion chart, but it was not confirmed from OPM in the
  // same pass as the rules around it. Two known differences from OPM's actual
  // method: OPM credits whole months and days from a chart rather than dividing
  // linearly, so results can differ by a few days of service.
  it('converts at the 2,087-hour federal work year', () => {
    expect(convertSickLeaveHoursToServiceYears(2087)).toBeCloseTo(1, 6);
    expect(convertSickLeaveHoursToServiceYears(4174)).toBeCloseTo(2, 6);
  });
});

describe('OPM: annuity supplement eligibility', () => {
  // "If you retire voluntarily on an immediate annuity which is not reduced for
  //  age, you may be eligible for an annuity supplement."
  it('allows an immediate unreduced annuity', () => {
    expect(evaluateSrsEligibility({ retirementAge: 57, creditableYearsOfService: 30, mra: 57 }).isEligible).toBe(true);
    expect(evaluateSrsEligibility({ retirementAge: 60, creditableYearsOfService: 20 }).isEligible).toBe(true);
  });

  // "If you receive a deferred benefit, a disability benefit or an immediate
  //  MRA+10 benefit, you will not be eligible for the annuity supplement."
  it('excludes an immediate MRA+10 benefit', () => {
    expect(evaluateSrsEligibility({ retirementAge: 57, creditableYearsOfService: 10, mra: 57 }).isEligible).toBe(false);
  });

  it('excludes a deferred benefit', () => {
    expect(
      evaluateSrsEligibility({ retirementAge: 57, creditableYearsOfService: 30, isDeferredOrPostponed: true }).isEligible
    ).toBe(false);
  });

  // "You may also receive the supplement if you retired involuntarily before
  //  attaining your MRA or voluntarily because of a major reorganization,
  //  reduction in force… However, in these three instances, you will not be
  //  eligible for the annuity supplement until you reach your MRA."
  it('allows an early-out but withholds payment until MRA', () => {
    const vera = evaluateSrsEligibility({
      retirementAge: 50,
      creditableYearsOfService: 25,
      mra: 57,
      isVoluntaryEarlyRetirement: true,
    });
    expect(vera.isEligible).toBe(true);
    expect(vera.isPayableNow).toBe(false);
    expect(vera.payableFromAge).toBe(57);
  });

  // "Eligibility for the annuity supplement continues until… the last day of the
  //  month in which you reach age 62."
  it('does not apply from age 62', () => {
    expect(evaluateSrsEligibility({ retirementAge: 62, creditableYearsOfService: 30 }).isEligible).toBe(false);
  });
});

describe('OPM: annuity supplement computation', () => {
  // OPM's own worked example, quoted verbatim:
  // "if your estimated full career Social Security benefit would be $1,000 and
  //  you had worked 30 years under FERS, OPM would divide 30 by 40 (.75) and
  //  multiply ($1,000 x .75 = $750)."
  it('reproduces OPM published example: $1,000 and 30 years gives $750', () => {
    expect(calculateSrsMonthly({ socialSecurityAt62Monthly: 1000, civilianYearsOfService: 30 })).toBeCloseTo(750, 6);
  });

  it('divides by a 40-year full career', () => {
    expect(calculateSrsMonthly({ socialSecurityAt62Monthly: 2000, civilianYearsOfService: 40 })).toBeCloseTo(2000, 6);
    expect(calculateSrsMonthly({ socialSecurityAt62Monthly: 2000, civilianYearsOfService: 20 })).toBeCloseTo(1000, 6);
  });
});

describe('OPM: annuity supplement earnings test', () => {
  // "The supplement is reduced by $1.00 for every $2.00 of earnings over" the
  // Social Security exempt amount.
  it('withholds one dollar for every two earned above the exempt amount', () => {
    const r = applySrsEarningsTest({ srsAnnual: 9000, annualEarnedIncome: 34480, exemptAmount: 24480 });
    expect(r.withheld).toBeCloseTo(5000, 6);
    expect(r.srsAnnualAfterTest).toBeCloseTo(4000, 6);
  });

  it('withholds nothing at or below the exempt amount', () => {
    expect(applySrsEarningsTest({ srsAnnual: 9000, annualEarnedIncome: 24480, exemptAmount: 24480 }).withheld).toBe(0);
  });
});
