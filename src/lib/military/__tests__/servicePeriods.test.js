import { describe, expect, it } from 'vitest';
import {
  BRANCHES,
  CHARACTER_STATUS,
  COMPONENTS,
  DOCUMENTATION_STATUS,
  DUTY_STATUS,
  MODELING_STATUS,
  SERVICE_OWNERS,
  classifyServicePeriodForFers,
  createServicePeriod,
  detectOverlaps,
  normalizeMilitaryServicePeriods,
  opmDuration,
  opmDurationToYears,
  parseIsoDate,
  splitAtCalendarYears,
  sumOpmDurations,
  toHalfOpenInterval,
} from '../servicePeriods';
import { INPUT_PROVENANCE, ISSUE_CODES, ISSUE_SEVERITY } from '../status';

/** An honourably discharged, DD 214-documented active-duty period. */
const official = (overrides = {}) =>
  createServicePeriod({
    id: overrides.id ?? 'p1',
    branch: BRANCHES.ARMY,
    component: COMPONENTS.REGULAR,
    dutyStatus: DUTY_STATUS.ACTIVE_DUTY,
    startDate: '1998-06-15',
    endDate: '2002-06-14',
    characterStatus: CHARACTER_STATUS.CONFIRMED_HONORABLE_CONDITIONS,
    documentationStatus: DOCUMENTATION_STATUS.DD214,
    inputProvenance: INPUT_PROVENANCE.USER_ENTERED_OFFICIAL,
    ...overrides,
  });

const codesOf = (issues) => issues.map((i) => i.code);

describe('dates and intervals', () => {
  it('parses ISO dates in UTC and rejects impossible ones', () => {
    expect(parseIsoDate('2000-02-29').toISOString()).toBe('2000-02-29T00:00:00.000Z');
    expect(parseIsoDate('2001-02-29')).toBeNull();
    expect(parseIsoDate('2000-13-01')).toBeNull();
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
  });

  it('turns an inclusive end date into an exclusive one a day later', () => {
    const i = toHalfOpenInterval({ startDate: '2000-01-01', endDate: '2000-01-31' });
    expect(i.start.toISOString().slice(0, 10)).toBe('2000-01-01');
    expect(i.endExclusive.toISOString().slice(0, 10)).toBe('2000-02-01');
  });

  it('returns null when a date is missing or the end precedes the start', () => {
    expect(toHalfOpenInterval({ startDate: '2000-01-01' })).toBeNull();
    expect(toHalfOpenInterval({ startDate: '2000-02-01', endDate: '2000-01-01' })).toBeNull();
  });

  it('splits at every 1 January and keeps exact day counts, including leap days', () => {
    const pieces = splitAtCalendarYears(toHalfOpenInterval({ startDate: '1999-12-30', endDate: '2001-01-02' }));
    expect(pieces.map((p) => [p.year, p.days])).toEqual([
      [1999, 2],
      [2000, 366],
      [2001, 2],
    ]);
    expect(pieces.reduce((n, p) => n + p.days, 0)).toBe(370);
  });

  it('adjacent periods neither overlap nor leave a gap', () => {
    const a = toHalfOpenInterval({ startDate: '2000-01-01', endDate: '2000-06-30' });
    const b = toHalfOpenInterval({ startDate: '2000-07-01', endDate: '2000-12-31' });
    expect(a.endExclusive.getTime()).toBe(b.start.getTime());
  });
});

describe('OPM service duration', () => {
  it('computes a period as end + 1 day minus start with 30-day months', () => {
    // A classic four-year enlistment: 15 June 1998 to 14 June 2002 is exactly 4 years.
    expect(opmDuration('1998-06-15', '2002-06-14')).toEqual({ years: 4, months: 0, days: 0 });
    // 1 Jan to 31 Jan is one month, not 31 days.
    expect(opmDuration('2000-01-01', '2000-01-31')).toEqual({ years: 0, months: 1, days: 0 });
    // Borrowing: 10 April minus 20 March is −10 days, borrow a 30-day month → 20 days.
    // That is 21 calendar days; OPM's convention is what an SF 50 shows.
    expect(opmDuration('2000-03-20', '2000-04-09')).toEqual({ years: 0, months: 0, days: 20 });
  });

  it('sums periods carrying 30 days into a month and 12 months into a year', () => {
    const total = sumOpmDurations([
      { years: 1, months: 11, days: 20 },
      { years: 0, months: 1, days: 15 },
    ]);
    expect(total).toEqual({ years: 2, months: 1, days: 5 });
    expect(opmDurationToYears({ years: 2, months: 6, days: 0 })).toBeCloseTo(2.5, 10);
  });

  it('is zero for a period it cannot read', () => {
    expect(opmDuration(null, '2000-01-01')).toEqual({ years: 0, months: 0, days: 0 });
  });
});

