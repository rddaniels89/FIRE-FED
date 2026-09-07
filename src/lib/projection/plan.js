/**
 * Resolves a scenario's profile into one retirement plan.
 *
 * A profile says when the person leaves and, optionally, when the annuity
 * starts. Everything else — which FERS door they leave through, whether the
 * supplement is paid, whether FEHB survives, when the TSP opens without penalty,
 * what the annuity is worth on the day it starts — follows from those two ages
 * and the service behind them. This module derives all of it once so every
 * consumer (timeline, dashboard, report) reads the same answer.
 */

import {
  DEFAULT_MRA,
  calculateAnnualLeaveLumpSum,
  calculateFersRefund,
  calculateFersResults,
  estimateSalaryHistory,
  getFersContributionRate,
} from '../calculations/fers';
import {
  RETIREMENT_PATHS,
  defaultAnnuityStartAge,
  evaluateAllRetirementPaths,
  evaluateRetirementPath,
} from '../calculations/retirementPaths';
import { calculateSrs } from '../calculations/srs';
import { evaluateFehbContinuation } from '../calculations/fehb';
import { describeTspAccess } from '../calculations/tspAccess';
import { SPECIAL_PROVISION_TYPES, evaluateSpecialProvisionEligibility } from '../calculations/specialProvisions';
import {
  birthYearFromAge,
  estimatePiaFromSalary,
  estimateSocialSecurityAt62,
  fullRetirementAge,
} from '../calculations/socialSecurity';
import { projectCareerSalaries } from '../calculations/careerProjection';
import { RETIREMENT_PATH_AUTO } from '../scenarios/schema';

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function isSpecialProvisionType(employeeType) {
  return Object.values(SPECIAL_PROVISION_TYPES).includes(employeeType);
}

/**
 * Service at separation, in years: today's service plus the years still to be
 * worked. Months are carried, so 29 years 6 months at 57 is not MRA+30.
 */
export function serviceAtSeparation({ yearsOfService, monthsOfService = 0, currentAge, separationAge }) {
  const now = num(yearsOfService) + num(monthsOfService) / 12;
  return now + Math.max(0, num(separationAge) - num(currentAge));
}

/**
 * The Social Security figure the scenario is working from: the SSA statement
 * amount at full retirement age, or a coarse salary-based estimate when the
 * user has not entered one.
 */
export function resolveSocialSecurityInputs(scenario, { asOfYear = new Date().getFullYear() } = {}) {
  const ss = scenario?.summary?.socialSecurity ?? {};
  const profile = scenario?.profile ?? {};
  const mode = ss.mode ?? 'not_configured';
  const salary = num(scenario?.tsp?.annualSalary, 0);

  let piaMonthlyAtFra = 0;
  if (mode === 'manual') piaMonthlyAtFra = num(ss.monthlyBenefit, 0);
  else if (mode === 'estimate') piaMonthlyAtFra = estimatePiaFromSalary({ annualSalary: salary, replacementPercent: num(ss.percentOfSalary, 30) });

  const birthYear = birthYearFromAge({ currentAge: num(profile.currentAge, 42), asOfYear });
  const fra = fullRetirementAge({ birthYear });

  return {
    mode,
    piaMonthlyAtFra,
    birthYear,
    fra,
    claimAge: num(profile.socialSecurityClaimAge, 67),
    monthlyAt62: estimateSocialSecurityAt62({ piaMonthlyAtFra, birthYear }),
    trustFundHaircut: ss.trustFundHaircut ?? null,
  };
}

/**
 * Picks the path when the profile says "auto": the best door that is open.
 * Unreduced beats an early-out beats MRA+10 beats deferred. Whether MRA+10 is
 * taken now or postponed depends on whether an annuity start age was chosen.
 */
export function chooseAutomaticPath({ separationAge, yearsOfService, annuityStartAge, mra, isVeraOffered }) {
  const paths = evaluateAllRetirementPaths({ separationAge, yearsOfService, annuityStartAge, mra, isVeraOffered });
  const eligible = (p) => paths.find((x) => x.path === p && x.isEligible);

  if (eligible(RETIREMENT_PATHS.IMMEDIATE_UNREDUCED)) return RETIREMENT_PATHS.IMMEDIATE_UNREDUCED;
  if (isVeraOffered && eligible(RETIREMENT_PATHS.VERA)) return RETIREMENT_PATHS.VERA;
  if (eligible(RETIREMENT_PATHS.MRA10_IMMEDIATE)) {
    const wantsLater = annuityStartAge != null && num(annuityStartAge) > num(separationAge);
    return wantsLater ? RETIREMENT_PATHS.MRA10_POSTPONED : RETIREMENT_PATHS.MRA10_IMMEDIATE;
  }
  if (eligible(RETIREMENT_PATHS.DEFERRED)) return RETIREMENT_PATHS.DEFERRED;
  return null;
}

