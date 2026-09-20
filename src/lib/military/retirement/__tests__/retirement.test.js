import { describe, expect, it } from 'vitest';
import { BASIC_PAY_TABLES, GRADES, LATEST_BASIC_PAY_TABLE, YOS_BANDS, basicPayMonthly, gradeLabel, yosBandIndex } from '../payTables';
import { DIEMS_BOUNDARIES, RETIREMENT_SYSTEMS as S, SYSTEM_CONFIRMATION, suggestMilitaryRetirementSystem, validateSystemSelection } from '../system';
import { computeLongevityMultiplier, serviceToMultiplierMonths } from '../multiplier';
import { buildBasicPayHistory, finalPayBase, selectHigh36PayBase, yearsOfServiceOn } from '../payBase';
import { FIRST_COLA_SHARE_BY_QUARTER, projectRetiredPayCola } from '../cola';
import { calculateMilitaryRetiredPay, hashInputs, normalizeRetirementInputs, roundDownToDollar } from '../calculate';
import { INPUT_PROVENANCE, ISSUE_CODES, MILITARY_RESULT_STATUS } from '../../status';

const OFFICIAL = INPUT_PROVENANCE.USER_ENTERED_OFFICIAL;

describe('pay tables', () => {
  it('carries every grade with 22 bands and a verified 2026 table', () => {
    expect(YOS_BANDS).toHaveLength(22);
    for (const g of GRADES) expect(LATEST_BASIC_PAY_TABLE.rates[g], g).toHaveLength(22);
    expect(LATEST_BASIC_PAY_TABLE.effectiveDate).toBe('2026-01-01');
    expect(LATEST_BASIC_PAY_TABLE.verified).toBe(true);
    expect(BASIC_PAY_TABLES.map((t) => t.effectiveDate)).toEqual(['2026-01-01', '2025-01-01', '2024-01-01']);
    expect(BASIC_PAY_TABLES[1].derived).toBe(true);
  });

  it('reads the 2026 DFAS figures', () => {
    expect(basicPayMonthly({ grade: 'E-7', yearsOfService: 20.5, isoDate: '2026-03-01' })).toMatchObject({ monthly: 6245.7, bandLabel: 'Over 20', verified: true, tableDate: '2026-01-01' });
    expect(basicPayMonthly({ grade: 'O5', yearsOfService: 21.99, isoDate: '2026-01-01' }).monthly).toBe(12032.7); // still "over 20"
    expect(basicPayMonthly({ grade: 'O5', yearsOfService: 22, isoDate: '2026-01-01' }).monthly).toBe(12394.8); // the anniversary moves the band
    expect(basicPayMonthly({ grade: 'E9', yearsOfService: 24, isoDate: '2026-06-01', seniorEnlisted: true }).monthly).toBe(11166.9);
    expect(basicPayMonthly({ grade: 'E1', yearsOfService: 0.2, isoDate: '2026-06-01', e1Under4Months: true }).monthly).toBe(2225.7);
    expect(basicPayMonthly({ grade: 'E9', yearsOfService: 8, isoDate: '2026-06-01' })).toBeNull(); // E-9 is not paid under 10 years
    expect(gradeLabel('O3E')).toBe('O-3E');
  });

  it('bands years of service the way the table does: the anniversary starts the next band', () => {
    expect(yosBandIndex(1.9)).toBe(0);
    expect(yosBandIndex(2)).toBe(1);
    expect(yosBandIndex(2.001)).toBe(1);
    expect(yosBandIndex(2.99)).toBe(1);
    expect(yosBandIndex(3.99)).toBe(2);
    expect(yosBandIndex(40.5)).toBe(21);
  });

  it('derives earlier years by the raise and refuses junior enlisted there', () => {
    const e7 = basicPayMonthly({ grade: 'E7', yearsOfService: 20.5, isoDate: '2025-06-01' });
    expect(e7.monthly).toBeCloseTo(6245.7 / 1.038, 0);
    expect(e7).toMatchObject({ derived: true, verified: false, tableDate: '2025-01-01' });
    expect(basicPayMonthly({ grade: 'E4', yearsOfService: 3, isoDate: '2025-06-01' })).toBeNull();
    expect(basicPayMonthly({ grade: 'E7', yearsOfService: 20.5, isoDate: '2023-06-01' })).toBeNull();
  });

  it('projects future months at the growth assumption and says so', () => {
    const r = basicPayMonthly({ grade: 'E7', yearsOfService: 20.5, isoDate: '2028-06-01', growthAssumption: 0.03 });
    expect(r.monthly).toBeCloseTo(6245.7 * 1.03 ** 2, 2);
    expect(r).toMatchObject({ assumed: true, verified: false, growthYears: 2 });
  });
});

