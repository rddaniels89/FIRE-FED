/**
 * Differential test: FireFed against the IRS and the Social Security
 * Administration, using their own published worksheets and tables.
 *
 * The companion to `calculations/__tests__/opmDifferential.test.js`, which does
 * the same against OPM. Every expected value here comes from a primary source,
 * not from what FireFed happens to produce. Where they disagree, the source
 * wins.
 *
 * Sources, fetched and read on 2026-09-07:
 *   IRS Publication 915 (2025), "Social Security and Equivalent Railroad
 *     Retirement Benefits", Worksheet 1 and its two filled-in examples
 *     https://www.irs.gov/pub/irs-pdf/p915.pdf
 *   SSA, "Starting Your Retirement Benefits Early" — the full retirement age
 *     table with the reduction at 62 for each cohort
 *     https://www.ssa.gov/benefits/retirement/planner/agereduction.html
 *   SSA Office of the Chief Actuary, "Early or Late Retirement?" — the
 *     5/9 and 5/12 of one percent rules and the delayed retirement credit table
 *     https://www.ssa.gov/oact/quickcalc/early_late.html
 *   IRS Notice 2022-6, substantially equal periodic payments
 *     https://www.irs.gov/pub/irs-drop/n-22-06.pdf
 *
 * The Social Security taxation thresholds are statutory and not indexed, so the
 * 2025 publication states the same figures that apply for 2026.
 */

import { describe, expect, it } from 'vitest';
import { calculateTaxableSocialSecurity } from '../socialSecurityTaxation';
import {
  claimingAdjustmentFactor,
  fullRetirementAge,
  DELAYED_CREDIT_RATE_PER_MONTH,
  delayedCreditAnnualRate,
  EARLY_REDUCTION_RATE_BEYOND_36,
  EARLY_REDUCTION_RATE_FIRST_36,
} from '../../calculations/socialSecurity';
import { calculateSeppAnnualPayment } from '../../calculations/tspAccess';

