/**
 * Military service periods: what the user records, and what FERS can credit.
 *
 * A period is a span of dates with a branch, a component, a duty status, an
 * order authority when known, and a character-of-service status. From those
 * facts this module decides one thing: whether FireFed may model the period as
 * creditable FERS service, must stop for an agency determination, or must
 * exclude it. That decision is planning logic, not an OPM decision, and the
 * classification says so on every result.
 *
 * What OPM credits (CSRS/FERS Handbook chapter 22; 5 U.S.C. 8411(c)):
 *
 *   Active duty, active duty for training, and cadet or midshipman time at a
 *   service academy are creditable when performed under honorable conditions.
 *   Service after 1956 needs a deposit; service before 1957 does not.
 *
 *   Inactive-duty training (drill) and state active duty are not creditable.
 *
 *   Full-time National Guard duty under Title 32 is creditable only when it
 *   interrupted federal civilian service that was followed by reemployment
 *   under USERRA, and only under 32 U.S.C. 316, 502, 503, 504 or 505. Nothing
 *   about a Guard period can be inferred from its dates; the user supplies the
 *   authority and the interruption fact, and the agency decides.
 *
 *   ROTC field training after 1964 can be creditable in narrow cases. That
 *   rule is not implemented; the period is held for an official determination.
 *
 * Dates. Users enter inclusive start and end dates as they appear on a DD 214.
 * Internally every period is a half-open interval [start, end + 1 day) so that
 * adjacent periods neither overlap nor leave a gap, and periods are split at
 * calendar-year boundaries because the deposit rate and the basic pay it is
 * applied to are year-specific. All arithmetic is in UTC calendar days; no
 * date is derived from a floating-point age.
 *
 * Duration. OPM totals service in years, months and days with a 30-day month:
 * each period is (end + 1 day) − start with borrowing at 30, the periods are
 * summed, and 30 days carry into a month and 12 months into a year. That is
 * the figure an SF 50 or retirement estimate shows, so it is the one reported.
 */

import {
  INPUT_PROVENANCE,
  ISSUE_CODES,
  MILITARY_RESULT_STATUS,
  hasBlockingIssue,
  raiseIssue,
} from './status';

export const BRANCHES = Object.freeze({
  ARMY: 'army',
  NAVY: 'navy',
  AIR_FORCE: 'air_force',
  MARINE_CORPS: 'marine_corps',
  COAST_GUARD: 'coast_guard',
  SPACE_FORCE: 'space_force',
  PUBLIC_HEALTH_SERVICE: 'public_health_service',
  NOAA_CORPS: 'noaa_corps',
  OTHER: 'other',
});

export const COMPONENTS = Object.freeze({
  REGULAR: 'regular',
  RESERVE: 'reserve',
  NATIONAL_GUARD: 'national_guard',
  OTHER: 'other',
  UNKNOWN: 'unknown',
});

export const DUTY_STATUS = Object.freeze({
  ACTIVE_DUTY: 'active_duty',
  ACTIVE_DUTY_FOR_TRAINING: 'active_duty_for_training',
  INACTIVE_DUTY_TRAINING: 'inactive_duty_training',
  ACADEMY: 'academy',
  ROTC: 'rotc',
  TITLE32_FULL_TIME: 'title32_full_time',
  STATE_ACTIVE_DUTY: 'state_active_duty',
  UNKNOWN: 'unknown',
});

export const CHARACTER_STATUS = Object.freeze({
  CONFIRMED_HONORABLE_CONDITIONS: 'confirmed_honorable_conditions',
  NOT_CONFIRMED: 'not_confirmed',
  UNKNOWN: 'unknown',
});

export const DOCUMENTATION_STATUS = Object.freeze({
  DD214: 'dd214',
  STATEMENT_OF_SERVICE: 'statement_of_service',
  OTHER_OFFICIAL: 'other_official',
  NONE: 'none',
  UNKNOWN: 'unknown',
});

/** Who in the household the period belongs to. */
export const SERVICE_OWNERS = Object.freeze({ PRIMARY: 'primary', SPOUSE: 'spouse' });

/**
 * The modelling status of a period for FERS credit. The first three are the
 * shared result statuses; the fourth is the shared NOT_SUPPORTED status under
 * the name the classification rules use.
 */