describe('retirement system routing (spec §20.3)', () => {
  it('suggests from the DIEMS and always asks for confirmation', () => {
    expect(suggestMilitaryRetirementSystem({ diems: '1979-06-01' }).suggested).toBe(S.FINAL_PAY);
    expect(suggestMilitaryRetirementSystem({ diems: DIEMS_BOUNDARIES.FINAL_PAY_BEFORE }).suggested).toBe(S.HIGH_36);
    expect(suggestMilitaryRetirementSystem({ diems: '1995-01-01' }).suggested).toBe(S.HIGH_36);
    expect(suggestMilitaryRetirementSystem({ diems: '1995-01-01', cbsElected: true }).suggested).toBe(S.REDUX);
    expect(suggestMilitaryRetirementSystem({ diems: '2010-01-01', brsOptIn: true }).suggested).toBe(S.BRS);
    expect(suggestMilitaryRetirementSystem({ diems: '2019-01-01' }).suggested).toBe(S.BRS);
    expect(suggestMilitaryRetirementSystem({ diems: null }).suggested).toBeNull();
    expect(suggestMilitaryRetirementSystem({ diems: '1995-01-01' }).requiresConfirmation).toBe(true);
  });

  it('never infers REDUX and flags conflicts without switching', () => {
    const noCbs = validateSystemSelection({ system: S.REDUX, systemConfirmation: SYSTEM_CONFIRMATION.USER_CONFIRMED, diems: '1995-01-01' });
    expect(noCbs.ok).toBe(false);
    expect(noCbs.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_SYSTEM_CONFLICT);
    expect(validateSystemSelection({ system: S.FINAL_PAY, systemConfirmation: 'official', diems: '1990-01-01' }).ok).toBe(false);
    expect(validateSystemSelection({ system: S.BRS, systemConfirmation: 'official', diems: '2010-01-01' }).ok).toBe(false);
    expect(validateSystemSelection({ system: S.BRS, systemConfirmation: 'official', diems: '2010-01-01', brsOptIn: true }).ok).toBe(true);
    expect(validateSystemSelection({ system: S.HIGH_36, systemConfirmation: 'official', diems: '2019-01-01' }).ok).toBe(false);
    const unconfirmed = validateSystemSelection({ system: S.HIGH_36, systemConfirmation: SYSTEM_CONFIRMATION.SUGGESTED, diems: '1995-01-01' });
    expect(unconfirmed.ok).toBe(true);
    expect(unconfirmed.confirmed).toBe(false);
    expect(unconfirmed.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_SYSTEM_UNCONFIRMED);
  });
});

