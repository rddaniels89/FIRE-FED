/**
 * FERS Special Retirement Supplement (SRS).
 *
 * Approximates the Social Security benefit earned during FERS service and is
 * paid between retirement and age 62 to employees who leave on an immediate,
 * unreduced annuity. For someone retiring at MRA+30 it is frequently
 * $1,000-$1,500 a month — large enough that omitting it materially misstates
 * whether an early retirement works.
 *
 * Sources:
 *   https://www.opm.gov/retirement-center/fers-information/types-of-retirement/
 *   CSRS/FERS Handbook, Chapter 51
 */

import { DEFAULT_MRA } from './fers';
import { CURRENT_PARAMETER_YEAR, getAnnualParameters } from './annualParameters';
import { calculateEarningsTestWithholding } from './ssaEarningsTest';

/** The supplement stops the month the retiree turns 62, claimed or not. */
export const SRS_END_AGE = 62;

/** OPM divides by 40 as the assumed full Social Security career. */
export const SRS_SERVICE_DIVISOR = 40;

/**
 * The supplement is subject to the same earnings test as Social Security, and
 * always the under-FRA case: it ends at 62 and full retirement age is 67, so a
 * supplement recipient can never be in their FRA year. The higher FRA-year
 * exempt amount and its $1-per-$3 ratio exist in ssaEarningsTest.js for
 * modelling Social Security itself, and are deliberately unreachable from here.
 */
export function getSrsEarningsTestExemptAmount(year = CURRENT_PARAMETER_YEAR) {
  return getAnnualParameters(year).ssaEarningsTest.underFraExemptAmount;
}

export const SRS_INELIGIBILITY_REASONS = Object.freeze({
  AGE_62_OR_OVER: 'age_62_or_over',
  NOT_IMMEDIATE_UNREDUCED: 'not_immediate_unreduced',
  DEFERRED_OR_POSTPONED: 'deferred_or_postponed',
});

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * The supplement is payable only on an immediate, unreduced annuity taken
 * before 62 — MRA+30 or age 60 with 20 years. It is explicitly NOT payable on
 * MRA+10 (which is reduced), on deferred retirement, or on postponed
 * retirement, and age 62+5 does not qualify because the supplement has already
 * ended by then.
 *
 * `creditableYearsOfService` must exclude unused sick leave: sick leave cannot
 * establish eligibility for anything.
 *
 * A VERA retiree qualifies but is not paid until reaching MRA, which
 * `isPayableNow` reflects separately from `isEligible`.
 */
export function evaluateSrsEligibility({
  retirementAge,
  creditableYearsOfService,
  mra = DEFAULT_MRA,
  isVoluntaryEarlyRetirement = false,
  isDeferredOrPostponed = false,
} = {}) {
  const age = toNumber(retirementAge);
  const years = toNumber(creditableYearsOfService);
  const mraAge = toNumber(mra, DEFAULT_MRA);

  const base = {
    isEligible: false,
    isPayableNow: false,
    payableFromAge: null,
    reason: null,
  };

  if (isDeferredOrPostponed) {
    return { ...base, reason: SRS_INELIGIBILITY_REASONS.DEFERRED_OR_POSTPONED };
  }

  if (age >= SRS_END_AGE) {
    return { ...base, reason: SRS_INELIGIBILITY_REASONS.AGE_62_OR_OVER };
  }

  // VERA is its own qualifying route; payment waits until MRA.
  if (isVoluntaryEarlyRetirement) {
    return {
      isEligible: true,
      isPayableNow: age >= mraAge,
      payableFromAge: Math.max(age, mraAge),
      reason: null,
    };
  }

  const immediateUnreduced = (age >= mraAge && years >= 30) || (age >= 60 && years >= 20);
  if (!immediateUnreduced) {
    return { ...base, reason: SRS_INELIGIBILITY_REASONS.NOT_IMMEDIATE_UNREDUCED };
  }

  return { isEligible: true, isPayableNow: true, payableFromAge: age, reason: null };
}

