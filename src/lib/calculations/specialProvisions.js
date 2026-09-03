/**
 * FERS special provision retirement — law enforcement, firefighters, air
 * traffic controllers, and the smaller covered groups.
 *
 * This is not a variation on ordinary FERS. Almost every rule differs:
 *
 *   Computation   1.7% for the first 20 years, then 1.0%, rather than a flat
 *                 1.0%. Twenty years is worth 34% of high-3 instead of 20%.
 *   Eligibility   Age 50 with 20 years of covered service, or any age with 25.
 *   Mandatory     Separation is compulsory at 57 for LEO and firefighters, 56
 *                 for controllers. Retirement is not always a choice.
 *   COLA          Paid from the start, not withheld until 62.
 *   Supplement    Payable, and exempt from the earnings test until MRA.
 *
 * A well-paid group that thinks about retirement constantly, and the model was
 * blind to all of it.
 *
 * https://www.opm.gov/retirement-center/fers-information/computation/
 */

export const SPECIAL_PROVISION_TYPES = Object.freeze({
  LAW_ENFORCEMENT: 'law_enforcement',
  FIREFIGHTER: 'firefighter',
  AIR_TRAFFIC_CONTROLLER: 'air_traffic_controller',
  NUCLEAR_MATERIALS_COURIER: 'nuclear_materials_courier',
  CAPITOL_POLICE: 'capitol_police',
  SUPREME_COURT_POLICE: 'supreme_court_police',
});

export const SPECIAL_PROVISION_LABELS = Object.freeze({
  [SPECIAL_PROVISION_TYPES.LAW_ENFORCEMENT]: 'Law enforcement officer',
  [SPECIAL_PROVISION_TYPES.FIREFIGHTER]: 'Firefighter',
  [SPECIAL_PROVISION_TYPES.AIR_TRAFFIC_CONTROLLER]: 'Air traffic controller',
  [SPECIAL_PROVISION_TYPES.NUCLEAR_MATERIALS_COURIER]: 'Nuclear materials courier',
  [SPECIAL_PROVISION_TYPES.CAPITOL_POLICE]: 'Capitol Police',
  [SPECIAL_PROVISION_TYPES.SUPREME_COURT_POLICE]: 'Supreme Court Police',
});

/** The enhanced rate, and the years it applies to. */
export const ENHANCED_MULTIPLIER = 0.017;
export const ENHANCED_YEARS_CAP = 20;
export const STANDARD_MULTIPLIER = 0.01;

/** Separation is compulsory at these ages. */
export const MANDATORY_RETIREMENT_AGES = Object.freeze({
  [SPECIAL_PROVISION_TYPES.AIR_TRAFFIC_CONTROLLER]: 56,
  default: 57,
});

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function getMandatoryRetirementAge(type) {
  return MANDATORY_RETIREMENT_AGES[type] ?? MANDATORY_RETIREMENT_AGES.default;
}

/**
 * Eligibility: age 50 with 20 years of covered service, or any age with 25.
 *
 * `coveredYears` is service in the covered position, which is often less than
 * total federal service — time before transferring in does not count toward
 * these thresholds.
 */
export function evaluateSpecialProvisionEligibility({
  age,
  coveredYears,
  type = SPECIAL_PROVISION_TYPES.LAW_ENFORCEMENT,
} = {}) {
  const a = num(age);
  const covered = num(coveredYears);
  const mandatoryAge = getMandatoryRetirementAge(type);

  const byAge = a >= 50 && covered >= 20;
  const byService = covered >= 25;
  const isEligible = byAge || byService;

  return {
    type,
    label: SPECIAL_PROVISION_LABELS[type] ?? type,
    isEligible,
    qualifiesUnder: isEligible ? (byAge ? 'age_50_with_20' : 'any_age_with_25') : null,
    mandatoryRetirementAge: mandatoryAge,
    yearsUntilMandatory: Math.max(0, mandatoryAge - a),
    isPastMandatoryAge: a >= mandatoryAge,
    reason: isEligible ? null : 'Needs age 50 with 20 years of covered service, or any age with 25.',
  };
}

/**
 * The enhanced computation: 1.7% on the first 20 years, 1.0% beyond.
 *
 * Total service is used for the years beyond 20, including service that was
 * never in a covered position.
 */
export function calculateSpecialProvisionAnnuity({ high3Salary, totalYearsOfService } = {}) {
  const high3 = Math.max(0, num(high3Salary));
  const years = Math.max(0, num(totalYearsOfService));

  const enhancedYears = Math.min(years, ENHANCED_YEARS_CAP);
  const standardYears = Math.max(0, years - ENHANCED_YEARS_CAP);

  const enhancedPortion = high3 * enhancedYears * ENHANCED_MULTIPLIER;
  const standardPortion = high3 * standardYears * STANDARD_MULTIPLIER;
  const annualPension = enhancedPortion + standardPortion;

  return {
    annualPension,
    monthlyPension: annualPension / 12,
    enhancedYears,
    standardYears,
    enhancedPortion,
    standardPortion,
    /** What the same service would have earned under ordinary FERS. */
    standardFersEquivalent: high3 * years * STANDARD_MULTIPLIER,
    effectiveMultiplier: years > 0 ? annualPension / (high3 * years) : 0,
  };
}

/**
 * Everything that differs from ordinary FERS, in one place.
 *
 * The earnings-test exemption is the one most easily missed: a special provision
 * retiree who leaves before their MRA keeps the whole supplement regardless of
 * what they earn, right up until they reach it. Many take a second career
 * immediately, so the difference is not theoretical.
 */
export function evaluateSpecialProvisionRetirement({
  age,
  coveredYears,
  totalYearsOfService,
  high3Salary,
  type = SPECIAL_PROVISION_TYPES.LAW_ENFORCEMENT,
  mra = 57,
} = {}) {
  const eligibility = evaluateSpecialProvisionEligibility({ age, coveredYears, type });
  const annuity = calculateSpecialProvisionAnnuity({ high3Salary, totalYearsOfService });

  return {
    ...eligibility,
    annuity,
    receivesColaImmediately: true,
    hasSupplement: num(age) < 62,
    supplementExemptFromEarningsTestUntilMra: num(age) < num(mra, 57),
    annuityAdvantage: annuity.annualPension - annuity.standardFersEquivalent,
  };
}
