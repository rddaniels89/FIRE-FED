/**
 * Military service deposits under FERS.
 *
 * Post-1956 active duty counts toward a FERS annuity only if a deposit is paid.
 * Skip it and the time is simply gone: it does not raise the annuity, and it
 * does not count toward eligibility either — which means paying can move the
 * date you are allowed to retire, not just the size of the cheque.
 *
 * The deposit is 3% of the basic pay earned while serving. That is basic pay at
 * the time, not today's money, so four years of service in the 1990s is usually
 * a few thousand dollars against an annuity increase paid for life. The
 * arithmetic is nearly always favourable, and the reason people miss it is that
 * nobody puts the two numbers side by side.
 *
 * Interest is free for two years from the date FERS coverage begins, then
 * accrues at a variable rate set annually. The deposit must be paid in full
 * before separation.
 *
 * https://www.opm.gov/retirement-center/fers-information/creditable-service/
 */

/** FERS deposit rate: 3% of military basic pay earned. */
export const FERS_MILITARY_DEPOSIT_RATE = 0.03;

/** Interest does not begin accruing until two years after FERS coverage starts. */
export const INTEREST_FREE_YEARS = 2;

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * The deposit owed on a period of military service.
 *
 * `militaryBasicPay` is total basic pay earned during the service, in the
 * dollars of the day.
 */
export function calculateMilitaryDeposit({
  militaryBasicPay,
  yearsSinceFersCoverageBegan = 0,
  annualInterestRate = 0,
} = {}) {
  const pay = Math.max(0, num(militaryBasicPay));
  const principal = pay * FERS_MILITARY_DEPOSIT_RATE;

  const accruingYears = Math.max(0, num(yearsSinceFersCoverageBegan) - INTEREST_FREE_YEARS);
  const rate = Math.max(0, num(annualInterestRate));
  const withInterest = principal * Math.pow(1 + rate, accruingYears);

  return {
    principal,
    interest: withInterest - principal,
    total: withInterest,
    interestFreeYearsRemaining: Math.max(0, INTEREST_FREE_YEARS - num(yearsSinceFersCoverageBegan)),
    isAccruingInterest: accruingYears > 0 && rate > 0,
  };
}

/**
 * Whether paying is worth it, and how long it takes to get the money back.
 *
 * The annuity increase is the same computation as any other creditable service:
 * high-3 times the years times the multiplier. Break-even is the deposit divided
 * by that annual increase, and it is usually a small number of years against an
 * annuity paid for the rest of a life.
 *
 * `addsEligibility` is the part that does not show up in the money: military
 * time counts toward the service thresholds too, so a deposit can be what makes
 * an earlier retirement legal at all.
 */
export function evaluateMilitaryDepositDecision({
  militaryYears,
  militaryBasicPay,
  high3Salary,
  multiplier = 0.01,
  yearsSinceFersCoverageBegan = 0,
  annualInterestRate = 0,
  yearsOfAnnuityExpected = 25,
} = {}) {
  const years = Math.max(0, num(militaryYears));
  const high3 = Math.max(0, num(high3Salary));
  const mult = Math.max(0, num(multiplier, 0.01));

  const deposit = calculateMilitaryDeposit({
    militaryBasicPay,
    yearsSinceFersCoverageBegan,
    annualInterestRate,
  });

  const annualAnnuityIncrease = high3 * years * mult;
  const monthlyAnnuityIncrease = annualAnnuityIncrease / 12;

  const breakEvenYears =
    annualAnnuityIncrease > 0 ? deposit.total / annualAnnuityIncrease : null;

  const lifetimeIncrease = annualAnnuityIncrease * Math.max(0, num(yearsOfAnnuityExpected));

  return {
    deposit,
    militaryYears: years,
    annualAnnuityIncrease,
    monthlyAnnuityIncrease,
    breakEvenYears,
    lifetimeIncrease,
    netLifetimeGain: lifetimeIncrease - deposit.total,
    // Nearly always true, and the reason to surface this at all.
    isWorthPaying: breakEvenYears !== null && breakEvenYears < num(yearsOfAnnuityExpected),
    addsEligibility: years > 0,
  };
}
