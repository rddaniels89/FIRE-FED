import { describe, expect, it } from 'vitest';
import { MEDICAL_DISPOSITIONS, computeChapter61, computeSeverance, computeTera } from '../special';
import { calculateMilitaryRetiredPay } from '../calculate';
import { RETIREMENT_SYSTEMS as S } from '../system';
import { INPUT_PROVENANCE, ISSUE_CODES, ISSUE_SEVERITY, MILITARY_RESULT_STATUS } from '../../status';

const OFFICIAL = INPUT_PROVENANCE.USER_ENTERED_OFFICIAL;
const codes = (r) => r.issues.map((i) => i.code);

describe('Chapter 61 (spec §20.10)', () => {
  const base = { payBaseMonthly: 6000, system: S.HIGH_36, serviceMonths: 12 * 12, retirementDate: '2026-06-01', provenance: OFFICIAL };

  it('requires the official disposition and DoD percentage; the VA rating is kept apart', () => {
    expect(codes(computeChapter61({ ...base, disposition: MEDICAL_DISPOSITIONS.UNKNOWN }))).toEqual([ISSUE_CODES.MRT_MEDICAL_DISPOSITION_REQUIRED]);
    const noPct = computeChapter61({ ...base, disposition: MEDICAL_DISPOSITIONS.PDRL, dodDisabilityPercent: null, vaRating: 70 });
    expect(codes(noPct)).toContain(ISSUE_CODES.MRT_MEDICAL_DOD_PERCENT_REQUIRED);
    expect(codes(noPct)).toContain(ISSUE_CODES.MRT_MEDICAL_VA_RATING_SEPARATE);
    expect(noPct.path).toBe('blocked');
  });

  it('computes both authorized methods and pays the greater, with the 75% cap', () => {
    // 12 years × 2.5% = 30% longevity; DoD 50% wins.
    const r = computeChapter61({ ...base, disposition: MEDICAL_DISPOSITIONS.PDRL, dodDisabilityPercent: 50 });
    expect(r.path).toBe('retirement');
    expect(r.options[0].rate).toBe(0.5);
    expect(r.options[1].rate).toBeCloseTo(0.3, 10);
    expect(r.method).toBe('disability');
    expect(r.grossUnrounded).toBe(3000);
    expect(codes(r)).toContain(ISSUE_CODES.MRT_MEDICAL_METHOD_APPLIED);
    expect(codes(r)).toContain(ISSUE_CODES.MRT_MEDICAL_TAX_NOT_DECIDED);
    // 28 years × 2.5% = 70% longevity beats DoD 40%.
    const longevity = computeChapter61({ ...base, serviceMonths: 28 * 12, disposition: MEDICAL_DISPOSITIONS.PDRL, dodDisabilityPercent: 40 });
    expect(longevity.method).toBe('longevity');
    expect(longevity.grossUnrounded).toBeCloseTo(4200, 6);
    // 100% DoD is capped at 75%.
    const capped = computeChapter61({ ...base, disposition: MEDICAL_DISPOSITIONS.PDRL, dodDisabilityPercent: 100 });
    expect(capped.multiplier).toBe(0.75);
    expect(capped.capApplied).toBe(true);
  });

  it('applies the TDRL 50% floor only to placements before 2017, and warns that TDRL is temporary', () => {
    const old = computeChapter61({ ...base, disposition: MEDICAL_DISPOSITIONS.TDRL, dodDisabilityPercent: 30, tdrlPlacementDate: '2016-06-01' });
    expect(old.floorApplied).toBe(true);
    expect(old.multiplier).toBe(0.5);
    expect(codes(old)).toContain(ISSUE_CODES.MRT_MEDICAL_TDRL_FLOOR_APPLIED);
    expect(codes(old)).toContain(ISSUE_CODES.MRT_MEDICAL_TDRL_TEMPORARY);
    const recent = computeChapter61({ ...base, disposition: MEDICAL_DISPOSITIONS.TDRL, dodDisabilityPercent: 30, tdrlPlacementDate: '2017-01-01' });
    expect(recent.floorApplied).toBe(false);
    expect(recent.multiplier).toBeCloseTo(0.3, 10);
  });

  it('severance is its own path with bounded years, never a zero-dollar retirement', () => {
    const sev = computeSeverance({ monthlyBasicPay: 4000, serviceMonths: 5 * 12 + 7 });
    expect(sev.years).toBe(6); // 5 years 7 months rounds up
    expect(sev.lumpSum).toBe(2 * 4000 * 6);
    expect(computeSeverance({ monthlyBasicPay: 4000, serviceMonths: 12 }).years).toBe(3);
    expect(computeSeverance({ monthlyBasicPay: 4000, serviceMonths: 12, combatRelated: true }).years).toBe(6);
    expect(computeSeverance({ monthlyBasicPay: 4000, serviceMonths: 19.6 * 12 }).years).toBe(19);
    const r = computeChapter61({ ...base, serviceMonths: 4 * 12, disposition: MEDICAL_DISPOSITIONS.SEVERANCE, dodDisabilityPercent: 20, monthlyBasicPay: 4000 });
    expect(r.path).toBe('severance');
    expect(r.severance.lumpSum).toBe(2 * 4000 * 4);
    expect(codes(r)).toContain(ISSUE_CODES.MRT_MEDICAL_SEVERANCE_PATH);
  });

  it('an estimated disposition makes the result an estimate', () => {
    const r = computeChapter61({ ...base, provenance: INPUT_PROVENANCE.USER_ESTIMATE, disposition: MEDICAL_DISPOSITIONS.PDRL, dodDisabilityPercent: 50 });
    expect(codes(r)).toContain(ISSUE_CODES.MRT_AUTHORITY_UNCONFIRMED);
    expect(r.official).toBe(false);
  });
});