/** High-3 on the day of separation. */
export function resolveHigh3AtSeparation(scenario) {
  const profile = scenario.profile;
  const career = scenario.career ?? {};
  const yearsToSeparation = Math.max(0, num(profile.separationAge) - num(profile.currentAge));
  const growth = num(scenario.tsp?.annualSalaryGrowthRate, 3) / 100;
  const salary = num(scenario.tsp?.annualSalary, 0);
  const high3Today = num(scenario.fers?.high3Salary, salary);

  if (career.enabled) {
    const path = projectCareerSalaries({
      grade: career.grade,
      step: career.step,
      localityCode: career.localityCode,
      currentAge: profile.currentAge,
      separationAge: profile.separationAge,
      annualRaisePercent: career.annualRaisePercent,
      promotions: career.promotions ?? [],
      yearsInCurrentStep: career.yearsInCurrentStep ?? 0,
    });
    return {
      high3AtSeparation: path.high3AtSeparation,
      salaryAtSeparation: path.salaryAtSeparation,
      basis: 'career',
      salaryPath: path.years,
    };
  }

  // A high-3 is an average of the last three years, so it trails the final
  // salary by roughly one year of growth.
  const salaryAtSeparation = salary * Math.pow(1 + growth, yearsToSeparation);
  const high3AtSeparation =
    yearsToSeparation === 0 ? high3Today : Math.max(high3Today, salaryAtSeparation / Math.pow(1 + growth, 1));

  return { high3AtSeparation, salaryAtSeparation, basis: 'salary_growth', salaryPath: null };
}

/**
 * The plan. Every field is nominal at the age it applies.
 */
