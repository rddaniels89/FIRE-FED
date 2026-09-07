/**
 * Federal income tax for a retirement-planning household.
 *
 * A deliberately narrow Form 1040: ordinary income, long-term capital gains
 * (and qualified dividends, which share the same rates), Social Security, the
 * standard deduction with its age-65 additions, the OBBBA senior deduction,
 * and itemised deductions as a single override figure. No credits, no AMT, no
 * NIIT, no QBI — none of which move the needle for a typical federal retiree
 * and all of which would triple the surface area.
 *
 * Order of operations (the parts that are easy to get wrong):
 *
 *   1. Taxable Social Security depends on all other income, so it is computed
 *      first from ordinary income + capital gains.
 *   2. AGI = ordinary + capital gains + taxable Social Security.
 *   3. Deduction = max(standard + age-65 additions, itemised) + senior bonus.
 *      The senior bonus is allowed to itemisers too (IRC 151(d)(5)), which is
 *      why it is added outside the max.
 *   4. Taxable income = AGI - deduction. Capital gains are treated as the TOP
 *      slice of taxable income: ordinary brackets apply to what is left after
 *      removing the gains, and the 0/15/20% thresholds are measured against
 *      total taxable income. This stacking is what lets a retiree with low
 *      ordinary income realise gains at 0%.
 *
 * Rates and thresholds are annual parameters and live in annualParameters.js.
 *
 * Sources:
 *   Rev. Proc. 2025-32           https://www.irs.gov/pub/irs-drop/rp-25-32.pdf
 *   IRC 1(h) capital gains       https://www.law.cornell.edu/uscode/text/26/1
 *   IRC 63 standard deduction    https://www.law.cornell.edu/uscode/text/26/63
 *   OBBBA s.70103 senior bonus   https://www.congress.gov/bill/119th-congress/house-bill/1
 */

import { CURRENT_PARAMETER_YEAR, getAnnualParameters } from '../calculations/annualParameters';
import { calculateTaxableSocialSecurity } from './socialSecurityTaxation';

/** Age at which the additional standard deduction and senior bonus begin. */
export const SENIOR_DEDUCTION_AGE = 65;

/** Long-term capital gain rates, in stacking order. */
export const CAPITAL_GAINS_RATES = Object.freeze([0, 0.15, 0.2]);

/** How many individuals a filing status can claim age-based deductions for. */
const TAXPAYERS_PER_STATUS = Object.freeze({
  single: 1,
  married_joint: 2,
  head_of_household: 1,
  married_separate: 1,
});

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nonNegative(value) {
  return Math.max(0, num(value));
}

function ceiling(bracket) {
  return bracket.upTo === null || bracket.upTo === undefined ? Infinity : bracket.upTo;
}

function getFederalTaxParameters(year, filingStatus) {
  const params = getAnnualParameters(year);
  const bracketList = params.federalTax.brackets[filingStatus];
  if (!bracketList) throw new Error(`Unknown filing status: ${filingStatus}`);
  return { params, bracketList };
}

/** Number of taxpayers on the return who are 65 or older, capped by filing status. */
export function countSeniors({ ages = [], filingStatus = 'single' } = {}) {
  const maximum = TAXPAYERS_PER_STATUS[filingStatus] ?? 1;
  const seniors = (Array.isArray(ages) ? ages : [ages]).filter((age) => num(age, -1) >= SENIOR_DEDUCTION_AGE);
  return Math.min(seniors.length, maximum);
}

/**
 * Standard deduction including the age-65 additional amounts. Blindness is
 * not modelled.
 */
export function calculateStandardDeduction({ year = CURRENT_PARAMETER_YEAR, filingStatus = 'single', ages = [] } = {}) {
  const { federalTax } = getAnnualParameters(year);
  const base = federalTax.standardDeduction[filingStatus];
  if (base === undefined) throw new Error(`Unknown filing status: ${filingStatus}`);
  const seniors = countSeniors({ ages, filingStatus });
  const additional = seniors * federalTax.additionalStandardDeductionAge65[filingStatus];
  return { base, seniors, additional, total: base + additional };
}