describe('TERA (spec §20.10)', () => {
  const base = { payBaseMonthly: 6000, system: S.HIGH_36, retirementDate: '2026-06-01' };
  const authority = { name: 'FY2012 NDAA §504 (Army)', approvalDate: '2026-01-15', provenance: OFFICIAL };

  it('blocks without an official authority and outside 15 to 19 years', () => {
    const none = computeTera({ ...base, serviceMonths: 18 * 12 });
    expect(none.blocked).toBe(true);
    expect(codes(none)).toEqual([ISSUE_CODES.MRT_TERA_AUTHORITY_REQUIRED]);
    expect(none.issues[0].severity).toBe(ISSUE_SEVERITY.BLOCK);
    expect(codes(computeTera({ ...base, serviceMonths: 14 * 12 + 11, authority }))).toContain(ISSUE_CODES.MRT_TERA_SERVICE_OUT_OF_RANGE);
    expect(codes(computeTera({ ...base, serviceMonths: 20 * 12, authority }))).toContain(ISSUE_CODES.MRT_TERA_SERVICE_OUT_OF_RANGE);
  });

  it('reduces the longevity formula by 1% per year short of 20, prorated by month', () => {
    const exact = computeTera({ ...base, serviceMonths: 18 * 12, authority });
    expect(exact.monthsShort).toBe(24);
    expect(exact.reductionFactor).toBeCloseTo(0.98, 10);
    expect(exact.multiplier).toBeCloseTo(0.45 * 0.98, 10);
    expect(exact.grossUnrounded).toBeCloseTo(6000 * 0.45 * 0.98, 6);
    const months = computeTera({ ...base, serviceMonths: 17 * 12 + 5, authority });
    expect(months.monthsShort).toBe(31);
    expect(months.reductionFactor).toBeCloseTo(1 - 0.01 * (31 / 12), 10);
    expect(months.steps.map((s) => s.id)).toEqual(['tera_longevity', 'tera_reduction']);
    const estimated = computeTera({ ...base, serviceMonths: 18 * 12, authority: { ...authority, provenance: INPUT_PROVENANCE.USER_ESTIMATE } });
    expect(codes(estimated)).toContain(ISSUE_CODES.MRT_AUTHORITY_UNCONFIRMED);
  });
});

