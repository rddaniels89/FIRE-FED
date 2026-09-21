/**
 * Guard and Reserve (non-regular) retirement: points, qualifying years, the
 * age retired pay begins, and the pay base at that age.
 *
 * Three tests that must never be blurred (spec §20.7):
 *
 *   Qualifying years   whether the member has the 20 satisfactory years the
 *                      retirement requires: a retirement year with at least
 *                      50 creditable points (10 U.S.C. 12732).
 *   Equivalent service total creditable points ÷ 360, the years the multiplier
 *                      is applied to (10 U.S.C. 12733); raw point precision is
 *                      kept.
 *   Retired-pay age    60, unless an official eligibility date says otherwise
 *                      or verified qualifying active duty since 28 January
 *                      2008 earns three-month reductions, never below 50
 *                      (10 U.S.C. 12731(f)).
 *
 * Points per retirement year are capped in two ways: membership points at 15
 * for a year in an active status, and inactive-duty points at a ceiling that
 * has risen over time by the retirement-year ending date: 60 before
 * 23 September 1996, 75 through 29 October 2000, 90 through 29 October 2007,
 * 130 since (10 U.S.C. 12733(3)). Active-duty points are never capped by the
 * inactive ceiling. A year's total cannot exceed the days in it.
 *
 * The official point statement controls. A detailed audit that does not
 * reconcile to the entered official total blocks the result until the user
 * resolves it.
 *
 * Pay base. A member of the Retired Reserve awaiting pay keeps accruing
 * years of service for the pay-table band until pay begins; a former member
 * who was discharged does not (10 U.S.C. 1407(f)). Both are paid from the
 * table in force when pay begins. The former-member treatment is marked for
 * verification.
 */

import { ISSUE_CODES, INPUT_PROVENANCE, raiseIssue } from '../status';
import { parseIsoDate, toIsoDate } from '../servicePeriods';

export const QUALIFYING_YEAR_POINTS = 50;
export const REQUIRED_QUALIFYING_YEARS = 20;
export const POINTS_PER_YEAR = 360;
export const MEMBERSHIP_POINTS_CAP = 15;
export const DEFAULT_RETIRED_PAY_AGE = 60;
export const MINIMUM_REDUCED_RETIRED_PAY_AGE = 50;
export const REDUCED_AGE_UNIT_DAYS = 90;
export const REDUCED_AGE_UNIT_MONTHS = 3;
/** Qualifying duty performed on or after this date can reduce the retired-pay age. */
export const REDUCED_AGE_DUTY_FROM = '2008-01-28';
/** From this date, qualifying days aggregate across fiscal years; before it, within one fiscal year. */
export const REDUCED_AGE_AGGREGATION_FROM = '2014-10-01';

export const RETIRED_RESERVE_STATUSES = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  RETIRED_RESERVE: 'retired_reserve',
  FORMER_MEMBER: 'former_member',
  UNKNOWN: 'unknown',
});

/** Inactive-duty point ceiling by retirement-year ending date. */
export const INACTIVE_POINT_CAPS = Object.freeze([
  { from: '2007-10-30', cap: 130 },
  { from: '2000-10-30', cap: 90 },
  { from: '1996-09-23', cap: 75 },
  { from: '0000-01-01', cap: 60 },
]);

/** Order authorities under which active duty can count toward a reduced retired-pay age (10 U.S.C. 12731(f)(2)). */
export const REDUCED_AGE_AUTHORITIES = Object.freeze(['12301(a)', '12301(d)', '12302', '12304', '12304a', '12304b', '12305', '12306', '331', '332', '12406', '688', 'title32_502f']);

const int = (v) => Math.max(0, Math.floor(Number(v) || 0));

export function inactivePointCapFor(retirementYearEnd) {
  const d = String(retirementYearEnd ?? '');
  for (const row of INACTIVE_POINT_CAPS) if (d >= row.from) return row.cap;
  return 60;
}

