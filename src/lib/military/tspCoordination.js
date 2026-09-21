/**
 * Civilian and uniformed-services TSP accounts, and the limits they share
 * (spec §4.7, §6.9, §20.8).
 *
 * Two accounts, one login, several limits:
 *
 *   Elective deferrals (IRC 402(g))   employee contributions across BOTH
 *                                     accounts and any other employer plan
 *                                     that shares the limit; catch-up from 50,
 *                                     the higher 60–63 amount, from the annual
 *                                     parameter registry. Traditional
 *                                     contributions from tax-exempt combat-zone
 *                                     pay are excluded; Roth contributions from
 *                                     that pay are not.
 *   Annual additions (IRC 415(c))     per plan: employee (including the
 *                                     tax-exempt part) plus automatic and
 *                                     matching contributions.
 *   Matching                          FERS and BRS schedules are computed
 *                                     independently, per pay period, so
 *                                     front-loading one account can leave later
 *                                     periods with no match.
 *   Vesting                           service in one system never vests the
 *                                     automatic contribution of the other.
 *
 * Nothing here decides how much to contribute. It reports the limit, the
 * usage, and what the entered plan would forfeit.
 */

import { CURRENT_PARAMETER_YEAR, getAnnualParameters } from '../calculations/annualParameters';
import { getCatchUpLimitForAge } from '../calculations/contributionLimits';
import { ISSUE_CODES, raiseIssue } from './status';

export const ACCOUNT_CONTEXTS = Object.freeze({ CIVILIAN: 'civilian', UNIFORMED: 'uniformed_services' });
export const TSP_SYSTEMS = Object.freeze({ FERS: 'fers', BRS: 'brs', NEITHER: 'neither' });

/** Effective-dated service-contribution rules by system. */
export const TSP_CONTRIBUTION_RULES = Object.freeze({
  [TSP_SYSTEMS.FERS]: Object.freeze({
    effectiveFrom: '1987-01-01',
    automaticPercent: 1,
    automaticStartsAfterMonths: 0,
    matchingStartsAfterMonths: 0,
    /** Contributions continue for as long as the employee is covered. */
    stopsAfterYearsOfService: null,
    /** Most FERS employees; 2 for congressional and certain noncareer positions (override per account). */
    vestingYearsAutomatic: 3,
    source: 'https://www.tsp.gov/making-contributions/contribution-types/',
  }),
  [TSP_SYSTEMS.BRS]: Object.freeze({
    effectiveFrom: '2018-01-01',
    automaticPercent: 1,
    /** Service automatic 1% begins after 60 days of service; immediately for opt-ins. */
    automaticStartsAfterMonths: 2,
    /** Service matching begins at the start of the 25th month of service; immediately for opt-ins with 2+ years. */
    matchingStartsAfterMonths: 24,
    /** Automatic and matching contributions stop after 26 years of service. */
    stopsAfterYearsOfService: 26,
    vestingYearsAutomatic: 2,
    source: 'https://militarypay.defense.gov/BlendedRetirement/',
  }),
});

const num = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};
const nonNeg = (v) => Math.max(0, num(v));

/** The FERS/BRS matching schedule: 100% of the first 3%, 50% of the next 2%. */
export function matchingPercentFor(employeePercent) {
  const p = nonNeg(employeePercent);
  return Math.min(p, 3) + 0.5 * Math.min(Math.max(p - 3, 0), 2);
}

/**
 * Agency or service contribution percentages for one account, from that
 * account's own system and service. FERS service is never BRS service.
 *
 *   system                 'fers' | 'brs' | 'neither'
 *   employeePercent        employee deferral as % of basic pay
 *   monthsOfService        months in THIS system (or uniformed service for BRS)
 *   optedIn                BRS opt-in (2018) rather than automatic enrolment
 */
export function serviceContributionPercents({ system, employeePercent = 0, monthsOfService = 0, optedIn = false } = {}) {
  const rules = TSP_CONTRIBUTION_RULES[system];
  if (!rules) return { automatic: 0, matching: 0, total: 0, reasons: ['no_system'] };
  const months = nonNeg(monthsOfService);
  const years = months / 12;
  const reasons = [];
  if (rules.stopsAfterYearsOfService !== null && years >= rules.stopsAfterYearsOfService) {
    return { automatic: 0, matching: 0, total: 0, reasons: ['after_26_years'] };
  }
  const automaticOn = optedIn || months >= rules.automaticStartsAfterMonths;
  const matchingOn = optedIn ? months >= rules.matchingStartsAfterMonths || system === TSP_SYSTEMS.FERS : months >= rules.matchingStartsAfterMonths;
  if (!automaticOn) reasons.push('automatic_not_started');
  if (!matchingOn) reasons.push('matching_not_started');
  const automatic = automaticOn ? rules.automaticPercent : 0;
  const matching = matchingOn ? matchingPercentFor(employeePercent) : 0;
  return { automatic, matching, total: automatic + matching, reasons };
}

