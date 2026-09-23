/**
 * Health coverage periods, one row per household member per period (spec
 * §4.8, §5.7, §6.10). FireFed models the coverage the user confirms and the
 * cost they enter; it never declares anyone eligible.
 *
 * The hard rules, each effective-dated:
 *
 *   TRS   a Selected Reserve member eligible for FEHB cannot buy TRICARE
 *         Reserve Select (10 U.S.C. 1076d) until the statutory change takes
 *         effect on 2030-01-01 (Pub. L. 116-92 §701).
 *   TRR   the corresponding restriction for TRICARE Retired Reserve
 *         (10 U.S.C. 1076e); no scheduled end date.
 *   TFL   requires Medicare Part A and Part B; Part B premiums stay in the
 *         projection.
 *   CHAMPVA a person eligible for TRICARE cannot receive CHAMPVA; Medicare-
 *         eligible beneficiaries need Parts A and B to keep it.
 *   TAMP  180 days, only when the service record establishes eligibility;
 *         otherwise accepted as user-confirmed coverage.
 *   CHCBP 18 or 36 months by beneficiary category; stored as entered.
 *
 * A conflict is a blocking issue on the period; nothing is silently dropped
 * and no plan is chosen for the user.
 */

import { getAnnualParameters, CURRENT_PARAMETER_YEAR } from '../calculations/annualParameters';
import { ISSUE_CODES, INPUT_PROVENANCE, raiseIssue } from './status';
import { SERVICE_OWNERS, parseIsoDate, toIsoDate } from './servicePeriods';
import { tricareMonthlyPremium } from './tricareCosts';

export const COVERAGE_SOURCES = Object.freeze({
  FEHB: 'fehb',
  PSHB: 'pshb',
  TRICARE_PRIME: 'tricare_prime',
  TRICARE_SELECT: 'tricare_select',
  TRICARE_OVERSEAS: 'tricare_overseas',
  TRS: 'trs',
  TRR: 'trr',
  TFL: 'tfl',
  TAMP: 'tamp',
  CHCBP: 'chcbp',
  CHAMPVA: 'champva',
  VA_HEALTHCARE: 'va_healthcare',
  MEDICARE_ADVANTAGE: 'medicare_advantage',
  MEDICARE_ONLY: 'medicare_only',
  OTHER_EMPLOYER: 'other_employer',
  MARKETPLACE: 'marketplace',
});

export const COVERAGE_LABELS = Object.freeze({
  fehb: 'FEHB',
  pshb: 'PSHB (Postal Service Health Benefits)',
  tricare_prime: 'TRICARE Prime',
  tricare_select: 'TRICARE Select',
  tricare_overseas: 'TRICARE Overseas',
  trs: 'TRICARE Reserve Select',
  trr: 'TRICARE Retired Reserve',
  tfl: 'TRICARE For Life',
  tamp: 'TAMP (transitional, 180 days)',
  chcbp: 'CHCBP (continued health care)',
  champva: 'CHAMPVA',
  va_healthcare: 'VA health care (out-of-pocket only)',
  medicare_advantage: 'Medicare Advantage',
  medicare_only: 'Medicare A/B (with Part D as entered)',
  other_employer: 'Other employer coverage',
  marketplace: 'Marketplace plan',
});

export const TRICARE_SOURCES = Object.freeze([COVERAGE_SOURCES.TRICARE_PRIME, COVERAGE_SOURCES.TRICARE_SELECT, COVERAGE_SOURCES.TRICARE_OVERSEAS, COVERAGE_SOURCES.TRS, COVERAGE_SOURCES.TRR, COVERAGE_SOURCES.TFL, COVERAGE_SOURCES.TAMP]);
export const FEHB_SOURCES = Object.freeze([COVERAGE_SOURCES.FEHB, COVERAGE_SOURCES.PSHB]);

