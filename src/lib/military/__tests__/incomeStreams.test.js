import { describe, expect, it } from 'vitest';
import {
  AMOUNT_STATUSES,
  COLA_POLICIES,
  FEDERAL_TAX_CLASSES,
  FREQUENCIES,
  STATE_TREATMENTS,
  STREAM_TYPES,
  STREAM_TYPE_RULES,
  classifyStreamTax,
  colaFactor,
  createIncomeStream,
  projectMilitaryIncomeForYear,
  resolveMilitaryIncomeStreams,
} from '../incomeStreams';
import { DIC_RATES, VA_RATES_EFFECTIVE_DATE, estimateDic, estimateVaCompensation } from '../vaCompensationRates';
import { ISSUE_CODES, ISSUE_SEVERITY } from '../status';
import { createDefaultMilitary } from '../../scenarios/schema';

const T = STREAM_TYPES;
const F = FEDERAL_TAX_CLASSES;
const AS_OF = new Date(2026, 8, 1);

const stream = (over = {}) => createIncomeStream({ id: over.id ?? 's1', grossAmount: 1000, frequency: FREQUENCIES.MONTHLY, officialAmountAsOfDate: '2026-01-01', ...over });
const resolve = (streams) => resolveMilitaryIncomeStreams({ ...createDefaultMilitary(), incomeStreams: streams }, { asOfDate: AS_OF });
const codesOf = (r) => r.issues.map((i) => i.code);

describe('tax character by stream type (spec §4.10, cases 28–31)', () => {
  it('case 28: VA compensation is tax-exempt', () => {
    expect(classifyStreamTax(stream({ type: T.VA_DISABILITY }))).toMatchObject({ federalTaxClass: F.TAX_EXEMPT, isTaxExempt: true, stateTreatment: STATE_TREATMENTS.EXEMPT });
  });
  it('case 29: DIC is tax-exempt and a survivor stream', () => {
    expect(classifyStreamTax(stream({ type: T.VA_DIC })).isTaxExempt).toBe(true);
    expect(STREAM_TYPE_RULES[T.VA_DIC].survivor).toBe(true);
  });
  it('case 30: CRDP is a taxable pension with military state treatment', () => {
    expect(classifyStreamTax(stream({ type: T.CRDP }))).toMatchObject({ federalTaxClass: F.TAXABLE_PENSION, stateTreatment: STATE_TREATMENTS.MILITARY_RETIRED_PAY });
  });
  it('case 31: CRSC is tax-exempt', () => {
    expect(classifyStreamTax(stream({ type: T.CRSC })).isTaxExempt).toBe(true);
  });
  it('retired pay is a taxable pension; drill pay is wages; allowances are exempt', () => {
    expect(classifyStreamTax(stream({ type: T.LONGEVITY_RETIRED_PAY })).federalTaxClass).toBe(F.TAXABLE_PENSION);
    expect(classifyStreamTax(stream({ type: T.RESERVE_RETIRED_PAY })).stateTreatment).toBe(STATE_TREATMENTS.MILITARY_RETIRED_PAY);
    expect(classifyStreamTax(stream({ type: T.DRILL_PAY })).federalTaxClass).toBe(F.TAXABLE_WAGES);
    expect(classifyStreamTax(stream({ type: T.ALLOWANCE })).isTaxExempt).toBe(true);
  });
  it('disability retired pay is projected taxable until the official classification is recorded', () => {
    const c = classifyStreamTax(stream({ type: T.DISABILITY_RETIRED_PAY }));
    expect(c.federalTaxClass).toBe(F.TAXABLE_PENSION);
    expect(c.classificationRequired).toBe(true);
    const recorded = classifyStreamTax(stream({ type: T.DISABILITY_RETIRED_PAY, federalTaxClassOverride: F.TAX_EXEMPT }));
    expect(recorded.isTaxExempt).toBe(true);
    expect(recorded.classificationRequired).toBe(false);
  });
});

