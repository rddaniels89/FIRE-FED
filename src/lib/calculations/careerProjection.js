/**
 * Career salary projection for a General Schedule employee.
 *
 * gsPay.js answers "what does a GS-13 step 5 make today?". This module answers
 * the question the retirement decision actually turns on: what will they make
 * each year between now and separation, and what high-3 does that produce?
 *
 * Three mechanics move a GS salary over time, and each has a published rule:
 *
 *  1. Within-grade increases (step advances). An employee moves up one step
 *     after a fixed waiting period at the current step -- 52 weeks for steps
 *     1-3, 104 weeks for steps 4-6, 156 weeks for steps 7-9 -- assuming an
 *     acceptable level of performance.
 *     https://www.opm.gov/policy-data-oversight/pay-leave/pay-administration/fact-sheets/within-grade-increases/
 *
 *  2. Promotions. The two-step rule: on promotion the employee is placed at the
 *     lowest step of the new grade whose rate is at least two steps above their
 *     rate in the old grade. 5 CFR 531.214.
 *     https://www.ecfr.gov/current/title-5/chapter-I/subchapter-B/part-531/subpart-B/section-531.214
 *
 *  3. The January across-the-board adjustment. Set annually by the President
 *     or Congress; the 2026 raise was 1.0% for most employees. Locality
 *     percentages move separately and are held fixed here.
 *     https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/
 *
 * The model is deliberately annual: one row per year of age, with the table
 * scaled by (1 + raise)^n, the step advanced when its waiting period has run,
 * and promotions applied at the age given. High-3 is approximated as the best
 * three consecutive annual salaries, which is what "highest 36 consecutive
 * months" collapses to on an annual grid.
 */

import {
  DEFAULT_LOCALITY_CODE,
  GS_PAY_TABLE_YEAR,
  applyLocalityPay,
  getGsPayTable,
  getLocality,
} from './gsPay';

/**
 * Years an employee waits at each step before advancing to the next.
 * Keyed by the step they are currently on; step 10 has no next step.
 */
export const WGI_WAITING_PERIOD_YEARS = Object.freeze({
  1: 1,
  2: 1,
  3: 1,
  4: 2,
  5: 2,
  6: 2,
  7: 3,
  8: 3,
  9: 3,
});

/**
 * Long-run planning default for the January across-the-board raise. Recent
 * years have ranged from 1.0% (2026) to 4.7% (2024); 2% is a middle-of-the-road
 * assumption that a user can override.
 */
export const DEFAULT_ANNUAL_PAY_RAISE_PERCENT = 2.0;

const MIN_GRADE = 1;
const MAX_GRADE = 15;
const MIN_STEP = 1;
const MAX_STEP = 10;

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

const isValidGrade = (g) => Number.isInteger(g) && g >= MIN_GRADE && g <= MAX_GRADE;
const isValidStep = (s) => Number.isInteger(s) && s >= MIN_STEP && s <= MAX_STEP;

/** Base rate for a grade and step in an already-resolved base table. */
const rateIn = (baseTable, grade, step) => baseTable[grade][step - 1];

/**
 * The two-step rule of 5 CFR 531.214, in simplified form.
 *
 * Find the old-grade rate two steps above the current step (held at step 10
 * when the employee is already at step 9 or 10), then place the employee at the
 * first step of the new grade whose rate meets or exceeds it. The regulation's
 * refinement for steps 9 and 10 -- adding two within-grade amounts beyond the
 * step 10 rate -- is not modelled; it can only move the result up by a step.
 */
export function promotionStep({ fromGrade, fromStep, toGrade, year = GS_PAY_TABLE_YEAR }) {
  const g = toInt(fromGrade);
  const s = toInt(fromStep);
  const target = toInt(toGrade);
  if (!isValidGrade(g) || !isValidStep(s) || !isValidGrade(target)) return null;

  const { baseTable } = getGsPayTable(year);
  const twoStepsUpRate = rateIn(baseTable, g, Math.min(s + 2, MAX_STEP));

  const newSteps = baseTable[target];
  const index = newSteps.findIndex((rate) => rate >= twoStepsUpRate);
  const step = index === -1 ? MAX_STEP : index + 1;

  return { grade: target, step, basePay: rateIn(baseTable, target, step) };
}

/**
 * Average of the best three consecutive entries -- the annual-grid version of
 * "highest 36 consecutive months". With fewer than three entries it is the
 * average of what there is.
 */
export function computeHigh3FromSalaryPath(salaries) {
  const values = (Array.isArray(salaries) ? salaries : [])
    .map(Number)
    .filter((v) => Number.isFinite(v));
  if (values.length === 0) return 0;

  const window = Math.min(3, values.length);
  let best = -Infinity;
  for (let i = 0; i + window <= values.length; i += 1) {
    let sum = 0;
    for (let j = i; j < i + window; j += 1) sum += values[j];
    best = Math.max(best, sum / window);
  }
  return best;
}

/** Scale factor applied to the table for a year n raises after the table year. */
const raiseFactor = (annualRaisePercent, yearsOfRaises) =>
  (1 + annualRaisePercent / 100) ** yearsOfRaises;

/**
 * Year-by-year salary path from now until separation.
 *
 * Rows run from `currentAge` up to but not including `separationAge`: a person
 * separating at 45 draws the age-44 salary as their last. If separation is not
 * after the current age, the path is a single row at the current age.
 *
 * Returns null for a grade outside 1..15 or a step outside 1..10.
 */