/**
 * Whether the automatic contribution is vested, from service in that system
 * alone (case 39: civilian service does not vest a uniformed-services
 * automatic contribution and vice versa). Matching is always vested.
 */
export function isAutomaticVested({ system, yearsOfServiceInSystem = 0, vestingYears = null } = {}) {
  const rules = TSP_CONTRIBUTION_RULES[system];
  if (!rules) return false;
  const required = vestingYears === null || vestingYears === undefined ? rules.vestingYearsAutomatic : num(vestingYears);
  return nonNeg(yearsOfServiceInSystem) >= required;
}

/** The elective-deferral limit and catch-up for a year and age, from the registry. */
export function sharedElectiveDeferralLimit({ year = CURRENT_PARAMETER_YEAR, age } = {}) {
  const tsp = getAnnualParameters(year).tsp;
  const catchUp = getCatchUpLimitForAge({ age, catchUpLimit: tsp.catchUpLimit, superCatchUpLimit: tsp.superCatchUpLimit });
  return {
    year,
    electiveDeferralLimit: tsp.electiveDeferralLimit,
    catchUpLimit: catchUp,
    catchUpApplies: catchUp > 0,
    total: tsp.electiveDeferralLimit + catchUp,
    annualAdditionsLimit: tsp.annualAdditionsLimit ?? null,
  };
}

/** A blank account for the validator; callers override what they know. */
export function createTspAccount(overrides = {}) {
  return {
    context: ACCOUNT_CONTEXTS.CIVILIAN,
    system: TSP_SYSTEMS.FERS,
    /** Employee deferrals already made this year (traditional + Roth), excluding tax-exempt traditional. */
    employeeDeferralsYtd: 0,
    /** Planned employee deferral per remaining pay period. */
    plannedPerPeriod: 0,
    payPeriodsRemaining: 0,
    /** Basic pay per period, for the match. */
    payPerPeriod: 0,
    employeePercent: 0,
    monthsOfService: 0,
    optedIn: false,
    /** Traditional contributions from tax-exempt combat-zone pay: outside 402(g), inside 415(c). */
    taxExemptDeferralsYtd: 0,
    taxExemptPlannedPerPeriod: 0,
    employerContributionsYtd: 0,
    /** Whether the account has ever received combat-zone contributions (an indicator, not an amount). */
    hasCombatZoneContributions: false,
    traditionalTaxExemptBasis: null,
    ...overrides,
  };
}

/**
 * Validates the year's deferrals across accounts (spec §6.9).
 *
 * Returns the shared limit, the usage, per-account annual additions, the
 * pay-period simulation of the match, and the issues.
 */
