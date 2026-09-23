import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_CONTEXTS,
  TSP_SYSTEMS,
  USERRA_TRANSACTION_TYPES,
  createTspBalances,
  isAutomaticVested,
  matchingPercentFor,
  normalizeUserraMakeUp,
  projectTspAccountYear,
  serviceContributionPercents,
  sharedElectiveDeferralLimit,
  splitTraditionalWithdrawal,
  validateTspCoordination,
} from '../tspCoordination';
import { ISSUE_CODES, ISSUE_SEVERITY } from '../status';

/** Spec §14.1 cases 33–40. */

const civ = (o = {}) => ({ context: ACCOUNT_CONTEXTS.CIVILIAN, system: TSP_SYSTEMS.FERS, payPerPeriod: 4000, employeePercent: 10, plannedPerPeriod: 400, payPeriodsRemaining: 26, monthsOfService: 120, ...o });
const uni = (o = {}) => ({ context: ACCOUNT_CONTEXTS.UNIFORMED, system: TSP_SYSTEMS.BRS, payPerPeriod: 1500, employeePercent: 5, plannedPerPeriod: 75, payPeriodsRemaining: 12, monthsOfService: 96, ...o });
const codes = (r) => r.issues.map((i) => i.code);

describe('shared elective-deferral limit (cases 33–35)', () => {
  it('civilian plus uniformed deferrals share one 402(g) limit', () => {
    const ok = validateTspCoordination({ year: 2026, age: 40, accounts: [civ({ plannedPerPeriod: 800 }), uni({ plannedPerPeriod: 300 })] });
    expect(ok.limits.total).toBe(24500);
    expect(ok.sharedDeferrals.total).toBe(800 * 26 + 300 * 12);
    expect(ok.electiveExcess).toBe(0);
    const over = validateTspCoordination({ year: 2026, age: 40, accounts: [civ({ plannedPerPeriod: 900 }), uni({ plannedPerPeriod: 300 })] });
    expect(over.electiveExcess).toBe(900 * 26 + 3600 - 24500);
    expect(codes(over)).toContain(ISSUE_CODES.MIL_TSP_SHARED_LIMIT_EXCEEDED);
    expect(over.issues.find((i) => i.code === ISSUE_CODES.MIL_TSP_SHARED_LIMIT_EXCEEDED).severity).toBe(ISSUE_SEVERITY.BLOCK);
    // Another shared plan counts too.
    const other = validateTspCoordination({ year: 2026, age: 40, accounts: [civ({ plannedPerPeriod: 800 })], otherSharedPlanDeferrals: 5000 });
    expect(other.electiveExcess).toBe(800 * 26 + 5000 - 24500);
  });

  it('age-50 catch-up raises the shared limit from the registry', () => {
    expect(sharedElectiveDeferralLimit({ year: 2026, age: 49 })).toMatchObject({ electiveDeferralLimit: 24500, catchUpLimit: 0, total: 24500 });
    expect(sharedElectiveDeferralLimit({ year: 2026, age: 50 })).toMatchObject({ catchUpLimit: 8000, total: 32500, catchUpApplies: true });
    const r = validateTspCoordination({ year: 2026, age: 52, accounts: [civ({ plannedPerPeriod: 1000 }), uni({ plannedPerPeriod: 500 })] });
    expect(r.sharedDeferrals.total).toBe(32000);
    expect(r.electiveExcess).toBe(0);
  });

  it('ages 60 through 63 use the higher catch-up, which drops back at 64', () => {
    expect(sharedElectiveDeferralLimit({ year: 2026, age: 60 }).total).toBe(24500 + 11250);
    expect(sharedElectiveDeferralLimit({ year: 2026, age: 63 }).total).toBe(35750);
    expect(sharedElectiveDeferralLimit({ year: 2026, age: 64 }).total).toBe(32500);
  });
});

describe('annual additions and combat-zone contributions (case 36)', () => {
  it('tax-exempt traditional contributions stay outside 402(g) but inside 415(c)', () => {
    const r = validateTspCoordination({
      year: 2026,
      age: 35,
      accounts: [uni({ payPerPeriod: 6000, employeePercent: 10, plannedPerPeriod: 0, taxExemptPlannedPerPeriod: 5500, payPeriodsRemaining: 12, monthsOfService: 120 })],
    });
    expect(r.sharedDeferrals.total).toBe(0);
    expect(r.electiveExcess).toBe(0);
    const acct = r.byAccount[0];
    expect(acct.taxExemptDeferrals).toBe(66000);
    // 1% automatic + 4% match on 72,000 of pay = 3,600; 66,000 + 3,600 = 69,600 < 72,000.
    expect(acct.annualAdditions).toBeCloseTo(69600, 0);
    expect(acct.annualAdditionsExcess).toBe(0);
    const over = validateTspCoordination({ year: 2026, age: 35, accounts: [uni({ payPerPeriod: 6000, employeePercent: 10, plannedPerPeriod: 0, taxExemptPlannedPerPeriod: 6000, payPeriodsRemaining: 12, monthsOfService: 120 })] });
    expect(over.byAccount[0].annualAdditionsExcess).toBeCloseTo(72000 + 3600 - 72000, 0);
    expect(codes(over)).toContain(ISSUE_CODES.MIL_TSP_ANNUAL_ADDITIONS_EXCEEDED);
  });

  it('flags a combat-zone account with no recorded tax-exempt balance', () => {
    const r = validateTspCoordination({ year: 2026, age: 35, accounts: [uni({ hasCombatZoneContributions: true, traditionalTaxExemptBasis: null })] });
    expect(codes(r)).toContain(ISSUE_CODES.MIL_TSP_TAX_EXEMPT_BASIS_MISSING);
    const ok = validateTspCoordination({ year: 2026, age: 35, accounts: [uni({ hasCombatZoneContributions: true, traditionalTaxExemptBasis: 12000 })] });
    expect(codes(ok)).not.toContain(ISSUE_CODES.MIL_TSP_TAX_EXEMPT_BASIS_MISSING);
  });
});