export function projectCareerSalaries({
  grade,
  step,
  localityCode = DEFAULT_LOCALITY_CODE,
  currentAge,
  separationAge,
  startYear = GS_PAY_TABLE_YEAR,
  annualRaisePercent = DEFAULT_ANNUAL_PAY_RAISE_PERCENT,
  promotions = [],
  yearsInCurrentStep = 0,
  year,
}) {
  let currentGrade = toInt(grade);
  let currentStep = toInt(step);
  if (!isValidGrade(currentGrade) || !isValidStep(currentStep)) return null;

  const ageNow = Number(currentAge);
  if (!Number.isFinite(ageNow)) return null;
  const ageOut = Number(separationAge);
  const rowCount = Number.isFinite(ageOut) && ageOut > ageNow ? Math.ceil(ageOut - ageNow) : 1;

  const tableYear = year ?? startYear;
  const table = getGsPayTable(tableYear);
  const locality = getLocality(localityCode, tableYear) ?? getLocality(DEFAULT_LOCALITY_CODE, tableYear);
  const raise = Number(annualRaisePercent);
  const raisePercent = Number.isFinite(raise) ? raise : DEFAULT_ANNUAL_PAY_RAISE_PERCENT;
  const firstYear = toInt(startYear);
  const baseYear = Number.isFinite(firstYear) ? firstYear : GS_PAY_TABLE_YEAR;

  const promotionsByAge = new Map();
  for (const p of Array.isArray(promotions) ? promotions : []) {
    const atAge = Number(p?.atAge);
    const toGrade = toInt(p?.toGrade);
    if (!Number.isFinite(atAge) || !isValidGrade(toGrade)) continue;
    const list = promotionsByAge.get(atAge) ?? [];
    list.push(toGrade);
    promotionsByAge.set(atAge, list);
  }

  let yearsInStep = Math.max(0, Number(yearsInCurrentStep) || 0);
  const years = [];
  let previousStepChange = null;

  for (let i = 0; i < rowCount; i += 1) {
    const age = ageNow + i;
    const rowYear = baseYear + i;

    let isPromotionYear = false;
    for (const toGrade of promotionsByAge.get(age) ?? []) {
      const placed = promotionStep({
        fromGrade: currentGrade,
        fromStep: currentStep,
        toGrade,
        year: tableYear,
      });
      if (!placed) continue;
      currentGrade = placed.grade;
      currentStep = placed.step;
      yearsInStep = 0;
      isPromotionYear = true;
    }

    const factor = raiseFactor(raisePercent, rowYear - table.year);
    const basePay = Math.round(rateIn(table.baseTable, currentGrade, currentStep) * factor);
    const cap = Math.round(table.executiveScheduleLevelIvCap * factor);
    const { salary, wasCapped } = applyLocalityPay({
      basePay,
      localityPercent: locality.percent,
      cap,
    });

    years.push({
      age,
      year: rowYear,
      grade: currentGrade,
      step: currentStep,
      basePay,
      localityPercent: locality.percent,
      salary,
      wasCapped,
      cappedAt: cap,
      isPromotionYear,
      isWgiYear: previousStepChange === 'wgi' && !isPromotionYear,
    });

    // Advance the step for next year once the waiting period has run.
    yearsInStep += 1;
    const waitingPeriod = WGI_WAITING_PERIOD_YEARS[currentStep];
    if (waitingPeriod !== undefined && yearsInStep >= waitingPeriod) {
      currentStep += 1;
      yearsInStep = 0;
      previousStepChange = 'wgi';
    } else {
      previousStepChange = null;
    }
  }

  const salaries = years.map((r) => r.salary);
  const last = years[years.length - 1];

  return {
    years,
    salaryAtSeparation: last.salary,
    high3AtSeparation: computeHigh3FromSalaryPath(salaries),
    cumulativeEarnings: salaries.reduce((sum, s) => sum + s, 0),
    payTableYear: table.year,
    payTableIsExact: table.isExact,
    locality: { code: locality.code, name: locality.name, percent: locality.percent },
  };
}

/**
 * The marginal value of one more year: how much the final salary and the high-3
 * move if separation is pushed back a year. Takes the same arguments as
 * projectCareerSalaries.
 */
export function whatIfOneMoreYear(args) {
  const baseline = projectCareerSalaries(args);
  if (!baseline) return null;

  const ageNow = Number(args.currentAge);
  const ageOut = Number(args.separationAge);
  const baselineSeparationAge = Number.isFinite(ageOut) && ageOut > ageNow ? ageOut : ageNow;
  const oneMore = projectCareerSalaries({ ...args, separationAge: baselineSeparationAge + 1 });

  const summarize = (p, separationAge) => ({
    separationAge,
    salaryAtSeparation: p.salaryAtSeparation,
    high3AtSeparation: p.high3AtSeparation,
  });

  return {
    baseline: summarize(baseline, baselineSeparationAge),
    oneMoreYear: summarize(oneMore, baselineSeparationAge + 1),
    high3Delta: oneMore.high3AtSeparation - baseline.high3AtSeparation,
    salaryDelta: oneMore.salaryAtSeparation - baseline.salaryAtSeparation,
  };
}