/**
 * OPM's estimate: the age-62 Social Security benefit, prorated by whole years
 * of civilian FERS service over 40.
 *
 * Only civilian service counts. Military service excluded even where a deposit
 * was paid, and unused sick leave never counts.
 */
export function calculateSrsMonthly({ socialSecurityAt62Monthly, civilianYearsOfService } = {}) {
  const ss = Math.max(0, toNumber(socialSecurityAt62Monthly));
  const rawYears = Math.max(0, toNumber(civilianYearsOfService));
  // OPM rounds service to the nearest whole year for this computation.
  const years = Math.round(rawYears);

  if (ss <= 0 || years <= 0) return 0;
  return (ss * years) / SRS_SERVICE_DIVISOR;
}

/**
 * The supplement is subject to the Social Security annual earnings test.
 *
 * Simplified against OPM's actual timing: OPM surveys earnings annually and
 * applies the reduction the following year, and the test does not apply before
 * the retiree reaches MRA. Callers decide when to apply it; this computes the
 * amount.
 */
export function applySrsEarningsTest({
  srsAnnual,
  annualEarnedIncome,
  exemptAmount,
  year = CURRENT_PARAMETER_YEAR,
} = {}) {
  const gross = Math.max(0, toNumber(srsAnnual));

  const result = calculateEarningsTestWithholding({
    benefitAnnual: gross,
    earnedIncome: annualEarnedIncome,
    reachesFraThisYear: false,
    year,
    exemptAmount,
  });

  return {
    srsAnnualBeforeTest: gross,
    excessEarnings: result.excessEarnings,
    withheld: result.withheld,
    srsAnnualAfterTest: result.benefitAfterTest,
    exemptAmount: result.exemptAmount,
    withholdingDivisor: result.withholdingDivisor,
    isFullyOffset: result.isFullyOffset,
    parameterYear: result.parameterYear,
    usesExactYearParameters: result.usesExactYearParameters,
  };
}

/**
 * Full picture for one retirement scenario: eligibility, monthly amount, the
 * earnings test, and the years over which it is paid.
 */
export function calculateSrs({
  retirementAge,
  creditableYearsOfService,
  socialSecurityAt62Monthly,
  mra = DEFAULT_MRA,
  isVoluntaryEarlyRetirement = false,
  isDeferredOrPostponed = false,
  annualEarnedIncome = 0,
  exemptAmount,
  year = CURRENT_PARAMETER_YEAR,
} = {}) {
  const eligibility = evaluateSrsEligibility({
    retirementAge,
    creditableYearsOfService,
    mra,
    isVoluntaryEarlyRetirement,
    isDeferredOrPostponed,
  });

  if (!eligibility.isEligible) {
    return {
      ...eligibility,
      monthlyBeforeEarningsTest: 0,
      monthlyAfterEarningsTest: 0,
      annualBeforeEarningsTest: 0,
      annualAfterEarningsTest: 0,
      earningsTest: null,
      yearsPayable: 0,
      lifetimeTotal: 0,
    };
  }

  const monthly = calculateSrsMonthly({
    socialSecurityAt62Monthly,
    civilianYearsOfService: creditableYearsOfService,
  });
  const annual = monthly * 12;

  const earningsTest = applySrsEarningsTest({
    srsAnnual: annual,
    annualEarnedIncome,
    exemptAmount,
    year,
  });

  const startAge = eligibility.payableFromAge ?? toNumber(retirementAge);
  const yearsPayable = Math.max(0, SRS_END_AGE - startAge);

  return {
    ...eligibility,
    monthlyBeforeEarningsTest: monthly,
    monthlyAfterEarningsTest: earningsTest.srsAnnualAfterTest / 12,
    annualBeforeEarningsTest: annual,
    annualAfterEarningsTest: earningsTest.srsAnnualAfterTest,
    earningsTest,
    yearsPayable,
    lifetimeTotal: earningsTest.srsAnnualAfterTest * yearsPayable,
  };
}