export const MODELING_STATUS = Object.freeze({
  SUPPORTED: MILITARY_RESULT_STATUS.SUPPORTED,
  ESTIMATE_ONLY: MILITARY_RESULT_STATUS.ESTIMATE_ONLY,
  OFFICIAL_DETERMINATION_REQUIRED: MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED,
  NOT_SUPPORTED_FOR_FERS_CREDIT: MILITARY_RESULT_STATUS.NOT_SUPPORTED,
});

/** Title 32 sections under which full-time Guard duty can be creditable (USERRA cases only). */
export const CREDITABLE_TITLE32_SECTIONS = Object.freeze(['316', '502', '503', '504', '505']);

/** Service on or after this date requires a deposit to be credited. */
export const POST_1956_DEPOSIT_START = '1957-01-01';

const OFFICIAL_DOCUMENTATION = new Set([
  DOCUMENTATION_STATUS.DD214,
  DOCUMENTATION_STATUS.STATEMENT_OF_SERVICE,
  DOCUMENTATION_STATUS.OTHER_OFFICIAL,
]);

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `sp_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

/** A period with every field present. Callers override what they know. */
export function createServicePeriod(overrides = {}) {
  return {
    id: overrides.id ?? nextId(),
    ownerId: SERVICE_OWNERS.PRIMARY,
    branch: BRANCHES.OTHER,
    component: COMPONENTS.UNKNOWN,
    dutyStatus: DUTY_STATUS.UNKNOWN,
    authorityTitle: null,
    authoritySection: null,
    startDate: null,
    endDate: null,
    characterStatus: CHARACTER_STATUS.UNKNOWN,
    interruptedFederalService: false,
    linkedFederalAbsenceId: null,
    documentationStatus: DOCUMENTATION_STATUS.UNKNOWN,
    inputProvenance: INPUT_PROVENANCE.USER_ESTIMATE,
    parentPeriodId: null,
    excludedFromDuplicateTotals: false,
    /** Basic pay by calendar year, in the dollars of the day. Null until entered. */
    earningsByYear: null,
    /**
     * Legacy only: a whole-year count carried over from the pre-v4 schema, which
     * recorded military service as a number with no dates. Never set by the UI.
     */
    approximateYears: null,
    ...overrides,
  };
}

// ----------------------------------------------------------------- dates

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses 'YYYY-MM-DD' to a UTC Date at midnight, or null if absent or invalid. */
export function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

const MS_PER_DAY = 86_400_000;

export function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * The half-open interval a period covers, or null when either date is missing
 * or the end precedes the start. The inclusive end the user typed becomes an
 * exclusive end one day later.
 */
export function toHalfOpenInterval(period) {
  const start = parseIsoDate(period?.startDate);
  const endInclusive = parseIsoDate(period?.endDate);
  if (!start || !endInclusive) return null;
  if (endInclusive.getTime() < start.getTime()) return null;
  return { start, endExclusive: addDays(endInclusive, 1) };
}

/** The overlap of two half-open intervals, or null when they do not meet. */
export function intersectIntervals(a, b) {
  const start = a.start.getTime() > b.start.getTime() ? a.start : b.start;
  const endExclusive = a.endExclusive.getTime() < b.endExclusive.getTime() ? a.endExclusive : b.endExclusive;
  if (endExclusive.getTime() <= start.getTime()) return null;
  return { start, endExclusive };
}

/**
 * Splits a half-open interval at every 1 January it crosses. Each piece knows
 * its calendar year and its day count, which is what a year-specific deposit
 * rate is applied to.
 */
export function splitAtCalendarYears(interval) {
  const pieces = [];
  let cursor = interval.start;
  while (cursor.getTime() < interval.endExclusive.getTime()) {
    const year = cursor.getUTCFullYear();
    const nextYear = new Date(Date.UTC(year + 1, 0, 1));
    const endExclusive = nextYear.getTime() < interval.endExclusive.getTime() ? nextYear : interval.endExclusive;
    pieces.push({ year, start: cursor, endExclusive, days: daysBetween(cursor, endExclusive) });
    cursor = endExclusive;
  }
  return pieces;
}

// ---------------------------------------------------------- OPM duration

/**
 * Length of a period the way OPM computes it: (end + 1 day) − start as years,
 * months and days, borrowing 30 days per month. Takes inclusive ISO dates.
 */
export function opmDuration(startDate, endDate) {
  const start = parseIsoDate(startDate);
  const endInclusive = parseIsoDate(endDate);
  if (!start || !endInclusive || endInclusive.getTime() < start.getTime()) return { years: 0, months: 0, days: 0 };
  const end = addDays(endInclusive, 1);

  let years = end.getUTCFullYear() - start.getUTCFullYear();
  let months = end.getUTCMonth() - start.getUTCMonth();
  let days = end.getUTCDate() - start.getUTCDate();
  if (days < 0) {
    days += 30;
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }
  return { years, months, days };
}

/** Sums OPM durations, carrying 30 days into a month and 12 months into a year. */
export function sumOpmDurations(durations) {
  let years = 0;
  let months = 0;
  let days = 0;
  for (const d of durations) {
    years += d?.years ?? 0;
    months += d?.months ?? 0;
    days += d?.days ?? 0;
  }
  months += Math.floor(days / 30);
  days %= 30;
  years += Math.floor(months / 12);
  months %= 12;
  return { years, months, days };
}

/** An OPM duration as decimal years (30-day months, 360-day years), for engines that take years. */
export function opmDurationToYears(d) {
  return (d?.years ?? 0) + (d?.months ?? 0) / 12 + (d?.days ?? 0) / 360;
}

// ----------------------------------------------------- classification

const entityFor = (period) => ({ type: 'servicePeriod', id: period?.id ?? null });

function classifyTitle32(period, issues) {
  const section = period.authoritySection == null ? '' : String(period.authoritySection).trim();
  if (!section) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_TITLE32_UNKNOWN, { entity: entityFor(period), detail: { reason: 'authority_unknown' } }));
    return MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED;
  }
  if (!CREDITABLE_TITLE32_SECTIONS.includes(section)) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_TITLE32_UNKNOWN, { entity: entityFor(period), detail: { reason: 'section_not_qualifying', section } }));
    return MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED;
  }
  if (!period.interruptedFederalService) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_TITLE32_UNKNOWN, { entity: entityFor(period), detail: { reason: 'not_userra_interruption', section } }));
    return MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED;
  }
  return null; // falls through to the supported/estimate decision
}

/**
 * Decides whether FERS may credit a period. Returns
 *
 *   { status, reasonCode, issues, depositRequired }
 *
 * `depositRequired` is true when any part of the period falls on or after
 * 1 January 1957. The order of the checks is the order in the spec: facts
 * that make modelling impossible first, then categories that are never
 * creditable, then the honourable-conditions test, then authority-specific
 * rules, then the official-versus-estimate distinction.
 */
export function classifyServicePeriodForFers(period) {
  const issues = [];
  const entity = entityFor(period);
  const interval = toHalfOpenInterval(period);
  const undatedLegacy = !interval && Number(period?.approximateYears) > 0;

  if (undatedLegacy) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_LEGACY_YEARS_UNDATED, { entity, detail: { approximateYears: Number(period.approximateYears) } }));
    return { status: MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED, reasonCode: ISSUE_CODES.MIL_LEGACY_YEARS_UNDATED, issues, depositRequired: null };
  }
  if (!interval) {
    const reason = parseIsoDate(period?.startDate) && parseIsoDate(period?.endDate) ? 'end_before_start' : 'missing';
    issues.push(raiseIssue(ISSUE_CODES.MIL_DATES_MISSING, { entity, detail: { reason } }));
    return { status: MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED, reasonCode: ISSUE_CODES.MIL_DATES_MISSING, issues, depositRequired: null };
  }

  const depositRequired = interval.endExclusive.getTime() > parseIsoDate(POST_1956_DEPOSIT_START).getTime();
  const hasPre1957 = interval.start.getTime() < parseIsoDate(POST_1956_DEPOSIT_START).getTime();

  const duty = period.dutyStatus;
  if (!duty || duty === DUTY_STATUS.UNKNOWN || !Object.values(DUTY_STATUS).includes(duty)) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_DUTY_STATUS_UNKNOWN, { entity }));
    return { status: MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED, reasonCode: ISSUE_CODES.MIL_DUTY_STATUS_UNKNOWN, issues, depositRequired };
  }

  if (duty === DUTY_STATUS.INACTIVE_DUTY_TRAINING) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_DRILL_NOT_CREDITABLE, { entity }));
    return { status: MODELING_STATUS.NOT_SUPPORTED_FOR_FERS_CREDIT, reasonCode: ISSUE_CODES.MIL_DRILL_NOT_CREDITABLE, issues, depositRequired: false };
  }
  if (duty === DUTY_STATUS.STATE_ACTIVE_DUTY) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_STATE_ACTIVE_DUTY_NOT_CREDITABLE, { entity }));
    return { status: MODELING_STATUS.NOT_SUPPORTED_FOR_FERS_CREDIT, reasonCode: ISSUE_CODES.MIL_STATE_ACTIVE_DUTY_NOT_CREDITABLE, issues, depositRequired: false };
  }

  if (period.characterStatus !== CHARACTER_STATUS.CONFIRMED_HONORABLE_CONDITIONS) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_CHARACTER_UNKNOWN, { entity, detail: { characterStatus: period.characterStatus ?? CHARACTER_STATUS.UNKNOWN } }));
    return { status: MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED, reasonCode: ISSUE_CODES.MIL_CHARACTER_UNKNOWN, issues, depositRequired };
  }

  if (duty === DUTY_STATUS.TITLE32_FULL_TIME) {
    const blocked = classifyTitle32(period, issues);
    if (blocked) return { status: blocked, reasonCode: ISSUE_CODES.MIL_TITLE32_UNKNOWN, issues, depositRequired };
  }
  if (duty === DUTY_STATUS.ROTC) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_RULE_NOT_IMPLEMENTED, { entity, detail: { dutyStatus: duty } }));
    return { status: MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED, reasonCode: ISSUE_CODES.MIL_RULE_NOT_IMPLEMENTED, issues, depositRequired };
  }

  // Active duty, active duty for training, academy time, or qualifying Title 32
  // under honourable conditions: creditable. Official or estimate decides the badge.
  if (period.interruptedFederalService) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_USERRA_DETERMINATION, { entity }));
  }
  if (hasPre1957) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_PRE_1957_NO_DEPOSIT, { entity }));
  }

  const official =
    period.inputProvenance === INPUT_PROVENANCE.USER_ENTERED_OFFICIAL &&
    OFFICIAL_DOCUMENTATION.has(period.documentationStatus);
  if (!official) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_ESTIMATED_PERIOD, { entity }));
    return { status: MODELING_STATUS.ESTIMATE_ONLY, reasonCode: null, issues, depositRequired };
  }
  return { status: MODELING_STATUS.SUPPORTED, reasonCode: null, issues, depositRequired };
}

// ------------------------------------------------------------ overlaps

/**
 * Finds every pair of periods for the same owner that share a calendar day.
 * A pair is `permitted` when one record is the other's parent and the child is
 * tagged as excluded from duplicate totals; every other overlap needs resolving.
 */
export function detectOverlaps(periods) {
  const dated = [];
  for (const p of periods ?? []) {
    const interval = toHalfOpenInterval(p);
    if (interval) dated.push({ period: p, interval });
  }
  const overlaps = [];
  for (let i = 0; i < dated.length; i += 1) {
    for (let j = i + 1; j < dated.length; j += 1) {
      const a = dated[i];
      const b = dated[j];
      if ((a.period.ownerId ?? SERVICE_OWNERS.PRIMARY) !== (b.period.ownerId ?? SERVICE_OWNERS.PRIMARY)) continue;
      const shared = intersectIntervals(a.interval, b.interval);
      if (!shared) continue;
      const aIsChildOfB = a.period.parentPeriodId === b.period.id && a.period.excludedFromDuplicateTotals === true;
      const bIsChildOfA = b.period.parentPeriodId === a.period.id && b.period.excludedFromDuplicateTotals === true;
      overlaps.push({
        periodIds: [a.period.id, b.period.id],
        start: toIsoDate(shared.start),
        endExclusive: toIsoDate(shared.endExclusive),
        days: daysBetween(shared.start, shared.endExclusive),
        permitted: aIsChildOfB || bIsChildOfA,
      });
    }
  }
  return overlaps;
}

// -------------------------------------------------------- normalisation

const emptyTotals = () => ({ supported: 0, estimateOnly: 0, officialDeterminationRequired: 0, notSupported: 0 });

const TOTAL_KEY = Object.freeze({
  [MODELING_STATUS.SUPPORTED]: 'supported',
  [MODELING_STATUS.ESTIMATE_ONLY]: 'estimateOnly',
  [MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED]: 'officialDeterminationRequired',
  [MODELING_STATUS.NOT_SUPPORTED_FOR_FERS_CREDIT]: 'notSupported',
});

/**
 * Turns raw periods into classified periods, non-overlapping year segments,
 * and totals. Nothing is deleted: a period that cannot be modelled is kept
 * with its reason so the user sees why it is missing from the totals.
 *
 * Returns
 *   periods    each input period with `classification` attached
 *   segments   year pieces of periods that can carry credit (supported or
 *              estimate), excluding tagged sub-periods and unresolved overlaps
 *   overlaps   from detectOverlaps
 *   issues     every issue raised, period issues first, then overlap issues
 *   totals     days and OPM durations by modelling status, plus what the
 *              legacy undated figure would have been
 */
export function normalizeMilitaryServicePeriods(periods = []) {
  const list = Array.isArray(periods) ? periods : [];
  const overlaps = detectOverlaps(list);
  const unresolvedOverlapIds = new Set();
  for (const o of overlaps) if (!o.permitted) o.periodIds.forEach((id) => unresolvedOverlapIds.add(id));

  const issues = [];
  const classified = [];
  const segments = [];
  const totalsDays = emptyTotals();
  const totalsDurations = { supported: [], estimateOnly: [], officialDeterminationRequired: [], notSupported: [] };
  let undatedApproximateYears = 0;

  for (const period of list) {
    const classification = classifyServicePeriodForFers(period);
    issues.push(...classification.issues);

    const interval = toHalfOpenInterval(period);
    const key = TOTAL_KEY[classification.status];
    if (interval) {
      const days = daysBetween(interval.start, interval.endExclusive);
      const excluded = period.excludedFromDuplicateTotals === true && period.parentPeriodId;
      const contested = unresolvedOverlapIds.has(period.id);
      if (!excluded && !contested) {
        totalsDays[key] += days;
        totalsDurations[key].push(opmDuration(period.startDate, period.endDate));
      }
      const carriesCredit =
        classification.status === MODELING_STATUS.SUPPORTED || classification.status === MODELING_STATUS.ESTIMATE_ONLY;
      if (carriesCredit && !excluded && !contested) {
        for (const piece of splitAtCalendarYears(interval)) {
          segments.push({
            periodId: period.id,
            ownerId: period.ownerId ?? SERVICE_OWNERS.PRIMARY,
            year: piece.year,
            start: toIsoDate(piece.start),
            endExclusive: toIsoDate(piece.endExclusive),
            days: piece.days,
            modelingStatus: classification.status,
            depositRequired: piece.year >= 1957,
            interruptedFederalService: Boolean(period.interruptedFederalService),
            basicPay: period.earningsByYear && Number.isFinite(Number(period.earningsByYear[piece.year]))
              ? Number(period.earningsByYear[piece.year])
              : null,
          });
        }
      }
      classified.push({
        ...period,
        classification: { ...classification, excludedFromTotals: Boolean(excluded), unresolvedOverlap: contested },
      });
    } else {
      if (Number(period?.approximateYears) > 0) undatedApproximateYears += Number(period.approximateYears);
      classified.push({ ...period, classification: { ...classification, excludedFromTotals: true, unresolvedOverlap: false } });
    }
  }

  for (const o of overlaps) {
    if (o.permitted) continue;
    for (const id of o.periodIds) {
      issues.push(
        raiseIssue(ISSUE_CODES.MIL_PERIOD_OVERLAP, {
          entity: { type: 'servicePeriod', id },
          detail: { withPeriodId: o.periodIds.find((x) => x !== id), start: o.start, endExclusive: o.endExclusive, days: o.days },
        })
      );
    }
  }

  const durations = Object.fromEntries(
    Object.entries(totalsDurations).map(([k, v]) => [k, sumOpmDurations(v)])
  );
  const creditableDuration = sumOpmDurations([durations.supported, durations.estimateOnly]);

  return {
    periods: classified,
    segments,
    overlaps,
    issues,
    hasBlockingIssue: hasBlockingIssue(issues),
    totals: {
      days: totalsDays,
      durations,
      /** Supported plus estimate-only, as OPM would state it. What later passes may credit, subject to the deposit. */
      creditable: creditableDuration,
      creditableYears: opmDurationToYears(creditableDuration),
      undatedApproximateYears,
    },
  };
}
