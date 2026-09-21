import { describe, expect, it } from 'vitest';
import {
  INACTIVE_POINT_CAPS,
  RETIRED_RESERVE_STATUSES,
  auditReserveRetirementYears,
  computeReserveEquivalentService,
  computeReserveRetiredPayAge,
  inactivePointCapFor,
  resolveReservePoints,
} from '../reserve';
import { calculateMilitaryRetiredPay } from '../calculate';
import { RETIREMENT_SYSTEMS as S } from '../system';
import { linkedCalculationFor, saveRetirementCalculation, snapshotCalculation } from '../connect';
import { STREAM_TYPES, resolveMilitaryIncomeStreams } from '../../incomeStreams';
import { INPUT_PROVENANCE, ISSUE_CODES, ISSUE_SEVERITY, MILITARY_RESULT_STATUS } from '../../status';
import { createDefaultMilitary } from '../../../scenarios/schema';

const OFFICIAL = INPUT_PROVENANCE.USER_ENTERED_OFFICIAL;
const year = (end, o = {}) => ({ retirementYearEnd: end, activePoints: 0, inactivePoints: 0, membershipPoints: 15, ...o });

describe('retirement points and qualifying years (10 U.S.C. 12732, 12733)', () => {
  it('a qualifying year needs 50 points: 49 fails, 50 and 51 pass', () => {
    const a = auditReserveRetirementYears([year('2025-06-30', { inactivePoints: 34 }), year('2024-06-30', { inactivePoints: 35 }), year('2023-06-30', { inactivePoints: 36 })]);
    expect(a.rows.map((r) => r.creditablePoints)).toEqual([49, 50, 51]);
    expect(a.rows.map((r) => r.qualifying)).toEqual([false, true, true]);
    expect(a.qualifyingYears).toBe(2);
    expect(a.totalPoints).toBe(150);
  });

  it('caps inactive-duty points by the retirement-year ending date, never active duty', () => {
    expect(INACTIVE_POINT_CAPS.map((c) => c.cap)).toEqual([130, 90, 75, 60]);
    expect(inactivePointCapFor('1996-09-22')).toBe(60);
    expect(inactivePointCapFor('1996-09-23')).toBe(75);
    expect(inactivePointCapFor('2000-10-29')).toBe(75);
    expect(inactivePointCapFor('2000-10-30')).toBe(90);
    expect(inactivePointCapFor('2007-10-29')).toBe(90);
    expect(inactivePointCapFor('2007-10-30')).toBe(130);
    const a = auditReserveRetirementYears([
      year('1995-01-31', { inactivePoints: 70 }), // 70 + 15 membership > 60
      year('2026-01-31', { inactivePoints: 140, activePoints: 200 }), // 155 > 130; active untouched
    ]);
    expect(a.rows[0].creditablePoints).toBe(60);
    expect(a.rows[0].capApplied).toBe(true);
    expect(a.rows[1].creditablePoints).toBe(330);
    expect(a.rows[1].inactiveCreditable).toBe(130);
    expect(a.issues.filter((i) => i.code === ISSUE_CODES.MRT_INACTIVE_POINT_CAP_APPLIED)).toHaveLength(2);
  });

  it('caps membership points at 15 and a year at its days, leap years included', () => {
    const a = auditReserveRetirementYears([year('2024-06-30', { membershipPoints: 40, activePoints: 400 }), year('2023-06-30', { activePoints: 400 })]);
    expect(a.rows[0].membershipCredited).toBe(15);
    expect(a.rows[0].ceiling).toBe(366); // 1 Jul 2023 to 30 Jun 2024 includes 29 Feb 2024
    expect(a.rows[0].creditablePoints).toBe(366);
    expect(a.rows[1].creditablePoints).toBe(365);
  });

  it('blocks when the audited rows do not reconcile to the official total, per row or in total', () => {
    const row = auditReserveRetirementYears([year('2025-06-30', { inactivePoints: 40, officialTotal: 60 })]);
    expect(row.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_RESERVE_POINTS_MISMATCH);
    expect(row.issues[0].severity).toBe(ISSUE_SEVERITY.BLOCK);
    const total = resolveReservePoints({ retirementYears: [year('2025-06-30', { inactivePoints: 40 })], officialTotalPoints: 100 });
    expect(total.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_RESERVE_POINTS_MISMATCH);
    const ok = resolveReservePoints({ retirementYears: [year('2025-06-30', { inactivePoints: 40 })], officialTotalPoints: 55 });
    expect(ok.issues).toHaveLength(0);
    expect(ok.totalPoints).toBe(55);
    expect(ok.official).toBe(true);
  });

  it('equivalent service is points / 360 at full precision, separate from the qualifying test', () => {
    expect(computeReserveEquivalentService({ totalPoints: 3600 }).equivalentYears).toBe(10);
    expect(computeReserveEquivalentService({ totalPoints: 4321 }).equivalentYears).toBeCloseTo(12.002778, 5);
    const twentyGoodYearsFewPoints = resolveReservePoints({ officialTotalPoints: 1000, officialQualifyingYears: 20, pointsProvenance: OFFICIAL });
    expect(twentyGoodYearsFewPoints.qualifyingYears).toBe(20);
    expect(computeReserveEquivalentService(twentyGoodYearsFewPoints).equivalentYears).toBeCloseTo(2.7778, 3);
  });
});

