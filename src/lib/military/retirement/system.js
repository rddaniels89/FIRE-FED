/**
 * Which military retirement system applies, and how sure we are.
 *
 * Four systems, keyed by the date the member first entered service (DIEMS)
 * and by two elections nothing in the dates can reveal:
 *
 *   Final Pay   entered before 8 September 1980
 *   High-36     entered 8 September 1980 through 31 December 2017 and made
 *               no REDUX or BRS election
 *   REDUX/CSB   entered 1 August 1986 through 31 December 2002 AND elected
 *               the Career Status Bonus at 15 years
 *   BRS         first entered on or after 1 January 2018, or opted in during
 *               2018 with under 12 years of service
 *
 * FireFed may suggest a system from the DIEMS; it never labels a result
 * supported until the user confirms the system from their record. A REDUX or
 * BRS election is a fact the user states, never an inference.
 */

import { ISSUE_CODES, raiseIssue } from '../status';

export const RETIREMENT_SYSTEMS = Object.freeze({
  FINAL_PAY: 'final_pay',
  HIGH_36: 'high_36',
  REDUX: 'redux',
  BRS: 'brs',
});

export const SYSTEM_LABELS = Object.freeze({
  [RETIREMENT_SYSTEMS.FINAL_PAY]: 'Final Pay',
  [RETIREMENT_SYSTEMS.HIGH_36]: 'High-36',
  [RETIREMENT_SYSTEMS.REDUX]: 'REDUX / Career Status Bonus',
  [RETIREMENT_SYSTEMS.BRS]: 'Blended Retirement System',
});

export const CALCULATION_PATHS = Object.freeze({
  REGULAR: 'regular',
  RESERVE_NONREGULAR: 'reserve_nonregular',
  MEDICAL: 'medical',
  TERA: 'tera',
  ALREADY_RETIRED: 'already_retired',
});

export const SYSTEM_CONFIRMATION = Object.freeze({
  OFFICIAL: 'official',
  USER_CONFIRMED: 'user_confirmed',
  SUGGESTED: 'suggested',
  UNKNOWN: 'unknown',
});

export const DIEMS_BOUNDARIES = Object.freeze({
  FINAL_PAY_BEFORE: '1980-09-08',
  REDUX_WINDOW_FROM: '1986-08-01',
  REDUX_WINDOW_BEFORE: '2003-01-01',
  BRS_FROM: '2018-01-01',
});

const S = RETIREMENT_SYSTEMS;

/**
 * Suggests a system from the DIEMS and stated elections. Returns
 * { suggested, reasons, requiresConfirmation: true, candidates }.
 * `suggested` is null when the DIEMS is unknown.
 */
export function suggestMilitaryRetirementSystem({ diems, cbsElected = null, brsOptIn = null } = {}) {
  const d = typeof diems === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(diems) ? diems : null;
  const reasons = [];
  if (!d) {
    return { suggested: null, reasons: ['The date you first entered service (DIEMS) is not recorded.'], requiresConfirmation: true, candidates: Object.values(S) };
  }
  if (d < DIEMS_BOUNDARIES.FINAL_PAY_BEFORE) {
    reasons.push('Entered service before 8 September 1980.');
    return { suggested: S.FINAL_PAY, reasons, requiresConfirmation: true, candidates: [S.FINAL_PAY] };
  }
  if (d >= DIEMS_BOUNDARIES.BRS_FROM) {
    reasons.push('First entered service on or after 1 January 2018: automatically covered by the Blended Retirement System.');
    return { suggested: S.BRS, reasons, requiresConfirmation: true, candidates: [S.BRS] };
  }
  if (brsOptIn === true) {
    reasons.push('You stated a BRS opt-in election.');
    return { suggested: S.BRS, reasons, requiresConfirmation: true, candidates: [S.BRS, S.HIGH_36, S.REDUX] };
  }
  const inReduxWindow = d >= DIEMS_BOUNDARIES.REDUX_WINDOW_FROM && d < DIEMS_BOUNDARIES.REDUX_WINDOW_BEFORE;
  if (inReduxWindow && cbsElected === true) {
    reasons.push('Entered service between 1 August 1986 and 31 December 2002 and you stated a Career Status Bonus election.');
    return { suggested: S.REDUX, reasons, requiresConfirmation: true, candidates: [S.REDUX, S.HIGH_36, S.BRS] };
  }
  reasons.push(
    inReduxWindow
      ? 'Entered service between 1 August 1986 and 31 December 2002 with no Career Status Bonus election stated.'
      : 'Entered service between 8 September 1980 and 31 December 2017 with no BRS opt-in stated.'
  );
  return { suggested: S.HIGH_36, reasons, requiresConfirmation: true, candidates: inReduxWindow ? [S.HIGH_36, S.REDUX, S.BRS] : [S.HIGH_36, S.BRS] };
}

/**
 * Checks a chosen system against the dates and elections. Never switches the
 * system; it raises MRT_SYSTEM_CONFLICT and lets the user resolve it.
 */
export function validateSystemSelection({ system, systemConfirmation, diems, cbsElected = null, brsOptIn = null } = {}) {
  const issues = [];
  const entity = { type: 'retirementScenario', field: 'system' };
  if (!system || !Object.values(S).includes(system)) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_SYSTEM_UNCONFIRMED, { entity, detail: { reason: 'system_missing' } }));
    return { ok: false, confirmed: false, issues };
  }
  const confirmed = systemConfirmation === SYSTEM_CONFIRMATION.OFFICIAL || systemConfirmation === SYSTEM_CONFIRMATION.USER_CONFIRMED;
  if (!confirmed) issues.push(raiseIssue(ISSUE_CODES.MRT_SYSTEM_UNCONFIRMED, { entity, detail: { reason: 'not_confirmed', system } }));

  const d = typeof diems === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(diems) ? diems : null;
  const conflict = (reason) => issues.push(raiseIssue(ISSUE_CODES.MRT_SYSTEM_CONFLICT, { entity, detail: { system, diems: d, reason } }));

  if (system === S.REDUX && cbsElected !== true) conflict('redux_requires_stated_cbs_election');
  if (d) {
    if (system === S.FINAL_PAY && d >= DIEMS_BOUNDARIES.FINAL_PAY_BEFORE) conflict('final_pay_requires_diems_before_1980_09_08');
    if (system === S.REDUX && (d < DIEMS_BOUNDARIES.REDUX_WINDOW_FROM || d >= DIEMS_BOUNDARIES.REDUX_WINDOW_BEFORE)) conflict('redux_diems_outside_window');
    if (system === S.BRS && d < DIEMS_BOUNDARIES.BRS_FROM && brsOptIn !== true) conflict('brs_before_2018_requires_opt_in');
    if (system === S.HIGH_36 && d >= DIEMS_BOUNDARIES.BRS_FROM) conflict('high_36_not_available_after_2017');
    if (system === S.HIGH_36 && d < DIEMS_BOUNDARIES.FINAL_PAY_BEFORE) conflict('high_36_not_available_before_1980_09_08');
  }
  const hasConflict = issues.some((i) => i.code === ISSUE_CODES.MRT_SYSTEM_CONFLICT);
  return { ok: !hasConflict, confirmed, issues };
}