function daysInRetirementYear(retirementYearEnd) {
  const end = parseIsoDate(retirementYearEnd);
  if (!end) return 365;
  const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), end.getUTCDate() + 1));
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/**
 * Audits detailed retirement-year rows.
 *
 *   rows  [{ retirementYearEnd, activePoints, inactivePoints, membershipPoints,
 *            funeralHonorsPoints, otherPoints, officialTotal, provenance }]
 *
 * Returns { rows: [{ ...row, creditablePoints, capApplied, qualifying, issues }],
 * totalPoints, qualifyingYears, issues }.
 */
export function auditReserveRetirementYears(rows = []) {
  const issues = [];
  const audited = (rows ?? []).map((r, index) => {
    const entity = { type: 'reserveRetirementYear', id: r.id ?? String(index) };
    const own = [];
    const cap = inactivePointCapFor(r.retirementYearEnd);
    const membership = Math.min(MEMBERSHIP_POINTS_CAP, int(r.membershipPoints));
    const inactiveRaw = int(r.inactivePoints) + int(r.funeralHonorsPoints) + int(r.otherPoints);
    // The ceiling applies to inactive-duty points including membership points.
    const inactiveCreditable = Math.min(cap, inactiveRaw + membership);
    const active = int(r.activePoints);
    const ceiling = daysInRetirementYear(r.retirementYearEnd);
    const creditable = Math.min(ceiling, active + inactiveCreditable);
    const capApplied = inactiveRaw + membership > cap;
    if (capApplied) own.push(raiseIssue(ISSUE_CODES.MRT_INACTIVE_POINT_CAP_APPLIED, { entity, detail: { cap, excluded: inactiveRaw + membership - cap, retirementYearEnd: r.retirementYearEnd } }));
    const official = r.officialTotal === null || r.officialTotal === undefined ? null : int(r.officialTotal);
    if (official !== null && official !== creditable) {
      own.push(raiseIssue(ISSUE_CODES.MRT_RESERVE_POINTS_MISMATCH, { entity, detail: { audited: creditable, official, retirementYearEnd: r.retirementYearEnd } }));
    }
    issues.push(...own);
    return { ...r, membershipCredited: membership, inactiveCreditable, creditablePoints: creditable, ceiling, cap, capApplied, qualifying: creditable >= QUALIFYING_YEAR_POINTS, issues: own };
  });
  return {
    rows: audited,
    totalPoints: audited.reduce((s, r) => s + r.creditablePoints, 0),
    qualifyingYears: audited.filter((r) => r.qualifying).length,
    issues,
  };
}

/** Points ÷ 360, at full precision (10 U.S.C. 12733). */
export function computeReserveEquivalentService({ totalPoints }) {
  const points = Math.max(0, Number(totalPoints) || 0);
  return { totalPoints: points, equivalentYears: points / POINTS_PER_YEAR };
}

const fiscalYearOf = (d) => (d.getUTCMonth() >= 9 ? d.getUTCFullYear() + 1 : d.getUTCFullYear());

/**
 * The retired-pay eligibility age.
 *
 *   officialEligibilityDate   ISO; the highest-precedence input
 *   birthDate                 ISO (month precision is enough); needed to turn an age into a date
 *   reducedAgePeriods         [{ startDate, endDate, authority, verified }]
 *
 * Returns { age, ageMonths, date, reductionMonths, units, method, excluded, verifiedOnly, issues }.
 */