describe('special paths through the engine', () => {
  const common = { system: S.HIGH_36, systemConfirmation: 'official', diems: '2010-06-01', payEntryBaseDate: '2010-06-01', retirementDate: '2026-07-01', gradePeriods: [{ grade: 'E6', startDate: '2018-01-01' }], payBaseOverride: { monthly: 5000, provenance: OFFICIAL }, creditableService: { years: 16, months: 0, days: 0, provenance: OFFICIAL } };

  it('medical: blocks until the disposition and percentage are recorded, then pays the greater method', () => {
    const noDisp = calculateMilitaryRetiredPay({ ...common, path: 'medical', medical: {} });
    expect(noDisp.status).toBe(MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    expect(codes(noDisp)).toContain(ISSUE_CODES.MRT_MEDICAL_DISPOSITION_REQUIRED);
    const r = calculateMilitaryRetiredPay({ ...common, path: 'medical', medical: { disposition: 'pdrl', dodDisabilityPercent: 60, provenance: OFFICIAL } });
    expect(r.special.kind).toBe('chapter61');
    expect(r.special.method).toBe('disability');
    expect(r.grossMonthly).toBe(3000);
    expect(r.status).not.toBe(MILITARY_RESULT_STATUS.NOT_SUPPORTED);
    expect(codes(r)).not.toContain(ISSUE_CODES.MRT_ACTIVE_SERVICE_BELOW_THRESHOLD); // 16 years is not a defect on this path
    expect(r.steps.map((s) => s.id)).toEqual(expect.arrayContaining(['medical_disability_rate', 'medical_longevity_rate', 'medical_method', 'rounding']));
  });

  it('medical separation returns the severance figure and no monthly pay', () => {
    const r = calculateMilitaryRetiredPay({ ...common, creditableService: { years: 6, months: 0, days: 0, provenance: OFFICIAL }, path: 'medical', medical: { disposition: 'separation_severance', dodDisabilityPercent: 20, monthlyBasicPay: 4500, provenance: OFFICIAL } });
    expect(r.special.kind).toBe('severance');
    expect(r.grossMonthly).toBe(0);
    expect(r.special.severance.lumpSum).toBe(2 * 4500 * 6);
    expect(r.events[0]).toMatchObject({ type: 'MEDICAL_SEVERANCE', amount: 54000 });
  });

  it('TERA: blocked without authority; reduced formula with it; never offered as an option', () => {
    const blocked = calculateMilitaryRetiredPay({ ...common, path: 'tera' });
    expect(blocked.status).toBe(MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    expect(codes(blocked)).toContain(ISSUE_CODES.MRT_TERA_AUTHORITY_REQUIRED);
    const r = calculateMilitaryRetiredPay({ ...common, path: 'tera', tera: { authorityName: 'FY2012 NDAA §504', approvalDate: '2026-01-01', provenance: OFFICIAL } });
    expect(r.special.kind).toBe('tera');
    // 16 years: 40% × (1 − 4%) = 38.4% of 5,000 = 1,920.
    expect(r.grossMonthly).toBe(1920);
    expect(r.multiplier.teraReductionFactor).toBeCloseTo(0.96, 10);
    // A regular 16-year case stays hypothetical and says nothing about TERA.
    const regular = calculateMilitaryRetiredPay({ ...common, path: 'regular' });
    expect(codes(regular)).toContain(ISSUE_CODES.MRT_ACTIVE_SERVICE_BELOW_THRESHOLD);
    expect(codes(regular)).not.toContain(ISSUE_CODES.MRT_TERA_AUTHORITY_REQUIRED);
  });
});