describe('tax-exempt basis at withdrawal (case 37)', () => {
  it('returns the basis pro rata and never as taxable income', () => {
    const split = splitTraditionalWithdrawal({ amount: 10000, traditionalTaxable: 80000, traditionalTaxExemptBasis: 20000 });
    expect(split.taxExempt).toBe(2000);
    expect(split.taxable).toBe(8000);
    expect(split.basisRemaining).toBe(18000);
    const all = splitTraditionalWithdrawal({ amount: 100000, traditionalTaxable: 80000, traditionalTaxExemptBasis: 20000 });
    expect(all.taxExempt).toBe(20000);
    expect(all.basisRemaining).toBe(0);
  });

  it('keeps the basis as a fixed dollar figure while the account grows', () => {
    const y = projectTspAccountYear({ balances: createTspBalances({ traditionalTaxable: 50000, traditionalTaxExemptBasis: 10000 }), contributions: { employeeTaxExempt: 5000 }, returnRate: 0.1, vested: true });
    expect(y.balances.traditionalTaxExemptBasis).toBe(15000);
    // Growth on the whole 65,000 goes to the taxable bucket.
    expect(y.balances.traditionalTaxable).toBeCloseTo(65000 * 1.1 - 15000, 6);
  });
});

describe('FERS and BRS matching and vesting (cases 38–39)', () => {
  it('computes FERS and BRS matches independently from each system’s own service', () => {
    expect(matchingPercentFor(5)).toBe(4);
    expect(matchingPercentFor(3)).toBe(3);
    expect(matchingPercentFor(4)).toBe(3.5);
    expect(matchingPercentFor(10)).toBe(4);
    // FERS: automatic and matching from day one.
    expect(serviceContributionPercents({ system: TSP_SYSTEMS.FERS, employeePercent: 5, monthsOfService: 0 })).toMatchObject({ automatic: 1, matching: 4 });
    // BRS: no automatic before 60 days, no matching before the 25th month, nothing after 26 years.
    expect(serviceContributionPercents({ system: TSP_SYSTEMS.BRS, employeePercent: 5, monthsOfService: 1 })).toMatchObject({ automatic: 0, matching: 0 });
    expect(serviceContributionPercents({ system: TSP_SYSTEMS.BRS, employeePercent: 5, monthsOfService: 12 })).toMatchObject({ automatic: 1, matching: 0 });
    expect(serviceContributionPercents({ system: TSP_SYSTEMS.BRS, employeePercent: 5, monthsOfService: 24 })).toMatchObject({ automatic: 1, matching: 4 });
    expect(serviceContributionPercents({ system: TSP_SYSTEMS.BRS, employeePercent: 5, monthsOfService: 26 * 12 })).toMatchObject({ automatic: 0, matching: 0, reasons: ['after_26_years'] });
    // Opt-ins with two years were matched at once.
    expect(serviceContributionPercents({ system: TSP_SYSTEMS.BRS, employeePercent: 5, monthsOfService: 30, optedIn: true })).toMatchObject({ automatic: 1, matching: 4 });
    // A legacy member gets nothing from the service.
    expect(serviceContributionPercents({ system: TSP_SYSTEMS.NEITHER, employeePercent: 5, monthsOfService: 120 }).total).toBe(0);
    // The same 10% of civilian pay and 5% of military pay give two different matches in the validator.
    const r = validateTspCoordination({ year: 2026, age: 40, accounts: [civ(), uni()] });
    expect(r.byAccount[0].contributionPercents).toMatchObject({ automatic: 1, matching: 4 });
    expect(r.byAccount[1].contributionPercents).toMatchObject({ automatic: 1, matching: 4 });
    expect(r.byAccount[0].employerContributions).toBeCloseTo(4000 * 26 * 0.05, 6);
    expect(r.byAccount[1].employerContributions).toBeCloseTo(1500 * 12 * 0.05, 6);
  });

  it('civilian service does not vest a uniformed automatic contribution, and the reverse', () => {
    expect(isAutomaticVested({ system: TSP_SYSTEMS.BRS, yearsOfServiceInSystem: 1.9 })).toBe(false);
    expect(isAutomaticVested({ system: TSP_SYSTEMS.BRS, yearsOfServiceInSystem: 2 })).toBe(true);
    expect(isAutomaticVested({ system: TSP_SYSTEMS.FERS, yearsOfServiceInSystem: 2.9 })).toBe(false);
    expect(isAutomaticVested({ system: TSP_SYSTEMS.FERS, yearsOfServiceInSystem: 3 })).toBe(true);
    expect(isAutomaticVested({ system: TSP_SYSTEMS.FERS, yearsOfServiceInSystem: 2, vestingYears: 2 })).toBe(true);
    // Ten years as a fed and one year in uniform: the BRS 1% is not vested.
    expect(isAutomaticVested({ system: TSP_SYSTEMS.BRS, yearsOfServiceInSystem: 1 })).toBe(false);
    const stop = projectTspAccountYear({ balances: createTspBalances({ unvestedAutomatic: 900 }), contributions: { automatic: 300 }, returnRate: 0, vested: false, forfeitUnvested: true });
    expect(stop.forfeited).toBe(1200);
    expect(stop.balances.unvestedAutomatic).toBe(0);
    const vest = projectTspAccountYear({ balances: createTspBalances({ unvestedAutomatic: 900 }), contributions: { automatic: 300 }, returnRate: 0, vested: true });
    expect(vest.balances.traditionalTaxable).toBe(1200);
  });
});

