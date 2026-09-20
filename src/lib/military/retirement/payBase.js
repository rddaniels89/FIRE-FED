/**
 * The retired-pay base: Final Pay, or the High-36 average built from actual
 * monthly rates.
 *
 * High-36 (10 U.S.C. 1407; DoD FMR Volume 7B, chapter 3): the total of the
 * monthly basic pay the member was entitled to for the 36 months, whether or
 * not consecutive, of the member's career in which basic pay was highest,
 * divided by 36. In practice those are the last 36 months unless the member
 * held a higher grade earlier, so this module builds a month-by-month history
 * from the career grade periods, prices each month from the table in force,
 * and takes the 36 highest. It never assumes "current pay × 36".
 *
 * Each month carries where its rate came from: a published table, a table
 * derived from a later publication, or a projection past the latest table at
 * a stated growth assumption. Months no table covers are "missing". Fewer
 * than 36 reliable months means the result is an estimate, or the user enters
 * the official High-36 from a service estimate as an override.
 *
 * Final Pay (10 U.S.C. 1406): the monthly rate for the retired grade and
 * years of service on the day before retirement.
 */

import { basicPayMonthly, gradeLabel } from './payTables';
import { parseIsoDate, toIsoDate } from '../servicePeriods';

export const HIGH_36_MONTHS = 36;

const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const firstOfMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const addMonths = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
const daysInMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();

/** Years of service on a date from the pay entry base date, in decimal years (for the YOS band). */
export function yearsOfServiceOn({ payEntryBaseDate, isoDate }) {
  const pebd = parseIsoDate(payEntryBaseDate);
  const d = parseIsoDate(isoDate);
  if (!pebd || !d) return null;
  const months = (d.getUTCFullYear() - pebd.getUTCFullYear()) * 12 + (d.getUTCMonth() - pebd.getUTCMonth()) - (d.getUTCDate() < pebd.getUTCDate() ? 1 : 0);
  return Math.max(0, months) / 12;
}

/** The grade period covering a date (last one whose window contains it). */
function gradeOn(gradePeriods, date) {
  const iso = toIsoDate(date);
  let match = null;
  for (const p of gradePeriods ?? []) {
    const start = p.startDate ?? '0000-01-01';
    const end = p.endDate ?? '9999-12-31';
    if (iso >= start && iso <= end) match = p;
  }
  return match;
}

/**
 * Month-by-month basic pay for the window ending the month before
 * `retirementDate` (a member retiring on the 1st is paid through the last
 * day of the prior month).
 *
 *   gradePeriods        [{ grade, startDate, endDate|null, e1Under4Months?, seniorEnlisted? }]
 *   payEntryBaseDate    ISO; when null every month is priced in the "2 or less" band and flagged
 *   retirementDate      ISO
 *   growthAssumption    decimal annual raise for months past the latest table
 *   monthsBack          how many months to build (default 36; more when a demotion is involved)
 *
 * Returns { months: [{ month, grade, yearsOfService, monthly, tableDate, verified, derived, assumed, missing }], counts }.
 */
export function buildBasicPayHistory({ gradePeriods = [], payEntryBaseDate = null, retirementDate, growthAssumption = 0, monthsBack = HIGH_36_MONTHS } = {}) {
  const retire = parseIsoDate(retirementDate);
  if (!retire) return { months: [], counts: empty() };
  const lastMonth = retire.getUTCDate() === 1 ? addMonths(firstOfMonth(retire), -1) : firstOfMonth(retire);
  const months = [];
  for (let k = monthsBack - 1; k >= 0; k -= 1) {
    const start = addMonths(lastMonth, -k);
    const period = gradeOn(gradePeriods, start);
    // A grade change inside a month: price the month by days at each grade.
    const nextMonth = addMonths(start, 1);
    const changes = (gradePeriods ?? []).filter((p) => p.startDate && p.startDate > toIsoDate(start) && p.startDate < toIsoDate(nextMonth));
    const yos = yearsOfServiceOn({ payEntryBaseDate, isoDate: toIsoDate(start) });
    const slices = [];
    let cursor = start;
    const boundaries = [...changes.map((p) => parseIsoDate(p.startDate)).sort((a, b) => a - b), nextMonth];
    for (const b of boundaries) {
      const g = gradeOn(gradePeriods, cursor);
      const days = Math.round((b - cursor) / 86_400_000);
      if (days > 0) slices.push({ grade: g?.grade ?? null, days, e1Under4Months: Boolean(g?.e1Under4Months), seniorEnlisted: Boolean(g?.seniorEnlisted) });
      cursor = b;
    }
    const dim = daysInMonth(start);
    let monthly = 0;
    let missing = false;
    let tableDate = null;
    let verified = true;
    let derived = false;
    let assumed = false;
    const gradesUsed = [];
    for (const s of slices) {
      if (!s.grade) {
        missing = true;
        continue;
      }
      const rate = basicPayMonthly({ grade: s.grade, yearsOfService: yos ?? 0, isoDate: toIsoDate(start), growthAssumption, e1Under4Months: s.e1Under4Months, seniorEnlisted: s.seniorEnlisted });
      if (!rate) {
        missing = true;
        continue;
      }
      monthly += rate.monthly * (s.days / dim);
      tableDate = rate.tableDate;
      verified = verified && rate.verified;
      derived = derived || rate.derived;
      assumed = assumed || rate.assumed;
      gradesUsed.push(gradeLabel(s.grade));
    }
    months.push({
      month: monthKey(start),
      grade: period?.grade ?? null,
      gradeLabel: gradesUsed.join(' / ') || (period?.grade ? gradeLabel(period.grade) : null),
      yearsOfService: yos,
      yosUnknown: yos === null,
      monthly: missing ? null : Math.round(monthly * 100) / 100,
      tableDate,
      verified: !missing && verified && yos !== null,
      derived,
      assumed,
      missing,
    });
  }
  return { months, counts: count(months) };
}

