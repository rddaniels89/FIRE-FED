/**
 * Healthcare costs across a federal retirement.
 *
 * Health cover is the expense most likely to decide whether an early federal
 * retirement works, and it changes shape three times:
 *
 *   Employed        FEHB, with the government paying the larger share.
 *   Retired, <65    FEHB at the SAME enrollee share — retirees are not charged
 *                   more — provided the five-year rule was met and the annuity
 *                   is immediate (see fehb.js). A deferred retiree, or one who
 *                   left too soon, buys marketplace cover at full price until
 *                   Medicare. A postponed retiree bridges the gap on the
 *                   marketplace and gets FEHB back when the annuity begins.
 *   65 and over     Medicare Part B, which most retirees keep FEHB alongside.
 *                   Higher incomes pay an IRMAA surcharge on Part B, set by the
 *                   tax return from two years earlier.
 *
 * VA, TRICARE and CHAMPVA replace the FEHB or marketplace premium with whatever
 * that programme costs; Part B still applies at 65 (TRICARE For Life requires
 * it).
 *
 * Every figure here is nominal. Premiums, Part B and out-of-pocket spend are
 * all grown at `premiumGrowthPercent` from the parameter year; the historical
 * Part B rise is close to the FEHB long-run average, so one rate serves both.
 *
 *   FEHB premiums  https://www.opm.gov/healthcare-insurance/healthcare/plan-information/premiums/
 *   Medicare       https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-and-deductibles
 *   Marketplace    https://www.kff.org/health-costs/ (2025 average unsubsidized benchmark)
 */

import { CURRENT_PARAMETER_YEAR, getAnnualParameters } from './annualParameters';
import { FEHB_OUTCOMES } from './fehb';

export const COVERAGE_TYPES = Object.freeze({
  FEHB: 'fehb',
  FEHB_WITH_MEDICARE: 'fehb_with_medicare',
  MARKETPLACE: 'marketplace',
  MEDICARE_ONLY: 'medicare_only',
  VA_TRICARE: 'va_tricare',
  NONE: 'none',
});

export const OTHER_COVERAGE_TYPES = Object.freeze({
  NONE: 'none',
  VA: 'va',
  TRICARE: 'tricare',
  CHAMPVA: 'champva',
});

export const FEHB_ENROLLMENT_TYPES = Object.freeze({
  SELF: 'self',
  SELF_PLUS_ONE: 'selfPlusOne',
  FAMILY: 'family',
});

export const MEDICARE_ELIGIBILITY_AGE = 65;

/**
 * Unsubsidized marketplace premium, annual. A planning approximation from the
 * KFF 2025 average benchmark (silver) premium — roughly $800/month for one
 * adult, doubled for a household. Real quotes vary widely by state and age.
 */
export const DEFAULT_MARKETPLACE_ANNUAL_PREMIUM = Object.freeze({
  self: 9600,
  family: 19200,
});

export const DEFAULT_HEALTHCARE = Object.freeze({
  fehbEnrolled: true,
  /** 'self' | 'selfPlusOne' | 'family' */
  fehbEnrollmentType: FEHB_ENROLLMENT_TYPES.SELF,
  /** Annual enrollee share; null resolves to the parameter-year default by type. */
  fehbAnnualEnrolleeShare: null,
  fehbYearsEnrolled: 5,
  enrolledSinceFirstOpportunity: false,
  tricareYears: 0,
  premiumGrowthPercent: 7,
  keepFehbWithMedicare: true,
  enrollInPartB: true,
  /**
   * Annual marketplace premium; null resolves to DEFAULT_MARKETPLACE_ANNUAL_PREMIUM
   * by enrollment type. An explicit 0 means cover at no cost from elsewhere
   * (a spouse's plan) and reports as COVERAGE_TYPES.NONE.
   */
  marketplaceAnnualPremium: null,
  /** 'none' | 'va' | 'tricare' | 'champva' */
  otherCoverage: OTHER_COVERAGE_TYPES.NONE,
  otherCoverageAnnualCost: 0,
  outOfPocketAnnual: 2000,
});

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** A finite, non-negative number when one was explicitly given, else null. */
const explicitAmount = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const resolveHealthcare = (healthcare) => ({ ...DEFAULT_HEALTHCARE, ...(healthcare ?? {}) });

/** Compound growth factor for a percentage rate over a number of years. */
const growthFactor = (ratePercent, years) =>
  Math.pow(1 + num(ratePercent) / 100, Math.max(0, num(years)));