export const ENROLLMENT_TYPES = Object.freeze({ SELF: 'self', SELF_PLUS_ONE: 'selfPlusOne', FAMILY: 'family' });
export const RELATIONSHIPS = Object.freeze({ SPONSOR: 'sponsor', SPOUSE: 'spouse', CHILD: 'child', SURVIVOR: 'survivor', FORMER_SPOUSE: 'former_spouse' });

/** Effective-dated interaction rules. */
export const COVERAGE_RULES = Object.freeze({
  trsFehbConflict: Object.freeze({ from: '0000-01-01', until: '2030-01-01', statute: '10 U.S.C. 1076d(a); Pub. L. 116-92 §701', source: 'https://tricare.mil/Plans/HealthPlans/TRS' }),
  trrFehbConflict: Object.freeze({ from: '0000-01-01', until: null, statute: '10 U.S.C. 1076e', source: 'https://tricare.mil/Plans/HealthPlans/TRR' }),
  tflRequiresPartB: Object.freeze({ statute: '10 U.S.C. 1086(d)', source: 'https://tricare.mil/Plans/HealthPlans/TFL' }),
  champvaTricareConflict: Object.freeze({ statute: '38 U.S.C. 1781', source: 'https://www.va.gov/family-and-caregiver-benefits/health-and-disability/champva/' }),
  tampDays: 180,
  chcbpMonths: Object.freeze({ member: 18, dependent: 36 }),
});

let seq = 0;
const nextId = () => `cov_${Date.now().toString(36)}_${(seq += 1).toString(36)}`;
const num = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** A coverage period with every field present. */
export function createCoveragePeriod(overrides = {}) {
  return {
    id: overrides.id ?? nextId(),
    ownerId: SERVICE_OWNERS.PRIMARY,
    /** Whose service or employment the coverage flows from. */
    sponsorId: SERVICE_OWNERS.PRIMARY,
    relationship: RELATIONSHIPS.SPONSOR,
    source: COVERAGE_SOURCES.FEHB,
    enrollmentType: ENROLLMENT_TYPES.SELF,
    startDate: null,
    endDate: null,
    /** The user confirms enrollment or eligibility; FireFed never infers it. */
    enrollmentConfirmed: false,
    eligibilityConfirmed: false,
    /** null = use the program table where one exists (TRICARE), else 0. */
    monthlyPremium: null,
    /** Expected annual out-of-pocket, in today's dollars; low/high optional. */
    otherHealthInsurance: false,
    /** Marks a person the household knows to be TRICARE-eligible even without a TRICARE period (CHAMPVA rule). */
    notes: null,
    inputProvenance: INPUT_PROVENANCE.USER_ENTERED_OFFICIAL,
    rulesVersion: null,
    ...overrides,
    outOfPocketAnnual: { low: null, base: 0, high: null, ...(overrides.outOfPocketAnnual ?? {}) },
    medicare: { partADate: null, partBDate: null, partBPremiumMonthly: null, partDPremiumMonthly: 0, ...(overrides.medicare ?? {}) },
  };
}

const overlaps = (a, b) => {
  const as = a.startDate ?? '0000-01-01';
  const ae = a.endDate ?? '9999-12-31';
  const bs = b.startDate ?? '0000-01-01';
  const be = b.endDate ?? '9999-12-31';
  return as <= be && bs <= ae;
};

const daysInclusive = (startIso, endIso) => {
  const s = parseIsoDate(startIso);
  const e = parseIsoDate(endIso);
  if (!s || !e) return null;
  return Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
};

const monthsInclusive = (startIso, endIso) => {
  const s = parseIsoDate(startIso);
  const e = parseIsoDate(endIso);
  if (!s || !e) return null;
  return (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) + 1;
};

/** The monthly premium the projection uses, and where it came from. */
export function resolveCoveragePremium(period) {
  const explicit = period.monthlyPremium;
  if (explicit !== null && explicit !== undefined && explicit !== '') return { monthly: Math.max(0, num(explicit)), source: 'user', verified: true };
  const table = tricareMonthlyPremium({ plan: period.source, enrollment: period.enrollmentType });
  if (table) return { monthly: table.monthly, source: 'table', verified: table.verified, tableYear: table.year };
  return { monthly: 0, source: 'none', verified: true };
}

