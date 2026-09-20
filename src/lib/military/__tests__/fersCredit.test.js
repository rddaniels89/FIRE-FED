import { describe, expect, it } from 'vitest';
import { CREDIT_REASONS, resolveMilitaryFersCredit } from '../fersCredit';
import { createDefaultMilitary } from '../../scenarios/schema';
import { ISSUE_CODES, INPUT_PROVENANCE, MILITARY_RESULT_STATUS } from '../status';
import { CHARACTER_STATUS, DOCUMENTATION_STATUS, DUTY_STATUS, SERVICE_OWNERS, createServicePeriod } from '../servicePeriods';

const official = (overrides = {}) =>
  createServicePeriod({
    id: 'p1',
    dutyStatus: DUTY_STATUS.ACTIVE_DUTY,
    startDate: '1998-06-15',
    endDate: '2002-06-14',
    characterStatus: CHARACTER_STATUS.CONFIRMED_HONORABLE_CONDITIONS,
    documentationStatus: DOCUMENTATION_STATUS.DD214,
    inputProvenance: INPUT_PROVENANCE.USER_ENTERED_OFFICIAL,
    ...overrides,
  });

const military = ({ periods = [], depositStatus = 'not_requested' } = {}) => ({
  ...createDefaultMilitary(),
  servicePeriods: periods,
  deposit: { ...createDefaultMilitary().deposit, status: depositStatus },
});

describe('resolveMilitaryFersCredit', () => {
  it('credits a supported period once the deposit is paid in full, on OPM\'s duration', () => {
    const r = resolveMilitaryFersCredit(military({ periods: [official()], depositStatus: 'paid_in_full' }));
    expect(r.creditYears).toBeCloseTo(4, 10);
    expect(r.creditDuration).toEqual({ years: 4, months: 0, days: 0 });
    expect(r.creditedPeriodIds).toEqual(['p1']);
    expect(r.status).toBe(MILITARY_RESULT_STATUS.SUPPORTED);
    expect(r.reason).toBeNull();
    expect(r.issues).toEqual([]);
  });

  it('credits nothing while the deposit is unpaid, and says that is why', () => {
    for (const depositStatus of ['not_requested', 'payments_in_progress', 'agency_quote_received', 'unknown', 'agency_denied']) {
      const r = resolveMilitaryFersCredit(military({ periods: [official()], depositStatus }));
      expect(r.creditYears, depositStatus).toBe(0);
      expect(r.status, depositStatus).toBeNull();
      expect(r.reason, depositStatus).toBe(CREDIT_REASONS.DEPOSIT_UNPAID);
      expect(r.issues.map((i) => i.code)).toContain(ISSUE_CODES.MIL_DEPOSIT_PARTIAL);
    }
  });

  it('credits pre-1957 service without any deposit', () => {
    const r = resolveMilitaryFersCredit(military({ periods: [official({ startDate: '1953-01-01', endDate: '1955-12-31' })] }));
    expect(r.creditYears).toBeCloseTo(3, 10);
    expect(r.status).toBe(MILITARY_RESULT_STATUS.SUPPORTED);
    expect(r.issues.map((i) => i.code)).toContain(ISSUE_CODES.MIL_PRE_1957_NO_DEPOSIT);
  });

  it('credits only the pre-1957 days of a straddling period when the deposit is unpaid', () => {
    const r = resolveMilitaryFersCredit(military({ periods: [official({ startDate: '1956-01-01', endDate: '1957-12-31' })] }));
    // 366 days of 1956 on a 360-day year; the OPM duration is not used for a part-credited period.
    expect(r.creditDays).toBe(366);
    expect(r.creditDuration).toBeNull();
    expect(r.creditYears).toBeCloseTo(366 / 360, 10);
    expect(r.partlyCreditedPeriodIds).toEqual(['p1']);
    // The post-1956 tail is unpaid, and the note says so; the pre-1957 days are credited regardless.
    expect(r.issues.map((i) => i.code)).toContain(ISSUE_CODES.MIL_DEPOSIT_PARTIAL);
    expect(r.reason).toBeNull();
  });

  it('carries an estimate-only status when any credited period is an estimate', () => {
    const r = resolveMilitaryFersCredit(
      military({
        periods: [official(), official({ id: 'p2', startDate: '2003-01-01', endDate: '2003-12-31', inputProvenance: INPUT_PROVENANCE.USER_ESTIMATE })],
        depositStatus: 'paid_in_full',
      })
    );
    expect(r.creditYears).toBeCloseTo(5, 10);
    expect(r.status).toBe(MILITARY_RESULT_STATUS.ESTIMATE_ONLY);
  });

  it('never credits a blocked or excluded period, paid or not', () => {
    const r = resolveMilitaryFersCredit(
      military({
        periods: [
          official({ id: 'drill', dutyStatus: DUTY_STATUS.INACTIVE_DUTY_TRAINING }),
          official({ id: 't32', dutyStatus: DUTY_STATUS.TITLE32_FULL_TIME, startDate: '2005-01-01', endDate: '2005-12-31' }),
        ],
        depositStatus: 'paid_in_full',
      })
    );
    expect(r.creditYears).toBe(0);
    expect(r.reason).toBe(CREDIT_REASONS.OFFICIAL_DETERMINATION_REQUIRED);
  });

  it('reports not creditable when everything recorded is drill or state duty', () => {
    const r = resolveMilitaryFersCredit(
      military({ periods: [official({ dutyStatus: DUTY_STATUS.STATE_ACTIVE_DUTY })], depositStatus: 'paid_in_full' })
    );
    expect(r.reason).toBe(CREDIT_REASONS.NOT_CREDITABLE);
  });

  it('ignores a legacy undated year count', () => {
    const r = resolveMilitaryFersCredit(military({ periods: [createServicePeriod({ id: 'legacy', approximateYears: 6 })], depositStatus: 'paid_in_full' }));
    expect(r.creditYears).toBe(0);
    expect(r.reason).toBe(CREDIT_REASONS.OFFICIAL_DETERMINATION_REQUIRED);
    expect(r.normalized.totals.undatedApproximateYears).toBe(6);
  });

  it('resolves per owner, so a spouse\'s periods do not credit the primary', () => {
    const r = resolveMilitaryFersCredit(
      military({ periods: [official({ ownerId: SERVICE_OWNERS.SPOUSE })], depositStatus: 'paid_in_full' })
    );
    expect(r.creditYears).toBe(0);
    expect(r.hasRecordedService).toBe(false);
    expect(r.reason).toBe(CREDIT_REASONS.NO_SERVICE);
    const spouse = resolveMilitaryFersCredit(
      military({ periods: [official({ ownerId: SERVICE_OWNERS.SPOUSE })], depositStatus: 'paid_in_full' }),
      { ownerId: SERVICE_OWNERS.SPOUSE }
    );
    expect(spouse.creditYears).toBeCloseTo(4, 10);
  });

  it('is empty and quiet when there is no military block at all', () => {
    for (const m of [undefined, null, {}, createDefaultMilitary()]) {
      const r = resolveMilitaryFersCredit(m);
      expect(r.creditYears).toBe(0);
      expect(r.status).toBeNull();
      expect(r.reason).toBe(CREDIT_REASONS.NO_SERVICE);
      expect(r.issues).toEqual([]);
    }
  });
});
