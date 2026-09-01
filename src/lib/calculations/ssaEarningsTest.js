/**
 * Social Security retirement earnings test.
 *
 * The withholding ratios here are stable rule logic; the dollar thresholds they
 * apply to are annual parameters and live in annualParameters.js.
 *
 * https://www.ssa.gov/oact/cola/rtea.html
 */

import { CURRENT_PARAMETER_YEAR, getAnnualParameters } from './annualParameters';

/** Under FRA for the whole year: $1 withheld for every $2 above the limit. */
export const WITHHOLDING_DIVISOR_UNDER_FRA = 2;

/** In the year FRA is reached: $1 withheld for every $3 above the higher limit. */
export const WITHHOLDING_DIVISOR_FRA_YEAR = 3;

export const EARNINGS_TEST_CASES = Object.freeze({
  UNDER_FRA_ALL_YEAR: 'under_fra_all_year',
  FRA_YEAR: 'fra_year',
  AT_OR_PAST_FRA: 'at_or_past_fra',
});

function toNonNegativeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Withholding for one year of benefits.
 *
 * `earnedIncome` is wages and self-employment income only — pensions, annuities,
 * investment income and TSP withdrawals are not counted by the test.
 *
 * For the FRA year, `earnedIncome` should be only the earnings BEFORE the month
 * FRA is reached; SSA disregards the rest. From the FRA month onward no test
 * applies at all, which is the AT_OR_PAST_FRA case.
 */
export function calculateEarningsTestWithholding({
  benefitAnnual,
  earnedIncome,
  reachesFraThisYear = false,
  isAtOrPastFra = false,
  year = CURRENT_PARAMETER_YEAR,
  exemptAmount,
} = {}) {
  const benefit = toNonNegativeNumber(benefitAnnual);
  const earnings = toNonNegativeNumber(earnedIncome);
  const params = getAnnualParameters(year);

  if (isAtOrPastFra) {
    return {
      case: EARNINGS_TEST_CASES.AT_OR_PAST_FRA,
      exemptAmount: null,
      withholdingDivisor: null,
      excessEarnings: 0,
      withheld: 0,
      benefitAfterTest: benefit,
      isFullyOffset: false,
      parameterYear: params.year,
      usesExactYearParameters: params.isExact,
    };
  }

  const testCase = reachesFraThisYear
    ? EARNINGS_TEST_CASES.FRA_YEAR
    : EARNINGS_TEST_CASES.UNDER_FRA_ALL_YEAR;

  const defaultExempt = reachesFraThisYear
    ? params.ssaEarningsTest.fraYearExemptAmount
    : params.ssaEarningsTest.underFraExemptAmount;

  const divisor = reachesFraThisYear
    ? WITHHOLDING_DIVISOR_FRA_YEAR
    : WITHHOLDING_DIVISOR_UNDER_FRA;

  const exempt = exemptAmount === undefined ? defaultExempt : toNonNegativeNumber(exemptAmount, 0);
  const excessEarnings = Math.max(0, earnings - exempt);
  const withheld = Math.min(benefit, excessEarnings / divisor);

  return {
    case: testCase,
    exemptAmount: exempt,
    withholdingDivisor: divisor,
    excessEarnings,
    withheld,
    benefitAfterTest: benefit - withheld,
    isFullyOffset: benefit > 0 && withheld >= benefit,
    parameterYear: params.year,
    usesExactYearParameters: params.isExact,
  };
}
