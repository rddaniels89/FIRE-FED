import { describe, expect, it } from 'vitest';
import { SBP_CATEGORIES, computeRcsbp, computeSbp, retiredPayLedger, sbpDicOffsetShare } from '../sbp';
import { INPUT_PROVENANCE, ISSUE_CODES, ISSUE_SEVERITY, MILITARY_RULES_VERSION, rulesStatus } from '../status';
import { resolveMilitaryIncomeStreams, projectMilitaryIncomeForYear } from '../incomeStreams';
import { createDefaultMilitary } from '../../scenarios/schema';

const OFFICIAL = INPUT_PROVENANCE.USER_ENTERED_OFFICIAL;
const codes = (r) => r.issues.map((i) => i.code);

describe('SBP spouse coverage (spec §20.11)', () => {
  it('blocks an incomplete election and never infers one', () => {
    expect(codes(computeSbp({ election: { elected: 'unknown' }, grossMonthly: 3000 }))).toEqual([ISSUE_CODES.MRT_SBP_ELECTION_INCOMPLETE]);
    expect(computeSbp({ election: { elected: 'no' }, grossMonthly: 3000 })).toMatchObject({ applies: false, status: 'declined' });
    const noCategory = computeSbp({ election: { elected: 'yes', category: SBP_CATEGORIES.UNKNOWN }, grossMonthly: 3000 });
    expect(noCategory.status).toBe('blocked');
    expect(noCategory.issues[0].severity).toBe(ISSUE_SEVERITY.BLOCK);
    const noBase = computeSbp({ election: { elected: 'yes', category: SBP_CATEGORIES.SPOUSE, fullBase: false, electedBase: null }, grossMonthly: 3000 });
    expect(noBase.status).toBe('blocked');
  });

  it('computes the covered base, the 6.5% premium, and the 55% annuity', () => {
    const full = computeSbp({ election: { elected: 'yes', category: SBP_CATEGORIES.SPOUSE, fullBase: true, electionDate: '2026-07-01', provenance: OFFICIAL }, grossMonthly: 3000 });
    expect(full).toMatchObject({ applies: true, supported: true, base: 3000, premiumSource: 'formula_6_5', status: 'supported' });
    expect(full.premiumMonthly).toBeCloseTo(195, 6);
    expect(full.annuityMonthly).toBeCloseTo(1650, 6);
    const reduced = computeSbp({ election: { elected: 'yes', category: SBP_CATEGORIES.SPOUSE, fullBase: false, electedBase: 1000, electionDate: '2026-07-01', provenance: OFFICIAL }, grossMonthly: 3000 });
    expect(reduced.premiumMonthly).toBeCloseTo(65, 6);
    expect(reduced.annuityMonthly).toBeCloseTo(550, 6);
    const low = computeSbp({ election: { elected: 'yes', category: SBP_CATEGORIES.SPOUSE, fullBase: false, electedBase: 250, provenance: OFFICIAL }, grossMonthly: 3000 });
    expect(codes(low)).toContain(ISSUE_CODES.MRT_SBP_BASE_BELOW_MINIMUM);
    const high = computeSbp({ election: { elected: 'yes', category: SBP_CATEGORIES.SPOUSE, fullBase: false, electedBase: 4000, provenance: OFFICIAL }, grossMonthly: 3000 });
    expect(codes(high)).toContain(ISSUE_CODES.MRT_SBP_BASE_ABOVE_GROSS);
  });

  it('official premium and annuity override the formula; old elections and child add-ons are flagged', () => {
    const official = computeSbp({ election: { elected: 'yes', category: SBP_CATEGORIES.SPOUSE, fullBase: true, officialPremiumMonthly: 180, officialAnnuityMonthly: 1600, provenance: OFFICIAL }, grossMonthly: 3000 });
    expect(official).toMatchObject({ premiumMonthly: 180, premiumSource: 'official', annuityMonthly: 1600, annuitySource: 'official', status: 'official_amount' });
    const old = computeSbp({ election: { elected: 'yes', category: SBP_CATEGORIES.SPOUSE, fullBase: true, electionDate: '1988-01-01', provenance: OFFICIAL }, grossMonthly: 3000 });
    expect(codes(old)).toContain(ISSUE_CODES.MRT_SBP_PREMIUM_FORMULA_UNVERIFIED);
    const child = computeSbp({ election: { elected: 'yes', category: SBP_CATEGORIES.SPOUSE_CHILD, fullBase: true, provenance: OFFICIAL }, grossMonthly: 3000 });
    expect(codes(child)).toContain(ISSUE_CODES.MRT_SBP_CHILD_ADDON_OFFICIAL);
  });

  it('other categories are official-amount only', () => {
    const fs = computeSbp({ election: { elected: 'yes', category: SBP_CATEGORIES.FORMER_SPOUSE, fullBase: true, provenance: OFFICIAL }, grossMonthly: 3000 });
    expect(fs.status).toBe('blocked');
    expect(codes(fs)).toContain(ISSUE_CODES.MRT_SBP_CATEGORY_OFFICIAL_ONLY);
    const fsOfficial = computeSbp({ election: { elected: 'yes', category: SBP_CATEGORIES.FORMER_SPOUSE, officialPremiumMonthly: 200, officialAnnuityMonthly: 1500, provenance: OFFICIAL }, grossMonthly: 3000 });
    expect(fsOfficial).toMatchObject({ applies: true, supported: false, premiumMonthly: 200, annuityMonthly: 1500, status: 'official_amount' });
  });

  it('paid-up status needs age 70 and 360 payments', () => {
    const paid = computeSbp({ election: { elected: 'yes', category: SBP_CATEGORIES.SPOUSE, fullBase: true, premiumsPaidToDate: 360, provenance: OFFICIAL }, grossMonthly: 3000, memberAge: 71 });
    expect(paid.paidUp.eligibleNow).toBe(true);
    expect(codes(paid)).toContain(ISSUE_CODES.MRT_SBP_PAID_UP);
    const young = computeSbp({ election: { elected: 'yes', category: SBP_CATEGORIES.SPOUSE, fullBase: true, premiumsPaidToDate: 360, provenance: OFFICIAL }, grossMonthly: 3000, memberAge: 65 });
    expect(young.paidUp.eligibleNow).toBe(false);
    expect(young.paidUp.paidUpAge).toBe(70);
    const short = computeSbp({ election: { elected: 'yes', category: SBP_CATEGORIES.SPOUSE, fullBase: true, premiumsPaidToDate: 120, provenance: OFFICIAL }, grossMonthly: 3000, memberAge: 68 });
    expect(short.paidUp.paymentsRemaining).toBe(240);
    expect(short.paidUp.paidUpAge).toBe(88);
  });

  it('RCSBP takes official amounts only', () => {
    const blocked = computeRcsbp({ rcsbp: { elected: true, option: 'C' } });
    expect(blocked.blocked).toBe(true);
    expect(codes(blocked)).toEqual([ISSUE_CODES.MRT_RCSBP_OFFICIAL_AMOUNT_REQUIRED]);
    const ok = computeRcsbp({ rcsbp: { elected: true, option: 'C', officialPremiumMonthly: 90, officialAnnuityMonthly: 900, provenance: OFFICIAL } });
    expect(ok).toMatchObject({ blocked: false, premiumMonthly: 90, annuityMonthly: 900, status: 'official_amount' });
    expect(computeRcsbp({ rcsbp: { elected: false } }).applies).toBe(false);
  });
});