describe('IRS Publication 915: taxable Social Security', () => {
  // Filled-in Worksheet 1, Example 1. A single filer with $5,980 of benefits in
  // box 5 and $28,990 of other taxable income works the sheet to line 19 and
  // enters $2,990 of taxable benefits.
  it('reproduces Worksheet 1 Example 1 exactly', () => {
    const r = calculateTaxableSocialSecurity({
      filingStatus: 'single',
      otherIncome: 28990,
      socialSecurityBenefits: 5980,
    });
    // Line 6: half the benefits plus other income.
    expect(r.provisionalIncome).toBeCloseTo(31980, 6);
    // Line 19.
    expect(r.taxablePortion).toBeCloseTo(2990, 6);
  });

  // Example 2: Casey and Pat, filing jointly. A $15,500 pension, $14,000 of
  // wages and $250 of interest is $29,750 on line 3, less a $1,000 deductible
  // IRA payment on line 7, against $5,600 of benefits. The publication states
  // the outcome in words: "They find none of Casey's social security benefits
  // are taxable."
  it('reproduces Worksheet 1 Example 2 exactly', () => {
    const r = calculateTaxableSocialSecurity({
      filingStatus: 'married_joint',
      otherIncome: 29750 - 1000,
      socialSecurityBenefits: 5600,
    });
    expect(r.provisionalIncome).toBeCloseTo(31550, 6);
    expect(r.taxablePortion).toBe(0);
  });

  // Worksheet 1 line 9: $32,000 married filing jointly, $25,000 otherwise.
  it('uses the statutory base amounts', () => {
    const justUnder = calculateTaxableSocialSecurity({
      filingStatus: 'single',
      otherIncome: 22000,
      socialSecurityBenefits: 6000,
    });
    expect(justUnder.provisionalIncome).toBeCloseTo(25000, 6);
    expect(justUnder.taxablePortion).toBe(0);

    const jointJustUnder = calculateTaxableSocialSecurity({
      filingStatus: 'married_joint',
      otherIncome: 29000,
      socialSecurityBenefits: 6000,
    });
    expect(jointJustUnder.provisionalIncome).toBeCloseTo(32000, 6);
    expect(jointJustUnder.taxablePortion).toBe(0);
  });

  // Worksheet 1 line 11: $12,000 married filing jointly, $9,000 otherwise.
  // These are the second-tier widths, i.e. $34,000 - $25,000 and
  // $44,000 - $32,000.
  it('uses the statutory second-tier widths', () => {
    // A single filer exactly at the top of the first tier: provisional income
    // $34,000 is $9,000 above the base, so the whole of it is first-tier.
    const r = calculateTaxableSocialSecurity({
      filingStatus: 'single',
      otherIncome: 24000,
      socialSecurityBenefits: 20000,
    });
    expect(r.provisionalIncome).toBeCloseTo(34000, 6);
    // Line 13 is min(9,000, 9,000); line 14 halves it; line 15 takes the
    // smaller of that and half the benefits.
    expect(r.taxablePortion).toBeCloseTo(4500, 6);
  });

  // Worksheet 1 line 19 takes the smaller of line 17 and line 18, and line 18
  // is 85% of the benefits. The taxable portion can never exceed it.
  it('never exceeds 85% of benefits', () => {
    const r = calculateTaxableSocialSecurity({
      filingStatus: 'single',
      otherIncome: 500000,
      socialSecurityBenefits: 40000,
    });
    expect(r.taxablePortion).toBeCloseTo(34000, 6);
    expect(r.taxablePercent).toBeCloseTo(0.85, 6);
  });

  // Worksheet 1, the note under line 9: someone married filing separately who
  // lived with their spouse skips to 85% of line 8 with no base amount at all.
  it('gives a married-separate filer who lived with their spouse no base amount', () => {
    const r = calculateTaxableSocialSecurity({
      filingStatus: 'married_separate',
      otherIncome: 10000,
      socialSecurityBenefits: 10000,
    });
    expect(r.taxablePortion).toBeGreaterThan(0);
  });
});