describe('resolution and issues', () => {
  it('includes an official stream with no issues', () => {
    const r = resolve([stream({ type: T.LONGEVITY_RETIRED_PAY, grossAmount: 2500 })]);
    expect(r.streams[0].resolved).toMatchObject({ included: true, annualGross: 30000 });
    expect(r.issues).toEqual([]);
  });

  it('excludes a stream with no amount and says so', () => {
    const r = resolve([stream({ type: T.VA_DISABILITY, grossAmount: 0 })]);
    expect(r.streams[0].resolved.included).toBe(false);
    expect(codesOf(r)).toEqual([ISSUE_CODES.MIL_STREAM_AMOUNT_MISSING]);
  });

  it('projects CRDP and CRSC only from an official amount', () => {
    const official = resolve([stream({ type: T.CRDP, amountStatus: AMOUNT_STATUSES.OFFICIAL })]);
    expect(official.streams[0].resolved.included).toBe(true);
    expect(official.issues[0]).toMatchObject({ code: ISSUE_CODES.MIL_CRDP_CRSC_MANUAL, severity: ISSUE_SEVERITY.WARNING, detail: { official: true } });
    const estimated = resolve([stream({ type: T.CRSC, amountStatus: AMOUNT_STATUSES.ESTIMATED })]);
    expect(estimated.streams[0].resolved.included).toBe(false);
    expect(estimated.issues[0].detail.official).toBe(false);
  });

  it('flags an official amount older than eighteen months', () => {
    const fresh = resolve([stream({ type: T.VA_DISABILITY, officialAmountAsOfDate: '2025-12-01' })]);
    expect(codesOf(fresh)).not.toContain(ISSUE_CODES.MIL_OFFICIAL_AMOUNT_STALE);
    const stale = resolve([stream({ type: T.VA_DISABILITY, officialAmountAsOfDate: '2024-12-01' })]);
    const issue = stale.issues.find((i) => i.code === ISSUE_CODES.MIL_OFFICIAL_AMOUNT_STALE);
    expect(issue.detail.monthsOld).toBe(21);
  });

  it('flags the missing classification on disability retired pay and the state question on SBP', () => {
    expect(codesOf(resolve([stream({ type: T.DISABILITY_RETIRED_PAY })]))).toContain(ISSUE_CODES.MIL_DISABILITY_RETIRED_PAY_TAX_UNKNOWN);
    expect(codesOf(resolve([stream({ type: T.SBP })]))).toContain(ISSUE_CODES.MIL_SBP_STATE_TREATMENT_UNKNOWN);
  });

  it('fills a VA stream from the rate table when only a rating is given, and labels it', () => {
    const r = resolve([stream({ type: T.VA_DISABILITY, grossAmount: null, amountStatus: AMOUNT_STATUSES.ESTIMATED, vaEstimate: { rating: 70, spouse: true } })]);
    expect(r.streams[0].resolved.included).toBe(true);
    expect(r.streams[0].resolved.annualGross).toBeCloseTo(1961.45 * 12, 2);
    expect(r.streams[0].resolved.estimate.monthly).toBe(1961.45);
    expect(codesOf(r)).toContain(ISSUE_CODES.MIL_VA_TABLE_ESTIMATE);
  });

  it('handles an absent block', () => {
    expect(resolveMilitaryIncomeStreams(undefined).streams).toEqual([]);
    expect(resolveMilitaryIncomeStreams({}).issues).toEqual([]);
  });
});

describe('COLA policies (spec §6.8)', () => {
  const base = { inflation: 0.025, asOfYear: 2026 };
  it('retired-pay and VA policies follow inflation; none stays flat; user rate uses its own; schedule uses given years and inflation for the rest', () => {
    expect(colaFactor(stream({ colaPolicy: COLA_POLICIES.MILITARY_RETIRED_PAY }), { ...base, years: 3 })).toBeCloseTo(1.025 ** 3, 10);
    expect(colaFactor(stream({ colaPolicy: COLA_POLICIES.VA_SSA }), { ...base, years: 3 })).toBeCloseTo(1.025 ** 3, 10);
    expect(colaFactor(stream({ colaPolicy: COLA_POLICIES.NONE }), { ...base, years: 3 })).toBe(1);
    expect(colaFactor(stream({ colaPolicy: COLA_POLICIES.USER_RATE, colaRate: 0.01 }), { ...base, years: 3 })).toBeCloseTo(1.01 ** 3, 10);
    expect(colaFactor(stream({ colaPolicy: COLA_POLICIES.MANUAL_SCHEDULE, colaSchedule: { 2027: 0.032, 2028: 0 } }), { ...base, years: 3 })).toBeCloseTo(1.032 * 1 * 1.025, 10);
  });
  it('is 1 in the current year', () => {
    expect(colaFactor(stream({ colaPolicy: COLA_POLICIES.MILITARY_RETIRED_PAY }), { ...base, years: 0 })).toBe(1);
  });
});