describe('SBP and DIC concurrency (case 32 revisited, effective-dated)', () => {
  it('offsets fully before 2021, by thirds through 2022, and not at all from 2023', () => {
    expect(sbpDicOffsetShare(2020)).toBe(1);
    expect(sbpDicOffsetShare(2021)).toBeCloseTo(2 / 3, 10);
    expect(sbpDicOffsetShare(2022)).toBeCloseTo(1 / 3, 10);
    expect(sbpDicOffsetShare(2023)).toBe(0);
    expect(sbpDicOffsetShare(2030)).toBe(0);
  });

  it('the death scenario pays full SBP and full DIC in 2026, and would have offset in 2022', () => {
    const military = { ...createDefaultMilitary(), connection: 'self', incomeStreams: [
      { id: 'sbp', type: 'sbp', ownerId: 'spouse', startsOnDeathOf: 'primary', grossAmount: 1650, frequency: 'monthly', amountStatus: 'official' },
      { id: 'dic', type: 'va_dic', ownerId: 'spouse', startsOnDeathOf: 'primary', grossAmount: 1700, frequency: 'monthly', amountStatus: 'official' },
    ] };
    const resolved = resolveMilitaryIncomeStreams(military);
    const args = { resolved, yearsFromNow: 0, asOfYear: 2026, ages: { primary: 71, spouse: 68 }, inflation: 0, deathAges: { primary: 70, spouse: null } };
    const now = projectMilitaryIncomeForYear({ ...args, year: 2026 });
    expect(now.total).toBe((1650 + 1700) * 12);
    const historical = projectMilitaryIncomeForYear({ ...args, year: 2022 });
    expect(historical.total).toBeCloseTo((Math.max(0, 1650 - 1700 / 3) + 1700) * 12, 6);
  });

  it('a supported election supplies the SBP stream amount when none is entered', () => {
    const military = {
      ...createDefaultMilitary(),
      connection: 'self',
      sbp: { elected: 'yes', category: 'spouse', fullBase: true, provenance: OFFICIAL },
      incomeStreams: [
        { id: 'rp', type: 'longevity_retired_pay', grossAmount: 3000, frequency: 'monthly', amountStatus: 'official' },
        { id: 'sbp', type: 'sbp', ownerId: 'spouse', startsOnDeathOf: 'primary', grossAmount: null },
      ],
    };
    const resolved = resolveMilitaryIncomeStreams(military);
    const s = resolved.streams.find((x) => x.id === 'sbp');
    expect(s.resolved.included).toBe(true);
    expect(s.resolved.annualGross).toBeCloseTo(1650 * 12, 6);
    expect(s.resolved.issues.map((i) => i.code)).toContain(ISSUE_CODES.MIL_SBP_ANNUITY_FROM_ELECTION);
  });
});