function empty() {
  return { total: 0, reliable: 0, missing: 0, assumed: 0, derived: 0, yosUnknown: 0 };
}

function count(months) {
  const c = empty();
  for (const m of months) {
    c.total += 1;
    if (m.missing) c.missing += 1;
    else if (m.assumed) c.assumed += 1;
    else if (m.derived) c.derived += 1;
    if (m.verified) c.reliable += 1;
    if (m.yosUnknown) c.yosUnknown += 1;
  }
  return c;
}

/**
 * The High-36 average from a priced history: the 36 highest months, whether
 * or not consecutive. Months with no rate are skipped and counted as missing.
 * Returns null when no month has a rate.
 */
export function selectHigh36PayBase(history) {
  const priced = (history?.months ?? []).filter((m) => !m.missing && m.monthly !== null);
  if (priced.length === 0) return null;
  const top = [...priced].sort((a, b) => b.monthly - a.monthly).slice(0, HIGH_36_MONTHS);
  const total = top.reduce((s, m) => s + m.monthly, 0);
  const selectedMonths = top.map((m) => m.month).sort();
  const nonConsecutive = !isConsecutive(selectedMonths);
  return {
    method: 'high_36',
    monthly: total / HIGH_36_MONTHS,
    monthlyUnrounded: total / HIGH_36_MONTHS,
    monthsUsed: top.length,
    monthsShort: Math.max(0, HIGH_36_MONTHS - top.length),
    reliableMonths: top.filter((m) => m.verified).length,
    assumedMonths: top.filter((m) => m.assumed).length,
    derivedMonths: top.filter((m) => m.derived).length,
    missingMonths: (history?.counts?.missing ?? 0) + Math.max(0, HIGH_36_MONTHS - top.length),
    nonConsecutive,
    highest: Math.max(...top.map((m) => m.monthly)),
    lowest: Math.min(...top.map((m) => m.monthly)),
    months: top.sort((a, b) => (a.month < b.month ? -1 : 1)),
  };
}

function isConsecutive(keys) {
  for (let i = 1; i < keys.length; i += 1) {
    const [y1, m1] = keys[i - 1].split('-').map(Number);
    const [y2, m2] = keys[i].split('-').map(Number);
    if ((y2 * 12 + m2) - (y1 * 12 + m1) !== 1) return false;
  }
  return true;
}

/** Final Pay: the rate for the retired grade and years of service on the day before retirement. */
export function finalPayBase({ grade, payEntryBaseDate, retirementDate, growthAssumption = 0, seniorEnlisted = false } = {}) {
  const retire = parseIsoDate(retirementDate);
  if (!retire) return null;
  const dayBefore = new Date(retire.getTime() - 86_400_000);
  const yos = yearsOfServiceOn({ payEntryBaseDate, isoDate: toIsoDate(dayBefore) });
  const rate = basicPayMonthly({ grade, yearsOfService: yos ?? 0, isoDate: toIsoDate(dayBefore), growthAssumption, seniorEnlisted });
  if (!rate) return null;
  return {
    method: 'final_pay',
    monthly: rate.monthly,
    monthlyUnrounded: rate.monthly,
    grade,
    gradeLabel: gradeLabel(grade),
    yearsOfService: yos,
    yosUnknown: yos === null,
    band: rate.bandLabel,
    tableDate: rate.tableDate,
    verified: rate.verified && yos !== null,
    derived: rate.derived,
    assumed: rate.assumed,
    asOf: toIsoDate(dayBefore),
  };
}
