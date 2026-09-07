/**
 * Household tax engine — the single entry point the planner calls for one
 * year of a scenario.
 *
 * Takes the income streams a federal retiree actually has, sorts them into
 * what the tax code cares about (ordinary vs. capital gain vs. Social Security
 * vs. Roth, which is nothing), and runs the federal and state modules. Roth
 * withdrawals are accepted so the caller can hand over the whole cash-flow
 * picture, but they never touch a taxable figure.
 *
 * FICA is separate because it applies to wages only and stops the day the
 * employee retires; it is here because a FERS employee's take-home pay is a
 * planner input and FERS employees pay full FICA (CSRS employees pay only the
 * Medicare portion).
 */

import { CURRENT_PARAMETER_YEAR, getAnnualParameters } from '../calculations/annualParameters';
import { calculateFederalIncomeTax } from './federalIncomeTax';
import { calculateStateIncomeTax } from './stateIncomeTax';

export {
  calculateTaxableSocialSecurity,
  PROVISIONAL_INCOME_BENEFIT_SHARE,
  FIRST_TIER_RATE,
  SECOND_TIER_RATE,
} from './socialSecurityTaxation';

export {
  calculateFederalIncomeTax,
  calculateStandardDeduction,
  calculateSeniorBonusDeduction,
  calculateOrdinaryTax,
  calculateCapitalGainsTax,
  marginalRateForTaxableIncome,
  roomInBracket,
  countSeniors,
  SENIOR_DEDUCTION_AGE,
  CAPITAL_GAINS_RATES,
} from './federalIncomeTax';

export {
  calculateStateIncomeTax,
  getStatePreset,
  STATE_TAX_PRESETS,
} from './stateIncomeTax';

export { FILING_STATUSES } from '../calculations/annualParameters';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nonNegative(value) {
  return Math.max(0, num(value));
}

/**
 * FICA on wages: Social Security up to the wage base plus Medicare on all
 * wages. The 0.9% Additional Medicare Tax above $200k/$250k is ignored.
 */
export function estimateFicaTax({ wages = 0, year = CURRENT_PARAMETER_YEAR } = {}) {
  const params = getAnnualParameters(year);
  const { socialSecurityRate, socialSecurityWageBase, medicareRate } = params.federalTax.fica;
  const pay = nonNegative(wages);

  const socialSecurityWages = Math.min(pay, socialSecurityWageBase);
  const socialSecurityTax = socialSecurityWages * socialSecurityRate;
  const medicareTax = pay * medicareRate;

  return {
    wages: pay,
    socialSecurityWages,
    socialSecurityTax,
    medicareTax,
    totalTax: socialSecurityTax + medicareTax,
    wageBase: socialSecurityWageBase,
    parameterYear: params.year,
    usesExactYearParameters: params.isExact,
  };
}

/**
 * Federal plus state tax for a household's year.
 *
 * `state` is a preset object from STATE_TAX_PRESETS, a two-letter code, or
 * null/undefined for no state tax.
 *
 * `grossIncome` is the taxable universe — ordinary + capital gains + gross
 * Social Security — and is what `effectiveRate` is measured against. Roth
 * withdrawals are tax-free, so they are excluded from it and echoed back as
 * `rothWithdrawals` for the caller's cash-flow view.
 */
export function calculateHouseholdTaxes({
  year = CURRENT_PARAMETER_YEAR,
  filingStatus = 'single',
  ages = [],
  income = {},
  state = null,
  itemizedDeductions = 0,
} = {}) {
  const {
    wages = 0,
    federalPension = 0,
    srs = 0,
    traditionalWithdrawals = 0,
    rothWithdrawals = 0,
    taxableInterest = 0,
    longTermCapitalGains = 0,
    socialSecurity = 0,
    otherTaxable = 0,
    otherPension = 0,
  } = income;

  const ordinaryIncome = nonNegative(wages)
    + nonNegative(federalPension)
    + nonNegative(otherPension)
    + nonNegative(srs)
    + nonNegative(traditionalWithdrawals)
    + nonNegative(taxableInterest)
    + nonNegative(otherTaxable);
  const gains = nonNegative(longTermCapitalGains);
  const benefits = nonNegative(socialSecurity);

  const federal = calculateFederalIncomeTax({
    year,
    filingStatus,
    ordinaryIncome,
    longTermCapitalGains: gains,
    socialSecurityBenefits: benefits,
    ages,
    itemizedDeductions,
  });

  const stateResult = state
    ? calculateStateIncomeTax({
      state,
      ordinaryIncome,
      federalPensionIncome: nonNegative(federalPension),
      socialSecurityBenefits: benefits,
      taxableSocialSecurityFederal: federal.taxableSocialSecurity,
      longTermCapitalGains: gains,
    })
    : null;

  const stateTax = stateResult ? stateResult.tax : 0;
  const totalTax = federal.totalTax + stateTax;
  const grossIncome = federal.grossIncome;

  return {
    year: federal.parameterYear,
    filingStatus,
    ordinaryIncome,
    grossIncome,
    rothWithdrawals: nonNegative(rothWithdrawals),
    federal,
    state: stateResult,
    federalTax: federal.totalTax,
    stateTax,
    totalTax,
    effectiveRate: grossIncome > 0 ? totalTax / grossIncome : 0,
    usesExactYearParameters: federal.usesExactYearParameters,
  };
}