describe('the retired-pay age (10 U.S.C. 12731(f))', () => {
  it('is 60 with no qualifying duty, and an official date beats everything', () => {
    const plain = computeReserveRetiredPayAge({ birthDate: '1970-03-15' });
    expect(plain).toMatchObject({ age: 60, method: 'age_60', date: '2030-03-01', units: 0 });
    const official = computeReserveRetiredPayAge({ officialEligibilityDate: '2029-01-01', birthDate: '1970-03-15', reducedAgePeriods: [{ startDate: '2015-01-01', endDate: '2016-12-31', authority: '12302', verified: true }] });
    expect(official).toMatchObject({ method: 'official_date', date: '2029-01-01', age: null });
  });

  it('reduces three months per 90 aggregate days of verified qualifying duty since 2008-01-28', () => {
    const r = computeReserveRetiredPayAge({ birthDate: '1970-03-15', reducedAgePeriods: [{ startDate: '2015-01-01', endDate: '2015-12-31', authority: '12302', verified: true }] });
    expect(r.units).toBe(4); // 365 days
    expect(r).toMatchObject({ reductionMonths: 12, age: 59, method: 'reduced_age', verifiedOnly: true, date: '2029-03-01' });
    expect(r.issues.map((i) => i.code)).toEqual([ISSUE_CODES.MRT_HEALTH_AGE_DIFFERS]);
  });

  it('aggregates across fiscal years only from 1 October 2014; earlier days count within one fiscal year', () => {
    // 60 days in FY2013 and 60 in FY2014: no unit before the change.
    const before = computeReserveRetiredPayAge({ reducedAgePeriods: [{ startDate: '2013-08-02', endDate: '2013-11-29', authority: '12302', verified: true }] });
    expect(before.units).toBe(0);
    // The same 120 days straddling FY2015/FY2016 pool into one unit.
    const after = computeReserveRetiredPayAge({ reducedAgePeriods: [{ startDate: '2015-08-02', endDate: '2015-11-29', authority: '12302', verified: true }] });
    expect(after.units).toBe(1);
    // Two 90-day blocks in separate pre-2014 fiscal years each earn a unit.
    const separate = computeReserveRetiredPayAge({ reducedAgePeriods: [{ startDate: '2012-01-01', endDate: '2012-03-30', authority: '12302', verified: true }, { startDate: '2013-01-01', endDate: '2013-03-31', authority: '12302', verified: true }] });
    expect(separate.units).toBe(2);
  });

  it('never goes below 50, ignores duty before 2008-01-28 and non-qualifying authorities, and flags unverified duty', () => {
    const floor = computeReserveRetiredPayAge({ reducedAgePeriods: [{ startDate: '2015-01-01', endDate: '2028-12-31', authority: '12302', verified: true }] });
    expect(floor.age).toBe(50);
    const excluded = computeReserveRetiredPayAge({ reducedAgePeriods: [{ startDate: '2005-01-01', endDate: '2006-01-01', authority: '12302', verified: true }, { startDate: '2016-01-01', endDate: '2016-12-31', authority: '12301(h)', verified: true }] });
    expect(excluded.units).toBe(0);
    expect(excluded.excluded.map((e) => e.reason)).toEqual(['before_2008_01_28', 'authority_not_qualifying']);
    const unverified = computeReserveRetiredPayAge({ reducedAgePeriods: [{ startDate: '2016-01-01', endDate: '2016-12-31', authority: '10 U.S.C. 12302', verified: false }] });
    expect(unverified.units).toBe(4);
    expect(unverified.verifiedOnly).toBe(false);
    expect(unverified.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_REDUCED_AGE_UNVERIFIED);
  });
});

const reserveInputs = (o = {}, reserve = {}) => ({
  path: 'reserve_nonregular',
  system: S.HIGH_36,
  systemConfirmation: 'official',
  diems: '1996-06-01',
  payEntryBaseDate: '1996-06-01',
  retirementDate: '2026-06-01', // transfer to the Retired Reserve
  gradePeriods: [{ grade: 'E8', startDate: '2018-01-01' }],
  reserve: {
    officialTotalPoints: 4320, // 12 equivalent years
    officialQualifyingYears: 22,
    pointsProvenance: OFFICIAL,
    birthDate: '1976-05-10',
    retiredReserveStatus: RETIRED_RESERVE_STATUSES.RETIRED_RESERVE,
    ...reserve,
  },
  ...o,
});