export function validateTspCoordination({ year = CURRENT_PARAMETER_YEAR, age, accounts = [], otherSharedPlanDeferrals = 0, userraMakeUp = [] } = {}) {
  const limits = sharedElectiveDeferralLimit({ year, age });
  const issues = [];
  const list = accounts.map((a) => createTspAccount(a));

  // Make-up contributions for a USERRA period count against the limit of
  // the year they are attributed to, not the year they are paid.
  const makeUpThisYear = (userraMakeUp ?? [])
    .filter((t) => t.type === USERRA_TRANSACTION_TYPES.MAKEUP_EMPLOYEE && num(t.attributedYear) === year)
    .reduce((s, t) => s + nonNeg(t.amount), 0);

  const ytd = list.reduce((s, a) => s + nonNeg(a.employeeDeferralsYtd), 0) + nonNeg(otherSharedPlanDeferrals) + makeUpThisYear;
  const planned = list.reduce((s, a) => s + nonNeg(a.plannedPerPeriod) * nonNeg(a.payPeriodsRemaining), 0);
  const shared = ytd + planned;
  const electiveExcess = Math.max(0, shared - limits.total);
  if (electiveExcess > 0) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_TSP_SHARED_LIMIT_EXCEEDED, { detail: { shared, limit: limits.total, excess: electiveExcess } }));
  }

  // Pay-period simulation: each period every account defers its plan while
  // shared room remains. A period with no deferral in an account that
  // matches is a period with no match (case 40).
  let room = Math.max(0, limits.total - ytd);
  const maxPeriods = Math.max(0, ...list.map((a) => nonNeg(a.payPeriodsRemaining)));
  const sim = list.map(() => ({ deferred: 0, matched: 0, matchLost: 0, periodsWithoutMatch: 0, limitHitAtPeriod: null }));
  for (let p = 0; p < maxPeriods; p += 1) {
    list.forEach((a, k) => {
      if (p >= nonNeg(a.payPeriodsRemaining)) return;
      // Regular deferrals draw on the shared room; tax-exempt combat-zone
      // deferrals do not, but they still earn the match.
      const wantRegular = nonNeg(a.plannedPerPeriod);
      const wantExempt = nonNeg(a.taxExemptPlannedPerPeriod);
      const want = wantRegular + wantExempt;
      const take = Math.min(wantRegular, room);
      room -= take;
      sim[k].deferred += take;
      const deferredThisPeriod = take + wantExempt;
      const pct = serviceContributionPercents({ system: a.system, employeePercent: a.employeePercent, monthsOfService: a.monthsOfService, optedIn: a.optedIn });
      const fullMatch = nonNeg(a.payPerPeriod) * (pct.matching / 100);
      if (want > 0 && deferredThisPeriod <= 0 && fullMatch > 0) {
        sim[k].periodsWithoutMatch += 1;
        sim[k].matchLost += fullMatch;
        if (sim[k].limitHitAtPeriod === null) sim[k].limitHitAtPeriod = p + 1;
      } else if (deferredThisPeriod > 0 && fullMatch > 0) {
        // A partial period earns a partial match.
        const share = Math.min(1, deferredThisPeriod / want);
        sim[k].matched += fullMatch * share;
        if (share < 1) sim[k].matchLost += fullMatch * (1 - share);
      }
    });
  }

  const byAccount = list.map((a, k) => {
    const pct = serviceContributionPercents({ system: a.system, employeePercent: a.employeePercent, monthsOfService: a.monthsOfService, optedIn: a.optedIn });
    const employeeTotal = nonNeg(a.employeeDeferralsYtd) + sim[k].deferred;
    const taxExemptTotal = nonNeg(a.taxExemptDeferralsYtd) + nonNeg(a.taxExemptPlannedPerPeriod) * nonNeg(a.payPeriodsRemaining);
    const employerPlanned = nonNeg(a.payPerPeriod) * nonNeg(a.payPeriodsRemaining) * (pct.automatic / 100) + sim[k].matched;
    const employerTotal = nonNeg(a.employerContributionsYtd) + employerPlanned;
    const annualAdditions = employeeTotal + taxExemptTotal + employerTotal;
    const additionsExcess = limits.annualAdditionsLimit ? Math.max(0, annualAdditions - limits.annualAdditionsLimit) : 0;
    const entity = { type: 'tspAccount', id: a.context };
    if (additionsExcess > 0) {
      issues.push(raiseIssue(ISSUE_CODES.MIL_TSP_ANNUAL_ADDITIONS_EXCEEDED, { entity, detail: { annualAdditions, limit: limits.annualAdditionsLimit, excess: additionsExcess } }));
    }
    if (sim[k].matchLost > 0) {
      issues.push(raiseIssue(ISSUE_CODES.MIL_TSP_MATCH_AT_RISK, { entity, detail: { matchLost: Math.round(sim[k].matchLost), periodsWithoutMatch: sim[k].periodsWithoutMatch, limitHitAtPeriod: sim[k].limitHitAtPeriod } }));
    }
    if (a.hasCombatZoneContributions && !(nonNeg(a.traditionalTaxExemptBasis) > 0)) {
      issues.push(raiseIssue(ISSUE_CODES.MIL_TSP_TAX_EXEMPT_BASIS_MISSING, { entity }));
    }
    return {
      context: a.context,
      system: a.system,
      contributionPercents: pct,
      employeeDeferrals: employeeTotal,
      taxExemptDeferrals: taxExemptTotal,
      employerContributions: employerTotal,
      annualAdditions,
      annualAdditionsExcess: additionsExcess,
      match: { earned: sim[k].matched, lost: sim[k].matchLost, periodsWithoutMatch: sim[k].periodsWithoutMatch, limitHitAtPeriod: sim[k].limitHitAtPeriod },
    };
  });

  return {
    year,
    limits,
    sharedDeferrals: { ytd, planned, total: shared, makeUpThisYear, otherSharedPlanDeferrals: nonNeg(otherSharedPlanDeferrals) },
    electiveExcess,
    remainingRoom: Math.max(0, limits.total - shared),
    byAccount,
    issues,
  };
}

// ---------------------------------------------------------------- balances

/** A uniformed-services (or civilian) account's balance buckets. */
export function createTspBalances(overrides = {}) {
  return {
    traditionalTaxable: 0,
    /** Contributions from tax-exempt combat-zone pay: returned tax-free, pro rata, on withdrawal. */
    traditionalTaxExemptBasis: 0,
    roth: 0,
    rothBasis: 0,
    /** Automatic contributions not yet vested; forfeited if service ends first. */
    unvestedAutomatic: 0,
    ...overrides,
  };
}