describe('projection by year', () => {
  const project = (streams, { age = 60, spouseAge = null, i = 0, deathAges = null } = {}) =>
    projectMilitaryIncomeForYear({
      resolved: resolve(streams),
      yearsFromNow: i,
      asOfYear: 2026,
      year: 2026 + i,
      ages: { primary: age, spouse: spouseAge },
      inflation: 0.02,
      deathAges,
    });

  it('sorts each stream into its tax bucket', () => {
    const r = project([
      stream({ id: 'rp', type: T.LONGEVITY_RETIRED_PAY, grossAmount: 3000 }),
      stream({ id: 'va', type: T.VA_DISABILITY, grossAmount: 1000 }),
      stream({ id: 'crsc', type: T.CRSC, grossAmount: 500 }),
      stream({ id: 'drill', type: T.DRILL_PAY, grossAmount: 400 }),
      stream({ id: 'sbp', type: T.SBP, grossAmount: 800, startsOnDeathOf: null }),
    ]);
    expect(r.militaryRetiredPay).toBe(36000);
    expect(r.taxExempt).toBe(18000);
    expect(r.taxableWages).toBe(4800);
    expect(r.taxablePension).toBe(9600);
    expect(r.total).toBe(36000 + 18000 + 4800 + 9600);
    expect(r.byStream.map((s) => s.id).sort()).toEqual(['crsc', 'drill', 'rp', 'sbp', 'va']);
  });

  it('respects start and end ages and applies COLA from the as-of year', () => {
    const s = [stream({ type: T.RESERVE_RETIRED_PAY, grossAmount: 1000, startAge: 60, endAge: null })];
    expect(project(s, { age: 59 }).total).toBe(0);
    expect(project(s, { age: 60, i: 5 }).total).toBeCloseTo(12000 * 1.02 ** 5, 6);
  });

  it('case 48: a stream stops on its owner\'s death and the survivor streams start', () => {
    const s = [
      stream({ id: 'rp', type: T.LONGEVITY_RETIRED_PAY, grossAmount: 3000 }),
      stream({ id: 'va', type: T.VA_DISABILITY, grossAmount: 1000 }),
      stream({ id: 'sbp', type: T.SBP, grossAmount: 1650, ownerId: 'spouse', startsOnDeathOf: 'primary' }),
      stream({ id: 'dic', type: T.VA_DIC, grossAmount: 1699.36, ownerId: 'spouse', startsOnDeathOf: 'primary' }),
    ];
    const alive = project(s, { age: 70, spouseAge: 68, deathAges: { primary: 75, spouse: null } });
    expect(alive.byStream.map((x) => x.id).sort()).toEqual(['rp', 'va']);
    expect(alive.survivorIncome).toBe(0);

    const after = project(s, { age: 76, spouseAge: 74, deathAges: { primary: 75, spouse: null } });
    expect(after.byStream.map((x) => x.id).sort()).toEqual(['dic', 'sbp']);
    // Case 32: full SBP and full DIC together; no offset.
    expect(after.survivorIncome).toBeCloseTo((1650 + 1699.36) * 12, 6);
    expect(after.taxablePension).toBeCloseTo(1650 * 12, 6);
    expect(after.taxExempt).toBeCloseTo(1699.36 * 12, 6);
  });

  it('never starts a survivor stream when no death is modelled', () => {
    const s = [stream({ id: 'sbp', type: T.SBP, grossAmount: 1650, ownerId: 'spouse', startsOnDeathOf: 'primary' })];
    expect(project(s, { age: 90, spouseAge: 88, deathAges: null }).total).toBe(0);
    expect(project(s, { age: 90, spouseAge: 88, deathAges: { primary: null, spouse: null } }).total).toBe(0);
  });

  it('skips a spouse-owned stream when there is no spouse age', () => {
    expect(project([stream({ type: T.VA_DISABILITY, ownerId: 'spouse' })], { spouseAge: null }).total).toBe(0);
  });
});

