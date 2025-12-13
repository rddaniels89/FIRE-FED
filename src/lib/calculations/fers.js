export const DEFAULT_RETIREMENT_END_AGE = 85;
export const DEFAULT_MRA = 57;

export function calculateFersMultiplier({ retirementAge, totalYearsOfService }) {
  const age = Number(retirementAge ?? 0);
  const years = Number(totalYearsOfService ?? 0);
  if (age >= 62 && years >= 20) return 0.011;
  return 0.01;
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
}) {
  const totalYears = Number(yearsOfService ?? 0) + Number(monthsOfService ?? 0) / 12;
  const ageNow = Number(currentAge ?? 0);
  const retireAge = Number(retirementAge ?? 0);
  const endAge = Number(retirementEndAge ?? DEFAULT_RETIREMENT_END_AGE);

  const projectedYears =
    includeFutureService ? totalYears + Math.max(0, retireAge - ageNow) : totalYears;

  const { annualPension, monthlyPension, multiplier } = calculateFersPensionAnnual({
    high3Salary,
    totalYearsOfService: projectedYears,
    retirementAge: retireAge,
  });

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
    stayFed: {
      annualPension,
      monthlyPension,
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


