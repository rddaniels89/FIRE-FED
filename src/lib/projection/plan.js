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
import { SPECIAL_PROVISION_TYPES, evaluateSpecialProvisionEligibility, getMandatoryRetirementAge } from '../calculations/specialProvisions';
import {
  estimatePiaFromSalary,
  estimateSocialSecurityAt62,
  fullRetirementAge,
} from '../calculations/socialSecurity';
import { projectCareerSalaries } from '../calculations/careerProjection';
import { birthYearFromAgeAndMonths, isMraTransitionYear, minimumRetirementAge } from '../calculations/mra';
import { RETIREMENT_PATH_AUTO } from '../scenarios/schema';
import { resolveMilitaryFersCredit } from '../military/fersCredit';
import { ISSUE_CODES, raiseIssue } from '../military/status';
import { SERVICE_OWNERS } from '../military/servicePeriods';
import { STATE_TREATMENTS, resolveMilitaryIncomeStreams } from '../military/incomeStreams';
import { stateMilitaryRetiredPayExclusion } from '../taxes/stateMilitaryRetiredPay';
import { ACCOUNT_CONTEXTS, TSP_SYSTEMS, isAutomaticVested, normalizeUserraMakeUp, validateTspCoordination } from '../military/tspCoordination';
import { validateCoveragePeriods } from '../military/coverage';
import { continuationPayScenario, lumpSumScenario } from '../military/brs';

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** 'YYYY-MM-DD' for a Date, in local calendar terms. */
function isoDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${day}`;
}

/**
 * The first day of the month in which the person reaches `targetAge`, derived
 * from their age in years and months today. Month precision is all the profile
 * carries, and all the deposit deadline needs.
 */
export function isoMonthAtAge({ currentAge, currentAgeMonths = 0, targetAge, asOfDate = new Date() }) {
  const d = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
  const nowMonths = d.getFullYear() * 12 + d.getMonth();
  const birthMonths = nowMonths - Math.floor(num(currentAge)) * 12 - Math.min(11, Math.max(0, Math.floor(num(currentAgeMonths))));
  const target = birthMonths + Math.round(num(targetAge) * 12);
  const year = Math.floor(target / 12);
  const month = target - year * 12;
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

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
export function resolveSocialSecurityInputs(scenario, { asOfYear = new Date().getFullYear(), birthYear } = {}) {
  const ss = scenario?.summary?.socialSecurity ?? {};
  const profile = scenario?.profile ?? {};
  const mode = ss.mode ?? 'not_configured';
  const salary = num(scenario?.tsp?.annualSalary, 0);

  let piaMonthlyAtFra = 0;
  if (mode === 'manual') piaMonthlyAtFra = num(ss.monthlyBenefit, 0);
  else if (mode === 'estimate') piaMonthlyAtFra = estimatePiaFromSalary({ annualSalary: salary, replacementPercent: num(ss.percentOfSalary, 30) });

  // Full retirement age is a year-of-birth rule too, so it takes the exact
  // year when the caller has derived one from age in years and months.
  const resolvedBirthYear =
    birthYear ?? birthYearFromAgeAndMonths({
      currentAge: num(profile.currentAge, 42),
      currentAgeMonths: num(profile.currentAgeMonths, 0),
      asOfDate: new Date(asOfYear, new Date().getMonth(), 1),
    });
  const fra = fullRetirementAge({ birthYear: resolvedBirthYear });

  return {
    mode,
    piaMonthlyAtFra,
    birthYear: resolvedBirthYear,
    fra,
    claimAge: num(profile.socialSecurityClaimAge, 67),
    monthlyAt62: estimateSocialSecurityAt62({ piaMonthlyAtFra, birthYear: resolvedBirthYear }),
    trustFundHaircut: ss.trustFundHaircut ?? null,
  };
}

/**
 * Picks the path when the profile says "auto": the best door that is open.
 * Unreduced beats an early-out beats MRA+10 beats deferred. Whether MRA+10 is
 * taken now or postponed depends on whether an annuity start age was chosen.
 */
export function chooseAutomaticPath({ separationAge, yearsOfService, civilianYearsOfService, annuityStartAge, mra, isVeraOffered }) {
  const paths = evaluateAllRetirementPaths({ separationAge, yearsOfService, civilianYearsOfService, annuityStartAge, mra, isVeraOffered });
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
export function resolveRetirementPlan(scenario, options = {}) {
  const { asOfYear = new Date().getFullYear() } = options;
  const profile = scenario.profile;
  const fers = scenario.fers ?? {};
  // OPM's MRA runs from 55 to 57 by year of birth. Assuming 57 for everyone
  // overstates it for anyone born before 1970, which delays their eligibility.
  // The months are what make the birth year exact rather than approximate.
  const derivedBirthYear = birthYearFromAgeAndMonths({
    currentAge: num(profile.currentAge, 42),
    currentAgeMonths: num(profile.currentAgeMonths, 0),
    asOfDate: options.asOfDate ?? new Date(asOfYear, (options.asOfMonth ?? new Date().getMonth()), 1),
  });
  const birthYear = profile.bornOnJanuaryFirst ? derivedBirthYear - 1 : derivedBirthYear;
  const mra =
    profile.mra === null || profile.mra === undefined || profile.mra === ''
      ? minimumRetirementAge(birthYear)
      : num(profile.mra, DEFAULT_MRA);
  const currentAge = num(profile.currentAge);
  const separationAge = num(profile.separationAge, currentAge);
  const isSpecialProvision = isSpecialProvisionType(profile.employeeType);

  // Civilian service at separation. Military service credited by a paid
  // deposit is a separate bucket: it opens the age-and-service doors and
  // raises the computation, but it cannot supply the five civilian years,
  // the High-3, the supplement's numerator, or covered special-provision time.
  const civilianYears = serviceAtSeparation({
    yearsOfService: fers.yearsOfService,
    monthsOfService: fers.monthsOfService,
    currentAge,
    separationAge,
  });
  // The deposit is date arithmetic, so the plan's as-of date and the month of
  // separation are derived from the ages the profile stores (year and month,
  // never a day) and handed to the credit resolver.
  const asOfDate = options.asOfDate ?? new Date(asOfYear, options.asOfMonth ?? new Date().getMonth(), 1);
  const separationDate = isoMonthAtAge({ currentAge, currentAgeMonths: num(profile.currentAgeMonths, 0), targetAge: separationAge, asOfDate });
  const militaryCredit = resolveMilitaryFersCredit(scenario.military, {
    ownerId: SERVICE_OWNERS.PRIMARY,
    hireCohort: profile.hireCohort,
    asOfDate: isoDate(asOfDate),
    separationDate,
  });
  const militaryCreditYears = militaryCredit.creditYears;
  const eligibilityYears = civilianYears + militaryCreditYears;
  const militaryIssues = [...militaryCredit.issues];
  if (
    (scenario.military?.servicePeriods ?? []).some((p) => (p.ownerId ?? SERVICE_OWNERS.PRIMARY) === SERVICE_OWNERS.SPOUSE)
  ) {
    militaryIssues.push(raiseIssue(ISSUE_CODES.MIL_SPOUSE_CREDIT_NOT_MODELED));
  }

  const requestedStart = profile.annuityStartAge == null ? null : num(profile.annuityStartAge);

  let path = profile.retirementPath;
  if (!path || path === RETIREMENT_PATH_AUTO) {
    path = chooseAutomaticPath({
      separationAge,
      yearsOfService: eligibilityYears,
      civilianYearsOfService: civilianYears,
      annuityStartAge: requestedStart,
      mra,
      isVeraOffered: Boolean(profile.isVeraOffered),
    });
  }

  // Covered service for the special-provision test is civilian by definition;
  // military credit is kept out of it.
  const special = isSpecialProvision
    ? evaluateSpecialProvisionEligibility({ age: separationAge, coveredYears: civilianYears, type: profile.employeeType })
    : null;
  if (isSpecialProvision && militaryCreditYears > 0) {
    militaryIssues.push(raiseIssue(ISSUE_CODES.MIL_SPECIAL_SERVICE_EXCLUSION));
  }
  // Special provision employees are separated by law at the mandatory age (57;
  // 56 for air traffic controllers). A later separation age is not available.
  const mandatoryRetirementAge = isSpecialProvision ? getMandatoryRetirementAge(profile.employeeType) : null;
  const exceedsMandatoryAge = mandatoryRetirementAge != null && separationAge > mandatoryRetirementAge;

  // Special provision retirement is immediate and unreduced whenever its own
  // test is met, whatever the regular FERS doors say.
  if (special?.isEligible) path = RETIREMENT_PATHS.IMMEDIATE_UNREDUCED;

  const pathEval = path
    ? evaluateRetirementPath({
        path,
        separationAge,
        yearsOfService: eligibilityYears,
        civilianYearsOfService: civilianYears,
        annuityStartAge:
          requestedStart ?? defaultAnnuityStartAge({ path, separationAge, yearsOfService: eligibilityYears, mra }),
        mra,
        isVeraOffered: Boolean(profile.isVeraOffered),
      })
    : null;

  const isEligibleForAnnuity = Boolean(pathEval?.isEligible) || Boolean(special?.isEligible);
  // The one case the doors alone cannot explain: enough total service, too
  // little of it civilian. Said plainly rather than left as "not eligible".
  if (!isEligibleForAnnuity && militaryCreditYears > 0 && civilianYears < 5 && eligibilityYears >= 5) {
    militaryIssues.push(raiseIssue(ISSUE_CODES.MIL_FIVE_CIVILIAN_YEARS));
  }
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
          yearsOfService: civilianYears,
          monthsOfService: 0,
          militaryCreditYears,
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

  const socialSecurity = resolveSocialSecurityInputs(scenario, { asOfYear, birthYear });

  const srs =
    isEligibleForAnnuity && !takeRefund
      ? calculateSrs({
          retirementAge: separationAge,
          creditableYearsOfService: eligibilityYears,
          // The supplement is prorated on civilian FERS service only.
          civilianYearsOfService: civilianYears,
          socialSecurityAt62Monthly: socialSecurity.monthlyAt62,
          mra,
          isVoluntaryEarlyRetirement: path === RETIREMENT_PATHS.VERA,
          isDiscontinuedService: Boolean(profile.isDiscontinuedService),
          isDeferredOrPostponed: isDeferred || isPostponed || path === RETIREMENT_PATHS.MRA10_IMMEDIATE,
          isSpecialProvision: Boolean(special?.isEligible),
        })
      : null;

  if (srs?.isEligible && militaryCreditYears > 0) {
    militaryIssues.push(raiseIssue(ISSUE_CODES.MIL_SRS_EXCLUSION));
  }

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

  // Military and VA income streams: validated once here so the timeline
  // projects them and the screens explain them from the same resolution.
  const incomeStreams = resolveMilitaryIncomeStreams(scenario.military, { asOfDate });
  militaryIssues.push(...incomeStreams.issues);
  const hasMilitaryRetiredPay = incomeStreams.streams.some(
    (s) => s.resolved.included && s.resolved.stateTreatment === STATE_TREATMENTS.MILITARY_RETIRED_PAY
  );
  const stateCode = scenario.taxes?.includeStateTax === false ? null : scenario.taxes?.state?.code ?? null;
  let stateMilitaryRule = null;
  if (hasMilitaryRetiredPay && stateCode && stateCode !== 'NONE') {
    stateMilitaryRule = stateMilitaryRetiredPayExclusion({ code: stateCode, militaryRetiredPay: 1, taxYear: asOfYear, age: separationAge });
    if (!stateMilitaryRule.applied && stateMilitaryRule.reason !== 'no_rule') {
      militaryIssues.push(raiseIssue(ISSUE_CODES.MIL_STATE_TAX_UNVERIFIED, { detail: { state: stateCode, reason: stateMilitaryRule.reason, treatment: stateMilitaryRule.treatment } }));
    }
  }

  // ---- TSP coordination: the civilian and uniformed-services accounts share
  // one elective-deferral limit; matches and vesting stay separate.
  const milTsp = scenario.military?.tsp ?? {};
  const uni = milTsp.uniformedServices ?? {};
  const userra = normalizeUserraMakeUp(milTsp.userraMakeUp ?? []);
  let tspCoordination = null;
  if (uni.enabled) {
    militaryIssues.push(...userra.issues);
    const fractionLeft = (12 - asOfDate.getMonth()) / 12;
    const civPeriods = Math.max(1, num(milTsp.civilian?.payPeriodsPerYear, 26));
    const uniPeriods = Math.max(1, num(uni.payPeriodsPerYear, 12));
    const civSalary = currentAge < separationAge ? num(scenario.tsp?.annualSalary) : 0;
    const civPct = num(scenario.tsp?.monthlyContributionPercent);
    const uniAnnualPay = uni.contributing ? num(uni.monthlyBasicPay) * 12 : 0;
    const uniTraditional = uni.contributionType !== 'roth';
    const czAnnual = uniTraditional ? Math.min(uniAnnualPay, num(uni.combatZoneTaxExemptAnnual)) : 0;
    const uniSystem = uni.coverageSystem === 'brs' ? TSP_SYSTEMS.BRS : TSP_SYSTEMS.NEITHER;
    tspCoordination = validateTspCoordination({
      year: asOfYear,
      age: currentAge,
      accounts: [
        {
          context: ACCOUNT_CONTEXTS.CIVILIAN,
          system: TSP_SYSTEMS.FERS,
          employeeDeferralsYtd: num(milTsp.civilian?.ytdEmployeeDeferrals),
          plannedPerPeriod: (civSalary / civPeriods) * (civPct / 100),
          payPeriodsRemaining: civSalary > 0 ? Math.round(civPeriods * fractionLeft) : 0,
          payPerPeriod: civSalary / civPeriods,
          employeePercent: civPct,
          monthsOfService: num(fers.yearsOfService) * 12 + num(fers.monthsOfService),
        },
        {
          context: ACCOUNT_CONTEXTS.UNIFORMED,
          system: uniSystem,
          employeeDeferralsYtd: num(uni.ytdEmployeeDeferrals),
          plannedPerPeriod: Math.max(0, (uniAnnualPay * (num(uni.employeePercent) / 100) - czAnnual) / uniPeriods),
          payPeriodsRemaining: uniAnnualPay > 0 ? Math.round(uniPeriods * fractionLeft) : 0,
          payPerPeriod: uniAnnualPay / uniPeriods,
          employeePercent: num(uni.employeePercent),
          monthsOfService: num(uni.monthsOfService),
          optedIn: Boolean(uni.brsOptedIn),
          taxExemptPlannedPerPeriod: czAnnual / uniPeriods,
          hasCombatZoneContributions: Boolean(uni.hasCombatZoneContributions),
          traditionalTaxExemptBasis: uni.traditionalTaxExemptBasis,
        },
      ],
      otherSharedPlanDeferrals: num(milTsp.otherSharedPlanDeferrals),
      userraMakeUp: userra.transactions,
    });
    militaryIssues.push(...tspCoordination.issues);
    if (uniSystem === TSP_SYSTEMS.BRS && num(uni.unvestedAutomaticBalance) > 0 && !isAutomaticVested({ system: TSP_SYSTEMS.BRS, yearsOfServiceInSystem: num(uni.monthsOfService) / 12 })) {
      militaryIssues.push(raiseIssue(ISSUE_CODES.MIL_TSP_VESTING_AT_RISK, { entity: { type: 'tspAccount', id: ACCOUNT_CONTEXTS.UNIFORMED } }));
    }
  }

  // ---- Health coverage periods, one row per person; conflicts block.
  const coverage = validateCoveragePeriods(scenario.military?.coverage ?? [], {
    fehbEligibility: {
      primary: currentAge < separationAge || (Boolean(scenario.healthcare?.fehbEnrolled) && fehb.outcome === 'continues'),
      spouse: Boolean(scenario.household?.spouse?.enabled && scenario.household?.spouse?.isFederal),
    },
    asOfDate: `${asOfDate.getFullYear()}-${String(asOfDate.getMonth() + 1).padStart(2, '0')}-01`,
  });
  militaryIssues.push(...coverage.issues);

  // ---- BRS extras: continuation pay from an official offer, and the lump sum
  // against the linked BRS retired-pay calculation.
  const brsCfg = scenario.military?.brs ?? {};
  let brs = null;
  if (uni.coverageSystem === 'brs' || brsCfg.continuationPay?.offered || num(brsCfg.lumpSum?.electionPercent) > 0) {
    const continuationPay = brsCfg.continuationPay?.offered ? continuationPayScenario({ offer: brsCfg.continuationPay }) : null;
    let lumpSum = null;
    if (num(brsCfg.lumpSum?.electionPercent) > 0) {
      const linked = (scenario.military?.retirementScenarios ?? [])
        .map((sc) => (sc.calculations ?? []).find((c) => c.id === sc.currentCalculationId))
        .find((c) => c && c.system === 'brs' && c.projectedMonthly > 0);
      const fra = fullRetirementAge({ birthYear });
      const fraDate = `${birthYear + fra.years}-${String(1 + fra.months).padStart(2, '0')}-01`;
      lumpSum = lumpSumScenario({
        electionPercent: num(brsCfg.lumpSum.electionPercent),
        grossMonthly: linked?.projectedMonthly ?? 0,
        retiredPayStartDate: linked?.retiredPayStartDate ?? null,
        fullRetirementDate: fraDate,
        officialDiscountRate: brsCfg.lumpSum.officialDiscountRate === null || brsCfg.lumpSum.officialDiscountRate === undefined ? null : { rate: num(brsCfg.lumpSum.officialDiscountRate), year: brsCfg.lumpSum.discountRateYear, source: brsCfg.lumpSum.discountRateSource },
        asOfYear,
        colaAssumption: num(scenario.tsp?.inflationRate, 2.5) / 100,
        vaOffsetKnown: Boolean(brsCfg.lumpSum.vaOffsetKnown),
      });
      lumpSum = { ...lumpSum, linkedCalculationId: linked?.id ?? null };
    }
    brs = { continuationPay, lumpSum };
    militaryIssues.push(...(continuationPay?.issues ?? []), ...(lumpSum?.issues ?? []));
  }

  return {
    path,
    pathLabel: pathEval?.label ?? (special?.isEligible ? 'Special provision, immediate' : 'No annuity'),
    isEligibleForAnnuity,
    reason: pathEval?.reason ?? null,
    notes: [
      ...(pathEval?.notes ?? []),
      ...(exceedsMandatoryAge
        ? [`Mandatory retirement at ${mandatoryRetirementAge} for this position: a separation at ${separationAge} is not available.`]
        : []),
    ],
    mandatoryRetirementAge,
    exceedsMandatoryAge,
    mraBirthYear: birthYear,
    mraIsDerived: profile.mra === null || profile.mra === undefined || profile.mra === '',
    // The birth year is now exact, so nothing needs confirming except the one
    // day-level rule the app cannot see.
    mraIsTransitionBand: isMraTransitionYear(birthYear),
    currentAge,
    separationAge,
    annuityStartAge,
    isDeferred,
    isPostponed,
    isSpecialProvision: Boolean(special?.isEligible),
    mra,
    service: {
      todayYears: num(fers.yearsOfService) + num(fers.monthsOfService) / 12,
      civilianYears,
      militaryCreditYears,
      eligibilityYears,
      computationYears: fersResults?.service?.computationYears ?? eligibilityYears,
      sickLeaveYears: fersResults?.service?.sickLeaveYears ?? 0,
      creditsSickLeave,
    },
    military: {
      creditYears: militaryCreditYears,
      creditDuration: militaryCredit.creditDuration,
      status: militaryCredit.status,
      reason: militaryCredit.reason,
      depositPaidInFull: militaryCredit.depositPaidInFull,
      hasRecordedService: militaryCredit.hasRecordedService,
      creditedPeriodIds: militaryCredit.creditedPeriodIds,
      recordedYears: militaryCredit.normalized.totals.creditableYears + militaryCredit.normalized.totals.undatedApproximateYears,
      /** Each recorded period with its classification, for the screens. */
      normalizedPeriods: militaryCredit.normalized.periods,
      separationDate,
      deposit: {
        mode: militaryCredit.deposit.mode,
        principal: militaryCredit.deposit.principal,
        principalComplete: militaryCredit.deposit.principalComplete,
        interest: militaryCredit.deposit.interest,
        balance: militaryCredit.deposit.balance,
        totalPaid: militaryCredit.deposit.totalPaid,
        projectionDate: militaryCredit.deposit.projectionDate,
        interestAccrualDate: militaryCredit.deposit.interestAccrualDate,
        nextPostingDate: militaryCredit.deposit.nextPostingDate,
        officialBalance: militaryCredit.deposit.officialBalance,
        plannedPaymentDate: scenario.military?.deposit?.plannedPaymentDate ?? null,
        plannedPaymentAssumed: militaryCredit.deposit.plannedPaymentAssumed,
        plannedAfterSeparation: militaryCredit.deposit.plannedAfterSeparation,
        byPeriod: militaryCredit.deposit.byPeriod,
        ledger: militaryCredit.deposit.ledger,
        ratesUsed: militaryCredit.deposit.ratesUsed,
      },
      retiredPay: {
        ...militaryCredit.retiredPayGate,
        receives: scenario.military?.retiredPay?.receives ?? 'no',
        type: scenario.military?.retiredPay?.type ?? null,
        hypotheticalWaiver: Boolean(scenario.military?.hypotheticalWaiver),
      },
      incomeStreams: incomeStreams.streams,
      stateMilitaryRetiredPay: stateMilitaryRule
        ? { state: stateCode, applied: stateMilitaryRule.applied, verified: stateMilitaryRule.verified, treatment: stateMilitaryRule.treatment, reason: stateMilitaryRule.reason }
        : null,
      /** Shared-limit validation across the civilian and uniformed-services accounts; null when no uniformed account. */
      tsp: tspCoordination,
      userra: { transactions: userra.transactions, totals: userra.totals },
      /** Validated coverage periods, one per person per period, with their issues. */
      coverage: coverage.periods,
      brs,
      issues: militaryIssues,
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
