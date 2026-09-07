/**
 * When TSP money can be touched without the 10% early-withdrawal penalty.
 *
 * For an early retiree the TSP balance is not one number, it is several pools
 * that open on different dates:
 *
 *   Separation in or after the year you turn 55   penalty-free from separation
 *   (50 for special provision employees)           IRC 72(t)(2)(A)(v), (t)(10)
 *   Otherwise                                      penalty-free from 59½
 *   72(t) SEPP                                     penalty-free at any age, for a
 *                                                  fixed schedule lasting the longer
 *                                                  of 5 years or until 59½
 *   Roth contributions                             tax- and penalty-free once rolled
 *                                                  to a Roth IRA (TSP itself pays
 *                                                  Roth withdrawals pro rata)
 *   Roth conversions                               penalty-free 5 tax years after
 *                                                  each conversion, or at 59½
 *   Roth earnings                                  qualified at 59½ with 5 years
 *                                                  since the first Roth contribution
 *
 * A 45-year-old leaving with $600,000 in a Traditional TSP has, in the plain
 * case, no penalty-free access for fourteen years. That gap is most of what an
 * early-retirement plan has to solve.
 *
 * https://www.tsp.gov/publications/tspbk26.pdf (Tax Rules about TSP Payments)
 * https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-tax-on-early-distributions
 */

export const EARLY_WITHDRAWAL_PENALTY_RATE = 0.1;
export const PENALTY_FREE_AGE = 59.5;
export const SEPARATION_YEAR_AGE_RULE = 55;
export const SEPARATION_YEAR_AGE_RULE_PUBLIC_SAFETY = 50;
export const ROTH_SEASONING_YEARS = 5;
export const SEPP_MINIMUM_YEARS = 5;

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * The age from which Traditional TSP withdrawals are penalty-free, given when
 * the person separates. The rule keys on the calendar year of separation, so a
 * separation at 54 and 11 months inside the year the person turns 55 counts;
 * FireFed stores ages rather than dates, so separating at 55 or later is used
 * as the test and the year-of-turning-55 edge is noted for the user.
 */
export function traditionalPenaltyFreeAge({ separationAge, isSpecialProvision = false } = {}) {
  const sep = num(separationAge);
  const threshold = isSpecialProvision ? SEPARATION_YEAR_AGE_RULE_PUBLIC_SAFETY : SEPARATION_YEAR_AGE_RULE;
  if (sep >= threshold) return sep;
  return PENALTY_FREE_AGE;
}

/** Whether a Traditional withdrawal at `age` is penalty-free. */
export function isTraditionalPenaltyFree({ age, separationAge, isSpecialProvision = false, seppActive = false } = {}) {
  if (seppActive) return true;
  return num(age) >= traditionalPenaltyFreeAge({ separationAge, isSpecialProvision });
}

/**
 * Roth earnings are qualified — tax- and penalty-free — at 59½ once five tax
 * years have passed since the first Roth contribution.
 */
export function isRothQualified({ age, firstRothContributionAge } = {}) {
  const a = num(age);
  const first = firstRothContributionAge == null ? null : num(firstRothContributionAge);
  if (a < PENALTY_FREE_AGE) return false;
  if (first === null) return true;
  return a - first >= ROTH_SEASONING_YEARS;
}

/** A conversion made at `conversionAge` is penalty-free at `age`. */
export function isConversionSeasoned({ age, conversionAge } = {}) {
  return num(age) >= PENALTY_FREE_AGE || num(age) - num(conversionAge) >= ROTH_SEASONING_YEARS;
}

/**
 * The 72(t) schedule has to run for the longer of five years or until 59½. A
 * 50-year-old is committed until 59½; a 57-year-old until 62.
 */
export function seppEndAge({ startAge } = {}) {
  const s = num(startAge);
  return Math.max(s + SEPP_MINIMUM_YEARS, PENALTY_FREE_AGE);
}