describe('SSA: full retirement age and the reduction at 62', () => {
  // https://www.ssa.gov/benefits/retirement/planner/agereduction.html
  // Columns: birth year, FRA in months, months between 62 and FRA, and what a
  // $1,000 benefit is reduced to at 62. SSA rounds the dollar figure down.
  const table = [
    [1954, 66 * 12, 48, 750],
    [1955, 66 * 12 + 2, 50, 741],
    [1956, 66 * 12 + 4, 52, 733],
    [1957, 66 * 12 + 6, 54, 725],
    [1958, 66 * 12 + 8, 56, 716],
    [1959, 66 * 12 + 10, 58, 708],
    [1960, 67 * 12, 60, 700],
  ];

  it.each(table)(
    'born %i: FRA is %i months, %i months early, $1,000 becomes $%i',
    (birthYear, fraMonths, monthsEarly, reducedTo) => {
      const fra = fullRetirementAge({ birthYear });
      expect(fra.totalMonths).toBe(fraMonths);
      expect(fraMonths - 62 * 12).toBe(monthsEarly);

      const factor = claimingAdjustmentFactor({ claimAge: 62, birthYear });
      expect(Math.floor(1000 * factor)).toBe(reducedTo);
    }
  );

  // https://www.ssa.gov/oact/quickcalc/early_late.html : "a benefit is reduced
  // 5/9 of one percent for each month before normal retirement age, up to 36
  // months. If the number of months exceeds 36, then the benefit is further
  // reduced 5/12 of one percent per month."
  it('uses 5/9 of one percent for the first 36 months and 5/12 beyond', () => {
    expect(EARLY_REDUCTION_RATE_FIRST_36).toBeCloseTo(5 / 9 / 100, 12);
    expect(EARLY_REDUCTION_RATE_BEYOND_36).toBeCloseTo(5 / 12 / 100, 12);

    // SSA's own worked arithmetic: 36 months at 5/9 of 1% plus 24 months at
    // 5/12 of 1% is 20% + 10% = 30%.
    const factor = claimingAdjustmentFactor({ claimAge: 62, fra: 67 });
    expect(1 - factor).toBeCloseTo(0.3, 10);

    // Exactly 36 months early is 20%, with no second-tier reduction yet.
    expect(1 - claimingAdjustmentFactor({ claimAge: 64, fra: 67 })).toBeCloseTo(0.2, 10);
  });

  // The delayed retirement credit table: 8.0% a year for anyone born 1943 or
  // later, and "no credit is given after age 69", so it stops accruing at 70.
  it('credits 8% a year after full retirement age, stopping at 70', () => {
    expect(DELAYED_CREDIT_RATE_PER_MONTH * 12).toBeCloseTo(0.08, 10);

    // FRA 67 to 70 is three years of credit.
    expect(claimingAdjustmentFactor({ claimAge: 70, fra: 67 })).toBeCloseTo(1.24, 10);
    // FRA 66 to 70 is four years.
    expect(claimingAdjustmentFactor({ claimAge: 70, fra: 66 })).toBeCloseTo(1.32, 10);
    // Nothing accrues past 70.
    expect(claimingAdjustmentFactor({ claimAge: 71, fra: 67 })).toBeCloseTo(1.24, 10);
  });

  // The credit table itself: 3.0% a year for 1917-24 rising to 8.0% for 1943
  // and later. Nobody planning a federal retirement today falls outside the 8%
  // band, but a rate that is wrong for some inputs still has to be right.
  it.each([
    [1924, 0.03],
    [1930, 0.045],
    [1936, 0.06],
    [1942, 0.075],
    [1943, 0.08],
    [1960, 0.08],
  ])('born %i earns a delayed credit of %f a year', (birthYear, annualRate) => {
    expect(delayedCreditAnnualRate(birthYear)).toBeCloseTo(annualRate, 10);
  });

  it('applies the birth-year credit rate, not a flat 8%', () => {
    // Born 1930: FRA 65, so 60 months of credit at 4.5% a year, not 8%.
    expect(claimingAdjustmentFactor({ claimAge: 70, birthYear: 1930 })).toBeCloseTo(1.225, 10);
    // Born 1943: FRA 66, so 48 months at 8% a year.
    expect(claimingAdjustmentFactor({ claimAge: 70, birthYear: 1943 })).toBeCloseTo(1.32, 10);
  });

  it('pays exactly the primary amount at full retirement age', () => {
    expect(claimingAdjustmentFactor({ claimAge: 67, fra: 67 })).toBeCloseTo(1, 12);
    expect(claimingAdjustmentFactor({ claimAge: 66, fra: 66 })).toBeCloseTo(1, 12);
  });
});

describe('IRS Notice 2022-6: substantially equal periodic payments', () => {
  // The notice "modifies the existing minimum interest rate ... (which is 120%
  // of the federal mid-term rate) to add a 5% floor."
  it('defaults to the 5% floor', () => {
    const atFloor = calculateSeppAnnualPayment({ balance: 500000, startAge: 50, interestRate: 0.05 });
    const byDefault = calculateSeppAnnualPayment({ balance: 500000, startAge: 50 });
    expect(byDefault).toBeCloseTo(atFloor, 6);
  });

  // Amortising a balance over a life expectancy at a positive rate must pay
  // more than dividing by that life expectancy, which is the required minimum
  // distribution method the notice also permits.
  it('the amortization method pays more than dividing by life expectancy', () => {
    const amortised = calculateSeppAnnualPayment({ balance: 500000, startAge: 50, interestRate: 0.05 });
    const straightDivision = calculateSeppAnnualPayment({ balance: 500000, startAge: 50, interestRate: 0 });
    expect(amortised).toBeGreaterThan(straightDivision);
  });
});