describe('the multiplier (spec §20.5)', () => {
  it('counts whole months and disregards days', () => {
    expect(serviceToMultiplierMonths({ years: 20, months: 5, days: 29 })).toBe(245);
  });

  it('legacy 2.5% and BRS 2.0% at 20, 25, and 30 years', () => {
    expect(computeLongevityMultiplier({ system: S.HIGH_36, serviceMonths: 240, retirementDate: '2026-06-01' }).multiplier).toBeCloseTo(0.5, 12);
    expect(computeLongevityMultiplier({ system: S.HIGH_36, serviceMonths: 300, retirementDate: '2026-06-01' }).multiplier).toBeCloseTo(0.625, 12);
    expect(computeLongevityMultiplier({ system: S.HIGH_36, serviceMonths: 360, retirementDate: '2026-06-01' }).multiplier).toBeCloseTo(0.75, 12);
    expect(computeLongevityMultiplier({ system: S.BRS, serviceMonths: 240, retirementDate: '2026-06-01' }).multiplier).toBeCloseTo(0.4, 12);
    expect(computeLongevityMultiplier({ system: S.BRS, serviceMonths: 300, retirementDate: '2026-06-01' }).multiplier).toBeCloseTo(0.5, 12);
    expect(computeLongevityMultiplier({ system: S.FINAL_PAY, serviceMonths: 246, retirementDate: '2026-06-01' }).multiplier).toBeCloseTo(0.025 * 20.5, 12);
  });

  it('REDUX at 20, 25, 30 and over 30 years, and the age-62 figure', () => {
    expect(computeLongevityMultiplier({ system: S.REDUX, serviceMonths: 240, retirementDate: '2026-06-01' }).multiplier).toBeCloseTo(0.4, 12);
    expect(computeLongevityMultiplier({ system: S.REDUX, serviceMonths: 300, retirementDate: '2026-06-01' }).multiplier).toBeCloseTo(0.575, 12);
    expect(computeLongevityMultiplier({ system: S.REDUX, serviceMonths: 360, retirementDate: '2026-06-01' }).multiplier).toBeCloseTo(0.75, 12);
    expect(computeLongevityMultiplier({ system: S.REDUX, serviceMonths: 384, retirementDate: '2026-06-01' }).multiplier).toBeCloseTo(0.8, 12);
    expect(computeLongevityMultiplier({ system: S.REDUX, serviceMonths: 240, retirementDate: '2026-06-01', applyRedux: false }).multiplier).toBeCloseTo(0.5, 12);
    expect(computeLongevityMultiplier({ system: S.REDUX, serviceMonths: 246, retirementDate: '2026-06-01' }).reduxReduction).toBeCloseTo(0.01 * (30 - 20.5), 12);
  });

  it('applies the 75% cap only before 2007 and reports it either way', () => {
    const before = computeLongevityMultiplier({ system: S.HIGH_36, serviceMonths: 34 * 12, retirementDate: '2006-12-31' });
    const after = computeLongevityMultiplier({ system: S.HIGH_36, serviceMonths: 34 * 12, retirementDate: '2007-01-01' });
    expect(before).toMatchObject({ capApplied: true, multiplier: 0.75 });
    expect(after.capApplied).toBe(false);
    expect(after.multiplier).toBeCloseTo(0.85, 12);
    expect(computeLongevityMultiplier({ system: S.HIGH_36, serviceMonths: 42 * 12, retirementDate: '2026-01-01' })).toMatchObject({ capApplied: true, multiplier: 1 });
  });

  it('never lets BRS use 2.5% and never runs REDUX without the flag being the caller\'s business', () => {
    expect(computeLongevityMultiplier({ system: S.BRS, serviceMonths: 360, retirementDate: '2026-06-01' }).rate).toBe(0.02);
    expect(computeLongevityMultiplier({ system: 'nope', serviceMonths: 240 })).toBeNull();
  });
});

