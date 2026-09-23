/**
 * Gross military retired pay for a regular (active-component) longevity
 * retirement under Final Pay, High-36, REDUX, or BRS, with an auditable trace.
 *
 * The pipeline (spec §20.5):
 *
 *   retired_pay_base   = buildPayBase(system, grade history, pay tables, retirement date)
 *   multiplier         = computeSystemMultiplier(system, official 1405 service)
 *   gross_unrounded    = base × multiplier
 *   gross_monthly      = rounded down to the next lower dollar (10 U.S.C. 1412)
 *
 * followed by the COLA projection and, when the user has an official
 * estimate or statement, a reconciliation against it. Every operation is a
 * step in the trace with its rule id; every input carries its provenance; the
 * result carries a status, the rules version, and a hash of the normalised
 * inputs so an identical request always yields an identical result.
 *
 * What this does not do: infer the system, the election, the retired grade,
 * or creditable service; compute Reserve points, medical retirements, or
 * TERA (later passes); or say anything about net pay, SBP, VA offsets, CRDP,
 * or CRSC.
 */

import { INPUT_PROVENANCE, ISSUE_CODES, ISSUE_SEVERITY, MILITARY_RESULT_STATUS, MILITARY_RULES_VERSION, raiseIssue } from '../status';
import { CALCULATION_PATHS, RETIREMENT_SYSTEMS, SYSTEM_CONFIRMATION, SYSTEM_LABELS, suggestMilitaryRetirementSystem, validateSystemSelection } from './system';
import { computeLongevityMultiplier, serviceToMultiplierMonths } from './multiplier';
import { HIGH_36_MONTHS, buildBasicPayHistory, finalPayBase, selectHigh36PayBase } from './payBase';
import { FIRST_COLA_SHARE_BY_QUARTER, projectRetiredPayCola } from './cola';
import { gradeLabel } from './payTables';
import { parseIsoDate } from '../servicePeriods';
import {
  REQUIRED_QUALIFYING_YEARS,
  RETIRED_RESERVE_STATUSES,
  computeReserveEquivalentService,
  computeReserveRetiredPayAge,
  resolveReservePoints,
} from './reserve';
import { MEDICAL_DISPOSITIONS, computeChapter61, computeTera } from './special';

export const ENGINE_VERSION = '1.0.0';

/** Regular longevity retirement requires 20 years of active service (10 U.S.C. 3911, 6323, 8911; now 7311, 8323, 9311). */
export const REGULAR_RETIREMENT_MINIMUM_YEARS = 20;

/** Tolerance for calling a reconciliation matched: one dollar a month, the rounding unit. */
export const RECONCILIATION_TOLERANCE_MONTHLY = 1;

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** 10 U.S.C. 1412: retired pay is rounded to the next lower multiple of one dollar. */
export function roundDownToDollar(amount) {
  return Math.floor(num(amount) + 1e-9);
}

