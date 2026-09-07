/**
 * Tax rates for the TSP Traditional-vs-Roth comparison, read from the bracket
 * engine instead of typed in.
 *
 * The comparison needs two numbers: the marginal rate a contribution avoids
 * today, and the rate a withdrawal pays later. The first is the bracket the
 * salary lands in; the second is what the timeline actually charges in the
 * first full year of retirement, which already reflects the pension, the
 * supplement, Social Security and the state.
 */

import { calculateStandardDeduction, marginalRateForTaxableIncome } from '../taxes';
import { buildTimeline } from './timeline';
import { CURRENT_PARAMETER_YEAR } from '../calculations/annualParameters';

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Marginal federal rate on the current salary, after the standard deduction and pre-tax deferrals. */
export function currentMarginalRate(scenario) {
  const filingStatus = scenario?.taxes?.filingStatus ?? 'single';
  const salary = num(scenario?.tsp?.annualSalary);
  const spouseIncome = scenario?.household?.spouse?.enabled ? num(scenario.household.spouse.annualIncome) : 0;
  const deferral = scenario?.tsp?.contributionType === 'roth' ? 0 : salary * (num(scenario?.tsp?.monthlyContributionPercent) / 100);
  const deduction = calculateStandardDeduction({ year: CURRENT_PARAMETER_YEAR, filingStatus, ages: [num(scenario?.profile?.currentAge)] }).total;
  const taxableIncome = Math.max(0, salary + spouseIncome - deferral - deduction);
  return marginalRateForTaxableIncome({ year: CURRENT_PARAMETER_YEAR, filingStatus, taxableIncome });
}

/** Effective and marginal rates in the first full year after the annuity begins (or after separation). */
export function retirementTaxRates(scenario, { timeline } = {}) {
  const t = timeline ?? buildTimeline(scenario);
  const startAge = t.plan.annuityStartAge ?? t.plan.separationAge;
  const row = t.rows.find((r) => r.age === startAge + 1) ?? t.rows.find((r) => r.age >= startAge) ?? t.rows[t.rows.length - 1];
  const filingStatus = scenario?.taxes?.filingStatus ?? 'single';
  const ordinary = row.pension + row.srs + row.spousePension + row.withdrawals.traditional + row.sideHustle + row.socialSecurity * 0.85;
  const deduction = calculateStandardDeduction({ year: CURRENT_PARAMETER_YEAR, filingStatus, ages: [row.age] }).total;
  return {
    age: row.age,
    effectiveRate: row.taxes.effectiveRate,
    marginalRate: marginalRateForTaxableIncome({ year: CURRENT_PARAMETER_YEAR, filingStatus, taxableIncome: Math.max(0, ordinary - deduction) }),
    totalTax: row.taxes.total,
  };
}

/** The pair the TSP comparison consumes, as whole-number percents. */
export function resolveTspTaxRates(scenario, options = {}) {
  const now = currentMarginalRate(scenario);
  const later = retirementTaxRates(scenario, options);
  return {
    currentTaxRate: Math.round(now * 100),
    retirementTaxRate: Math.round(later.marginalRate * 100),
    retirementEffectiveRate: Math.round(later.effectiveRate * 100),
    basis: 'bracket_engine',
    retirementRateAge: later.age,
  };
}