describe('gross-to-net ledger', () => {
  it('walks the lines in the spec order and labels the result an estimate until reconciled', () => {
    const l = retiredPayLedger({ grossMonthly: 3000, sbpPremiumMonthly: 195, vaWaiverMonthly: 1000, crdpMonthly: 1000, crscMonthly: 0, federalWithholdingRate: 0.1, stateWithholdingRate: 0, otherDeductionsMonthly: 50 });
    expect(l.lines.map((x) => x.id)).toEqual(['gross', 'sbp', 'va_waiver', 'crdp', 'federal_withholding', 'other']);
    // Withholding on 3000 − 195 − 1000 + 1000 = 2805.
    expect(l.lines.find((x) => x.id === 'federal_withholding').amount).toBeCloseTo(-280.5, 6);
    expect(l.net).toBeCloseTo(3000 - 195 - 1000 + 1000 - 280.5 - 50, 6);
    expect(l.label).toBe('Estimated net deposit');
    expect(codes(l)).toEqual(expect.arrayContaining([ISSUE_CODES.MRT_CONCURRENT_RECEIPT_MANUAL, ISSUE_CODES.MRT_NET_NOT_RECONCILED]));
    const rec = retiredPayLedger({ grossMonthly: 3000, reconciledToRas: true });
    expect(rec.label).toBe('Net pay (reconciled to RAS)');
    expect(codes(rec)).toEqual([]);
  });

  it('optional adjustments never change the gross line', () => {
    const l = retiredPayLedger({ grossMonthly: 3000, vaWaiverMonthly: 5000, crscMonthly: 800 });
    expect(l.lines[0].amount).toBe(3000);
  });
});

describe('rules versions (case 50: a rule update preserves the prior snapshot)', () => {
  it('marks a scenario saved under older rules and leaves its calculations alone', () => {
    const military = { ...createDefaultMilitary(), rulesVersion: '2025.1', retirementScenarios: [{ id: 's', currentCalculationId: 'c', calculations: [{ id: 'c', rulesVersion: '2025.1', engineVersion: '0.9.0', projectedMonthly: 2500, steps: [{ id: 'x' }] }] }] };
    const before = JSON.stringify(military.retirementScenarios);
    const status = rulesStatus(military);
    expect(status).toEqual({ saved: '2025.1', current: MILITARY_RULES_VERSION, stale: true });
    expect(rulesStatus(createDefaultMilitary()).stale).toBe(false);
    // Resolving the streams under the current rules reports staleness without rewriting the snapshot.
    const withStream = { ...military, incomeStreams: [{ id: 'l', type: 'longevity_retired_pay', sourceCalculationId: 'c' }] };
    const resolved = resolveMilitaryIncomeStreams(withStream);
    expect(resolved.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_RULES_STALE);
    expect(JSON.stringify(withStream.retirementScenarios)).toBe(before);
    expect(resolved.streams[0].resolved.annualGross).toBe(2500 * 12);
  });
});
