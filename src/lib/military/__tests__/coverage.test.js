import { describe, expect, it } from 'vitest';
import { COVERAGE_RULES, COVERAGE_SOURCES, createCoveragePeriod, monthsInYear, projectCoverageCostForYear, resolveCoveragePremium, validateCoveragePeriods } from '../coverage';
import { TRICARE_COSTS, TRICARE_COSTS_VERIFIED, tricareMonthlyPremium } from '../tricareCosts';
import { ISSUE_CODES, ISSUE_SEVERITY } from '../status';

/** Spec §14.1 cases 41–47. */

const p = (o = {}) => ({ id: o.id ?? `${o.source}_${o.ownerId ?? 'primary'}`, enrollmentConfirmed: true, startDate: '2026-01-01', endDate: null, ...o });
const codesFor = (r, id) => r.periods.find((x) => x.id === id).resolved.issues.map((i) => i.code).filter((c) => c !== ISSUE_CODES.MIL_TRICARE_COST_UNVERIFIED);

describe('TRICARE Reserve Select and Retired Reserve against FEHB (cases 41–42)', () => {
  it('blocks TRS for an FEHB-eligible member before 2030 and notes the change after', () => {
    const now = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.TRS })], { fehbEligibility: { primary: true }, asOfDate: '2026-09-01' });
    expect(codesFor(now, 'trs_primary')).toContain(ISSUE_CODES.MIL_TRS_FEHB_CONFLICT);
    expect(now.periods[0].resolved.blocked).toBe(true);
    expect(COVERAGE_RULES.trsFehbConflict.until).toBe('2030-01-01');
    const later = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.TRS, startDate: '2030-01-01' })], { fehbEligibility: { primary: true } });
    expect(codesFor(later, 'trs_primary')).toContain(ISSUE_CODES.MIL_TRS_FEHB_RULE_CHANGED);
    expect(codesFor(later, 'trs_primary')).not.toContain(ISSUE_CODES.MIL_TRS_FEHB_CONFLICT);
    // Not FEHB-eligible: no conflict.
    const civilian = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.TRS })], { fehbEligibility: { primary: false } });
    expect(codesFor(civilian, 'trs_primary')).not.toContain(ISSUE_CODES.MIL_TRS_FEHB_CONFLICT);
    // An FEHB period for the same person in the same window counts as eligibility.
    const both = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.TRS }), p({ source: COVERAGE_SOURCES.FEHB })], { fehbEligibility: { primary: false } });
    expect(codesFor(both, 'trs_primary')).toContain(ISSUE_CODES.MIL_TRS_FEHB_CONFLICT);
  });

  it('blocks TRR for an FEHB-eligible member with no scheduled end', () => {
    const r = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.TRR, startDate: '2031-01-01' })], { fehbEligibility: { primary: true } });
    expect(codesFor(r, 'trr_primary')).toContain(ISSUE_CODES.MIL_TRR_FEHB_CONFLICT);
    expect(r.issues.find((i) => i.code === ISSUE_CODES.MIL_TRR_FEHB_CONFLICT).severity).toBe(ISSUE_SEVERITY.BLOCK);
  });
});

describe('TRICARE For Life and CHAMPVA (cases 43–44)', () => {
  it('TFL without Medicare Part B is incomplete coverage', () => {
    const r = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.TFL, medicare: { partADate: '2030-05-01' } })]);
    expect(codesFor(r, 'tfl_primary')).toContain(ISSUE_CODES.MIL_TFL_PARTB_MISSING);
    const ok = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.TFL, medicare: { partADate: '2030-05-01', partBDate: '2030-05-01' } })]);
    expect(codesFor(ok, 'tfl_primary')).not.toContain(ISSUE_CODES.MIL_TFL_PARTB_MISSING);
  });

  it('CHAMPVA and TRICARE for the same person conflict; one Medicare part alone is flagged', () => {
    const r = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.CHAMPVA, ownerId: 'spouse' }), p({ source: COVERAGE_SOURCES.TRICARE_SELECT, ownerId: 'spouse' })]);
    expect(codesFor(r, 'champva_spouse')).toContain(ISSUE_CODES.MIL_CHAMPVA_TRICARE_CONFLICT);
    // TRICARE on the sponsor does not conflict with CHAMPVA on the spouse.
    const split = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.CHAMPVA, ownerId: 'spouse' }), p({ source: COVERAGE_SOURCES.TRICARE_SELECT, ownerId: 'primary' })]);
    expect(codesFor(split, 'champva_spouse')).not.toContain(ISSUE_CODES.MIL_CHAMPVA_TRICARE_CONFLICT);
    const parts = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.CHAMPVA, ownerId: 'spouse', medicare: { partADate: '2030-01-01' } })]);
    expect(codesFor(parts, 'champva_spouse')).toContain(ISSUE_CODES.MIL_CHAMPVA_MEDICARE_PARTS);
  });
});