/**
 * Validates the household's coverage periods against the rules.
 *
 *   coverage         [period]
 *   fehbEligibility  { primary: bool, spouse: bool } current FEHB eligibility (a current federal employee is eligible)
 *   asOfDate         ISO; decides which effective-dated rule applies
 */
export function validateCoveragePeriods(coverage = [], { fehbEligibility = { primary: false, spouse: false }, asOfDate = toIsoDate(new Date()) } = {}) {
  const issues = [];
  const periods = (coverage ?? []).map((raw) => createCoveragePeriod(raw));
  const byOwner = new Map();
  for (const p of periods) byOwner.set(p.ownerId, [...(byOwner.get(p.ownerId) ?? []), p]);

  const annotated = periods.map((p) => {
    const entity = { type: 'coveragePeriod', id: p.id };
    const own = [];
    const sameOwner = (byOwner.get(p.ownerId) ?? []).filter((q) => q.id !== p.id);
    const start = p.startDate ?? asOfDate;
    const fehbEligible = Boolean(fehbEligibility?.[p.ownerId]) || sameOwner.some((q) => FEHB_SOURCES.includes(q.source) && overlaps(p, q));
    const tricareEligible = sameOwner.some((q) => TRICARE_SOURCES.includes(q.source) && overlaps(p, q));

    if (!p.enrollmentConfirmed && !p.eligibilityConfirmed) own.push(raiseIssue(ISSUE_CODES.MIL_COVERAGE_UNCONFIRMED, { entity, detail: { source: p.source } }));

    if (p.source === COVERAGE_SOURCES.TRS && fehbEligible) {
      const r = COVERAGE_RULES.trsFehbConflict;
      if (start < r.until) own.push(raiseIssue(ISSUE_CODES.MIL_TRS_FEHB_CONFLICT, { entity, detail: { ruleUntil: r.until, periodStart: start } }));
      else own.push(raiseIssue(ISSUE_CODES.MIL_TRS_FEHB_RULE_CHANGED, { entity, detail: { ruleUntil: r.until } }));
    }
    if (p.source === COVERAGE_SOURCES.TRR && fehbEligible) {
      own.push(raiseIssue(ISSUE_CODES.MIL_TRR_FEHB_CONFLICT, { entity }));
    }
    if (p.source === COVERAGE_SOURCES.TFL && !p.medicare.partBDate) {
      own.push(raiseIssue(ISSUE_CODES.MIL_TFL_PARTB_MISSING, { entity }));
    }
    if (p.source === COVERAGE_SOURCES.CHAMPVA) {
      if (tricareEligible) own.push(raiseIssue(ISSUE_CODES.MIL_CHAMPVA_TRICARE_CONFLICT, { entity }));
      if ((p.medicare.partADate && !p.medicare.partBDate) || (!p.medicare.partADate && p.medicare.partBDate)) {
        own.push(raiseIssue(ISSUE_CODES.MIL_CHAMPVA_MEDICARE_PARTS, { entity }));
      }
    }
    if (p.source === COVERAGE_SOURCES.TAMP) {
      const days = daysInclusive(p.startDate, p.endDate);
      if (days !== null && days > COVERAGE_RULES.tampDays) own.push(raiseIssue(ISSUE_CODES.MIL_TAMP_DURATION, { entity, detail: { days, limit: COVERAGE_RULES.tampDays } }));
      if (!p.eligibilityConfirmed) own.push(raiseIssue(ISSUE_CODES.MIL_TAMP_UNCONFIRMED, { entity }));
    }
    if (p.source === COVERAGE_SOURCES.CHCBP) {
      const months = monthsInclusive(p.startDate, p.endDate);
      const limit = p.relationship === RELATIONSHIPS.SPONSOR ? COVERAGE_RULES.chcbpMonths.member : COVERAGE_RULES.chcbpMonths.dependent;
      if (months !== null && months > limit) own.push(raiseIssue(ISSUE_CODES.MIL_CHCBP_DURATION, { entity, detail: { months, limit, category: p.relationship } }));
    }
    // Two primary sources for one person in the same month.
    const overlapping = sameOwner.filter((q) => overlaps(p, q) && q.id < p.id);
    if (overlapping.length > 0) own.push(raiseIssue(ISSUE_CODES.MIL_COVERAGE_OVERLAP, { entity, detail: { with: overlapping.map((q) => q.id) } }));

    const premium = resolveCoveragePremium(p);
    if (premium.source === 'table' && !premium.verified && premium.monthly > 0) own.push(raiseIssue(ISSUE_CODES.MIL_TRICARE_COST_UNVERIFIED, { entity, detail: { tableYear: premium.tableYear } }));

    issues.push(...own);
    return { ...p, resolved: { premium, fehbEligible, tricareEligible, blocked: own.some((i) => i.severity === 'block'), issues: own } };
  });
  return { periods: annotated, issues };
}

