/**
 * Carrying FEHB into retirement — the five-year rule.
 *
 * Losing federal health insurance is one of the most expensive mistakes
 * available to a retiring employee, and one of the easiest to make by accident.
 * Two conditions have to hold at once:
 *
 *   Five years   Enrolled for the five years immediately before retirement, or
 *                since the first opportunity to enrol.
 *   Immediate    Retiring on an immediate annuity. A deferred annuitant cannot
 *                keep it, and cannot buy back in later at any price.
 *
 * The second is what makes deferring so costly, and why postponing an MRA+10
 * annuity is usually the better route: postponement suspends coverage and
 * reinstates it when payments begin, where deferral ends it permanently.
 *
 * https://www.opm.gov/healthcare-insurance/healthcare/plan-information/
 */

export const FEHB_REQUIRED_YEARS = 5;

export const FEHB_OUTCOMES = Object.freeze({
  CONTINUES: 'continues',
  SUSPENDED_THEN_REINSTATED: 'suspended_then_reinstated',
  LOST_PERMANENTLY: 'lost_permanently',
  NOT_ENROLLED_LONG_ENOUGH: 'not_enrolled_long_enough',
});

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Whether the five-year requirement is satisfied.
 *
 * Enrolment since the first opportunity also qualifies, which covers anyone
 * hired within five years of retiring who took coverage straight away. TRICARE
 * counts toward the five years provided FEHB is in force at retirement.
 */
export function meetsFiveYearRule({
  yearsEnrolled,
  enrolledSinceFirstOpportunity = false,
  tricareYears = 0,
} = {}) {
  if (enrolledSinceFirstOpportunity) return true;
  return num(yearsEnrolled) + num(tricareYears) >= FEHB_REQUIRED_YEARS;
}

/**
 * What happens to coverage on a given retirement path.
 *
 * `isDeferred` and `isPostponed` are deliberately separate: they look similar
 * from the outside and have opposite consequences.
 */
export function evaluateFehbContinuation({
  yearsEnrolled,
  enrolledSinceFirstOpportunity = false,
  tricareYears = 0,
  isDeferred = false,
  isPostponed = false,
  annuityStartAge = null,
} = {}) {
  const meetsService = meetsFiveYearRule({
    yearsEnrolled,
    enrolledSinceFirstOpportunity,
    tricareYears,
  });

  const yearsShort = Math.max(
    0,
    FEHB_REQUIRED_YEARS - (num(yearsEnrolled) + num(tricareYears))
  );

  if (isDeferred) {
    return {
      outcome: FEHB_OUTCOMES.LOST_PERMANENTLY,
      continues: false,
      meetsFiveYearRule: meetsService,
      yearsShort: meetsService ? 0 : yearsShort,
      message:
        'A deferred annuity ends FEHB permanently. Meeting the five-year rule does not change that, and it cannot be reinstated later.',
    };
  }

  if (!meetsService) {
    return {
      outcome: FEHB_OUTCOMES.NOT_ENROLLED_LONG_ENOUGH,
      continues: false,
      meetsFiveYearRule: false,
      yearsShort,
      message: `Coverage stops at retirement. You are ${yearsShort.toFixed(1)} years short of the five-year requirement — staying enrolled that much longer preserves it.`,
    };
  }

  if (isPostponed) {
    return {
      outcome: FEHB_OUTCOMES.SUSPENDED_THEN_REINSTATED,
      continues: true,
      meetsFiveYearRule: true,
      yearsShort: 0,
      message: annuityStartAge
        ? `Coverage is suspended at separation and reinstated when your annuity begins at ${annuityStartAge}. You will need cover in between.`
        : 'Coverage is suspended at separation and reinstated when your annuity begins. You will need cover in between.',
    };
  }

  return {
    outcome: FEHB_OUTCOMES.CONTINUES,
    continues: true,
    meetsFiveYearRule: true,
    yearsShort: 0,
    message: 'Coverage continues into retirement at the same premium share you pay now.',
  };
}