describe('TAMP and CHCBP durations (cases 45–46)', () => {
  it('TAMP is 180 days and needs confirmed eligibility', () => {
    const ok = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.TAMP, startDate: '2026-07-01', endDate: '2026-12-27', eligibilityConfirmed: true })]);
    expect(codesFor(ok, 'tamp_primary')).toEqual([]);
    const long = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.TAMP, startDate: '2026-07-01', endDate: '2026-12-28', eligibilityConfirmed: true })]);
    expect(codesFor(long, 'tamp_primary')).toContain(ISSUE_CODES.MIL_TAMP_DURATION);
    const unconfirmed = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.TAMP, startDate: '2026-07-01', endDate: '2026-12-27' })]);
    expect(codesFor(unconfirmed, 'tamp_primary')).toContain(ISSUE_CODES.MIL_TAMP_UNCONFIRMED);
    expect(resolveCoveragePremium(createCoveragePeriod({ source: COVERAGE_SOURCES.TAMP })).monthly).toBe(0);
  });

  it('CHCBP allows 18 months for a member and 36 for a dependent, as entered', () => {
    const member18 = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.CHCBP, startDate: '2027-01-01', endDate: '2028-06-30' })]);
    expect(codesFor(member18, 'chcbp_primary')).toEqual([]);
    const member19 = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.CHCBP, startDate: '2027-01-01', endDate: '2028-07-31' })]);
    expect(codesFor(member19, 'chcbp_primary')).toContain(ISSUE_CODES.MIL_CHCBP_DURATION);
    const spouse36 = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.CHCBP, ownerId: 'spouse', relationship: 'former_spouse', startDate: '2027-01-01', endDate: '2029-12-31' })]);
    expect(codesFor(spouse36, 'chcbp_spouse')).toEqual([]);
    const spouse37 = validateCoveragePeriods([p({ source: COVERAGE_SOURCES.CHCBP, ownerId: 'spouse', relationship: 'former_spouse', startDate: '2027-01-01', endDate: '2030-01-31' })]);
    expect(codesFor(spouse37, 'chcbp_spouse')).toContain(ISSUE_CODES.MIL_CHCBP_DURATION);
    // Premium from the table, quarterly figure shown per month, marked as the table year.
    const prem = resolveCoveragePremium(createCoveragePeriod({ source: COVERAGE_SOURCES.CHCBP }));
    expect(prem.monthly).toBeCloseTo(1893 / 3, 6);
    expect(prem.source).toBe('table');
    expect(prem.verified).toBe(TRICARE_COSTS_VERIFIED);
  });
});

describe('different coverage per household member (case 47)', () => {
  it('costs each person from their own periods, with months in force and Part B where recorded', () => {
    const periods = validateCoveragePeriods([
      p({ id: 'me', source: COVERAGE_SOURCES.FEHB, monthlyPremium: 300, outOfPocketAnnual: { base: 1200 } }),
      p({ id: 'sp', source: COVERAGE_SOURCES.TRS, ownerId: 'spouse', enrollmentType: 'self', startDate: '2026-07-01', endDate: '2027-06-30', outOfPocketAnnual: { base: 600 } }),
      p({ id: 'sp2', source: COVERAGE_SOURCES.TFL, ownerId: 'spouse', startDate: '2027-07-01', medicare: { partADate: '2027-07-01', partBDate: '2027-07-01' } }),
    ]).periods;
    const me2026 = projectCoverageCostForYear({ periods, ownerId: 'primary', year: 2026 });
    expect(me2026.premiums).toBe(3600);
    expect(me2026.outOfPocket).toBe(1200);
    expect(me2026.medicarePartB).toBe(0);
    const sp2026 = projectCoverageCostForYear({ periods, ownerId: 'spouse', year: 2026 });
    expect(sp2026.bySource).toHaveLength(1);
    expect(sp2026.bySource[0].months).toBe(6);
    expect(sp2026.premiums).toBeCloseTo(TRICARE_COSTS.trs.monthly.self * 6, 6);
    expect(sp2026.outOfPocket).toBe(300);
    const sp2027 = projectCoverageCostForYear({ periods, ownerId: 'spouse', year: 2027 });
    expect(sp2027.bySource.map((s) => s.source)).toEqual(['trs', 'tfl']);
    expect(sp2027.medicarePartB).toBeCloseTo(202.9 * 6, 6);
    // Nobody named 'child': null, so the caller falls back.
    expect(projectCoverageCostForYear({ periods, ownerId: 'child', year: 2026 })).toBeNull();
    // Growth applies to every component.
    const grown = projectCoverageCostForYear({ periods, ownerId: 'primary', year: 2026, growthFactor: 1.1 });
    expect(grown.total).toBeCloseTo((3600 + 1200) * 1.1, 6);
  });

  it('counts months inside a calendar year correctly at the edges', () => {
    expect(monthsInYear({ startDate: '2026-01-01', endDate: null }, 2026)).toBe(12);
    expect(monthsInYear({ startDate: '2026-11-15', endDate: '2027-02-10' }, 2026)).toBe(2);
    expect(monthsInYear({ startDate: '2026-11-15', endDate: '2027-02-10' }, 2027)).toBe(2);
    expect(monthsInYear({ startDate: '2028-01-01', endDate: null }, 2027)).toBe(0);
  });

  it('flags overlapping and unconfirmed periods without dropping either', () => {
    const r = validateCoveragePeriods([p({ id: 'a', source: COVERAGE_SOURCES.FEHB }), p({ id: 'b', source: COVERAGE_SOURCES.OTHER_EMPLOYER, enrollmentConfirmed: false })]);
    expect(r.periods).toHaveLength(2);
    expect(codesFor(r, 'b')).toContain(ISSUE_CODES.MIL_COVERAGE_OVERLAP);
    expect(codesFor(r, 'b')).toContain(ISSUE_CODES.MIL_COVERAGE_UNCONFIRMED);
    expect(r.periods.every((x) => !x.resolved.blocked)).toBe(true);
  });

  it('the TRICARE table reports its year and verification state', () => {
    expect(tricareMonthlyPremium({ plan: 'trr', enrollment: 'family' })).toMatchObject({ monthly: 1551.5, year: 2025, verified: false });
    expect(tricareMonthlyPremium({ plan: 'fehb' })).toBeNull();
  });
});