/** Months of a period that fall inside a calendar year. */
export function monthsInYear(period, year) {
  const ys = `${year}-01-01`;
  const ye = `${year}-12-31`;
  const s = period.startDate && period.startDate > ys ? period.startDate : ys;
  const e = period.endDate && period.endDate < ye ? period.endDate : ye;
  if (s > e) return 0;
  return Math.max(0, monthsInclusive(s.slice(0, 7) + '-01', e.slice(0, 7) + '-01') ?? 0);
}

/**
 * One person's expected health cost for a calendar year from their coverage
 * periods (spec §6.10): premiums for the months in force, expected
 * out-of-pocket, Medicare premiums, all grown at `growthFactor`.
 *
 * Returns null when the person has no period touching the year, so the
 * caller can fall back to the household default.
 */
export function projectCoverageCostForYear({ periods = [], ownerId = SERVICE_OWNERS.PRIMARY, year, growthFactor = 1, parameterYear = CURRENT_PARAMETER_YEAR, includePartB = true } = {}) {
  const mine = periods.filter((p) => p.ownerId === ownerId && monthsInYear(p, year) > 0);
  if (mine.length === 0) return null;
  const medicare = getAnnualParameters(parameterYear).medicare;
  let premiums = 0;
  let outOfPocket = 0;
  let medicarePartB = 0;
  let medicarePartD = 0;
  const bySource = [];
  for (const p of mine) {
    const months = monthsInYear(p, year);
    const premium = p.resolved?.premium ?? resolveCoveragePremium(p);
    const prem = premium.monthly * months * growthFactor;
    const oop = Math.max(0, num(p.outOfPocketAnnual?.base)) * (months / 12) * growthFactor;
    let partB = 0;
    if (includePartB && p.medicare?.partBDate && p.medicare.partBDate <= `${year}-12-31`) {
      const bMonths = Math.min(months, monthsInYear({ startDate: p.medicare.partBDate, endDate: p.endDate }, year));
      const bPremium = p.medicare.partBPremiumMonthly === null || p.medicare.partBPremiumMonthly === undefined ? medicare.partBStandardMonthlyPremium : num(p.medicare.partBPremiumMonthly);
      partB = bPremium * bMonths * growthFactor;
    }
    const partD = Math.max(0, num(p.medicare?.partDPremiumMonthly)) * months * growthFactor;
    premiums += prem;
    outOfPocket += oop;
    medicarePartB += partB;
    medicarePartD += partD;
    bySource.push({ id: p.id, source: p.source, label: COVERAGE_LABELS[p.source] ?? p.source, months, premium: prem, outOfPocket: oop, medicarePartB: partB, medicarePartD: partD, verified: premium.verified, blocked: Boolean(p.resolved?.blocked) });
  }
  return { ownerId, year, premiums, outOfPocket, medicarePartB, medicarePartD, total: premiums + outOfPocket + medicarePartB + medicarePartD, bySource };
}
