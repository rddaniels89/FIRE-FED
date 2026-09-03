export const DEFAULT_RETIREMENT_END_AGE = 85;
export const DEFAULT_MRA = 57;

/**
 * OPM's leave year: 2,087 hours. Unused sick leave converts at this rate and is
 * added to service for the annuity computation only.
 *
 * https://www.opm.gov/retirement-center/fers-information/computation/
 */
export const SICK_LEAVE_HOURS_PER_WORK_YEAR = 2087;

/**
 * Survivor annuity elections. The survivor benefit is a percentage of the
 * retiree's annuity *before* the survivor reduction, and the retiree's own
 * annuity is reduced by the cost for life.
 *
 * Electing none requires notarized spousal consent if married, and it also ends
 * the spouse's ability to keep FEHB after the retiree dies — the reason the
 * election matters beyond the dollar figures.
 */
export const SURVIVOR_ELECTIONS = Object.freeze({
  NONE: 'none',
  PARTIAL: 'partial',
  FULL: 'full',
});

export const SURVIVOR_ELECTION_RULES = Object.freeze({
  [SURVIVOR_ELECTIONS.NONE]: { reductionPercent: 0, survivorPercent: 0 },
  [SURVIVOR_ELECTIONS.PARTIAL]: { reductionPercent: 5, survivorPercent: 25 },
  [SURVIVOR_ELECTIONS.FULL]: { reductionPercent: 10, survivorPercent: 50 },
});

/**
 * Unused sick leave expressed as years of service.
 *
 * Creditable for the annuity computation only. It cannot establish eligibility
 * to retire, cannot raise the high-3, and does not count toward the Special
 * Retirement Supplement.
 */
export function convertSickLeaveHoursToServiceYears(unusedSickLeaveHours) {
  const hours = Number(unusedSickLeaveHours);
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return hours / SICK_LEAVE_HOURS_PER_WORK_YEAR;
}

export function getSurvivorElectionRule(election) {
  return (
    SURVIVOR_ELECTION_RULES[election] ?? SURVIVOR_ELECTION_RULES[SURVIVOR_ELECTIONS.NONE]
  );
}

/**
 * Applies a survivor election to a gross annuity.
 *
 * The survivor's benefit is computed from the annuity before the reduction, not
 * after — a full election on a $40,000 annuity pays the survivor $20,000 while
 * costing the retiree $4,000 a year.
 */
export function calculateSurvivorBenefit({
  annualPensionBeforeSurvivorReduction,
  election = SURVIVOR_ELECTIONS.NONE,
}) {
  const gross = Math.max(0, Number(annualPensionBeforeSurvivorReduction ?? 0));
  const rule = getSurvivorElectionRule(election);

  const annualReduction = (gross * rule.reductionPercent) / 100;

  return {
    election: SURVIVOR_ELECTION_RULES[election] ? election : SURVIVOR_ELECTIONS.NONE,
    reductionPercent: rule.reductionPercent,
    survivorPercent: rule.survivorPercent,
    annualReduction,
    monthlyReduction: annualReduction / 12,
    annualPensionAfterReduction: gross - annualReduction,
    survivorAnnualBenefit: (gross * rule.survivorPercent) / 100,
    survivorMonthlyBenefit: (gross * rule.survivorPercent) / 100 / 12,
  };
}

export function calculateFersMultiplier({ retirementAge, totalYearsOfService }) {
  const age = Number(retirementAge ?? 0);
  const years = Number(totalYearsOfService ?? 0);
  if (age >= 62 && years >= 20) return 0.011;
  return 0.01;
}

export function calculateMra10ReductionPercent({ annuityStartAge, mra = DEFAULT_MRA }) {
  const startAge = Number(annuityStartAge ?? 0);
  const mraAge = Number(mra ?? DEFAULT_MRA);
  if (startAge <= 0) return 0;
  if (startAge >= 62) return 0;
  if (startAge < mraAge) return 0;

  const yearsUnder62 = 62 - startAge;
  // Simplified rule: 5% per year under 62 (pro-rated monthly in real life; we keep it simple here).
  return Math.max(0, yearsUnder62 * 5);
}

