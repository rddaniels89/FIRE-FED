/**
 * Bounded special retirements (spec §20.10): Chapter 61 disability retirement
 * from an official DoD disposition and percentage, medical separation with
 * severance as its own path, and TERA from an official authority only.
 *
 * FireFed calculates FROM the official answer. It never predicts fitness,
 * a rating, combat-relatedness, taxability, or whether TERA is offered.
 *
 * Chapter 61 (10 U.S.C. 1201, 1202, 1401):
 *   disability method   pay base × DoD disability percentage, capped at 75%
 *   longevity method    pay base × the system's multiplier × years of service
 *   The member is paid the greater. A TDRL placement before 1 January 2017
 *   carried a 50% floor; the FY2017 NDAA removed it for later placements.
 * Severance (10 U.S.C. 1212): under 30% and under 20 years is a separation
 *   with severance pay of 2 × monthly basic pay × years of service (at least
 *   3, or 6 when combat-related; at most 19), not a zero-dollar retirement.
 * TERA (10 U.S.C. 1293, 8323; Pub. L. 112-81 §504 and later authority):
 *   longevity formula reduced by 1% for each full year short of 20, prorated
 *   by month (1/12 of 1% per month), for 15 to 19 years of service, only
 *   under an official authority and approval.
 */

import { computeLongevityMultiplier } from './multiplier';
import { ISSUE_CODES, INPUT_PROVENANCE, raiseIssue } from '../status';

export const MEDICAL_DISPOSITIONS = Object.freeze({
  PDRL: 'pdrl',
  TDRL: 'tdrl',
  SEVERANCE: 'separation_severance',
  UNKNOWN: 'unknown',
});

export const MEDICAL_RULES = Object.freeze({
  capRate: 0.75,
  tdrlFloorRate: 0.5,
  /** Placements on or after this date have no 50% floor (Pub. L. 114-328 §521). */
  tdrlFloorRemovedFrom: '2017-01-01',
  severance: Object.freeze({ monthsOfPayPerYear: 2, minimumYears: 3, minimumYearsCombat: 6, maximumYears: 19 }),
  source: 'https://www.law.cornell.edu/uscode/text/10/1401',
});

export const TERA_RULES = Object.freeze({
  minimumMonths: 15 * 12,
  fullMonths: 20 * 12,
  reductionPerYearShort: 0.01,
  source: 'https://www.law.cornell.edu/uscode/text/10/1293',
});

const num = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/**
 * Chapter 61 retired pay from the official disposition and DoD percentage.
 *
 *   payBaseMonthly       the system's pay base (Final Pay or High-36)
 *   system, serviceMonths, retirementDate   for the longevity method
 *   disposition          MEDICAL_DISPOSITIONS
 *   dodDisabilityPercent official DoD percentage (never the VA rating)
 *   tdrlPlacementDate    ISO, for the floor rule
 *   provenance           of the disposition and percentage
 *
 * Returns { path: 'retirement' | 'severance' | 'blocked', method, options,
 * grossUnrounded, steps, issues, ... }.
 */
export function computeChapter61({ payBaseMonthly, system, serviceMonths, retirementDate, disposition, dodDisabilityPercent, vaRating = null, tdrlPlacementDate = null, provenance = INPUT_PROVENANCE.USER_ESTIMATE, combatRelated = null, monthlyBasicPay = null } = {}) {
  const issues = [];
  const steps = [];
  const official = provenance === INPUT_PROVENANCE.USER_ENTERED_OFFICIAL;
  if (!disposition || disposition === MEDICAL_DISPOSITIONS.UNKNOWN) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_MEDICAL_DISPOSITION_REQUIRED));
    return { path: 'blocked', issues, steps, official };
  }
  if (vaRating !== null && vaRating !== undefined) issues.push(raiseIssue(ISSUE_CODES.MRT_MEDICAL_VA_RATING_SEPARATE, { detail: { vaRating } }));
  if (dodDisabilityPercent === null || dodDisabilityPercent === undefined || !(num(dodDisabilityPercent) >= 0)) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_MEDICAL_DOD_PERCENT_REQUIRED));
    return { path: 'blocked', issues, steps, official };
  }
  const pct = Math.max(0, num(dodDisabilityPercent));
  issues.push(raiseIssue(ISSUE_CODES.MRT_MEDICAL_TAX_NOT_DECIDED));
  if (!official) issues.push(raiseIssue(ISSUE_CODES.MRT_AUTHORITY_UNCONFIRMED, { detail: { what: 'medical disposition and DoD percentage' } }));

  if (disposition === MEDICAL_DISPOSITIONS.SEVERANCE) {
    const sev = computeSeverance({ monthlyBasicPay: monthlyBasicPay ?? payBaseMonthly, serviceMonths, combatRelated });
    issues.push(raiseIssue(ISSUE_CODES.MRT_MEDICAL_SEVERANCE_PATH, { detail: { years: sev.years } }));
    steps.push(...sev.steps);
    return { path: 'severance', severance: sev, dodDisabilityPercent: pct, issues, steps, official };
  }

  const longevity = computeLongevityMultiplier({ system, serviceMonths, retirementDate });
  const disabilityRate = Math.min(MEDICAL_RULES.capRate, pct / 100);
  const capApplied = pct / 100 > MEDICAL_RULES.capRate;
  let floorApplied = false;
  let rate = disabilityRate;
  if (disposition === MEDICAL_DISPOSITIONS.TDRL) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_MEDICAL_TDRL_TEMPORARY));
    const placed = tdrlPlacementDate ?? retirementDate;
    if (placed && placed < MEDICAL_RULES.tdrlFloorRemovedFrom && rate < MEDICAL_RULES.tdrlFloorRate) {
      rate = MEDICAL_RULES.tdrlFloorRate;
      floorApplied = true;
      issues.push(raiseIssue(ISSUE_CODES.MRT_MEDICAL_TDRL_FLOOR_APPLIED, { detail: { placementDate: placed } }));
    }
  }
  const base = Math.max(0, num(payBaseMonthly));
  const options = [
    { method: 'disability', label: 'Disability percentage method', rate, monthly: base * rate, capApplied, floorApplied },
    { method: 'longevity', label: 'Longevity method', rate: longevity.multiplier, monthly: base * longevity.multiplier },
  ];
  const chosen = options[0].monthly >= options[1].monthly ? options[0] : options[1];
  steps.push({ id: 'medical_disability_rate', label: `Disability method: DoD ${pct}%${capApplied ? ', capped at 75%' : ''}${floorApplied ? ', TDRL 50% floor' : ''}`, value: rate, unit: 'fraction', ruleId: 'military.chapter61' });
  steps.push({ id: 'medical_longevity_rate', label: `Longevity method: ${(longevity.rate * 100).toFixed(1)}% × ${longevity.serviceYears.toFixed(2)} years`, value: longevity.multiplier, unit: 'fraction', ruleId: 'military.chapter61' });
  steps.push({ id: 'medical_method', label: `Greater of the two: ${chosen.label.toLowerCase()}`, value: chosen.monthly, unit: 'monthly', ruleId: 'military.chapter61', note: 'Both authorized methods are shown; the member receives the greater.' });
  issues.push(raiseIssue(ISSUE_CODES.MRT_MEDICAL_METHOD_APPLIED, { detail: { method: chosen.method } }));
  return { path: 'retirement', disposition, dodDisabilityPercent: pct, method: chosen.method, multiplier: chosen.rate, options, longevity, grossUnrounded: chosen.monthly, capApplied, floorApplied, issues, steps, official };
}