describe('property: tax-exempt income never enters a taxable bucket', () => {
  it('holds for every exempt type at every age and COLA', () => {
    for (const type of [T.VA_DISABILITY, T.VA_DIC, T.CRSC, T.ALLOWANCE]) {
      for (const i of [0, 7, 30]) {
        const r = projectMilitaryIncomeForYear({
          resolved: resolve([stream({ type, grossAmount: 1234, startsOnDeathOf: null })]),
          yearsFromNow: i,
          asOfYear: 2026,
          year: 2026 + i,
          ages: { primary: 60 + i, spouse: null },
          inflation: 0.03,
        });
        expect(r.taxExempt, `${type} ${i}`).toBeGreaterThan(0);
        expect(r.militaryRetiredPay + r.taxablePension + r.taxableWages, `${type} ${i}`).toBe(0);
      }
    }
  });
});

describe('VA rate table (effective 1 December 2025)', () => {
  it('reads the base rates', () => {
    expect(VA_RATES_EFFECTIVE_DATE).toBe('2025-12-01');
    expect(estimateVaCompensation({ rating: 10 }).monthly).toBe(180.42);
    expect(estimateVaCompensation({ rating: 100 }).monthly).toBe(3938.58);
    expect(estimateVaCompensation({ rating: 100, spouse: true }).monthly).toBe(4158.17);
    expect(estimateVaCompensation({ rating: 70, spouse: true, parents: 2, childrenUnder18: 1 }).monthly).toBe(2320.45);
    expect(estimateVaCompensation({ rating: 50, childrenUnder18: 1 }).monthly).toBe(1205.9);
  });

  it('adds further children and spouse aid and attendance at the per-rating amounts', () => {
    // 60%, spouse, three children under 18: base with spouse and 1 child, plus two add-ons.
    expect(estimateVaCompensation({ rating: 60, spouse: true, childrenUnder18: 3 }).monthly).toBeCloseTo(1663.02 + 2 * 65, 2);
    // 100%, spouse with A&A, one child in school.
    expect(estimateVaCompensation({ rating: 100, spouse: true, childrenInSchool: 1, spouseAidAttendance: true }).monthly).toBeCloseTo(4318.99 + 201.41, 2);
    // A school child beyond the one in the base is priced at the school rate.
    expect(estimateVaCompensation({ rating: 90, childrenUnder18: 1, childrenInSchool: 1 }).monthly).toBeCloseTo(2494.3 + 317, 2);
  });

  it('ignores dependents at 10% and 20% and says so, and refuses an invalid rating', () => {
    const r = estimateVaCompensation({ rating: 20, spouse: true, childrenUnder18: 2 });
    expect(r.monthly).toBe(356.66);
    expect(r.dependentsIgnored).toBe(true);
    expect(estimateVaCompensation({ rating: 65 })).toBeNull();
    expect(estimateVaCompensation({ rating: 0 })).toBeNull();
  });

  it('reads the DIC table', () => {
    expect(DIC_RATES.survivingSpouseBasic).toBe(1699.36);
    expect(estimateDic().monthly).toBe(1699.36);
    expect(estimateDic({ eightYearProvision: true, childrenUnder18: 1, transitional: true }).monthly).toBeCloseTo(1699.36 + 360.85 + 421 + 359, 2);
    // Aid and attendance and housebound are alternatives; A&A wins.
    expect(estimateDic({ aidAndAttendance: true, housebound: true }).monthly).toBeCloseTo(1699.36 + 421, 2);
  });
});
