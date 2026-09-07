/**
 * Federal taxation of Social Security benefits — the IRC 86 "provisional
 * income" worksheet from IRS Publication 915.
 *
 * Provisional income = other income (AGI before benefits, plus tax-exempt
 * interest) + one half of the benefits. Then:
 *
 *   PI <= base threshold           nothing is taxable
 *   base < PI <= adjusted          lesser of 50% of the excess over base,
 *                                  or 50% of benefits
 *   PI > adjusted                  lesser of 85% of benefits, or
 *                                  85% of the excess over adjusted PLUS the
 *                                  lesser of the 50%-tier maximum or 50% of
 *                                  benefits
 *
 * The 50%-tier maximum is 50% x (adjusted - base): $4,500 single and $6,000
 * joint — the fixed amounts printed on the Pub 915 worksheet. They are derived
 * here rather than hard-coded so the married_separate case (both thresholds
 * zero) falls out of the same arithmetic.
 *
 * The thresholds are statutory and unindexed, so they live in
 * annualParameters.js only for consistency of access, not because they change.
 *
 * Sources:
 *   https://www.irs.gov/publications/p915
 *   https://www.law.cornell.edu/uscode/text/26/86
 */

import { CURRENT_PARAMETER_YEAR, getAnnualParameters } from '../calculations/annualParameters';

/** Share of benefits counted toward provisional income. */
export const PROVISIONAL_INCOME_BENEFIT_SHARE = 0.5;

/** First-tier inclusion rate. */
export const FIRST_TIER_RATE = 0.5;

/** Second-tier inclusion rate, and the ceiling on the taxable share overall. */
export const SECOND_TIER_RATE = 0.85;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Taxable portion of one year's Social Security benefits.
 *
 * `otherIncome` is everything else that enters AGI — wages, pensions, TSP
 * withdrawals, interest, capital gains — plus tax-exempt interest, which the
 * worksheet adds back. Roth withdrawals are excluded (they are not in AGI).
 */
export function calculateTaxableSocialSecurity({
  filingStatus = 'single',
  otherIncome = 0,
  socialSecurityBenefits = 0,
  year = CURRENT_PARAMETER_YEAR,
} = {}) {
  const params = getAnnualParameters(year);
  const thresholds = params.federalTax.socialSecurityProvisionalIncome[filingStatus];
  if (!thresholds) {
    throw new Error(`Unknown filing status for Social Security taxation: ${filingStatus}`);
  }

  const benefits = Math.max(0, num(socialSecurityBenefits));
  const other = Math.max(0, num(otherIncome));
  const provisionalIncome = other + benefits * PROVISIONAL_INCOME_BENEFIT_SHARE;

  const { base, adjusted } = thresholds;
  const firstTierMaximum = FIRST_TIER_RATE * (adjusted - base);

  let taxablePortion = 0;
  if (benefits > 0 && provisionalIncome > base) {
    if (provisionalIncome <= adjusted) {
      taxablePortion = Math.min(
        FIRST_TIER_RATE * (provisionalIncome - base),
        FIRST_TIER_RATE * benefits,
      );
    } else {
      const firstTier = Math.min(firstTierMaximum, FIRST_TIER_RATE * benefits);
      const secondTier = SECOND_TIER_RATE * (provisionalIncome - adjusted);
      taxablePortion = Math.min(SECOND_TIER_RATE * benefits, firstTier + secondTier);
    }
  }

  return {
    provisionalIncome,
    taxablePortion,
    taxablePercent: benefits > 0 ? taxablePortion / benefits : 0,
    baseThreshold: base,
    adjustedThreshold: adjusted,
    parameterYear: params.year,
    usesExactYearParameters: params.isExact,
  };
}