describe('classification for FERS credit (spec §6.2)', () => {
  it('supports documented active duty under honorable conditions', () => {
    const c = classifyServicePeriodForFers(official());
    expect(c.status).toBe(MODELING_STATUS.SUPPORTED);
    expect(c.depositRequired).toBe(true);
    expect(c.issues).toEqual([]);
  });

  it('downgrades to estimate only when the period is a user estimate or undocumented', () => {
    const estimate = classifyServicePeriodForFers(official({ inputProvenance: INPUT_PROVENANCE.USER_ESTIMATE }));
    expect(estimate.status).toBe(MODELING_STATUS.ESTIMATE_ONLY);
    expect(codesOf(estimate.issues)).toContain(ISSUE_CODES.MIL_ESTIMATED_PERIOD);

    const undocumented = classifyServicePeriodForFers(official({ documentationStatus: DOCUMENTATION_STATUS.NONE }));
    expect(undocumented.status).toBe(MODELING_STATUS.ESTIMATE_ONLY);
  });

  it('case 11: pre-1957 service is creditable without a deposit', () => {
    const c = classifyServicePeriodForFers(official({ startDate: '1954-03-01', endDate: '1956-02-28' }));
    expect(c.status).toBe(MODELING_STATUS.SUPPORTED);
    expect(c.depositRequired).toBe(false);
    expect(codesOf(c.issues)).toContain(ISSUE_CODES.MIL_PRE_1957_NO_DEPOSIT);
  });

  it('a period straddling 1957 needs a deposit for the later part and says so', () => {
    const c = classifyServicePeriodForFers(official({ startDate: '1955-01-01', endDate: '1958-12-31' }));
    expect(c.depositRequired).toBe(true);
    expect(codesOf(c.issues)).toContain(ISSUE_CODES.MIL_PRE_1957_NO_DEPOSIT);
    const { segments } = normalizeMilitaryServicePeriods([official({ startDate: '1955-01-01', endDate: '1958-12-31' })]);
    expect(segments.map((s) => [s.year, s.depositRequired])).toEqual([
      [1955, false],
      [1956, false],
      [1957, true],
      [1958, true],
    ]);
  });

  it('case 12: a service-academy period is creditable', () => {
    const c = classifyServicePeriodForFers(official({ dutyStatus: DUTY_STATUS.ACADEMY, startDate: '1994-07-01', endDate: '1998-05-31' }));
    expect(c.status).toBe(MODELING_STATUS.SUPPORTED);
  });

  it('active duty for training is creditable', () => {
    expect(classifyServicePeriodForFers(official({ dutyStatus: DUTY_STATUS.ACTIVE_DUTY_FOR_TRAINING })).status).toBe(MODELING_STATUS.SUPPORTED);
  });

  it('case 13: inactive-duty training is excluded, not blocked', () => {
    const c = classifyServicePeriodForFers(official({ dutyStatus: DUTY_STATUS.INACTIVE_DUTY_TRAINING }));
    expect(c.status).toBe(MODELING_STATUS.NOT_SUPPORTED_FOR_FERS_CREDIT);
    expect(c.issues[0].severity).toBe(ISSUE_SEVERITY.INFO);
    expect(c.issues[0].code).toBe(ISSUE_CODES.MIL_DRILL_NOT_CREDITABLE);
  });

  it('case 14: state active duty is excluded', () => {
    const c = classifyServicePeriodForFers(official({ dutyStatus: DUTY_STATUS.STATE_ACTIVE_DUTY, component: COMPONENTS.NATIONAL_GUARD }));
    expect(c.status).toBe(MODELING_STATUS.NOT_SUPPORTED_FOR_FERS_CREDIT);
    expect(c.reasonCode).toBe(ISSUE_CODES.MIL_STATE_ACTIVE_DUTY_NOT_CREDITABLE);
  });

  it('case 15: Title 32 with unknown authority stops for an official determination', () => {
    const c = classifyServicePeriodForFers(official({ dutyStatus: DUTY_STATUS.TITLE32_FULL_TIME, component: COMPONENTS.NATIONAL_GUARD }));
    expect(c.status).toBe(MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    expect(c.issues[0].code).toBe(ISSUE_CODES.MIL_TITLE32_UNKNOWN);
    expect(c.issues[0].detail.reason).toBe('authority_unknown');
    expect(c.issues[0].severity).toBe(ISSUE_SEVERITY.BLOCK);
  });

  it('Title 32 under a qualifying section still needs the USERRA interruption', () => {
    const notInterrupted = classifyServicePeriodForFers(
      official({ dutyStatus: DUTY_STATUS.TITLE32_FULL_TIME, authoritySection: '502' })
    );
    expect(notInterrupted.status).toBe(MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    expect(notInterrupted.issues[0].detail.reason).toBe('not_userra_interruption');

    const interrupted = classifyServicePeriodForFers(
      official({ dutyStatus: DUTY_STATUS.TITLE32_FULL_TIME, authoritySection: '502', interruptedFederalService: true })
    );
    expect(interrupted.status).toBe(MODELING_STATUS.SUPPORTED);
    expect(codesOf(interrupted.issues)).toContain(ISSUE_CODES.MIL_USERRA_DETERMINATION);
  });

  it('Title 32 under a non-qualifying section is held, never credited', () => {
    const c = classifyServicePeriodForFers(
      official({ dutyStatus: DUTY_STATUS.TITLE32_FULL_TIME, authoritySection: '709', interruptedFederalService: true })
    );
    expect(c.status).toBe(MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    expect(c.issues[0].detail.reason).toBe('section_not_qualifying');
  });

  it('character of service that is unknown or unconfirmed blocks credit', () => {
    for (const characterStatus of [CHARACTER_STATUS.UNKNOWN, CHARACTER_STATUS.NOT_CONFIRMED, undefined]) {
      const c = classifyServicePeriodForFers(official({ characterStatus }));
      expect(c.status).toBe(MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
      expect(c.reasonCode).toBe(ISSUE_CODES.MIL_CHARACTER_UNKNOWN);
    }
  });

  it('unknown duty status is checked before character, so the user fixes facts in order', () => {
    const c = classifyServicePeriodForFers(official({ dutyStatus: DUTY_STATUS.UNKNOWN, characterStatus: CHARACTER_STATUS.UNKNOWN }));
    expect(c.reasonCode).toBe(ISSUE_CODES.MIL_DUTY_STATUS_UNKNOWN);
    expect(c.issues).toHaveLength(1);
  });

  it('missing or inverted dates block everything else', () => {
    const missing = classifyServicePeriodForFers(official({ endDate: null }));
    expect(missing.reasonCode).toBe(ISSUE_CODES.MIL_DATES_MISSING);
    expect(missing.issues[0].detail.reason).toBe('missing');
    const inverted = classifyServicePeriodForFers(official({ startDate: '2002-06-14', endDate: '1998-06-15' }));
    expect(inverted.issues[0].detail.reason).toBe('end_before_start');
  });

  it('ROTC is held for an official determination because the rule is not implemented', () => {
    const c = classifyServicePeriodForFers(official({ dutyStatus: DUTY_STATUS.ROTC }));
    expect(c.status).toBe(MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    expect(c.reasonCode).toBe(ISSUE_CODES.MIL_RULE_NOT_IMPLEMENTED);
  });

  it('a legacy undated year count is held and never credited', () => {
    const c = classifyServicePeriodForFers(createServicePeriod({ approximateYears: 4 }));
    expect(c.status).toBe(MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED);
    expect(c.reasonCode).toBe(ISSUE_CODES.MIL_LEGACY_YEARS_UNDATED);
    expect(c.issues[0].severity).toBe(ISSUE_SEVERITY.BLOCK);
  });

  it('tags every issue with the period it concerns', () => {
    const c = classifyServicePeriodForFers(official({ id: 'abc', characterStatus: CHARACTER_STATUS.UNKNOWN }));
    expect(c.issues[0].entity).toEqual({ type: 'servicePeriod', id: 'abc' });
  });
});

describe('overlaps', () => {
  it('finds shared days between two periods of the same owner', () => {
    const o = detectOverlaps([
      official({ id: 'a', startDate: '2000-01-01', endDate: '2000-12-31' }),
      official({ id: 'b', startDate: '2000-12-01', endDate: '2001-03-31' }),
    ]);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ periodIds: ['a', 'b'], start: '2000-12-01', endExclusive: '2001-01-01', days: 31, permitted: false });
  });

  it('does not treat adjacent periods as overlapping', () => {
    expect(
      detectOverlaps([
        official({ id: 'a', startDate: '2000-01-01', endDate: '2000-06-30' }),
        official({ id: 'b', startDate: '2000-07-01', endDate: '2000-12-31' }),
      ])
    ).toEqual([]);
  });

  it('permits a tagged sub-period of a parent order', () => {
    const o = detectOverlaps([
      official({ id: 'parent', startDate: '2000-01-01', endDate: '2000-12-31' }),
      official({ id: 'child', startDate: '2000-03-01', endDate: '2000-05-31', parentPeriodId: 'parent', excludedFromDuplicateTotals: true }),
    ]);
    expect(o[0].permitted).toBe(true);
  });

  it('requires both the parent link and the exclusion tag', () => {
    const o = detectOverlaps([
      official({ id: 'parent', startDate: '2000-01-01', endDate: '2000-12-31' }),
      official({ id: 'child', startDate: '2000-03-01', endDate: '2000-05-31', parentPeriodId: 'parent' }),
    ]);
    expect(o[0].permitted).toBe(false);
  });

  it('ignores overlaps between different household members', () => {
    expect(
      detectOverlaps([
        official({ id: 'a', ownerId: SERVICE_OWNERS.PRIMARY }),
        official({ id: 'b', ownerId: SERVICE_OWNERS.SPOUSE }),
      ])
    ).toEqual([]);
  });
});

describe('normalisation', () => {
  it('keeps every period, classifies each, and totals only what can carry credit', () => {
    const r = normalizeMilitaryServicePeriods([
      official({ id: 'ad', startDate: '1998-06-15', endDate: '2002-06-14' }),
      official({ id: 'drill', dutyStatus: DUTY_STATUS.INACTIVE_DUTY_TRAINING, startDate: '2003-01-01', endDate: '2006-12-31' }),
      official({ id: 't32', dutyStatus: DUTY_STATUS.TITLE32_FULL_TIME, startDate: '2007-01-01', endDate: '2007-12-31' }),
    ]);
    expect(r.periods).toHaveLength(3);
    expect(r.periods.map((p) => p.classification.status)).toEqual([
      MODELING_STATUS.SUPPORTED,
      MODELING_STATUS.NOT_SUPPORTED_FOR_FERS_CREDIT,
      MODELING_STATUS.OFFICIAL_DETERMINATION_REQUIRED,
    ]);
    expect(r.totals.durations.supported).toEqual({ years: 4, months: 0, days: 0 });
    expect(r.totals.durations.notSupported).toEqual({ years: 4, months: 0, days: 0 });
    expect(r.totals.durations.officialDeterminationRequired).toEqual({ years: 1, months: 0, days: 0 });
    expect(r.totals.creditable).toEqual({ years: 4, months: 0, days: 0 });
    expect(r.totals.creditableYears).toBeCloseTo(4, 10);
    // Only the supported period produced year segments.
    expect(new Set(r.segments.map((s) => s.periodId))).toEqual(new Set(['ad']));
    expect(r.segments.map((s) => s.year)).toEqual([1998, 1999, 2000, 2001, 2002]);
    expect(r.hasBlockingIssue).toBe(true);
  });

  it('carries basic pay by year onto the segments when the user has entered it', () => {
    const r = normalizeMilitaryServicePeriods([
      official({ startDate: '1999-01-01', endDate: '2000-12-31', earningsByYear: { 1999: 18000, 2000: 19500 } }),
    ]);
    expect(r.segments.map((s) => [s.year, s.basicPay])).toEqual([
      [1999, 18000],
      [2000, 19500],
    ]);
    const missing = normalizeMilitaryServicePeriods([official({ startDate: '1999-01-01', endDate: '1999-12-31' })]);
    expect(missing.segments[0].basicPay).toBeNull();
  });

  it('excludes unresolved overlapping periods from every total and raises the block on both', () => {
    const r = normalizeMilitaryServicePeriods([
      official({ id: 'a', startDate: '2000-01-01', endDate: '2000-12-31' }),
      official({ id: 'b', startDate: '2000-12-01', endDate: '2001-03-31' }),
    ]);
    expect(r.totals.days.supported).toBe(0);
    expect(r.segments).toEqual([]);
    const overlapIssues = r.issues.filter((i) => i.code === ISSUE_CODES.MIL_PERIOD_OVERLAP);
    expect(overlapIssues.map((i) => i.entity.id).sort()).toEqual(['a', 'b']);
    expect(overlapIssues[0].detail.days).toBe(31);
    expect(r.periods.every((p) => p.classification.unresolvedOverlap)).toBe(true);
  });

  it('counts a parent order once and keeps the tagged sub-period out of the totals', () => {
    const r = normalizeMilitaryServicePeriods([
      official({ id: 'parent', startDate: '2000-01-01', endDate: '2000-12-31' }),
      official({ id: 'child', startDate: '2000-03-01', endDate: '2000-05-31', parentPeriodId: 'parent', excludedFromDuplicateTotals: true }),
    ]);
    expect(r.totals.durations.supported).toEqual({ years: 1, months: 0, days: 0 });
    expect(r.segments.map((s) => s.periodId)).toEqual(['parent']);
    expect(r.periods.find((p) => p.id === 'child').classification.excludedFromTotals).toBe(true);
    expect(r.issues.filter((i) => i.code === ISSUE_CODES.MIL_PERIOD_OVERLAP)).toEqual([]);
  });

  it('reports a legacy undated count separately from creditable service', () => {
    const r = normalizeMilitaryServicePeriods([createServicePeriod({ id: 'legacy', approximateYears: 6 })]);
    expect(r.totals.undatedApproximateYears).toBe(6);
    expect(r.totals.creditableYears).toBe(0);
    expect(r.segments).toEqual([]);
  });

  it('handles nothing at all', () => {
    const r = normalizeMilitaryServicePeriods([]);
    expect(r.periods).toEqual([]);
    expect(r.totals.creditableYears).toBe(0);
    expect(r.hasBlockingIssue).toBe(false);
    expect(normalizeMilitaryServicePeriods(undefined).periods).toEqual([]);
  });
});

/** A small deterministic generator; no property-testing library is installed. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('property: unsupported service can never increase creditable service', () => {
  it('adding a drill, state-duty, unknown, or held period leaves the creditable total unchanged', () => {
    const rand = lcg(20260919);
    const unsupportedKinds = [
      { dutyStatus: DUTY_STATUS.INACTIVE_DUTY_TRAINING },
      { dutyStatus: DUTY_STATUS.STATE_ACTIVE_DUTY },
      { dutyStatus: DUTY_STATUS.UNKNOWN },
      { dutyStatus: DUTY_STATUS.TITLE32_FULL_TIME },
      { dutyStatus: DUTY_STATUS.ROTC },
      { characterStatus: CHARACTER_STATUS.UNKNOWN },
      { characterStatus: CHARACTER_STATUS.NOT_CONFIRMED },
      { startDate: null },
    ];
    for (let trial = 0; trial < 200; trial += 1) {
      const baseStartYear = 1970 + Math.floor(rand() * 40);
      const baseYears = 1 + Math.floor(rand() * 8);
      const base = official({
        id: 'base',
        startDate: `${baseStartYear}-01-01`,
        endDate: `${baseStartYear + baseYears - 1}-12-31`,
      });
      const before = normalizeMilitaryServicePeriods([base]).totals.creditableYears;

      // The extra period is placed after the base so it cannot create an overlap;
      // an overlap would legitimately reduce the total, which is a different property.
      const extraStart = baseStartYear + baseYears + Math.floor(rand() * 3);
      const extra = official({
        id: 'extra',
        startDate: `${extraStart}-01-01`,
        endDate: `${extraStart + Math.floor(rand() * 5)}-12-31`,
        ...unsupportedKinds[Math.floor(rand() * unsupportedKinds.length)],
      });
      const after = normalizeMilitaryServicePeriods([base, extra]).totals.creditableYears;
      expect(after, `trial ${trial}`).toBe(before);
    }
  });

  it('classification is a pure function of the period', () => {
    const p = official({ id: 'x', dutyStatus: DUTY_STATUS.TITLE32_FULL_TIME, authoritySection: '502', interruptedFederalService: true });
    const a = classifyServicePeriodForFers(p);
    const b = classifyServicePeriodForFers({ ...p });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