const hasOtherCoverage = (h) =>
  Boolean(h.otherCoverage) && h.otherCoverage !== OTHER_COVERAGE_TYPES.NONE;

/**
 * Whether FEHB is in force this year. Employment keeps it regardless of the
 * retirement outcome; after separation the outcome from fehb.js decides, with
 * the postponed case resuming only once the annuity is actually paying.
 */
function isFehbActive({ healthcare, fehbOutcome, isAnnuityPaying, isEmployed }) {
  if (!healthcare.fehbEnrolled) return false;
  if (isEmployed) return true;
  switch (fehbOutcome) {
    case FEHB_OUTCOMES.CONTINUES:
      return true;
    case FEHB_OUTCOMES.SUSPENDED_THEN_REINSTATED:
      return Boolean(isAnnuityPaying);
    default:
      return false;
  }
}

/** Annual FEHB enrollee share in parameter-year dollars. */
export function resolveFehbEnrolleeShare(healthcare, year = CURRENT_PARAMETER_YEAR) {
  const h = resolveHealthcare(healthcare);
  const explicit = explicitAmount(h.fehbAnnualEnrolleeShare);
  if (explicit !== null) return explicit;
  const defaults = getAnnualParameters(year).fehb?.defaultAnnualEnrolleeShare ?? {};
  return num(defaults[h.fehbEnrollmentType], num(defaults.self));
}

/** Annual marketplace premium in parameter-year dollars. */
export function resolveMarketplacePremium(healthcare) {
  const h = resolveHealthcare(healthcare);
  const explicit = explicitAmount(h.marketplaceAnnualPremium);
  if (explicit !== null) return explicit;
  return h.fehbEnrollmentType === FEHB_ENROLLMENT_TYPES.SELF
    ? DEFAULT_MARKETPLACE_ANNUAL_PREMIUM.self
    : DEFAULT_MARKETPLACE_ANNUAL_PREMIUM.family;
}

/**
 * Which kind of cover applies at an age, given the FEHB outcome and whether
 * the person is still working or drawing an annuity.
 */
export function resolveCoverageType({
  age,
  healthcare,
  fehbOutcome,
  isAnnuityPaying = false,
  isEmployed = false,
} = {}) {
  const h = resolveHealthcare(healthcare);
  const fehbActive = isFehbActive({ healthcare: h, fehbOutcome, isAnnuityPaying, isEmployed });
  const other = hasOtherCoverage(h);

  if (num(age) >= MEDICARE_ELIGIBILITY_AGE) {
    if (other) return COVERAGE_TYPES.VA_TRICARE;
    if (fehbActive && h.keepFehbWithMedicare) return COVERAGE_TYPES.FEHB_WITH_MEDICARE;
    return COVERAGE_TYPES.MEDICARE_ONLY;
  }

  if (other) return COVERAGE_TYPES.VA_TRICARE;
  if (fehbActive) return COVERAGE_TYPES.FEHB;
  if (resolveMarketplacePremium(h) > 0) return COVERAGE_TYPES.MARKETPLACE;
  return COVERAGE_TYPES.NONE;
}

/**
 * The Part B income-related surcharge for a MAGI, in parameter-year dollars.
 *
 * Tiers are read against the single thresholds unless filing jointly. Married
 * filing separately has its own compressed schedule that is not modelled; it
 * is treated as single, which understates the surcharge for that case.
 */
export function calculateIrmaaSurcharge({ magi, filingStatus = 'single', year } = {}) {
  const medicare = getAnnualParameters(year).medicare;
  const income = num(magi);
  const key = filingStatus === 'married_joint' ? 'jointMagiAbove' : 'singleMagiAbove';

  let tierIndex = -1;
  for (let i = 0; i < medicare.irmaa.length; i += 1) {
    if (income > medicare.irmaa[i][key]) tierIndex = i;
  }

  const partBMonthly =
    tierIndex >= 0 ? medicare.irmaa[tierIndex].partBMonthly : medicare.partBStandardMonthlyPremium;
  const monthlySurcharge = Math.max(0, partBMonthly - medicare.partBStandardMonthlyPremium);

  return {
    tierIndex,
    partBMonthly,
    monthlySurcharge,
    annualSurcharge: monthlySurcharge * 12,
  };
}