export function computeReserveRetiredPayAge({ officialEligibilityDate = null, birthDate = null, reducedAgePeriods = [] } = {}) {
  const issues = [];
  if (officialEligibilityDate && parseIsoDate(officialEligibilityDate)) {
    return { age: null, ageMonths: null, date: officialEligibilityDate, reductionMonths: null, units: null, method: 'official_date', excluded: [], verifiedOnly: true, issues };
  }
  const excluded = [];
  let anyUnverified = false;
  const daysByFy = new Map();
  let aggregateDays = 0;
  for (const p of reducedAgePeriods ?? []) {
    const start = parseIsoDate(p.startDate);
    const end = parseIsoDate(p.endDate);
    if (!start || !end || end < start) {
      excluded.push({ period: p, reason: 'dates_missing' });
      continue;
    }
    if (toIsoDate(end) < REDUCED_AGE_DUTY_FROM) {
      excluded.push({ period: p, reason: 'before_2008_01_28' });
      continue;
    }
    if (!REDUCED_AGE_AUTHORITIES.includes(String(p.authority ?? '').replace(/^10 ?U\.?S\.?C\.? ?/i, '').trim())) {
      excluded.push({ period: p, reason: 'authority_not_qualifying' });
      continue;
    }
    if (!p.verified) anyUnverified = true;
    // Walk the days: those before the aggregation change count within their
    // fiscal year; those on or after it pool across years.
    for (let d = new Date(Math.max(start.getTime(), parseIsoDate(REDUCED_AGE_DUTY_FROM).getTime())); d.getTime() <= end.getTime(); d = new Date(d.getTime() + 86_400_000)) {
      const iso = toIsoDate(d);
      if (iso >= REDUCED_AGE_AGGREGATION_FROM) aggregateDays += 1;
      else {
        const fy = fiscalYearOf(d);
        daysByFy.set(fy, (daysByFy.get(fy) ?? 0) + 1);
      }
    }
  }
  let units = Math.floor(aggregateDays / REDUCED_AGE_UNIT_DAYS);
  for (const days of daysByFy.values()) units += Math.floor(days / REDUCED_AGE_UNIT_DAYS);
  const reductionMonths = units * REDUCED_AGE_UNIT_MONTHS;
  const ageMonths = Math.max(MINIMUM_REDUCED_RETIRED_PAY_AGE * 12, DEFAULT_RETIRED_PAY_AGE * 12 - reductionMonths);
  const age = ageMonths / 12;
  if (units > 0 && anyUnverified) issues.push(raiseIssue(ISSUE_CODES.MRT_REDUCED_AGE_UNVERIFIED, { detail: { units, reductionMonths } }));
  if (units > 0) issues.push(raiseIssue(ISSUE_CODES.MRT_HEALTH_AGE_DIFFERS, { detail: { retiredPayAge: age } }));
  let date = null;
  const birth = parseIsoDate(birthDate);
  if (birth) {
    const d = new Date(Date.UTC(birth.getUTCFullYear(), birth.getUTCMonth() + ageMonths, 1));
    date = toIsoDate(d);
  }
  return { age, ageMonths, date, reductionMonths, units, method: units > 0 ? 'reduced_age' : 'age_60', excluded, verifiedOnly: !anyUnverified, issues };
}

/**
 * Summarises the points inputs for the calculation: from detailed rows when
 * given (audited), else from the official totals entered.
 */
export function resolveReservePoints({ retirementYears = [], officialTotalPoints = null, officialQualifyingYears = null, pointsProvenance = INPUT_PROVENANCE.USER_ESTIMATE } = {}) {
  const issues = [];
  if (retirementYears && retirementYears.length > 0) {
    const audit = auditReserveRetirementYears(retirementYears);
    issues.push(...audit.issues);
    const official = officialTotalPoints === null || officialTotalPoints === undefined ? null : int(officialTotalPoints);
    if (official !== null && official !== audit.totalPoints) {
      issues.push(raiseIssue(ISSUE_CODES.MRT_RESERVE_POINTS_MISMATCH, { detail: { audited: audit.totalPoints, official } }));
    }
    const allOfficial = retirementYears.every((r) => (r.provenance ?? INPUT_PROVENANCE.USER_ESTIMATE) === INPUT_PROVENANCE.USER_ENTERED_OFFICIAL);
    return { totalPoints: official ?? audit.totalPoints, qualifyingYears: officialQualifyingYears ?? audit.qualifyingYears, official: allOfficial || official !== null, audit, issues };
  }
  const total = officialTotalPoints === null || officialTotalPoints === undefined ? null : int(officialTotalPoints);
  if (total === null) return { totalPoints: null, qualifyingYears: officialQualifyingYears ?? null, official: false, audit: null, issues };
  return { totalPoints: total, qualifyingYears: officialQualifyingYears ?? null, official: pointsProvenance === INPUT_PROVENANCE.USER_ENTERED_OFFICIAL, audit: null, issues };
}