export function evaluateFersRegularEligibility({
  age,
  totalYearsOfService,
  mra = DEFAULT_MRA,
}) {
  const a = Number(age ?? 0);
  const y = Number(totalYearsOfService ?? 0);
  const mraAge = Number(mra ?? DEFAULT_MRA);

  const immediateFull =
    (a >= 62 && y >= 5) ||
    (a >= 60 && y >= 20) ||
    (a >= mraAge && y >= 30);

  const immediateMra10 = !immediateFull && a >= mraAge && y >= 10;

  const deferred = y >= 5;

  const messages = [];
  if (immediateFull) {
    messages.push('Eligible for immediate retirement (unreduced annuity)');
  } else if (immediateMra10) {
    const reduction = calculateMra10ReductionPercent({ annuityStartAge: a, mra: mraAge });
    messages.push(
      `Eligible for immediate retirement under MRA+10 (simplified reduction: ~${reduction.toFixed(1)}%)`
    );
    messages.push('You may be able to postpone the annuity start to reduce/eliminate the reduction (not fully modeled).');
  } else if (deferred) {
    messages.push('Not eligible for immediate retirement; may be eligible for deferred retirement (FEHB rules differ).');
  } else {
    messages.push('Not eligible yet (needs at least 5 years of service for deferred options).');
  }

  return {
    age: a,
    totalYearsOfService: y,
    mra: mraAge,
    isEligibleImmediate: immediateFull || immediateMra10,
    isEligibleImmediateUnreduced: immediateFull,
    isEligibleImmediateMra10: immediateMra10,
    isEligibleDeferred: deferred,
    messages,
  };
}

export function findEarliestFersImmediateRetirementAge({
  currentAge,
  totalYearsOfService,
  mra = DEFAULT_MRA,
  maxAgeToCheck = 70,
}) {
  const ageNow = Number(currentAge ?? 0);
  const yearsNow = Number(totalYearsOfService ?? 0);
  const maxAge = Number(maxAgeToCheck ?? 70);

  if (!Number.isFinite(ageNow) || !Number.isFinite(yearsNow)) return null;
  if (ageNow <= 0 || maxAge < ageNow) return null;

  for (let a = Math.ceil(ageNow); a <= maxAge; a++) {
    const projectedYears = yearsNow + Math.max(0, a - ageNow);
    const res = evaluateFersRegularEligibility({ age: a, totalYearsOfService: projectedYears, mra });
    if (res.isEligibleImmediate) return a;
  }
  return null;
}

export function calculateFersEligibility({ retirementAge, totalYearsOfService }) {
  const age = Number(retirementAge ?? 0);
  const years = Number(totalYearsOfService ?? 0);

  if (age >= 62 && years >= 5) {
    return { isEligible: true, eligibilityMessage: 'Eligible for immediate retirement with full pension' };
  }
  if (age >= 60 && years >= 20) {
    return { isEligible: true, eligibilityMessage: 'Eligible for immediate retirement with full pension' };
  }
  if (age >= 57 && years >= 30) {
    return { isEligible: true, eligibilityMessage: 'Eligible for immediate retirement with full pension' };
  }

  return {
    isEligible: false,
    eligibilityMessage: 'Not eligible for immediate retirement. Consider deferred retirement.',
  };
}

export function calculateFersPensionAnnual({ high3Salary, totalYearsOfService, retirementAge }) {
  const multiplier = calculateFersMultiplier({ retirementAge, totalYearsOfService });
  const annualPension = Number(high3Salary ?? 0) * Number(totalYearsOfService ?? 0) * multiplier;
  return { annualPension, monthlyPension: annualPension / 12, multiplier };
}

