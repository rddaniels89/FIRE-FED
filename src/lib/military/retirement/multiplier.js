/**
 * The retired-pay multiplier: creditable service turned into a percentage of
 * the pay base, with the REDUX reduction and the historical cap.
 *
 * Service. 10 U.S.C. 1405(b): years of service for the multiplier are whole
 * years plus each additional full month as one-twelfth; any remaining days
 * are disregarded. Service is never derived from enlistment and retirement
 * dates here; the caller supplies the official years, months, and days.
 *
 * Rate. 2.5% per year under Final Pay, High-36, and REDUX; 2.0% under BRS
 * (10 U.S.C. 1409(b)(1), (b)(4)).
 *
 * REDUX. Under 30 years the multiplier is reduced by one percentage point for
 * each full year (and fraction) short of 30: 2.5% × years − 1% × (30 − years)
 * (10 U.S.C. 1409(b)(2)). At 62 retired pay is recomputed as if the reduction
 * had never applied; cola.js carries that.
 *
 * Cap. Retirements before 1 January 2007 were capped at 75% of the base.
 * The FY2007 NDAA removed the cap for later retirements, so a member with
 * more than 30 years earns 2.5% per year up to 100% (10 U.S.C. 1409(b)(3)
 * as amended by Pub. L. 109-364 §642). The trace always says whether a cap
 * applied.
 */

import { RETIREMENT_SYSTEMS } from './system';

export const MULTIPLIER_RATES = Object.freeze({
  [RETIREMENT_SYSTEMS.FINAL_PAY]: 0.025,
  [RETIREMENT_SYSTEMS.HIGH_36]: 0.025,
  [RETIREMENT_SYSTEMS.REDUX]: 0.025,
  [RETIREMENT_SYSTEMS.BRS]: 0.02,
});

export const REDUX_REDUCTION_PER_YEAR = 0.01;
export const REDUX_FULL_SERVICE_YEARS = 30;
export const PRE_2007_CAP = 0.75;
export const CAP_REMOVAL_DATE = '2007-01-01';
export const LEGACY_CAP_AFTER_2006 = 1.0;

const int = (v) => Math.max(0, Math.floor(Number(v) || 0));

/** Whole months of creditable service for the multiplier; days are disregarded (10 U.S.C. 1405(b)). */
export function serviceToMultiplierMonths({ years = 0, months = 0, days = 0 } = {}) {
  void days;
  return int(years) * 12 + int(months);
}

/**
 * Returns the multiplier and every step behind it.
 *
 *   system          RETIREMENT_SYSTEMS
 *   serviceMonths   from serviceToMultiplierMonths
 *   retirementDate  ISO, for the cap rule
 *   applyRedux      false to compute the age-62 "as if no reduction" figure
 */
export function computeLongevityMultiplier({ system, serviceMonths, retirementDate, applyRedux = true } = {}) {
  const rate = MULTIPLIER_RATES[system];
  if (rate === undefined) return null;
  const months = int(serviceMonths);
  const years = months / 12;
  const uncapped = rate * years;

  let reduxReduction = 0;
  if (system === RETIREMENT_SYSTEMS.REDUX && applyRedux && years < REDUX_FULL_SERVICE_YEARS) {
    reduxReduction = REDUX_REDUCTION_PER_YEAR * (REDUX_FULL_SERVICE_YEARS - years);
  }
  const afterRedux = Math.max(0, uncapped - reduxReduction);

  const capRate = retirementDate && String(retirementDate) < CAP_REMOVAL_DATE ? PRE_2007_CAP : LEGACY_CAP_AFTER_2006;
  const capApplied = afterRedux > capRate;
  const multiplier = capApplied ? capRate : afterRedux;

  return {
    system,
    rate,
    serviceMonths: months,
    serviceYears: years,
    uncapped,
    reduxReduction,
    afterRedux,
    capRate,
    capApplied,
    multiplier,
    steps: [
      { id: 'service_months', label: 'Creditable service for the multiplier', value: months, unit: 'months', note: 'Whole years plus full months; days disregarded (10 U.S.C. 1405(b)).' },
      { id: 'rate', label: 'Rate per year of service', value: rate, unit: 'fraction' },
      { id: 'uncapped', label: 'Rate × years', value: uncapped, unit: 'fraction' },
      ...(reduxReduction > 0 ? [{ id: 'redux_reduction', label: 'REDUX reduction: 1% per year short of 30', value: -reduxReduction, unit: 'fraction' }] : []),
      { id: 'cap', label: capApplied ? `Capped at ${(capRate * 100).toFixed(0)}%` : `Below the ${(capRate * 100).toFixed(0)}% cap`, value: multiplier, unit: 'fraction', note: capRate === PRE_2007_CAP ? 'Retirements before 1 January 2007 were capped at 75%.' : 'The 75% cap was removed for retirements on or after 1 January 2007.' },
    ],
  };
}
