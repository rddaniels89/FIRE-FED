/**
 * Cost-of-living adjustments to military retired pay, year by year.
 *
 * Every system except REDUX receives the full CPI-W adjustment each
 * 1 December (10 U.S.C. 1401a). REDUX receives CPI-W less one percentage
 * point; at age 62 retired pay is recomputed once to what it would have been
 * with the full multiplier and full COLAs, and the minus-one rule resumes
 * (10 U.S.C. 1409(b)(2), 1410).
 *
 * First adjustment. A COLA measures CPI-W from the third quarter of one year
 * to the third quarter of the next. A member who retires part-way through
 * that window is credited only with the part after retirement, by the
 * quarter in which they retired: retire in the first quarter, half; second
 * quarter, a quarter; third quarter, none that December and the full amount
 * the next; fourth quarter, three quarters of the next December's COLA (DoD
 * FMR Volume 7B, chapter 8). The proration table is marked for verification.
 *
 * Future COLAs are the scenario's inflation assumption; published COLAs can
 * be supplied by year and are used where given. The two are distinguished on
 * every row.
 */

import { RETIREMENT_SYSTEMS } from './system';

export const REDUX_COLA_OFFSET = 0.01;

/** Share of the first COLA credited, by the quarter of retirement. Pending verification against FMR 7B ch. 8. */
export const FIRST_COLA_SHARE_BY_QUARTER = Object.freeze({
  verified: false,
  /** COLA in the December of the retirement year. */
  sameYear: Object.freeze({ 1: 0.5, 2: 0.25, 3: 0, 4: 0 }),
  /** COLA in the December of the following year. */
  nextYear: Object.freeze({ 1: 1, 2: 1, 3: 1, 4: 0.75 }),
});

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Projects gross monthly retired pay by calendar year.
 *
 *   system, retirementDate (ISO)
 *   grossMonthly                the rounded first-payment amount
 *   fullMonthly                 for REDUX: the amount under the full multiplier (age-62 recompute)
 *   ageAtRetirement             decimal years, for the age-62 event
 *   inflation                   decimal assumption for future COLAs
 *   publishedColas              { [year]: decimal } applied in that year's December when given
 *   horizonYears                how many years to project
 *
 * Returns rows [{ year, age, monthly, colaApplied, colaSource, factor, event }],
 * where `monthly` is the rate in force for most of that year (after the prior
 * December's adjustment).
 */
export function projectRetiredPayCola({ system, retirementDate, grossMonthly, fullMonthly = null, ageAtRetirement, inflation = 0.025, publishedColas = {}, horizonYears = 40 } = {}) {
  const retireYear = Number(String(retirementDate).slice(0, 4));
  const retireMonth = Number(String(retirementDate).slice(5, 7));
  const quarter = Math.min(4, Math.max(1, Math.ceil(retireMonth / 3)));
  const isRedux = system === RETIREMENT_SYSTEMS.REDUX;
  const rows = [];
  let monthly = num(grossMonthly);
  let fullTrack = num(fullMonthly ?? grossMonthly);
  let recomputed = false;

  for (let k = 0; k <= horizonYears; k += 1) {
    const year = retireYear + k;
    const age = num(ageAtRetirement) + k;
    let event = null;

    // The REDUX recomputation happens at 62: retired pay is reset to what the
    // full multiplier with full COLAs would have paid, then the offset resumes.
    if (isRedux && !recomputed && age >= 62 && k > 0) {
      monthly = fullTrack;
      recomputed = true;
      event = 'redux_age_62_recomputation';
    }

    rows.push({ year, age, monthly: Math.round(monthly * 100) / 100, colaApplied: null, colaSource: null, factor: null, event });

    // December's adjustment sets the next year's rate.
    const published = publishedColas && publishedColas[year] !== undefined ? num(publishedColas[year]) : null;
    const fullCola = published !== null ? published : num(inflation);
    const share = k === 0 ? FIRST_COLA_SHARE_BY_QUARTER.sameYear[quarter] : k === 1 ? FIRST_COLA_SHARE_BY_QUARTER.nextYear[quarter] : 1;
    const applied = fullCola * share;
    const reduxApplied = Math.max(0, applied - (share > 0 ? REDUX_COLA_OFFSET * share : 0));
    rows[rows.length - 1].colaApplied = isRedux ? reduxApplied : applied;
    rows[rows.length - 1].colaSource = published !== null ? 'published' : 'assumed';
    rows[rows.length - 1].factor = 1 + rows[rows.length - 1].colaApplied;
    rows[rows.length - 1].firstColaShare = k <= 1 ? share : 1;

    monthly *= 1 + (isRedux ? reduxApplied : applied);
    fullTrack *= 1 + applied;
  }
  return rows;
}