/**
 * OBBBA senior bonus deduction, 2025-2028. Per person 65+, reduced by 6% of
 * MAGI above the threshold, never below zero. Married-separate filers are
 * ineligible.
 */
export function calculateSeniorBonusDeduction({
  year = CURRENT_PARAMETER_YEAR,
  filingStatus = 'single',
  ages = [],
  magi = 0,
} = {}) {
  const params = getAnnualParameters(year);
  const rule = params.federalTax.seniorBonusDeduction;
  if (!rule) return 0;

  const taxYear = num(params.requestedYear, params.year);
  if (taxYear < rule.firstTaxYear || taxYear > rule.lastTaxYear) return 0;
  if (!rule.eligible[filingStatus]) return 0;

  const seniors = countSeniors({ ages, filingStatus });
  if (seniors === 0) return 0;

  const gross = seniors * rule.amountPerPerson;
  const excess = Math.max(0, num(magi) - rule.phaseOutThreshold[filingStatus]);
  return Math.max(0, gross - rule.phaseOutRate * excess);
}

/**
 * Tax on ordinary taxable income by stacking through the brackets, with a
 * per-bracket breakdown.
 */
export function calculateOrdinaryTax({ year = CURRENT_PARAMETER_YEAR, filingStatus = 'single', taxableIncome = 0 } = {}) {
  const { bracketList } = getFederalTaxParameters(year, filingStatus);
  const income = nonNegative(taxableIncome);

  const breakdown = [];
  let tax = 0;
  let floor = 0;
  for (const bracket of bracketList) {
    const top = ceiling(bracket);
    const amount = Math.max(0, Math.min(income, top) - floor);
    if (amount > 0) {
      const bracketTax = amount * bracket.rate;
      breakdown.push({ rate: bracket.rate, amount, tax: bracketTax });
      tax += bracketTax;
    }
    floor = top;
    if (income <= top) break;
  }
  return { tax, breakdown };
}

/** Rate the next dollar of ordinary taxable income would be taxed at. */
export function marginalRateForTaxableIncome({ year = CURRENT_PARAMETER_YEAR, filingStatus = 'single', taxableIncome = 0 } = {}) {
  const { bracketList } = getFederalTaxParameters(year, filingStatus);
  const income = nonNegative(taxableIncome);
  const bracket = bracketList.find((b) => income < ceiling(b)) ?? bracketList[bracketList.length - 1];
  return bracket.rate;
}

/**
 * Dollars of additional ordinary income before crossing the top of the
 * bracket at `targetRate`. Zero if already past it; Infinity for the top
 * bracket. A Roth-conversion planner asks "how much can I convert and stay in
 * the 12% bracket?" — this is that number.
 */
export function roomInBracket({ year = CURRENT_PARAMETER_YEAR, filingStatus = 'single', taxableIncome = 0, targetRate } = {}) {
  const { bracketList } = getFederalTaxParameters(year, filingStatus);
  const rate = num(targetRate, NaN);
  const bracket = bracketList.find((b) => Math.abs(b.rate - rate) < 1e-9);
  if (!bracket) throw new Error(`No ${targetRate} bracket for ${filingStatus} in ${year}`);
  const top = ceiling(bracket);
  if (top === Infinity) return Infinity;
  return Math.max(0, top - nonNegative(taxableIncome));
}

/**
 * Long-term capital gains tax with the gains stacked on top of ordinary
 * taxable income. `ordinaryTaxable` is taxable income excluding the gains;
 * `gains` is the portion of the gains that survived the deduction.
 */