describe('non-regular retired pay through the engine', () => {
  it('routes the reserve path: points / 360 x 2.5% on the pay base at the retired-pay date', () => {
    const r = calculateMilitaryRetiredPay(reserveInputs());
    expect(r.status).not.toBe(MILITARY_RESULT_STATUS.NOT_SUPPORTED);
    expect(r.reserve.equivalent.equivalentYears).toBe(12);
    expect(r.reserve.age).toMatchObject({ age: 60, date: '2036-05-01' });
    expect(r.retiredPayStartDate).toBe('2036-05-01');
    expect(r.multiplier.multiplier).toBeCloseTo(0.3, 10);
    expect(r.grossMonthly).toBe(Math.floor(r.payBase.monthly * 0.3));
    expect(r.events[0]).toMatchObject({ type: 'RESERVE_RETIRED_PAY_START', date: '2036-05-01' });
    expect(r.steps.map((s) => s.id)).toEqual(expect.arrayContaining(['reserve_points', 'reserve_equivalent', 'reserve_pay_age']));
    // Pay base priced at 2036 is projected, so the result is an estimate; no qualifying-years warning at 22 good years.
    expect(r.status).toBe(MILITARY_RESULT_STATUS.ESTIMATE_ONLY);
    expect(r.issues.map((i) => i.code)).not.toContain(ISSUE_CODES.MRT_QUALIFYING_YEARS_INSUFFICIENT);
  });

  it('keeps the qualifying-year test separate from the point total and warns below 20 good years', () => {
    const r = calculateMilitaryRetiredPay(reserveInputs({}, { officialQualifyingYears: 18 }));
    expect(r.hypothetical).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_QUALIFYING_YEARS_INSUFFICIENT);
    expect(r.reserve.equivalent.equivalentYears).toBe(12);
  });

  it('requires points: missing points stop the calculation, estimated points make it an estimate', () => {
    const missing = calculateMilitaryRetiredPay(reserveInputs({}, { officialTotalPoints: null }));
    expect(missing.status).toBe(MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    expect(missing.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_RESERVE_POINTS_OFFICIAL_REQUIRED);
    const est = calculateMilitaryRetiredPay(reserveInputs({}, { pointsProvenance: INPUT_PROVENANCE.USER_ESTIMATE }));
    expect(est.hypothetical).toBe(true);
    expect(est.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_RESERVE_POINTS_OFFICIAL_REQUIRED);
  });

  it('blocks on a points mismatch between rows and the official total', () => {
    const r = calculateMilitaryRetiredPay(reserveInputs({}, { retirementYears: [year('2025-05-31', { inactivePoints: 60, provenance: OFFICIAL })], officialTotalPoints: 4320 }));
    expect(r.status).toBe(MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    expect(r.issues.some((i) => i.code === ISSUE_CODES.MRT_RESERVE_POINTS_MISMATCH && i.severity === ISSUE_SEVERITY.BLOCK)).toBe(true);
  });

  it('a former member stops accruing years of service for the pay band; a Retired Reserve member does not', () => {
    // Discharged in 2020 with 24 years; E-8 pay still rises between 24 and 30 years, so the freeze shows.
    const retiredReserve = calculateMilitaryRetiredPay(reserveInputs({ retirementDate: '2020-06-01' }, { retiredReserveStatus: RETIRED_RESERVE_STATUSES.RETIRED_RESERVE }));
    const former = calculateMilitaryRetiredPay(reserveInputs({ retirementDate: '2020-06-01' }, { retiredReserveStatus: RETIRED_RESERVE_STATUSES.FORMER_MEMBER, separationDate: '2020-06-01' }));
    // At the 2036 pay date: nearly 40 years of service in the Retired Reserve vs. frozen at 24.
    expect(retiredReserve.history.months.at(-1).yearsOfService).toBeCloseTo(39.83, 1);
    expect(former.history.months.at(-1).yearsOfService).toBe(24);
    expect(retiredReserve.payBase.monthly).toBeGreaterThan(former.payBase.monthly);
    const unknown = calculateMilitaryRetiredPay(reserveInputs({}, { retiredReserveStatus: RETIRED_RESERVE_STATUSES.UNKNOWN }));
    expect(unknown.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_RETIRED_RESERVE_STATUS_UNKNOWN);
  });

  it('a reduced age moves the pay date and the pay base earlier, and keeps the health-age warning', () => {
    const r = calculateMilitaryRetiredPay(reserveInputs({}, { reducedAgePeriods: [{ startDate: '2015-01-01', endDate: '2015-12-31', authority: '12302', verified: true }] }));
    expect(r.reserve.age).toMatchObject({ age: 59, date: '2035-05-01' });
    expect(r.retiredPayStartDate).toBe('2035-05-01');
    expect(r.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_HEALTH_AGE_DIFFERS);
  });

  it('BRS applies 2.0% per equivalent year', () => {
    const r = calculateMilitaryRetiredPay(reserveInputs({ system: S.BRS, diems: '2019-01-01', payEntryBaseDate: '2019-01-01' }, { officialTotalPoints: 3600, birthDate: '1990-01-01' }));
    expect(r.multiplier.multiplier).toBeCloseTo(0.2, 10);
  });
});

describe('connecting a calculation to the plan (spec 20.16)', () => {
  const result = calculateMilitaryRetiredPay(reserveInputs());

  it('saves an immutable snapshot and one linked stream that reads its amount from the calculation', () => {
    const saved = saveRetirementCalculation(createDefaultMilitary(), { result, inputs: result.inputs, name: 'Reserve at 60' });
    expect(saved.military.retirementScenarios).toHaveLength(1);
    const sc = saved.military.retirementScenarios[0];
    expect(sc.currentCalculationId).toBe(saved.calculationId);
    expect(sc.calculations[0]).toMatchObject({ inputHash: result.inputHash, rulesVersion: result.rulesVersion, engineVersion: result.engineVersion, retiredPayStartDate: '2036-05-01' });
    const stream = saved.military.incomeStreams.find((s) => s.id === saved.streamId);
    expect(stream).toMatchObject({ type: STREAM_TYPES.RESERVE_RETIRED_PAY, sourceCalculationId: saved.calculationId, grossAmount: null, amountStatus: 'calculated' });
    const resolved = resolveMilitaryIncomeStreams(saved.military);
    const r = resolved.streams.find((s) => s.id === saved.streamId);
    expect(r.resolved.included).toBe(true);
    expect(r.resolved.annualGross).toBe(result.projectedMonthly * 12);
    expect(r.startDate).toBe('2036-05-01');
    expect(r.resolved.linkedCalculation.id).toBe(saved.calculationId);
    expect(linkedCalculationFor(saved.military, stream).isCurrent).toBe(true);
  });

  it('recalculating adds a successor and relinks the same stream; the earlier result stays', () => {
    const first = saveRetirementCalculation(createDefaultMilitary(), { result, inputs: result.inputs });
    const again = calculateMilitaryRetiredPay(reserveInputs({}, { officialTotalPoints: 5000 }));
    const second = saveRetirementCalculation(first.military, { result: again, inputs: again.inputs, scenarioId: first.scenarioId });
    expect(second.military.retirementScenarios).toHaveLength(1);
    const sc = second.military.retirementScenarios[0];
    expect(sc.calculations).toHaveLength(2);
    expect(sc.calculations[1].supersedes).toBe(first.calculationId);
    expect(sc.currentCalculationId).toBe(second.calculationId);
    expect(second.military.incomeStreams).toHaveLength(1);
    expect(second.streamId).toBe(first.streamId);
    expect(second.military.incomeStreams[0].sourceCalculationId).toBe(second.calculationId);
  });

  it('flags a manual retired-pay stream beside a linked one, and a stale rules version', () => {
    const saved = saveRetirementCalculation(createDefaultMilitary(), { result, inputs: result.inputs });
    const withManual = { ...saved.military, incomeStreams: [...saved.military.incomeStreams, { id: 'manual', type: STREAM_TYPES.LONGEVITY_RETIRED_PAY, grossAmount: 2500, frequency: 'monthly' }] };
    const resolved = resolveMilitaryIncomeStreams(withManual);
    const manual = resolved.streams.find((s) => s.id === 'manual');
    expect(manual.resolved.included).toBe(false);
    expect(manual.resolved.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_DUPLICATE_PLAN_INCOME);

    const stale = { ...saved.military, retirementScenarios: saved.military.retirementScenarios.map((sc) => ({ ...sc, calculations: sc.calculations.map((c) => ({ ...c, rulesVersion: '2025.1' })) })) };
    const staleResolved = resolveMilitaryIncomeStreams(stale);
    expect(staleResolved.issues.map((i) => i.code)).toContain(ISSUE_CODES.MRT_RULES_STALE);
    expect(staleResolved.streams[0].resolved.annualGross).toBe(result.projectedMonthly * 12); // unchanged, not recalculated
  });

  it('snapshots keep the trace but not the whole result', () => {
    const snap = snapshotCalculation(result, { inputs: result.inputs });
    expect(snap.steps.length).toBeGreaterThan(3);
    expect(snap.history).toBeUndefined();
    expect(snap.reserve).toMatchObject({ totalPoints: 4320, qualifyingYears: 22, retiredPayAge: 60 });
  });
});