/**
 * The amortization method for a 72(t) payment: the balance paid down over the
 * single life expectancy at a reasonable interest rate (capped at the greater
 * of 5% or 120% of the federal mid-term rate under Notice 2022-6).
 *
 * Life expectancy uses the IRS Single Life Table (Publication 590-B, 2022
 * revision) for the ages an early retiree is likely to start.
 */
export const SINGLE_LIFE_EXPECTANCY = Object.freeze({
  40: 45.7, 41: 44.8, 42: 43.8, 43: 42.9, 44: 41.9, 45: 41.0, 46: 40.0, 47: 39.0,
  48: 38.1, 49: 37.1, 50: 36.2, 51: 35.3, 52: 34.3, 53: 33.4, 54: 32.5, 55: 31.6,
  56: 30.6, 57: 29.8, 58: 28.9, 59: 28.0, 60: 27.1, 61: 26.2, 62: 25.4, 63: 24.5,
  64: 23.7, 65: 22.9,
});

export function singleLifeExpectancy(age) {
  const a = Math.round(num(age));
  if (SINGLE_LIFE_EXPECTANCY[a] !== undefined) return SINGLE_LIFE_EXPECTANCY[a];
  if (a < 40) return 45.7 + (40 - a) * 0.95;
  return Math.max(1, 22.9 - (a - 65) * 0.85);
}

export function calculateSeppAnnualPayment({ balance, startAge, interestRate = 0.05 } = {}) {
  const b = Math.max(0, num(balance));
  const n = singleLifeExpectancy(startAge);
  const r = Math.max(0, num(interestRate));
  if (b <= 0 || n <= 0) return 0;
  if (r === 0) return b / n;
  return (b * r) / (1 - Math.pow(1 + r, -n));
}

/**
 * Describes the access windows for a given separation, for display and for the
 * timeline's withdrawal ordering.
 */
export function describeTspAccess({
  separationAge,
  isSpecialProvision = false,
  firstRothContributionAge = null,
} = {}) {
  const sep = num(separationAge);
  const traditionalFrom = traditionalPenaltyFreeAge({ separationAge: sep, isSpecialProvision });
  const usesSeparationRule = traditionalFrom === sep && sep < PENALTY_FREE_AGE;
  const rothEarningsFrom =
    firstRothContributionAge == null
      ? PENALTY_FREE_AGE
      : Math.max(PENALTY_FREE_AGE, num(firstRothContributionAge) + ROTH_SEASONING_YEARS);

  return {
    separationAge: sep,
    traditionalPenaltyFreeAge: traditionalFrom,
    usesSeparationYearRule: usesSeparationRule,
    penaltyGapYears: Math.max(0, traditionalFrom - sep),
    rothBasisPenaltyFreeAge: sep,
    rothEarningsQualifiedAge: rothEarningsFrom,
    seppAvailable: sep < traditionalFrom,
    seppEndAgeIfStartedAtSeparation: seppEndAge({ startAge: sep }),
    notes: [
      usesSeparationRule
        ? `Separating at ${sep} — in or after the year you turn ${
            isSpecialProvision ? SEPARATION_YEAR_AGE_RULE_PUBLIC_SAFETY : SEPARATION_YEAR_AGE_RULE
          } — makes Traditional TSP withdrawals penalty-free immediately.`
        : sep < PENALTY_FREE_AGE
          ? `Separating at ${sep} leaves Traditional TSP behind a 10% penalty until 59½: a ${(
              PENALTY_FREE_AGE - sep
            ).toFixed(1)}-year gap.`
          : 'Traditional TSP is penalty-free from separation.',
      'Roth contributions can be withdrawn tax- and penalty-free at any age once rolled to a Roth IRA; the TSP itself pays Roth withdrawals pro rata between contributions and earnings.',
      'Each Roth conversion becomes penalty-free five tax years later, which is the mechanism behind a conversion ladder.',
    ],
  };
}