export function calculateCapitalGainsTax({
  year = CURRENT_PARAMETER_YEAR,
  filingStatus = 'single',
  ordinaryTaxable = 0,
  gains = 0,
} = {}) {
  const thresholds = getAnnualParameters(year).capitalGains[filingStatus];
  if (!thresholds) throw new Error(`Unknown filing status: ${filingStatus}`);

  const floorIncome = nonNegative(ordinaryTaxable);
  const gainAmount = nonNegative(gains);
  const ceilings = [thresholds.zeroRateUpTo, thresholds.fifteenRateUpTo, Infinity];

  const breakdown = [];
  let tax = 0;
  let floor = floorIncome;
  const top = floorIncome + gainAmount;
  CAPITAL_GAINS_RATES.forEach((rate, i) => {
    const bracketTop = ceilings[i];
    const amount = Math.max(0, Math.min(top, bracketTop) - floor);
    if (amount > 0) {
      const bracketTax = amount * rate;
      breakdown.push({ rate, amount, tax: bracketTax });
      tax += bracketTax;
    }
    floor = Math.max(floor, bracketTop);
  });
  return { tax, breakdown };
}

/**
 * Full federal income tax for one year.
 *
 * `ordinaryIncome` is everything taxed at ordinary rates: wages, FERS annuity,
 * SRS, traditional TSP withdrawals, interest, short-term gains. Social
 * Security is passed separately because only part of it is taxable; Roth
 * withdrawals are simply omitted. `ages` lists each taxpayer's age at year end
 * for the 65+ deductions.
 */
export function calculateFederalIncomeTax({
  year = CURRENT_PARAMETER_YEAR,
  filingStatus = 'single',
  ordinaryIncome = 0,
  longTermCapitalGains = 0,
  socialSecurityBenefits = 0,
  ages = [],
  itemizedDeductions = 0,
} = {}) {
  const { params } = getFederalTaxParameters(year, filingStatus);

  const ordinary = nonNegative(ordinaryIncome);
  const gains = nonNegative(longTermCapitalGains);
  const benefits = nonNegative(socialSecurityBenefits);
  const itemized = nonNegative(itemizedDeductions);

  const ss = calculateTaxableSocialSecurity({
    filingStatus,
    otherIncome: ordinary + gains,
    socialSecurityBenefits: benefits,
    year,
  });
  const taxableSocialSecurity = ss.taxablePortion;

  const agi = ordinary + gains + taxableSocialSecurity;
  const grossIncome = ordinary + gains + benefits;

  const standard = calculateStandardDeduction({ year, filingStatus, ages });
  const seniorBonus = calculateSeniorBonusDeduction({ year, filingStatus, ages, magi: agi });
  const usesItemized = itemized > standard.total;
  const deduction = (usesItemized ? itemized : standard.total) + seniorBonus;

  const taxableIncome = Math.max(0, agi - deduction);
  // Gains are the top slice, so the deduction consumes ordinary income first.
  const taxableGains = Math.min(gains, taxableIncome);
  const taxableOrdinary = taxableIncome - taxableGains;

  const ordinaryResult = calculateOrdinaryTax({ year, filingStatus, taxableIncome: taxableOrdinary });
  const gainsResult = calculateCapitalGainsTax({
    year,
    filingStatus,
    ordinaryTaxable: taxableOrdinary,
    gains: taxableGains,
  });

  const totalTax = ordinaryResult.tax + gainsResult.tax;
  const marginalOrdinaryRate = agi < deduction
    ? 0
    : marginalRateForTaxableIncome({ year, filingStatus, taxableIncome: taxableOrdinary });

  return {
    filingStatus,
    grossIncome,
    agi,
    taxableSocialSecurity,
    socialSecurity: ss,
    standardDeduction: standard.total,
    seniorBonusDeduction: seniorBonus,
    usesItemizedDeductions: usesItemized,
    deduction,
    taxableIncome,
    taxableOrdinaryIncome: taxableOrdinary,
    taxableCapitalGains: taxableGains,
    ordinaryTax: ordinaryResult.tax,
    capitalGainsTax: gainsResult.tax,
    totalTax,
    effectiveRate: grossIncome > 0 ? totalTax / grossIncome : 0,
    marginalOrdinaryRate,
    bracketBreakdown: ordinaryResult.breakdown,
    capitalGainsBreakdown: gainsResult.breakdown,
    parameterYear: params.year,
    usesExactYearParameters: params.isExact,
  };
}