describe('the pay base (spec §20.6)', () => {
  it('years of service from the pay entry base date, in full months', () => {
    expect(yearsOfServiceOn({ payEntryBaseDate: '2006-03-15', isoDate: '2026-03-14' })).toBeCloseTo(19 + 11 / 12, 10);
    expect(yearsOfServiceOn({ payEntryBaseDate: '2006-03-15', isoDate: '2026-03-15' })).toBe(20);
    expect(yearsOfServiceOn({ payEntryBaseDate: null, isoDate: '2026-03-15' })).toBeNull();
  });

  it('builds 36 months ending the month before a first-of-month retirement and prices each from its table', () => {
    const h = buildBasicPayHistory({ gradePeriods: [{ grade: 'E7', startDate: '2018-01-01', endDate: null }], payEntryBaseDate: '2006-06-01', retirementDate: '2026-07-01' });
    expect(h.months).toHaveLength(36);
    expect(h.months[0].month).toBe('2023-07');
    expect(h.months[35].month).toBe('2026-06');
    // 2023 has no table: missing. 2024 and 2025 are derived. 2026 is published.
    expect(h.months.filter((m) => m.missing)).toHaveLength(6);
    expect(h.months.find((m) => m.month === '2026-06')).toMatchObject({ monthly: 6245.7, verified: true, derived: false });
    expect(h.months.find((m) => m.month === '2025-06').derived).toBe(true);
    expect(h.counts.reliable).toBe(6);
  });

  it('High-36 takes the highest 36 months whether or not consecutive, never assuming the last 36', () => {
    // 48 priced months: a high grade for 30 months, a lower one for 12, then a
    // recovery for 6. The best 36 are the first 30 and the last 6, not the last 36.
    const month = (i) => `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
    const months = Array.from({ length: 48 }, (_, i) => ({ month: month(i), monthly: i < 30 ? 7000 : i < 42 ? 6000 : 6500, missing: false, verified: true, assumed: false, derived: false }));
    const hb = selectHigh36PayBase({ months, counts: { missing: 0 } });
    expect(hb.monthsUsed).toBe(36);
    expect(hb.months.filter((m) => m.monthly === 7000)).toHaveLength(30);
    expect(hb.months.filter((m) => m.monthly === 6500)).toHaveLength(6);
    expect(hb.months.some((m) => m.monthly === 6000)).toBe(false);
    expect(hb.nonConsecutive).toBe(true);
    expect(hb.monthly).toBeCloseTo((30 * 7000 + 6 * 6500) / 36, 6);
    expect(hb.highest).toBe(7000);
    expect(hb.lowest).toBe(6500);
    expect(hb.reliableMonths).toBe(36);
  });

  it('a demotion in the last year leaves the higher grade in the pay base', () => {
    // All twelve months inside the published 2026 table, so grade is the only difference.
    const h = buildBasicPayHistory({
      gradePeriods: [{ grade: 'E8', startDate: '2010-01-01', endDate: '2026-05-31' }, { grade: 'E7', startDate: '2026-06-01', endDate: null }],
      payEntryBaseDate: '2006-01-01',
      retirementDate: '2027-01-01',
      monthsBack: 12,
    });
    const hb = selectHigh36PayBase(h);
    const e8 = hb.months.filter((m) => m.gradeLabel === 'E-8');
    const e7 = hb.months.filter((m) => m.gradeLabel === 'E-7');
    expect(e8).toHaveLength(5);
    expect(e7).toHaveLength(7);
    expect(Math.min(...e8.map((m) => m.monthly))).toBeGreaterThan(Math.max(...e7.map((m) => m.monthly)));
    expect(hb.monthsShort).toBe(24);
    expect(hb.reliableMonths).toBe(12);
  });

  it('splits a month with a promotion by days', () => {
    const h = buildBasicPayHistory({ gradePeriods: [{ grade: 'E6', startDate: '2015-01-01', endDate: '2026-03-15' }, { grade: 'E7', startDate: '2026-03-16', endDate: null }], payEntryBaseDate: '2006-01-01', retirementDate: '2026-07-01' });
    const march = h.months.find((m) => m.month === '2026-03');
    const e6 = basicPayMonthly({ grade: 'E6', yearsOfService: 20.2, isoDate: '2026-03-01' }).monthly;
    const e7 = basicPayMonthly({ grade: 'E7', yearsOfService: 20.2, isoDate: '2026-03-01' }).monthly;
    expect(march.monthly).toBeCloseTo(e6 * (15 / 31) + e7 * (16 / 31), 2);
    expect(march.gradeLabel).toBe('E-6 / E-7');
  });

  it('Final Pay is the rate on the day before retirement', () => {
    const fp = finalPayBase({ grade: 'O5', payEntryBaseDate: '2004-02-01', retirementDate: '2026-02-01' });
    // 22 years exactly on 1 Feb; on 31 Jan it is 21 years 11 months → "Over 20".
    expect(fp).toMatchObject({ monthly: 12032.7, band: 'Over 20', asOf: '2026-01-31' });
  });
});

describe('COLA (spec §20.9)', () => {
  it('applies the full CPI to High-36 and CPI less one point to REDUX, with the age-62 recomputation', () => {
    const high = projectRetiredPayCola({ system: S.HIGH_36, retirementDate: '2026-10-01', grossMonthly: 3000, ageAtRetirement: 42, inflation: 0.03, horizonYears: 25 });
    const redux = projectRetiredPayCola({ system: S.REDUX, retirementDate: '2026-10-01', grossMonthly: 2400, fullMonthly: 3000, ageAtRetirement: 42, inflation: 0.03, horizonYears: 25 });
    // Q4 retiree: nothing this December, three quarters next, full thereafter.
    expect(high[0].colaApplied).toBe(0);
    expect(high[1].colaApplied).toBeCloseTo(0.03 * 0.75, 12);
    expect(high[2].colaApplied).toBeCloseTo(0.03, 12);
    expect(redux[2].colaApplied).toBeCloseTo(0.02, 12);
    const at62 = redux.find((r) => r.age === 62);
    expect(at62.event).toBe('redux_age_62_recomputation');
    const high62 = high.find((r) => r.age === 62);
    expect(at62.monthly).toBeCloseTo(high62.monthly, 2);
    // After 62 the offset resumes, so REDUX falls behind again.
    expect(redux.find((r) => r.age === 65).monthly).toBeLessThan(high.find((r) => r.age === 65).monthly);
    expect(high.find((r) => r.age === 62).event).toBeNull();
  });

  it('prorates the first adjustment by quarter and labels the shares unverified', () => {
    expect(FIRST_COLA_SHARE_BY_QUARTER.verified).toBe(false);
    const q1 = projectRetiredPayCola({ system: S.BRS, retirementDate: '2026-02-01', grossMonthly: 1000, ageAtRetirement: 40, inflation: 0.02, horizonYears: 3 });
    expect(q1[0].colaApplied).toBeCloseTo(0.01, 12);
    expect(q1[1].colaApplied).toBeCloseTo(0.02, 12);
    const q3 = projectRetiredPayCola({ system: S.BRS, retirementDate: '2026-08-01', grossMonthly: 1000, ageAtRetirement: 40, inflation: 0.02, horizonYears: 3 });
    expect(q3[0].colaApplied).toBe(0);
    expect(q3[1].colaApplied).toBeCloseTo(0.02, 12);
  });

  it('uses a published COLA where given and says which', () => {
    const rows = projectRetiredPayCola({ system: S.HIGH_36, retirementDate: '2024-01-01', grossMonthly: 1000, ageAtRetirement: 40, inflation: 0.02, publishedColas: { 2024: 0.025, 2025: 0.028 }, horizonYears: 3 });
    expect(rows[0]).toMatchObject({ colaSource: 'published' });
    expect(rows[0].colaApplied).toBeCloseTo(0.025 * 0.5, 12);
    expect(rows[2].colaSource).toBe('assumed');
  });
});

describe('the whole calculation (spec §20.5, §20.13)', () => {
  const e7 = (over = {}) => ({
    path: 'regular',
    system: S.HIGH_36,
    systemConfirmation: SYSTEM_CONFIRMATION.OFFICIAL,
    diems: '2006-06-01',
    retirementDate: '2026-07-01',
    payEntryBaseDate: '2006-06-01',
    ageAtRetirement: 38,
    creditableService: { years: 20, months: 1, days: 0, provenance: OFFICIAL },
    gradePeriods: [{ grade: 'E7', startDate: '2018-01-01', endDate: null, provenance: OFFICIAL }],
    retiredGradeConfirmed: true,
    assumptions: { basicPayGrowth: 0.03, inflation: 0.025, horizonYears: 30 },
    ...over,
  });

  it('E-7, 20 years 1 month, High-36: base × 50.21%, rounded down, with a full trace', () => {
    const r = calculateMilitaryRetiredPay(e7());
    expect(r.payBase.method).toBe('high_36');
    expect(r.multiplier.multiplier).toBeCloseTo(0.025 * (20 + 1 / 12), 12);
    expect(r.grossMonthly).toBe(Math.floor(r.payBase.monthlyUnrounded * r.multiplier.multiplier));
    expect(r.grossAnnual).toBe(r.grossMonthly * 12);
    expect(r.steps.map((s) => s.id)).toEqual(['system', 'service', 'pay_base', 'service_months', 'rate', 'uncapped', 'cap', 'gross_unrounded', 'rounding', 'cola']);
    expect(r.steps.every((s) => s.ruleId)).toBe(true);
    // 2023 months are missing and 2024/2025 derived, so this is an estimate.
    expect(r.status).toBe(MILITARY_RESULT_STATUS.ESTIMATE_ONLY);
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining([ISSUE_CODES.MRT_PAY_HISTORY_INCOMPLETE, ISSUE_CODES.MRT_DERIVED_PAY_TABLE, ISSUE_CODES.MRT_FIRST_COLA_CONVENTION]));
    expect(r.events[0]).toMatchObject({ type: 'MILITARY_RETIRED_PAY_START', date: '2026-07-01', monthly: r.grossMonthly });
    expect(r.rulesVersion).toMatch(/^\d{4}\.\d+$/);
  });

  it('with an official pay-base override and confirmed facts the result is supported', () => {
    const r = calculateMilitaryRetiredPay(e7({ payBaseOverride: { monthly: 6000, provenance: OFFICIAL, asOfDate: '2026-05-01' } }));
    expect(r.payBase.method).toBe('official_override');
    expect(r.grossMonthly).toBe(Math.floor(6000 * 0.025 * (20 + 1 / 12)));
    expect(r.grossMonthly).toBe(3012);
    expect(r.status).toBe(MILITARY_RESULT_STATUS.SUPPORTED);
    expect(r.dataQuality.official).toEqual(expect.arrayContaining(['creditable service', 'retirement system', 'pay base']));
  });

  it('BRS at 20 years is 40% of the base; REDUX at 20 is 40% with the full 50% restored at 62', () => {
    const brs = calculateMilitaryRetiredPay(e7({ system: S.BRS, diems: '2006-06-01', brsOptIn: true, creditableService: { years: 20, months: 0, days: 0, provenance: OFFICIAL }, payBaseOverride: { monthly: 6000, provenance: OFFICIAL } }));
    expect(brs.grossMonthly).toBe(2400);
    const redux = calculateMilitaryRetiredPay(e7({ system: S.REDUX, diems: '1995-06-01', cbsElected: true, creditableService: { years: 20, months: 0, days: 0, provenance: OFFICIAL }, payBaseOverride: { monthly: 6000, provenance: OFFICIAL }, ageAtRetirement: 40 }));
    expect(redux.grossMonthly).toBe(2400);
    expect(redux.steps.find((s) => s.id === 'redux_full').value).toBe(3000);
    const at62 = redux.cola.find((r) => r.age === 62);
    expect(at62.event).toBe('redux_age_62_recomputation');
    expect(at62.monthly).toBeGreaterThan(redux.cola.find((r) => r.age === 61).monthly);
  });

  it('refuses REDUX without the stated election and a system that conflicts with the dates', () => {
    const r = calculateMilitaryRetiredPay(e7({ system: S.REDUX, diems: '1995-06-01' }));
    expect(r.status).toBe(MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    expect(r.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_SYSTEM_CONFLICT);
    expect(r.grossMonthly).toBeNull();
    const conflict = calculateMilitaryRetiredPay(e7({ system: S.FINAL_PAY }));
    expect(conflict.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_SYSTEM_CONFLICT);
  });

  it('blocks without a path, a system, or creditable service', () => {
    expect(calculateMilitaryRetiredPay({}).issues[0].code).toBe(ISSUE_CODES.MRT_PATH_UNKNOWN);
    expect(calculateMilitaryRetiredPay(e7({ system: null })).issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_SYSTEM_UNCONFIRMED);
    expect(calculateMilitaryRetiredPay(e7({ creditableService: null })).issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_1405_SERVICE_UNKNOWN);
    expect(calculateMilitaryRetiredPay(e7({ path: 'reserve_nonregular' })).status).toBe(MILITARY_RESULT_STATUS.NOT_SUPPORTED);
  });

  it('under 20 years is a hypothetical comparison, never an available retirement', () => {
    const r = calculateMilitaryRetiredPay(e7({ creditableService: { years: 17, months: 0, days: 0, provenance: OFFICIAL }, payBaseOverride: { monthly: 6000, provenance: OFFICIAL } }));
    expect(r.hypothetical).toBe(true);
    expect(r.status).toBe(MILITARY_RESULT_STATUS.ESTIMATE_ONLY);
    expect(r.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_ACTIVE_SERVICE_BELOW_THRESHOLD);
  });

  it('reconciles against an official estimate; the official amount controls the projection', () => {
    const match = calculateMilitaryRetiredPay(e7({ payBaseOverride: { monthly: 6000, provenance: OFFICIAL }, officialEstimate: { monthlyGross: 3012, asOfDate: '2026-05-01' } }));
    expect(match.reconciliation).toMatchObject({ withinTolerance: true, difference: 0, controlling: 'official' });
    expect(match.status).toBe(MILITARY_RESULT_STATUS.SUPPORTED_WITH_OFFICIAL_AMOUNT);
    const off = calculateMilitaryRetiredPay(e7({ officialEstimate: { monthlyGross: 3300, asOfDate: '2026-05-01' } }));
    expect(off.reconciliation.withinTolerance).toBe(false);
    expect(off.projectedMonthly).toBe(3300);
    expect(off.reconciliation.diagnostics).toContain('pay_base_months_not_all_published');
    expect(off.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_OFFICIAL_RECONCILIATION_MISMATCH);
  });

  it('future retirement dates project the pay tables and say so', () => {
    const r = calculateMilitaryRetiredPay(e7({ retirementDate: '2029-07-01', gradePeriods: [{ grade: 'E8', startDate: '2024-01-01', endDate: null }] }));
    expect(r.payBase.assumedMonths).toBeGreaterThan(0);
    expect(r.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_FUTURE_PAY_TABLE_ASSUMED);
    expect(r.status).toBe(MILITARY_RESULT_STATUS.ESTIMATE_ONLY);
    const low = calculateMilitaryRetiredPay(e7({ retirementDate: '2029-07-01', gradePeriods: [{ grade: 'E8', startDate: '2024-01-01', endDate: null }], assumptions: { basicPayGrowth: 0 } }));
    expect(low.grossMonthly).toBeLessThan(r.grossMonthly);
  });

  it('rounds down to the dollar and never uses cents', () => {
    expect(roundDownToDollar(3012.99)).toBe(3012);
    expect(roundDownToDollar(3012.0000001)).toBe(3012);
  });
});

describe('determinism', () => {
  it('identical normalised inputs give the identical hash, steps, and values; a changed input changes the hash', () => {
    const a = calculateMilitaryRetiredPay({ path: 'regular', system: S.HIGH_36, systemConfirmation: 'official', diems: '2006-06-01', retirementDate: '2026-07-01', payEntryBaseDate: '2006-06-01', ageAtRetirement: 38, creditableService: { years: 20, months: 0, days: 0, provenance: OFFICIAL }, gradePeriods: [{ grade: 'e-7', startDate: '2018-01-01' }] });
    const b = calculateMilitaryRetiredPay({ gradePeriods: [{ grade: 'E7', startDate: '2018-01-01', endDate: null }], creditableService: { years: 20, months: 0, days: 0, provenance: OFFICIAL }, ageAtRetirement: 38, payEntryBaseDate: '2006-06-01', retirementDate: '2026-07-01', diems: '2006-06-01', systemConfirmation: 'official', system: S.HIGH_36, path: 'regular' });
    expect(a.inputHash).toBe(b.inputHash);
    expect(JSON.stringify(a.steps)).toBe(JSON.stringify(b.steps));
    expect(a.grossMonthly).toBe(b.grossMonthly);
    const c = normalizeRetirementInputs({ ...b.inputs, creditableService: { ...b.inputs.creditableService, months: 1 } });
    expect(hashInputs(c)).not.toBe(a.inputHash);
  });

  it('property: more service never lowers gross pay under the same base and system, short of the cap', () => {
    for (const system of [S.HIGH_36, S.BRS, S.FINAL_PAY]) {
      let last = 0;
      for (let months = 240; months <= 456; months += 7) {
        const m = computeLongevityMultiplier({ system, serviceMonths: months, retirementDate: '2026-01-01' });
        expect(m.multiplier).toBeGreaterThanOrEqual(last - 1e-12);
        last = m.multiplier;
      }
    }
  });
});
