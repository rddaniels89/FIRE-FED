/**
 * How much military service the FERS plan may credit, and under what status.
 *
 * Service that the classifier accepts (supported or estimate only) earns credit
 * only once its deposit is paid in full, unless it predates 1957, which needs
 * no deposit. Until the deposit engine tracks payment by period, the block
 * carries one deposit status for the whole record: paid in full credits every
 * creditable period; anything else credits only the pre-1957 days.
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

import {
  ISSUE_CODES,
  MILITARY_RESULT_STATUS,
  combineStatuses,
  raiseIssue,
} from './status';
import {
  MODELING_STATUS,
  SERVICE_OWNERS,
  normalizeMilitaryServicePeriods,
  opmDuration,
  opmDurationToYears,
  sumOpmDurations,
} from './servicePeriods';

const PAID_IN_FULL = 'paid_in_full';
const DAYS_PER_OPM_YEAR = 360;

/** Why the credited figure is zero. */
export const CREDIT_REASONS = Object.freeze({
  NO_SERVICE: 'no_service',
  DEPOSIT_UNPAID: 'deposit_unpaid',
  OFFICIAL_DETERMINATION_REQUIRED: 'official_determination_required',
  NOT_CREDITABLE: 'not_creditable',
});

/**
 * Resolves the credit for one household member.
 *
 * Returns
 *   creditYears        decimal years on OPM's 360-day basis; what the engine adds
 *   creditDays         the calendar days behind that figure
 *   creditedPeriodIds  periods that contributed
 *   status             SUPPORTED or ESTIMATE_ONLY for a credited figure; null
 *                      when nothing is credited
 *   reason             why nothing is credited (CREDIT_REASONS), else null
 *   depositPaidInFull  the deposit status the credit relied on
 *   issues             why anything recorded is not credited
 *   normalized         the full classification, for screens that show it
 */
export function resolveMilitaryFersCredit(military, { ownerId = SERVICE_OWNERS.PRIMARY } = {}) {
  const periods = Array.isArray(military?.servicePeriods) ? military.servicePeriods : [];
  const own = periods.filter((p) => (p.ownerId ?? SERVICE_OWNERS.PRIMARY) === ownerId);
  const normalized = normalizeMilitaryServicePeriods(own);
  const depositPaidInFull = military?.deposit?.status === PAID_IN_FULL;

  const issues = [...normalized.issues];
  const creditedPeriodIds = new Set();
  const uncreditedForDeposit = new Set();
  let creditDays = 0;

  for (const segment of normalized.segments) {
    if (!segment.depositRequired || depositPaidInFull) {
      creditDays += segment.days;
      creditedPeriodIds.add(segment.periodId);
    } else {
      uncreditedForDeposit.add(segment.periodId);
    }
  }
  for (const id of uncreditedForDeposit) {
    if (!creditedPeriodIds.has(id)) {
      issues.push(raiseIssue(ISSUE_CODES.MIL_DEPOSIT_PARTIAL, { entity: { type: 'servicePeriod', id } }));
    }
  }

  // OPM's duration for the credited periods, so the figure matches what the
  // agency would show, falling back to calendar days when a period was only
  // partly credited (a pre-1957 start with an unpaid post-1956 tail).
  const fullyCredited = normalized.periods.filter(
    (p) => creditedPeriodIds.has(p.id) && !uncreditedForDeposit.has(p.id) && p.startDate && p.endDate
  );
  const partlyCredited = normalized.periods.some((p) => creditedPeriodIds.has(p.id) && uncreditedForDeposit.has(p.id));
  const creditDuration = partlyCredited
    ? null
    : sumOpmDurations(fullyCredited.map((p) => opmDuration(p.startDate, p.endDate)));
  const creditYears = creditDuration ? opmDurationToYears(creditDuration) : creditDays / DAYS_PER_OPM_YEAR;

  // The status describes the credited figure. When nothing is credited the
  // status is null and `reason` says why, so a zero is never dressed up as an
  // estimate or a determination it is not.
  const credited = normalized.periods.filter((p) => creditedPeriodIds.has(p.id));
  const creditable = normalized.periods.filter(
    (p) => p.classification.status === MODELING_STATUS.SUPPORTED || p.classification.status === MODELING_STATUS.ESTIMATE_ONLY
  );
  const status = credited.length > 0 ? combineStatuses(credited.map((p) => p.classification.status)) : null;
  let reason = null;
  if (own.length === 0) reason = CREDIT_REASONS.NO_SERVICE;
  else if (credited.length === 0) {
    if (creditable.length > 0) reason = CREDIT_REASONS.DEPOSIT_UNPAID;
    else if (normalized.periods.some((p) => p.classification.status === MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED))
      reason = CREDIT_REASONS.OFFICIAL_DETERMINATION_REQUIRED;
    else reason = CREDIT_REASONS.NOT_CREDITABLE;
  }

  return {
    creditYears,
    creditDays,
    creditDuration,
    creditedPeriodIds: [...creditedPeriodIds],
    status,
    reason,
    depositPaidInFull,
    hasRecordedService: own.length > 0,
    issues,
    normalized,
  };
}