export function calculateFersResults({
  yearsOfService,
  monthsOfService,
  high3Salary,
  currentAge,
  retirementAge,
  showComparison,
  privateJobSalary,
  privateJobYears,
  includeFutureService = false,
  retirementEndAge = DEFAULT_RETIREMENT_END_AGE,
  mra = DEFAULT_MRA,
  deferredYearsAssumption = 20,
  unusedSickLeaveHours = 0,
  survivorElection = SURVIVOR_ELECTIONS.NONE,
}) {
  const totalYears = Number(yearsOfService ?? 0) + Number(monthsOfService ?? 0) / 12;
  const ageNow = Number(currentAge ?? 0);
  const retireAge = Number(retirementAge ?? 0);
  const endAge = Number(retirementEndAge ?? DEFAULT_RETIREMENT_END_AGE);

  // Service that counts toward eligibility. Sick leave is deliberately excluded:
  // it cannot be used to qualify for retirement.
  const projectedYears =
    includeFutureService ? totalYears + Math.max(0, retireAge - ageNow) : totalYears;

  const sickLeaveYears = convertSickLeaveHoursToServiceYears(unusedSickLeaveHours);
  const computationYears = projectedYears + sickLeaveYears;

  // The 1.1% factor requires age 62 with 20 years. Read conservatively here as a
  // threshold sick leave cannot satisfy, consistent with sick leave being barred
  // from establishing eligibility — so the multiplier keys off service alone.
  const multiplier = calculateFersMultiplier({
    retirementAge: retireAge,
    totalYearsOfService: projectedYears,
  });

  const annualPensionBeforeSurvivorReduction =
    Number(high3Salary ?? 0) * computationYears * multiplier;

  const survivor = calculateSurvivorBenefit({
    annualPensionBeforeSurvivorReduction,
    election: survivorElection,
  });

  const annualPension = survivor.annualPensionAfterReduction;
  const monthlyPension = annualPension / 12;

  const lifetimePension = annualPension * Math.max(0, endAge - retireAge);
  const eligibility = calculateFersEligibility({ retirementAge: retireAge, totalYearsOfService: projectedYears });

  const workingYears = Math.max(0, retireAge - ageNow);
  const totalLifetimeEarnings = workingYears * Number(high3Salary ?? 0) + lifetimePension;

  // Leave early scenario: simplified assumptions
  const deferredYears = Number(deferredYearsAssumption ?? 20);
  const deferredPension = Number(high3Salary ?? 0) * deferredYears * 0.01;
  const lifetimeDeferred = deferredPension * Math.max(0, endAge - Number(mra ?? DEFAULT_MRA));

  const privateSectorEarnings = Number(privateJobYears ?? 0) * Number(privateJobSalary ?? 0);
  const leaveEarlyLifetimeEarnings =
    deferredYears * Number(high3Salary ?? 0) + privateSectorEarnings + lifetimeDeferred;

  let breakEvenAge = 0;
  if (showComparison) {
    const annualDifference = annualPension - deferredPension;
    if (annualDifference > 0) {
      const earningsGap = leaveEarlyLifetimeEarnings - totalLifetimeEarnings;
      if (earningsGap > 0) {
        breakEvenAge = retireAge + earningsGap / annualDifference;
      }
    }
  }

  return {
    totalYears,
    projectedYears,
    service: {
      // Eligibility and computation differ once sick leave is in play, and the
      // difference is the whole point of tracking both.
      eligibilityYears: projectedYears,
      sickLeaveYears,
      computationYears,
      unusedSickLeaveHours: Math.max(0, Number(unusedSickLeaveHours ?? 0)),
    },
    survivor,
    stayFed: {
      annualPension,
      monthlyPension,
      annualPensionBeforeSurvivorReduction,
      multiplier,
      lifetimePension,
      isEligible: eligibility.isEligible,
      eligibilityMessage: eligibility.eligibilityMessage,
      totalLifetimeEarnings,
    },
    leaveEarly: {
      deferredPension,
      mra: Number(mra ?? DEFAULT_MRA),
      lifetimeDeferred,
      totalLifetimeEarnings: leaveEarlyLifetimeEarnings,
      breakEvenAge,
    },
  };
}