/** Severance pay: 2 × monthly basic pay × years (fractions of six months or more round up), within the statutory bounds. */
export function computeSeverance({ monthlyBasicPay, serviceMonths, combatRelated = null } = {}) {
  const months = Math.max(0, num(serviceMonths));
  const whole = Math.floor(months / 12);
  const rounded = months - whole * 12 >= 6 ? whole + 1 : whole;
  const min = combatRelated === true ? MEDICAL_RULES.severance.minimumYearsCombat : MEDICAL_RULES.severance.minimumYears;
  const years = Math.min(MEDICAL_RULES.severance.maximumYears, Math.max(min, rounded));
  const pay = Math.max(0, num(monthlyBasicPay));
  const lumpSum = MEDICAL_RULES.severance.monthsOfPayPerYear * pay * years;
  return {
    years,
    yearsBeforeBounds: rounded,
    minimumApplied: rounded < min,
    maximumApplied: rounded > MEDICAL_RULES.severance.maximumYears,
    monthlyBasicPay: pay,
    lumpSum,
    combatRelatedKnown: combatRelated !== null,
    steps: [
      { id: 'severance_years', label: `Severance years: ${rounded} counted, bounded to ${years}`, value: years, unit: 'years', ruleId: 'military.chapter61' },
      { id: 'severance_amount', label: 'Severance pay: 2 × monthly basic pay × years', value: lumpSum, unit: 'monthly', ruleId: 'military.chapter61', note: 'A one-time payment, not retired pay. Recoupment against VA compensation is an official matter.' },
    ],
  };
}

/**
 * TERA retired pay from an official authority.
 *
 *   authority   { name, approvalDate, provenance }
 */
export function computeTera({ payBaseMonthly, system, serviceMonths, retirementDate, authority = null } = {}) {
  const issues = [];
  const steps = [];
  const months = Math.max(0, num(serviceMonths));
  const official = authority && authority.name && authority.provenance === INPUT_PROVENANCE.USER_ENTERED_OFFICIAL;
  if (!authority || !authority.name) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_TERA_AUTHORITY_REQUIRED));
    return { blocked: true, issues, steps, official: false };
  }
  if (!official) issues.push(raiseIssue(ISSUE_CODES.MRT_AUTHORITY_UNCONFIRMED, { detail: { what: 'TERA authority' } }));
  if (months < TERA_RULES.minimumMonths || months >= TERA_RULES.fullMonths) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_TERA_SERVICE_OUT_OF_RANGE, { detail: { serviceMonths: months } }));
    return { blocked: true, issues, steps, official: Boolean(official) };
  }
  const longevity = computeLongevityMultiplier({ system, serviceMonths: months, retirementDate });
  const monthsShort = TERA_RULES.fullMonths - months;
  const reductionFactor = 1 - TERA_RULES.reductionPerYearShort * (monthsShort / 12);
  const base = Math.max(0, num(payBaseMonthly));
  const grossUnrounded = base * longevity.multiplier * reductionFactor;
  steps.push({ id: 'tera_longevity', label: `Longevity formula: ${(longevity.rate * 100).toFixed(1)}% × ${longevity.serviceYears.toFixed(4)} years`, value: longevity.multiplier, unit: 'fraction', ruleId: 'military.tera' });
  steps.push({ id: 'tera_reduction', label: `TERA reduction: 1% per year short of 20 (${monthsShort} months short)`, value: reductionFactor, unit: 'fraction', ruleId: 'military.tera', note: 'Prorated by month: 1/12 of 1% per month.' });
  return { blocked: false, authority, longevity, monthsShort, reductionFactor, multiplier: longevity.multiplier * reductionFactor, grossUnrounded, issues, steps, official: Boolean(official) };
}