export function resolveRetirementPlan(scenario, { asOfYear = new Date().getFullYear() } = {}) {
  const profile = scenario.profile;
  const fers = scenario.fers ?? {};
  const mra = num(profile.mra, DEFAULT_MRA);
  const currentAge = num(profile.currentAge);
  const separationAge = num(profile.separationAge, currentAge);
  const isSpecialProvision = isSpecialProvisionType(profile.employeeType);

  const eligibilityYears = serviceAtSeparation({
    yearsOfService: fers.yearsOfService,
    monthsOfService: fers.monthsOfService,
    currentAge,
    separationAge,
  });

  const requestedStart = profile.annuityStartAge == null ? null : num(profile.annuityStartAge);

  let path = profile.retirementPath;
  if (!path || path === RETIREMENT_PATH_AUTO) {
    path = chooseAutomaticPath({
      separationAge,
      yearsOfService: eligibilityYears,
      annuityStartAge: requestedStart,
      mra,
      isVeraOffered: Boolean(profile.isVeraOffered),
    });
  }

  const special = isSpecialProvision
    ? evaluateSpecialProvisionEligibility({ age: separationAge, coveredYears: eligibilityYears, type: profile.employeeType })
    : null;

  // Special provision retirement is immediate and unreduced whenever its own
  // test is met, whatever the regular FERS doors say.
  if (special?.isEligible) path = RETIREMENT_PATHS.IMMEDIATE_UNREDUCED;

  const pathEval = path
    ? evaluateRetirementPath({
        path,
        separationAge,
        yearsOfService: eligibilityYears,
        annuityStartAge:
          requestedStart ?? defaultAnnuityStartAge({ path, separationAge, yearsOfService: eligibilityYears, mra }),
        mra,
        isVeraOffered: Boolean(profile.isVeraOffered),
      })
    : null;

  const isEligibleForAnnuity = Boolean(pathEval?.isEligible) || Boolean(special?.isEligible);
  const annuityStartAge = special?.isEligible
    ? separationAge
    : isEligibleForAnnuity
      ? num(pathEval.annuityStartAge, separationAge)
      : null;

  const isDeferred = path === RETIREMENT_PATHS.DEFERRED;
  const isPostponed = path === RETIREMENT_PATHS.MRA10_POSTPONED;
  const creditsSickLeave = special?.isEligible ? true : Boolean(pathEval?.creditsSickLeave);

  const high3 = resolveHigh3AtSeparation(scenario);
  const takeRefund = Boolean(fers.takeRefundOfContributions) && !isEligibleForAnnuity;

  const fersResults =
    isEligibleForAnnuity && !takeRefund
      ? calculateFersResults({
          yearsOfService: eligibilityYears,
          monthsOfService: 0,
          high3Salary: high3.high3AtSeparation,
          currentAge,
          retirementAge: annuityStartAge,
          includeFutureService: false,
          mra,
          unusedSickLeaveHours: creditsSickLeave ? num(fers.unusedSickLeaveHours, 0) : 0,
          survivorElection: fers.survivorElection,
          cpiIncrease: num(scenario.tsp?.inflationRate, 2.5) / 100,
          isSpecialProvision: Boolean(special?.isEligible),
          retirementEndAge: num(scenario.summary?.assumptions?.endAge, 95),
          multiplierAge: separationAge,
        })
      : null;

  const annuityAnnualAtStart = fersResults ? fersResults.stayFed.annualPension : 0;
  const nominalFreezeYears = annuityStartAge != null ? Math.max(0, annuityStartAge - separationAge) : 0;
  const inflation = num(scenario.tsp?.inflationRate, 2.5) / 100;
  const yearsToStart = annuityStartAge != null ? Math.max(0, annuityStartAge - currentAge) : 0;

  const socialSecurity = resolveSocialSecurityInputs(scenario, { asOfYear });

  const srs =
    isEligibleForAnnuity && !takeRefund
      ? calculateSrs({
          retirementAge: separationAge,
          creditableYearsOfService: eligibilityYears,
          socialSecurityAt62Monthly: socialSecurity.monthlyAt62,
          mra,
          isVoluntaryEarlyRetirement: path === RETIREMENT_PATHS.VERA,
          isDeferredOrPostponed: isDeferred || isPostponed || path === RETIREMENT_PATHS.MRA10_IMMEDIATE,
          isSpecialProvision: Boolean(special?.isEligible),
        })
      : null;

  const healthcare = scenario.healthcare ?? {};
  const fehb = evaluateFehbContinuation({
    yearsEnrolled: num(healthcare.fehbYearsEnrolled, 0) + Math.max(0, separationAge - currentAge),
    enrolledSinceFirstOpportunity: Boolean(healthcare.enrolledSinceFirstOpportunity),
    tricareYears: num(healthcare.tricareYears, 0),
    isDeferred: isDeferred || !isEligibleForAnnuity,
    isPostponed,
    annuityStartAge,
  });

  const tspAccess = describeTspAccess({ separationAge, isSpecialProvision });

  const refund = takeRefund
    ? calculateFersRefund({
        annualSalaries: estimateSalaryHistory({
          currentSalary: high3.salaryAtSeparation,
          yearsOfService: eligibilityYears,
          annualGrowthRate: num(scenario.tsp?.annualSalaryGrowthRate, 3) / 100,
        }),
        hireCohort: profile.hireCohort,
      })
    : null;

  const annualLeave = calculateAnnualLeaveLumpSum({
    annualSalary: high3.salaryAtSeparation,
    hours: num(fers.annualLeaveHoursAtSeparation, 0),
  });

  return {
    path,
    pathLabel: pathEval?.label ?? (special?.isEligible ? 'Special provision, immediate' : 'No annuity'),
    isEligibleForAnnuity,
    reason: pathEval?.reason ?? null,
    notes: pathEval?.notes ?? [],
    currentAge,
    separationAge,
    annuityStartAge,
    isDeferred,
    isPostponed,
    isSpecialProvision: Boolean(special?.isEligible),
    mra,
    service: {
      todayYears: num(fers.yearsOfService) + num(fers.monthsOfService) / 12,
      eligibilityYears,
      computationYears: fersResults?.service?.computationYears ?? eligibilityYears,
      sickLeaveYears: fersResults?.service?.sickLeaveYears ?? 0,
      creditsSickLeave,
    },
    high3: high3,
    annuity: {
      annualAtStart: annuityAnnualAtStart,
      monthlyAtStart: annuityAnnualAtStart / 12,
      multiplier: fersResults?.stayFed?.multiplier ?? 0,
      ageReductionPercent: fersResults?.ageReduction?.percent ?? 0,
      survivor: fersResults?.survivor ?? null,
      colaStartAge: fersResults?.cola?.startAge ?? 62,
      // Deferred and postponed annuities are computed on the separation-day
      // high-3 and receive nothing until they begin. This is what the wait costs.
      nominalFreezeYears,
      realValueAtStartInTodaysDollars: annuityAnnualAtStart / Math.pow(1 + inflation, yearsToStart),
      purchasingPowerLostToFreeze: nominalFreezeYears > 0 ? 1 - 1 / Math.pow(1 + inflation, nominalFreezeYears) : 0,
      fersResults,
    },
    srs: srs
      ? {
          isEligible: srs.isEligible,
          reason: srs.reason,
          startAge: srs.isEligible ? srs.payableFromAge ?? separationAge : null,
          endAge: 62,
          monthly: srs.isEligible ? srs.monthlyBeforeEarningsTest : 0,
          annual: srs.isEligible ? srs.annualBeforeEarningsTest : 0,
        }
      : { isEligible: false, reason: null, startAge: null, endAge: 62, monthly: 0, annual: 0 },
    fehb,
    tspAccess,
    refund,
    annualLeave,
    socialSecurity,
    fersContributionRate: getFersContributionRate(profile.hireCohort),
    keepsFehb: Boolean(fehb.continues),
    hasSupplement: Boolean(srs?.isEligible),
  };
}