/** FNV-1a over the canonical JSON of the normalised inputs; enough to detect a changed request. */
export function hashInputs(value) {
  const json = canonical(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i += 1) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a-${h.toString(16).padStart(8, '0')}`;
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

/** The inputs with every field present, in one shape, so the hash is stable. */
export function normalizeRetirementInputs(raw = {}) {
  const a = raw.assumptions ?? {};
  return {
    path: raw.path ?? null,
    system: raw.system ?? null,
    systemConfirmation: raw.systemConfirmation ?? SYSTEM_CONFIRMATION.UNKNOWN,
    diems: raw.diems ?? null,
    cbsElected: raw.cbsElected ?? null,
    brsOptIn: raw.brsOptIn ?? null,
    retirementDate: raw.retirementDate ?? null,
    /** When pay begins later than the retirement itself (Reserve). Null = the retirement date, or the computed retired-pay age. */
    retiredPayStartDate: raw.retiredPayStartDate ?? null,
    payEntryBaseDate: raw.payEntryBaseDate ?? null,
    ageAtRetirement: raw.ageAtRetirement ?? null,
    creditableService: raw.creditableService
      ? { years: num(raw.creditableService.years), months: num(raw.creditableService.months), days: num(raw.creditableService.days), provenance: raw.creditableService.provenance ?? INPUT_PROVENANCE.USER_ESTIMATE }
      : null,
    gradePeriods: (raw.gradePeriods ?? []).map((p) => ({
      grade: String(p.grade ?? '').toUpperCase().replace('-', ''),
      startDate: p.startDate ?? null,
      endDate: p.endDate ?? null,
      e1Under4Months: Boolean(p.e1Under4Months),
      seniorEnlisted: Boolean(p.seniorEnlisted),
      provenance: p.provenance ?? INPUT_PROVENANCE.USER_ESTIMATE,
    })),
    retiredGradeConfirmed: Boolean(raw.retiredGradeConfirmed),
    payBaseOverride: raw.payBaseOverride ? { monthly: num(raw.payBaseOverride.monthly), provenance: raw.payBaseOverride.provenance ?? INPUT_PROVENANCE.USER_ENTERED_OFFICIAL, asOfDate: raw.payBaseOverride.asOfDate ?? null } : null,
    officialEstimate: raw.officialEstimate ? { monthlyGross: num(raw.officialEstimate.monthlyGross), asOfDate: raw.officialEstimate.asOfDate ?? null, source: raw.officialEstimate.source ?? 'service_estimate' } : null,
    reserve: raw.reserve
      ? {
          retirementYears: (raw.reserve.retirementYears ?? []).map((r, i) => ({
            id: r.id ?? String(i),
            retirementYearEnd: r.retirementYearEnd ?? null,
            activePoints: num(r.activePoints),
            inactivePoints: num(r.inactivePoints),
            membershipPoints: num(r.membershipPoints),
            funeralHonorsPoints: num(r.funeralHonorsPoints),
            otherPoints: num(r.otherPoints),
            officialTotal: r.officialTotal === null || r.officialTotal === undefined ? null : num(r.officialTotal),
            provenance: r.provenance ?? INPUT_PROVENANCE.USER_ESTIMATE,
          })),
          officialTotalPoints: raw.reserve.officialTotalPoints === null || raw.reserve.officialTotalPoints === undefined ? null : num(raw.reserve.officialTotalPoints),
          officialQualifyingYears: raw.reserve.officialQualifyingYears === null || raw.reserve.officialQualifyingYears === undefined ? null : num(raw.reserve.officialQualifyingYears),
          pointsProvenance: raw.reserve.pointsProvenance ?? INPUT_PROVENANCE.USER_ESTIMATE,
          noticeOfEligibilityDate: raw.reserve.noticeOfEligibilityDate ?? null,
          retiredReserveStatus: raw.reserve.retiredReserveStatus ?? RETIRED_RESERVE_STATUSES.UNKNOWN,
          separationDate: raw.reserve.separationDate ?? null,
          officialEligibilityDate: raw.reserve.officialEligibilityDate ?? null,
          birthDate: raw.reserve.birthDate ?? null,
          reducedAgePeriods: (raw.reserve.reducedAgePeriods ?? []).map((p) => ({ startDate: p.startDate ?? null, endDate: p.endDate ?? null, authority: p.authority ?? null, verified: Boolean(p.verified) })),
        }
      : null,
    medical: raw.medical
      ? {
          disposition: raw.medical.disposition ?? MEDICAL_DISPOSITIONS.UNKNOWN,
          dodDisabilityPercent: raw.medical.dodDisabilityPercent === null || raw.medical.dodDisabilityPercent === undefined || raw.medical.dodDisabilityPercent === '' ? null : num(raw.medical.dodDisabilityPercent),
          vaRating: raw.medical.vaRating === null || raw.medical.vaRating === undefined || raw.medical.vaRating === '' ? null : num(raw.medical.vaRating),
          tdrlPlacementDate: raw.medical.tdrlPlacementDate ?? null,
          combatRelated: raw.medical.combatRelated === true ? true : raw.medical.combatRelated === false ? false : null,
          monthlyBasicPay: raw.medical.monthlyBasicPay === null || raw.medical.monthlyBasicPay === undefined ? null : num(raw.medical.monthlyBasicPay),
          provenance: raw.medical.provenance ?? INPUT_PROVENANCE.USER_ESTIMATE,
        }
      : null,
    tera: raw.tera
      ? { authorityName: raw.tera.authorityName ?? null, approvalDate: raw.tera.approvalDate ?? null, provenance: raw.tera.provenance ?? INPUT_PROVENANCE.USER_ESTIMATE }
      : null,
    assumptions: {
      basicPayGrowth: a.basicPayGrowth === undefined ? 0.03 : num(a.basicPayGrowth),
      inflation: a.inflation === undefined ? 0.025 : num(a.inflation),
      horizonYears: a.horizonYears === undefined ? 40 : num(a.horizonYears),
      publishedColas: a.publishedColas ?? {},
    },
  };
}

/**
 * The calculation. Pure: no clock, no network, no writes. Returns the same
 * result for the same inputs and rules version.
 */
export function calculateMilitaryRetiredPay(rawInputs = {}) {
  const inputs = normalizeRetirementInputs(rawInputs);
  const issues = [];
  const steps = [];
  const step = (s) => steps.push(s);
  const base = {
    engineVersion: ENGINE_VERSION,
    rulesVersion: MILITARY_RULES_VERSION,
    inputHash: hashInputs(inputs),
    inputs,
    issues,
    steps,
  };

  // ---- path
  if (!inputs.path) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_PATH_UNKNOWN));
    return finish(base, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
  }
  const isReserve = inputs.path === CALCULATION_PATHS.RESERVE_NONREGULAR;
  const isMedical = inputs.path === CALCULATION_PATHS.MEDICAL;
  const isTera = inputs.path === CALCULATION_PATHS.TERA;
  if (!Object.values(CALCULATION_PATHS).includes(inputs.path)) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_PATH_UNSUPPORTED, { detail: { path: inputs.path } }));
    return finish(base, MILITARY_RESULT_STATUS.NOT_SUPPORTED);
  }
  // The special paths need their official facts before anything is priced.
  if (isMedical) {
    const m = inputs.medical ?? {};
    if (!m.disposition || m.disposition === MEDICAL_DISPOSITIONS.UNKNOWN) {
      issues.push(raiseIssue(ISSUE_CODES.MRT_MEDICAL_DISPOSITION_REQUIRED));
      return finish(base, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    }
    if (m.dodDisabilityPercent === null) {
      issues.push(raiseIssue(ISSUE_CODES.MRT_MEDICAL_DOD_PERCENT_REQUIRED));
      return finish(base, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    }
  }
  if (isTera && !(inputs.tera && inputs.tera.authorityName)) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_TERA_AUTHORITY_REQUIRED));
    return finish(base, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
  }

  // ---- system
  const suggestion = suggestMilitaryRetirementSystem({ diems: inputs.diems, cbsElected: inputs.cbsElected, brsOptIn: inputs.brsOptIn });
  const system = inputs.system ?? null;
  const validation = validateSystemSelection({ system, systemConfirmation: inputs.systemConfirmation, diems: inputs.diems, cbsElected: inputs.cbsElected, brsOptIn: inputs.brsOptIn });
  issues.push(...validation.issues);
  if (!system) return finish({ ...base, suggestion }, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
  if (!validation.ok) return finish({ ...base, suggestion, system }, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
  if (system === RETIREMENT_SYSTEMS.REDUX && inputs.cbsElected !== true) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_REDUX_UNCONFIRMED));
    return finish({ ...base, suggestion, system }, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
  }
  step({ id: 'system', label: 'Retirement system', ruleId: 'military.retirement_system', value: SYSTEM_LABELS[system], note: validation.confirmed ? 'Confirmed from the record.' : `Suggested: ${suggestion.reasons.join(' ')}` });

  // ---- Reserve: points, qualifying years, and the retired-pay date decide
  // the service basis and the date the pay base is built for.
  let reserve = null;
  let hypothetical = false;
  if (isReserve) {
    const r = inputs.reserve ?? {};
    const points = resolveReservePoints(r);
    issues.push(...points.issues);
    if (points.totalPoints === null) {
      issues.push(raiseIssue(ISSUE_CODES.MRT_RESERVE_POINTS_OFFICIAL_REQUIRED, { detail: { reason: 'points_missing' } }));
      return finish({ ...base, suggestion, system }, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    }
    if (!points.official) {
      issues.push(raiseIssue(ISSUE_CODES.MRT_RESERVE_POINTS_OFFICIAL_REQUIRED, { detail: { reason: 'points_estimated' } }));
      hypothetical = true;
    }
    if (points.qualifyingYears !== null && points.qualifyingYears < REQUIRED_QUALIFYING_YEARS) {
      issues.push(raiseIssue(ISSUE_CODES.MRT_QUALIFYING_YEARS_INSUFFICIENT, { detail: { qualifyingYears: points.qualifyingYears } }));
      hypothetical = true;
    }
    const equivalent = computeReserveEquivalentService({ totalPoints: points.totalPoints });
    const age = computeReserveRetiredPayAge({ officialEligibilityDate: r.officialEligibilityDate, birthDate: r.birthDate, reducedAgePeriods: r.reducedAgePeriods });
    issues.push(...age.issues);
    if (r.retiredReserveStatus === RETIRED_RESERVE_STATUSES.UNKNOWN) issues.push(raiseIssue(ISSUE_CODES.MRT_RETIRED_RESERVE_STATUS_UNKNOWN));
    reserve = { points, equivalent, age, retiredReserveStatus: r.retiredReserveStatus, separationDate: r.separationDate ?? null };
    step({ id: 'reserve_points', label: 'Creditable retirement points', ruleId: 'military.reserve_points', value: points.totalPoints, unit: 'points', note: `${points.qualifyingYears ?? '?'} qualifying years (50+ points). ${points.official ? 'Official point statement.' : 'Estimated points.'}` });
    step({ id: 'reserve_equivalent', label: 'Equivalent years of service: points ÷ 360', ruleId: 'military.reserve_points', value: Math.round(equivalent.equivalentYears * 10000) / 10000, unrounded: equivalent.equivalentYears, unit: 'years' });
    step({ id: 'reserve_pay_age', label: age.method === 'official_date' ? 'Retired-pay start: official eligibility date' : age.method === 'reduced_age' ? `Retired-pay age reduced by ${age.reductionMonths} months (${age.units} × 90 days)` : 'Retired-pay age 60', ruleId: 'military.reserve_retired_pay_age', value: age.date ?? age.age, note: age.method === 'reduced_age' ? 'Three-month units of verified qualifying duty since 28 January 2008; never below 50.' : undefined });
  }

  // ---- dates
  // A Reserve retirement pays from the computed age or an official date, never
  // from the transfer or discharge date; without either there is no start.
  if (isReserve && !inputs.retiredPayStartDate && !reserve.age.date) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_RESERVE_PAY_DATE_REQUIRED));
    return finish({ ...base, suggestion, system, reserve }, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
  }
  const payStartIso = isReserve ? (inputs.retiredPayStartDate ?? reserve.age.date) : (inputs.retiredPayStartDate ?? inputs.retirementDate);
  // The pay base is built as of the retirement for a regular retirement, and
  // as of the day pay begins for a non-regular one.
  const payBaseDateIso = isReserve ? payStartIso : inputs.retirementDate;
  const retire = parseIsoDate(payBaseDateIso);
  if (!retire) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_PATH_UNKNOWN, { detail: { reason: isReserve ? 'retired_pay_start_date_missing' : 'retirement_date_missing' } }));
    return finish({ ...base, suggestion, system, reserve }, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
  }

  // ---- service
  let serviceMonths;
  let serviceOfficial;
  if (isReserve) {
    serviceMonths = reserve.equivalent.equivalentYears * 12; // fractional; the multiplier keeps raw point precision
    serviceOfficial = reserve.points.official;
  } else {
    if (!inputs.creditableService) {
      issues.push(raiseIssue(ISSUE_CODES.MRT_1405_SERVICE_UNKNOWN));
      return finish({ ...base, suggestion, system }, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    }
    serviceMonths = serviceToMultiplierMonths(inputs.creditableService);
    serviceOfficial = inputs.creditableService.provenance === INPUT_PROVENANCE.USER_ENTERED_OFFICIAL;
    if (serviceMonths < REGULAR_RETIREMENT_MINIMUM_YEARS * 12 && inputs.path === CALCULATION_PATHS.REGULAR) {
      issues.push(raiseIssue(ISSUE_CODES.MRT_ACTIVE_SERVICE_BELOW_THRESHOLD, { detail: { serviceMonths } }));
      hypothetical = true;
    }
    step({ id: 'service', label: 'Creditable service (10 U.S.C. 1405)', ruleId: 'military.retired_pay_formula', value: `${inputs.creditableService.years}y ${inputs.creditableService.months}m ${inputs.creditableService.days}d`, unrounded: serviceMonths / 12, note: `${serviceMonths} whole months; days disregarded. ${serviceOfficial ? 'Official figure.' : 'User estimate.'}` });
  }

  // ---- pay base
  // The grade held on the retirement date, whatever order the periods were
  // entered in (the form lists the current grade first and earlier grades after).
  const retiredPeriod = gradePeriodAt(inputs.gradePeriods, payBaseDateIso);
  const retiredGrade = retiredPeriod?.grade ?? null;
  let payBase = null;
  let history = null;
  if (inputs.payBaseOverride && inputs.payBaseOverride.monthly > 0) {
    payBase = { method: 'official_override', monthly: inputs.payBaseOverride.monthly, monthlyUnrounded: inputs.payBaseOverride.monthly, verified: inputs.payBaseOverride.provenance === INPUT_PROVENANCE.USER_ENTERED_OFFICIAL, provenance: inputs.payBaseOverride.provenance, asOfDate: inputs.payBaseOverride.asOfDate };
    step({ id: 'pay_base', label: 'Retired-pay base (official override)', ruleId: 'military.high36', value: payBase.monthly, unit: 'monthly', note: 'Entered from a service retirement estimate; the table-built base is not used.' });
  } else if (!retiredGrade) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_PAY_TABLE_MISSING, { detail: { reason: 'grade_missing' } }));
    return finish({ ...base, suggestion, system, service: { months: serviceMonths } }, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
  } else if (system === RETIREMENT_SYSTEMS.FINAL_PAY) {
    payBase = finalPayBase({ grade: retiredGrade, payEntryBaseDate: inputs.payEntryBaseDate, retirementDate: payBaseDateIso, growthAssumption: inputs.assumptions.basicPayGrowth, seniorEnlisted: Boolean(retiredPeriod?.seniorEnlisted) });
    if (!payBase) {
      issues.push(raiseIssue(ISSUE_CODES.MRT_PAY_TABLE_MISSING, { detail: { grade: retiredGrade, date: payBaseDateIso } }));
      return finish({ ...base, suggestion, system, service: { months: serviceMonths } }, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    }
    if (payBase.yosUnknown) issues.push(raiseIssue(ISSUE_CODES.MRT_PAY_ENTRY_DATE_UNKNOWN));
    if (payBase.assumed) issues.push(raiseIssue(ISSUE_CODES.MRT_FUTURE_PAY_TABLE_ASSUMED, { detail: { growth: inputs.assumptions.basicPayGrowth } }));
    if (payBase.derived) issues.push(raiseIssue(ISSUE_CODES.MRT_DERIVED_PAY_TABLE));
    step({ id: 'pay_base', label: `Final Pay: ${payBase.gradeLabel}, ${payBase.band}, table of ${payBase.tableDate}`, ruleId: 'military.retired_pay_formula', value: payBase.monthly, unit: 'monthly', note: `Rate on ${payBase.asOf}, the day before retirement.` });
  } else {
    // A Reserve former member's years of service freeze at separation; a
    // Retired Reserve member's keep accruing until pay begins (10 U.S.C. 1407(f)).
    const yosFreezeDate = isReserve && reserve.retiredReserveStatus === RETIRED_RESERVE_STATUSES.FORMER_MEMBER ? reserve.separationDate : null;
    // The window runs back to the earliest grade period entered, so a higher
    // grade held before a reduction can still make the 36 highest months.
    history = buildBasicPayHistory({ gradePeriods: inputs.gradePeriods, payEntryBaseDate: inputs.payEntryBaseDate, retirementDate: payBaseDateIso, growthAssumption: inputs.assumptions.basicPayGrowth, yosFreezeDate, monthsBack: historyWindowMonths(inputs.gradePeriods, payBaseDateIso) });
    payBase = selectHigh36PayBase(history);
    if (!payBase) {
      issues.push(raiseIssue(ISSUE_CODES.MRT_PAY_TABLE_MISSING, { detail: { grade: retiredGrade, date: payBaseDateIso } }));
      return finish({ ...base, suggestion, system, service: { months: serviceMonths }, history }, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    }
    if (history.counts.yosUnknown > 0) issues.push(raiseIssue(ISSUE_CODES.MRT_PAY_ENTRY_DATE_UNKNOWN));
    if (payBase.assumedMonths > 0) issues.push(raiseIssue(ISSUE_CODES.MRT_FUTURE_PAY_TABLE_ASSUMED, { detail: { months: payBase.assumedMonths, growth: inputs.assumptions.basicPayGrowth } }));
    if (payBase.derivedMonths > 0) issues.push(raiseIssue(ISSUE_CODES.MRT_DERIVED_PAY_TABLE, { detail: { months: payBase.derivedMonths } }));
    if (payBase.reliableMonths < 36) issues.push(raiseIssue(ISSUE_CODES.MRT_PAY_HISTORY_INCOMPLETE, { detail: { reliableMonths: payBase.reliableMonths, missingMonths: payBase.missingMonths } }));
    step({ id: 'pay_base', label: `High-36 average of the ${payBase.monthsUsed} highest months${payBase.nonConsecutive ? ' (not consecutive)' : ''}`, ruleId: 'military.high36', value: Math.round(payBase.monthly * 100) / 100, unrounded: payBase.monthlyUnrounded, unit: 'monthly', note: `${payBase.reliableMonths} months from published tables, ${payBase.derivedMonths} derived, ${payBase.assumedMonths} projected, ${payBase.monthsShort} short of 36.` });
  }
  if (!inputs.retiredGradeConfirmed && retiredGrade) issues.push(raiseIssue(ISSUE_CODES.MRT_RETIRED_GRADE_UNCONFIRMED, { detail: { grade: gradeLabel(retiredGrade) } }));

  // ---- multiplier
  let mult = isReserve
    ? reserveMultiplier({ system, equivalentYears: reserve.equivalent.equivalentYears, retirementDate: payStartIso })
    : computeLongevityMultiplier({ system, serviceMonths, retirementDate: inputs.retirementDate });
  let special = null;
  if (isMedical) {
    const m = inputs.medical;
    const ch61 = computeChapter61({ payBaseMonthly: payBase.monthlyUnrounded, system, serviceMonths, retirementDate: inputs.retirementDate, disposition: m.disposition, dodDisabilityPercent: m.dodDisabilityPercent, vaRating: m.vaRating, tdrlPlacementDate: m.tdrlPlacementDate, provenance: m.provenance, combatRelated: m.combatRelated, monthlyBasicPay: m.monthlyBasicPay });
    issues.push(...ch61.issues);
    for (const s of ch61.steps) step(s);
    if (ch61.path === 'blocked') return finish({ ...base, suggestion, system, payBase, history: history ? { counts: history.counts, months: history.months } : null }, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    if (ch61.path === 'severance') {
      return finish(
        { ...base, suggestion, system, systemLabel: SYSTEM_LABELS[system], retiredGrade, retiredGradeLabel: retiredGrade ? gradeLabel(retiredGrade) : null, service: { months: serviceMonths, years: serviceMonths / 12, official: serviceOfficial }, payBase, history: history ? { counts: history.counts, months: history.months } : null, special: { kind: 'severance', ...ch61 }, grossMonthly: 0, grossAnnual: 0, projectedMonthly: 0, retiredPayStartDate: null, events: [{ type: 'MEDICAL_SEVERANCE', date: inputs.retirementDate, amount: ch61.severance.lumpSum }] },
        ch61.official && serviceOfficial ? MILITARY_RESULT_STATUS.SUPPORTED : MILITARY_RESULT_STATUS.ESTIMATE_ONLY
      );
    }
    special = { kind: 'chapter61', ...ch61 };
    mult = { ...mult, multiplier: ch61.multiplier, method: ch61.method, options: ch61.options, uncapped: ch61.multiplier, capApplied: ch61.capApplied, reduxReduction: 0 };
    if (!ch61.official) hypothetical = true;
  } else if (isTera) {
    const tera = computeTera({ payBaseMonthly: payBase.monthlyUnrounded, system, serviceMonths, retirementDate: inputs.retirementDate, authority: { name: inputs.tera.authorityName, approvalDate: inputs.tera.approvalDate, provenance: inputs.tera.provenance } });
    issues.push(...tera.issues);
    for (const s of tera.steps) step(s);
    if (tera.blocked) return finish({ ...base, suggestion, system, payBase, history: history ? { counts: history.counts, months: history.months } : null }, MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    special = { kind: 'tera', ...tera };
    mult = { ...mult, multiplier: tera.multiplier, teraReductionFactor: tera.reductionFactor, monthsShort: tera.monthsShort, reduxReduction: 0 };
    if (!tera.official) hypothetical = true;
  } else {
    for (const s of mult.steps) step({ ...s, ruleId: s.id === 'redux_reduction' ? 'military.redux' : isReserve ? 'military.reserve_points' : 'military.retired_pay_formula' });
  }

  // ---- gross
  const grossUnrounded = payBase.monthlyUnrounded * mult.multiplier;
  const grossMonthly = roundDownToDollar(grossUnrounded);
  step({ id: 'gross_unrounded', label: 'Pay base × multiplier', ruleId: 'military.retired_pay_formula', value: Math.round(grossUnrounded * 100) / 100, unrounded: grossUnrounded, unit: 'monthly' });
  step({ id: 'rounding', label: 'Rounded down to the next lower dollar (10 U.S.C. 1412)', ruleId: 'military.retired_pay_formula', value: grossMonthly, unrounded: grossUnrounded, unit: 'monthly' });

  // REDUX: what the full multiplier would pay, for the age-62 recomputation.
  let fullMonthly = grossMonthly;
  if (system === RETIREMENT_SYSTEMS.REDUX && !isReserve) {
    const full = computeLongevityMultiplier({ system, serviceMonths, retirementDate: inputs.retirementDate, applyRedux: false });
    fullMonthly = roundDownToDollar(payBase.monthlyUnrounded * full.multiplier);
    step({ id: 'redux_full', label: 'REDUX: amount under the full multiplier, restored at 62', ruleId: 'military.redux', value: fullMonthly, unit: 'monthly' });
  }

  // ---- COLA
  const cola = projectRetiredPayCola({
    system,
    retirementDate: payStartIso,
    grossMonthly,
    fullMonthly,
    ageAtRetirement: isReserve && reserve.age.age != null ? reserve.age.age : inputs.ageAtRetirement ?? 0,
    inflation: inputs.assumptions.inflation,
    publishedColas: inputs.assumptions.publishedColas,
    horizonYears: inputs.assumptions.horizonYears,
  });
  issues.push(raiseIssue(ISSUE_CODES.MRT_FIRST_COLA_CONVENTION, { detail: { quarterShares: FIRST_COLA_SHARE_BY_QUARTER } }));
  step({ id: 'cola', label: system === RETIREMENT_SYSTEMS.REDUX ? 'COLA: CPI less 1 point, recomputed at 62' : 'COLA: full CPI each December', ruleId: 'military.retired_pay_cola', value: inputs.assumptions.inflation, unit: 'fraction', note: 'Future adjustments at the inflation assumption; published adjustments where supplied.' });

  // ---- reconciliation
  let reconciliation = null;
  if (inputs.officialEstimate && inputs.officialEstimate.monthlyGross > 0) {
    const diff = grossMonthly - inputs.officialEstimate.monthlyGross;
    const within = Math.abs(diff) <= RECONCILIATION_TOLERANCE_MONTHLY;
    reconciliation = {
      officialMonthly: inputs.officialEstimate.monthlyGross,
      firefedMonthly: grossMonthly,
      difference: diff,
      percentDifference: inputs.officialEstimate.monthlyGross > 0 ? diff / inputs.officialEstimate.monthlyGross : null,
      withinTolerance: within,
      controlling: 'official',
      diagnostics: within ? [] : diagnose({ diff, payBase, mult, inputs }),
    };
    if (!within) issues.push(raiseIssue(ISSUE_CODES.MRT_OFFICIAL_RECONCILIATION_MISMATCH, { detail: { difference: diff } }));
    step({ id: 'reconciliation', label: 'Official amount versus FireFed', ruleId: 'military.retired_pay_formula', value: diff, unit: 'monthly', note: within ? 'Within one dollar.' : 'Outside tolerance; the official amount controls the projection.' });
  }

  // ---- status
  const blocking = issues.some((i) => i.severity === ISSUE_SEVERITY.BLOCK);
  const estimateOnly =
    hypothetical ||
    !validation.confirmed ||
    !serviceOfficial ||
    !payBase.verified ||
    (payBase.method === 'high_36' && payBase.reliableMonths < 36) ||
    Boolean(payBase.assumed) ||
    (payBase.method !== 'official_override' && inputs.payEntryBaseDate === null) ||
    (isReserve && (!reserve.age.verifiedOnly || reserve.retiredReserveStatus === RETIRED_RESERVE_STATUSES.UNKNOWN));
  const status = blocking
    ? MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED
    : reconciliation
      ? MILITARY_RESULT_STATUS.SUPPORTED_WITH_OFFICIAL_AMOUNT
      : estimateOnly
        ? MILITARY_RESULT_STATUS.ESTIMATE_ONLY
        : MILITARY_RESULT_STATUS.SUPPORTED;

  const projectedMonthly = reconciliation ? reconciliation.officialMonthly : grossMonthly;
  return finish(
    {
      ...base,
      suggestion,
      system,
      systemLabel: SYSTEM_LABELS[system],
      systemConfirmed: validation.confirmed,
      hypothetical,
      retiredGrade,
      retiredGradeLabel: retiredGrade ? gradeLabel(retiredGrade) : null,
      service: { months: serviceMonths, years: serviceMonths / 12, official: serviceOfficial, ...(inputs.creditableService ?? {}) },
      reserve,
      special,
      retiredPayStartDate: payStartIso,
      payBase,
      history: history ? { counts: history.counts, months: history.months } : null,
      multiplier: mult,
      grossMonthlyUnrounded: grossUnrounded,
      grossMonthly,
      grossAnnual: grossMonthly * 12,
      /** What the timeline projects: the official amount when one is entered, else FireFed's figure. */
      projectedMonthly,
      cola,
      reconciliation,
      events: [
        { type: isReserve ? 'RESERVE_RETIRED_PAY_START' : 'MILITARY_RETIRED_PAY_START', date: payStartIso, monthly: projectedMonthly },
        ...cola.filter((r) => r.event).map((r) => ({ type: 'MILITARY_RETIRED_PAY_RECOMPUTATION', year: r.year, monthly: r.monthly, reason: r.event })),
      ],
      dataQuality: {
        official: [serviceOfficial ? 'creditable service' : null, validation.confirmed ? 'retirement system' : null, payBase.method === 'official_override' && payBase.verified ? 'pay base' : null].filter(Boolean),
        estimated: [!serviceOfficial ? 'creditable service' : null, payBase.method === 'high_36' && payBase.reliableMonths < 36 ? 'pay base months' : null, payBase.assumed ? 'future pay tables' : null].filter(Boolean),
        defaulted: ['inflation', 'basic pay growth'],
        missing: [inputs.payEntryBaseDate ? null : 'pay entry base date', inputs.diems ? null : 'DIEMS', inputs.retiredGradeConfirmed ? null : 'retired grade confirmation'].filter(Boolean),
      },
    },
    status
  );
}

/** The grade period covering a date: the latest-starting one that contains it, else the latest-starting one, else the last entered. */
export function gradePeriodAt(periods = [], isoDate = null) {
  if (!periods.length) return null;
  const latest = (list) => list.reduce((best, p) => (!best || (p.startDate ?? '') > (best.startDate ?? '') ? p : best), null);
  const covering = isoDate ? periods.filter((p) => (!p.startDate || p.startDate <= isoDate) && (!p.endDate || p.endDate >= isoDate)) : [];
  return latest(covering) ?? latest(periods) ?? periods[periods.length - 1];
}

/** Months of history to price: at least 36, and back to the earliest grade period entered (capped at 40 years). */
export function historyWindowMonths(periods = [], retirementIso = null) {
  const starts = periods.map((p) => p.startDate).filter(Boolean).sort();
  const retire = parseIsoDate(retirementIso);
  const earliest = parseIsoDate(starts[0]);
  if (!retire || !earliest) return HIGH_36_MONTHS;
  const months = (retire.getUTCFullYear() - earliest.getUTCFullYear()) * 12 + (retire.getUTCMonth() - earliest.getUTCMonth());
  return Math.min(480, Math.max(HIGH_36_MONTHS, months));
}

/** Reserve: the legacy or BRS rate applied to points ÷ 360 at full precision; the cap rule is the same. */
function reserveMultiplier({ system, equivalentYears, retirementDate }) {
  const base = computeLongevityMultiplier({ system, serviceMonths: 0, retirementDate });
  const rate = base.rate;
  const uncapped = rate * equivalentYears;
  const capApplied = uncapped > base.capRate;
  const multiplier = capApplied ? base.capRate : uncapped;
  return {
    ...base,
    serviceMonths: equivalentYears * 12,
    serviceYears: equivalentYears,
    uncapped,
    reduxReduction: 0,
    afterRedux: uncapped,
    capApplied,
    multiplier,
    steps: [
      { id: 'rate', label: 'Rate per equivalent year of service', value: rate, unit: 'fraction' },
      { id: 'uncapped', label: 'Rate × (points ÷ 360)', value: uncapped, unit: 'fraction' },
      { id: 'cap', label: capApplied ? `Capped at ${(base.capRate * 100).toFixed(0)}%` : `Below the ${(base.capRate * 100).toFixed(0)}% cap`, value: multiplier, unit: 'fraction' },
    ],
  };
}

function diagnose({ diff, payBase, mult, inputs }) {
  const out = [];
  if (payBase.method === 'high_36' && (payBase.reliableMonths < 36 || payBase.assumedMonths > 0 || payBase.derivedMonths > 0)) out.push('pay_base_months_not_all_published');
  if (!inputs.payEntryBaseDate) out.push('pay_entry_date_unknown_affects_yos_band');
  if (!inputs.retiredGradeConfirmed) out.push('retired_grade_unconfirmed');
  if (inputs.creditableService?.provenance !== INPUT_PROVENANCE.USER_ENTERED_OFFICIAL) out.push('service_is_an_estimate');
  if (Math.abs(diff) < 2) out.push('rounding');
  if (mult.capApplied) out.push('cap_applied');
  return out;
}

function finish(partial, status) {
  return Object.freeze({
    status,
    grossMonthly: partial.grossMonthly ?? null,
    grossAnnual: partial.grossAnnual ?? null,
    projectedMonthly: partial.projectedMonthly ?? null,
    payBase: partial.payBase ?? null,
    multiplier: partial.multiplier ?? null,
    service: partial.service ?? null,
    cola: partial.cola ?? [],
    events: partial.events ?? [],
    reconciliation: partial.reconciliation ?? null,
    dataQuality: partial.dataQuality ?? null,
    ...partial,
  });
}