/**
 * One year of an account: contributions in, growth, vesting.
 *
 * Growth accrues to the taxable traditional bucket; the tax-exempt basis is a
 * fixed dollar figure (case 37). An unvested automatic bucket vests in full
 * when `vested` is true and is forfeited when `forfeitUnvested` is true.
 */
export function projectTspAccountYear({ balances, contributions = {}, returnRate = 0, vested = false, forfeitUnvested = false } = {}) {
  const b = createTspBalances(balances);
  const c = {
    employeeTraditional: nonNeg(contributions.employeeTraditional),
    employeeTaxExempt: nonNeg(contributions.employeeTaxExempt),
    employeeRoth: nonNeg(contributions.employeeRoth),
    automatic: nonNeg(contributions.automatic),
    matching: nonNeg(contributions.matching),
  };
  let traditionalTaxable = b.traditionalTaxable + c.employeeTraditional + c.matching;
  let basis = b.traditionalTaxExemptBasis + c.employeeTaxExempt;
  let unvested = b.unvestedAutomatic;
  if (vested) {
    traditionalTaxable += unvested + c.automatic;
    unvested = 0;
  } else {
    unvested += c.automatic;
  }
  let forfeited = 0;
  if (forfeitUnvested && !vested) {
    forfeited = unvested;
    unvested = 0;
  }
  const roth = b.roth + c.employeeRoth;
  const rothBasis = b.rothBasis + c.employeeRoth;
  const g = 1 + num(returnRate);
  // The tax-exempt basis is part of the traditional balance; growth on it is taxable.
  const traditionalTotal = (traditionalTaxable + basis) * g;
  return {
    balances: {
      traditionalTaxable: Math.max(0, traditionalTotal - basis),
      traditionalTaxExemptBasis: basis,
      roth: Math.max(0, roth * g),
      rothBasis,
      unvestedAutomatic: Math.max(0, unvested * g),
    },
    contributions: c,
    forfeited,
  };
}

/** Total of an account's buckets (vested and unvested). */
export function tspAccountTotal(balances) {
  const b = createTspBalances(balances);
  return b.traditionalTaxable + b.traditionalTaxExemptBasis + b.roth + b.unvestedAutomatic;
}

/**
 * A traditional withdrawal is paid pro rata from taxable and tax-exempt
 * money; the tax-exempt part is not income (TSP fact sheet, IRS Pub. 3).
 */
export function splitTraditionalWithdrawal({ amount, traditionalTaxable, traditionalTaxExemptBasis } = {}) {
  const a = nonNeg(amount);
  const taxable = nonNeg(traditionalTaxable);
  const basis = nonNeg(traditionalTaxExemptBasis);
  const total = taxable + basis;
  if (a <= 0 || total <= 0) return { taxable: 0, taxExempt: 0, basisRemaining: basis };
  const share = Math.min(1, a / total);
  const taxExempt = basis * share;
  return { taxable: a - taxExempt, taxExempt, basisRemaining: basis - taxExempt };
}

// ---------------------------------------------------------------- USERRA

export const USERRA_TRANSACTION_TYPES = Object.freeze({
  MAKEUP_EMPLOYEE: 'makeup_employee',
  RESTORED_AGENCY_AUTOMATIC: 'restored_agency_automatic',
  RESTORED_AGENCY_MATCHING: 'restored_agency_matching',
  BREAKAGE: 'breakage',
});

/**
 * Make-up and restoration entries for a USERRA return are stored as distinct
 * transactions attributed to the year they replace. Validation only; the
 * amounts are the agency's.
 */
export function normalizeUserraMakeUp(transactions = []) {
  const issues = [];
  const list = (transactions ?? []).map((t, i) => {
    const type = Object.values(USERRA_TRANSACTION_TYPES).includes(t.type) ? t.type : null;
    const entry = {
      id: t.id ?? `userra_${i}`,
      type,
      amount: nonNeg(t.amount),
      attributedYear: t.attributedYear === null || t.attributedYear === undefined ? null : num(t.attributedYear),
      paidDate: t.paidDate ?? null,
      provenance: t.provenance ?? 'user_estimate',
    };
    if (!type || entry.attributedYear === null) {
      issues.push(raiseIssue(ISSUE_CODES.MIL_USERRA_TRANSACTION_INCOMPLETE, { entity: { type: 'userraTransaction', id: entry.id } }));
    }
    return entry;
  });
  const totals = {};
  for (const t of list) if (t.type) totals[t.type] = (totals[t.type] ?? 0) + t.amount;
  return { transactions: list, totals, issues };
}
