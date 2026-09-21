import { describe, expect, it } from 'vitest';
import { calculateMilitaryRetiredPay, gradePeriodAt, historyWindowMonths } from '../calculate';
import { RETIREMENT_SYSTEMS as S } from '../system';
import { INPUT_PROVENANCE, ISSUE_CODES, MILITARY_RESULT_STATUS } from '../../status';

/** Fixes from the PR #32 review of the retired-pay engine. */

const OFFICIAL = INPUT_PROVENANCE.USER_ENTERED_OFFICIAL;
const codes = (r) => r.issues.map((i) => i.code);

describe('Reserve pay start needs a real date', () => {
  const base = {
    path: 'reserve_nonregular',
    system: S.HIGH_36,
    systemConfirmation: 'official',
    diems: '1996-06-01',
    payEntryBaseDate: '1996-06-01',
    retirementDate: '2026-06-01',
    gradePeriods: [{ grade: 'E8', startDate: '2018-01-01' }],
    reserve: { officialTotalPoints: 4320, officialQualifyingYears: 22, pointsProvenance: OFFICIAL, retiredReserveStatus: 'retired_reserve' },
  };

  it('blocks when neither a birth month nor an official eligibility date can place age 60; the transfer date is never the pay start', () => {
    const r = calculateMilitaryRetiredPay(base);
    expect(r.status).toBe(MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    expect(codes(r)).toContain(ISSUE_CODES.MRT_RESERVE_PAY_DATE_REQUIRED);
    expect(r.grossMonthly).toBeNull();
    expect(r.retiredPayStartDate).toBeUndefined();
  });

  it('prices at the computed date once the birth month is known, or at the official date', () => {
    const byAge = calculateMilitaryRetiredPay({ ...base, reserve: { ...base.reserve, birthDate: '1976-05-10' } });
    expect(byAge.retiredPayStartDate).toBe('2036-05-01');
    const official = calculateMilitaryRetiredPay({ ...base, reserve: { ...base.reserve, officialEligibilityDate: '2035-01-01' } });
    expect(official.retiredPayStartDate).toBe('2035-01-01');
  });
});

describe('the retired grade is the one held on the retirement date', () => {
  it('picks the covering period whatever order the periods were entered in', () => {
    const current = { grade: 'E7', startDate: '2018-01-01', endDate: null };
    const earlier = { grade: 'E5', startDate: '2010-01-01', endDate: '2017-12-31' };
    expect(gradePeriodAt([current, earlier], '2027-01-01').grade).toBe('E7');
    expect(gradePeriodAt([earlier, current], '2027-01-01').grade).toBe('E7');
    // No period covers the date: the latest-starting one stands in.
    expect(gradePeriodAt([earlier, { grade: 'E6', startDate: '2018-01-01', endDate: '2020-01-01' }], '2027-01-01').grade).toBe('E6');
    expect(gradePeriodAt([], '2027-01-01')).toBeNull();
  });

  it('Final Pay prices the current grade even when an earlier grade was entered last', () => {
    const inputs = { path: 'regular', system: S.FINAL_PAY, systemConfirmation: 'official', diems: '1979-06-01', payEntryBaseDate: '1979-06-01', retirementDate: '2026-07-01', creditableService: { years: 30, months: 0, days: 0, provenance: OFFICIAL }, gradePeriods: [{ grade: 'E9', startDate: '2018-01-01' }, { grade: 'E7', startDate: '2005-01-01', endDate: '2017-12-31' }] };
    const r = calculateMilitaryRetiredPay(inputs);
    expect(r.retiredGrade).toBe('E9');
    expect(r.payBase.gradeLabel).toBe('E-9');
  });
});

describe('the High-36 window reaches back to the earliest grade entered', () => {
  it('sizes the window from the earliest period start, at least 36 months, at most 40 years', () => {
    expect(historyWindowMonths([{ startDate: '2018-01-01' }], '2027-01-01')).toBe(108);
    expect(historyWindowMonths([{ startDate: '2026-01-01' }], '2027-01-01')).toBe(36);
    expect(historyWindowMonths([{ startDate: '1970-01-01' }], '2027-01-01')).toBe(480);
    expect(historyWindowMonths([], '2027-01-01')).toBe(36);
  });

  it('a higher grade held more than 36 months before retirement still makes the 36 highest months', () => {
    const r = calculateMilitaryRetiredPay({
      path: 'regular',
      system: S.HIGH_36,
      systemConfirmation: 'official',
      diems: '2008-06-01',
      payEntryBaseDate: '2008-06-01',
      retirementDate: '2030-01-01',
      creditableService: { years: 21, months: 6, days: 0, provenance: OFFICIAL },
      // E-9 for 30 months ending mid-2026, then E-6 for the last 42 months.
      gradePeriods: [{ grade: 'E6', startDate: '2026-07-01', endDate: null }, { grade: 'E9', startDate: '2024-01-01', endDate: '2026-06-30' }],
    });
    expect(r.payBase.months[0].month).toBe('2024-01');
    expect(r.payBase.months.filter((m) => m.gradeLabel === 'E-9')).toHaveLength(30);
    expect(r.payBase.nonConsecutive).toBe(true); // the 30 E-9 months plus the six highest (latest) E-6 months
    expect(r.retiredGrade).toBe('E6');
  });
});