describe('pay-period front-loading (case 40)', () => {
  it('warns when the shared limit is reached before the last pay period and quantifies the lost match', () => {
    // 2,000 per civilian period × 26 = 52,000 planned against 24,500: the limit is hit in period 13.
    const r = validateTspCoordination({ year: 2026, age: 40, accounts: [civ({ plannedPerPeriod: 2000, payPeriodsRemaining: 26 })] });
    const acct = r.byAccount[0];
    expect(acct.match.limitHitAtPeriod).toBe(14);
    expect(acct.match.periodsWithoutMatch).toBe(13);
    // 4% match on 4,000 per period, 13 periods plus the partial 13th.
    expect(acct.match.lost).toBeCloseTo(160 * 13 + 160 * (1 - 500 / 2000), 6);
    expect(codes(r)).toContain(ISSUE_CODES.MIL_TSP_MATCH_AT_RISK);
    expect(codes(r)).toContain(ISSUE_CODES.MIL_TSP_SHARED_LIMIT_EXCEEDED);
    // Level deferrals within the limit: no warning.
    const level = validateTspCoordination({ year: 2026, age: 40, accounts: [civ({ plannedPerPeriod: 900, payPeriodsRemaining: 26 })] });
    expect(codes(level)).not.toContain(ISSUE_CODES.MIL_TSP_MATCH_AT_RISK);
  });

  it('a front-loaded civilian account starves the uniformed account’s later periods of match too', () => {
    // Civilian defers 3,500 for six periods (21,000); the uniformed account's 300 a period for twelve (3,600) then outruns the 24,500 room in its last period.
    const r = validateTspCoordination({ year: 2026, age: 40, accounts: [civ({ plannedPerPeriod: 3500, payPeriodsRemaining: 6 }), uni({ plannedPerPeriod: 300, payPeriodsRemaining: 12 })] });
    expect(r.byAccount[0].match.lost).toBe(0);
    expect(r.byAccount[1].match.lost).toBeGreaterThan(0);
    expect(r.byAccount[1].match.limitHitAtPeriod).toBeNull(); // a partial period, not an empty one
    expect(codes(r).filter((c) => c === ISSUE_CODES.MIL_TSP_MATCH_AT_RISK).length).toBeGreaterThanOrEqual(1);
  });
});

describe('USERRA make-up transactions', () => {
  it('stores make-up and restoration entries separately and applies them to the attributed year', () => {
    const n = normalizeUserraMakeUp([
      { type: USERRA_TRANSACTION_TYPES.MAKEUP_EMPLOYEE, amount: 6000, attributedYear: 2026 },
      { type: USERRA_TRANSACTION_TYPES.RESTORED_AGENCY_MATCHING, amount: 2400, attributedYear: 2026 },
      { type: USERRA_TRANSACTION_TYPES.RESTORED_AGENCY_AUTOMATIC, amount: 600, attributedYear: 2025 },
      { amount: 100 },
    ]);
    expect(n.totals).toEqual({ makeup_employee: 6000, restored_agency_matching: 2400, restored_agency_automatic: 600 });
    expect(n.issues.map((i) => i.code)).toEqual([ISSUE_CODES.MIL_USERRA_TRANSACTION_INCOMPLETE]);
    const r = validateTspCoordination({ year: 2026, age: 40, accounts: [civ({ plannedPerPeriod: 800 })], userraMakeUp: n.transactions });
    expect(r.sharedDeferrals.makeUpThisYear).toBe(6000);
    expect(r.sharedDeferrals.total).toBe(800 * 26 + 6000);
    const prior = validateTspCoordination({ year: 2025, age: 40, accounts: [civ({ plannedPerPeriod: 800 })], userraMakeUp: n.transactions });
    expect(prior.sharedDeferrals.makeUpThisYear).toBe(0);
  });
});