/**
 * Nominal healthcare cost for a single year.
 *
 * `year` selects the base parameters (default: the current parameter year);
 * `yearsFromNow` is how far to grow them. Keep `year` fixed across a projection
 * so growth is never applied on top of a later year's already-higher figures.
 *
 * IRMAA thresholds are not indexed here, so a nominal MAGI far in the future
 * will read against today's tiers and overstate the surcharge somewhat.
 */
export function projectHealthcareCostForYear({
  age,
  yearsFromNow = 0,
  year = CURRENT_PARAMETER_YEAR,
  healthcare,
  fehbOutcome,
  isAnnuityPaying = false,
  isEmployed = false,
  magiTwoYearsPrior = 0,
  filingStatus = 'single',
  includeIrmaa = false,
} = {}) {
  const h = resolveHealthcare(healthcare);
  const medicare = getAnnualParameters(year).medicare;
  const factor = growthFactor(h.premiumGrowthPercent, yearsFromNow);

  const coverageType = resolveCoverageType({
    age,
    healthcare: h,
    fehbOutcome,
    isAnnuityPaying,
    isEmployed,
  });

  const paysFehb =
    coverageType === COVERAGE_TYPES.FEHB || coverageType === COVERAGE_TYPES.FEHB_WITH_MEDICARE;
  const paysPartB = num(age) >= MEDICARE_ELIGIBILITY_AGE && Boolean(h.enrollInPartB);

  const fehbPremium = paysFehb ? resolveFehbEnrolleeShare(h, year) * factor : 0;
  const marketplacePremium =
    coverageType === COVERAGE_TYPES.MARKETPLACE ? resolveMarketplacePremium(h) * factor : 0;
  const medicarePartB = paysPartB ? medicare.partBStandardMonthlyPremium * 12 * factor : 0;
  const irmaaSurcharge =
    paysPartB && includeIrmaa
      ? calculateIrmaaSurcharge({ magi: magiTwoYearsPrior, filingStatus, year }).annualSurcharge *
        factor
      : 0;
  const otherCoverageCost =
    coverageType === COVERAGE_TYPES.VA_TRICARE
      ? Math.max(0, num(h.otherCoverageAnnualCost)) * factor
      : 0;
  const outOfPocket = Math.max(0, num(h.outOfPocketAnnual)) * factor;

  return {
    coverageType,
    fehbPremium,
    marketplacePremium,
    medicarePartB,
    irmaaSurcharge,
    otherCoverageCost,
    outOfPocket,
    total:
      fehbPremium +
      marketplacePremium +
      medicarePartB +
      irmaaSurcharge +
      otherCoverageCost +
      outOfPocket,
  };
}

/**
 * Year-by-year healthcare costs from `startAge` up to (not including) `endAge`.
 *
 *   separationAge    Employed while younger than this. Omit for someone
 *                    already separated.
 *   annuityStartAge  The annuity pays from this age. Omit for an immediate
 *                    annuity at separation.
 *   currentAge       Growth is measured from here; defaults to startAge.
 *   magiByAge        MAGI keyed by the age it was earned, or a function of
 *                    age. The lookback from annualParameters is applied.
 */
export function projectHealthcareCosts({
  startAge,
  endAge,
  currentAge = startAge,
  year = CURRENT_PARAMETER_YEAR,
  healthcare,
  fehbOutcome,
  annuityStartAge = null,
  separationAge = null,
  filingStatus = 'single',
  includeIrmaa = false,
  magiByAge = {},
} = {}) {
  const from = num(startAge);
  const to = num(endAge);
  const base = num(currentAge, from);
  const lookback = num(getAnnualParameters(year).medicare?.irmaaLookbackYears, 2);
  const separation = explicitAmount(separationAge);
  const annuityStart = explicitAmount(annuityStartAge);

  const magiAt = (age) => {
    if (typeof magiByAge === 'function') return num(magiByAge(age));
    return num(magiByAge?.[age]);
  };

  const years = [];
  for (let age = from; age < to; age += 1) {
    const isEmployed = separation !== null ? age < separation : false;
    const isAnnuityPaying = annuityStart !== null ? age >= annuityStart : !isEmployed;
    const yearsFromNow = Math.max(0, age - base);

    years.push({
      age,
      yearsFromNow,
      isEmployed,
      isAnnuityPaying,
      ...projectHealthcareCostForYear({
        age,
        yearsFromNow,
        year,
        healthcare,
        fehbOutcome,
        isAnnuityPaying,
        isEmployed,
        magiTwoYearsPrior: magiAt(age - lookback),
        filingStatus,
        includeIrmaa,
      }),
    });
  }

  return years;
}
