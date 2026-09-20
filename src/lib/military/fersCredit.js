/**
 * How much military service the FERS plan may credit, and under what status.
 *
 * Service that the classifier accepts (supported or estimate only) earns credit
 * only once its deposit is paid in full, unless it predates 1957, which needs
 * no deposit. The deposit engine (deposit.js) decides which periods are paid:
 * from the agency's paid-in-full record when the user has one, otherwise from
 * the payments recorded against the computed balance, period by period, oldest
 * first. A planned payment that clears the balance before separation is
 * treated as made, and the credit that rests on it is an estimate.
 *
 * What the credit does and does not do inside the FERS engine is the point of
 * this module's existence, so it is stated here once:
 *
 *   Counts toward   retirement eligibility (MRA+30, 60/20, 62/5, MRA+10, VERA),
 *                   the annuity computation, and the 20 years that earn the
 *                   1.1% factor at 62.
 *   Never counts    toward the five years of civilian service every FERS
 *                   annuity requires, the High-3, the civilian-service
 *                   numerator of the annuity supplement, or the covered-service
 *                   minimum for law enforcement, firefighter, and controller
 *                   retirement.
 *
 * Whether retired pay must be waived to take the credit is a separate rule
 * that arrives with the retired-pay streams; it is not decided here.
 */

import { MILITARY_RESULT_STATUS, combineStatuses } from './status';
import {
  MODELING_STATUS,
  SERVICE_OWNERS,
  opmDuration,
  opmDurationToYears,
  sumOpmDurations,
} from './servicePeriods';
import { estimateMilitaryDeposit } from './deposit';

const DAYS_PER_OPM_YEAR = 360;

/** Why the credited figure is zero. */
export const CREDIT_REASONS = Object.freeze({
  NO_SERVICE: 'no_service',
  DEPOSIT_UNPAID: 'deposit_unpaid',
  DEPOSIT_AFTER_SEPARATION: 'deposit_after_separation',
  OFFICIAL_DETERMINATION_REQUIRED: 'official_determination_required',
  NOT_CREDITABLE: 'not_creditable',
});

/**
 * Resolves the credit for one household member.
 *
 *   military        the scenario's military block
 *   ownerId         whose periods to read
 *   hireCohort      for the USERRA lesser-of rule
 *   asOfDate        ISO date the plan is being run on
 *   separationDate  ISO date (month precision) the person leaves federal service
 *
 * Returns
 *   creditYears        decimal years on OPM's 360-day basis; what the engine adds
 *   creditDays         the calendar days behind that figure
 *   creditedPeriodIds  periods that contributed
 *   status             SUPPORTED or ESTIMATE_ONLY for a credited figure; null
 *                      when nothing is credited
 *   reason             why nothing is credited (CREDIT_REASONS), else null
 *   deposit            the deposit estimate the credit rests on
 *   issues             why anything recorded is not credited
 *   normalized         the full classification, for screens that show it
 */
export function resolveMilitaryFersCredit(
  military,
  { ownerId = SERVICE_OWNERS.PRIMARY, hireCohort, asOfDate, separationDate = null } = {}
) {
  const periods = Array.isArray(military?.servicePeriods) ? military.servicePeriods : [];
  const own = periods.filter((p) => (p.ownerId ?? SERVICE_OWNERS.PRIMARY) === ownerId);
  const deposit = estimateMilitaryDeposit({ military, periods: own, hireCohort, asOfDate, separationDate });
  const { normalized } = deposit;

  const issues = [...normalized.issues, ...deposit.issues];
  const creditedPeriodIds = new Set([...deposit.creditedPeriodIds, ...deposit.partlyCreditedPeriodIds]);

  // Days come from the credited year segments, so a straddling period whose
  // post-1956 tail is unpaid contributes only its pre-1957 days.
  const creditDays = deposit.creditedSegments.reduce((s, seg) => s + seg.days, 0);

  // OPM's duration is exact only when whole periods are credited; a part-
  // credited period falls back to calendar days on the 360-day year.
  const wholePeriods = normalized.periods.filter((p) => deposit.creditedPeriodIds.includes(p.id) && p.startDate && p.endDate);
  const anyPartial = deposit.partlyCreditedPeriodIds.length > 0;
  const creditDuration = anyPartial ? null : sumOpmDurations(wholePeriods.map((p) => opmDuration(p.startDate, p.endDate)));
  const creditYears = creditDuration && wholePeriods.length > 0 ? opmDurationToYears(creditDuration) : creditDays / DAYS_PER_OPM_YEAR;
  const creditedPeriods = normalized.periods.filter((p) => creditedPeriodIds.has(p.id));

  // The status describes the credited figure. When nothing is credited the
  // status is null and `reason` says why, so a zero is never dressed up as an
  // estimate or a determination it is not.
  const creditable = normalized.periods.filter(
    (p) => p.classification.status === MODELING_STATUS.SUPPORTED || p.classification.status === MODELING_STATUS.ESTIMATE_ONLY
  );
  let status = creditedPeriods.length > 0 ? combineStatuses(creditedPeriods.map((p) => p.classification.status)) : null;
  if (status && deposit.plannedPaymentAssumed) status = MILITARY_RESULT_STATUS.ESTIMATE_ONLY;

  let reason = null;
  if (own.length === 0) reason = CREDIT_REASONS.NO_SERVICE;
  else if (creditedPeriods.length === 0) {
    if (deposit.plannedAfterSeparation) reason = CREDIT_REASONS.DEPOSIT_AFTER_SEPARATION;
    else if (creditable.length > 0) reason = CREDIT_REASONS.DEPOSIT_UNPAID;
    else if (normalized.periods.some((p) => p.classification.status === MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED))
      reason = CREDIT_REASONS.OFFICIAL_DETERMINATION_REQUIRED;
    else reason = CREDIT_REASONS.NOT_CREDITABLE;
  }

  return {
    creditYears,
    creditDays,
    creditDuration: creditedPeriods.length > 0 ? creditDuration : null,
    partlyCreditedPeriodIds: deposit.partlyCreditedPeriodIds,
    creditedPeriodIds: [...creditedPeriodIds],
    status,
    reason,
    depositPaidInFull: deposit.paidInFullRecorded,
    hasRecordedService: own.length > 0,
    deposit,
    issues,
    normalized,
  };
}
