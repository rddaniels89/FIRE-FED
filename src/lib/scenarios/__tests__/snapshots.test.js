import { describe, it, expect } from 'vitest';
import {
  SNAPSHOT_CONFLICT_TARGET,
  buildScenarioSnapshot,
  toSnapshotDate,
} from '../snapshots';

const scenario = {
  id: '7f1c2e4a-0000-4000-8000-000000000001',
  name: 'Retire at 57',
  tsp: { currentBalance: 250000 },
  fers: { high3Salary: 120000 },
  fire: { monthlyFireIncomeGoal: 7000 },
  summary: { socialSecurity: { monthly: 2100 } },
};

describe('toSnapshotDate', () => {
  it('buckets a timestamp to its UTC calendar day', () => {
    expect(toSnapshotDate(new Date('2027-01-15T09:30:00Z'))).toBe('2027-01-15');
  });

  it('keeps edits made from different timezones on the same UTC day', () => {
    const morningInTokyo = new Date('2027-01-15T01:00:00Z');
    const eveningInDC = new Date('2027-01-15T23:00:00Z');
    expect(toSnapshotDate(morningInTokyo)).toBe(toSnapshotDate(eveningInDC));
  });

  it('returns null for an unparseable date', () => {
    expect(toSnapshotDate('not-a-date')).toBeNull();
  });
});

describe('buildScenarioSnapshot', () => {
  const userId = 'a0000000-0000-4000-8000-00000000000a';

  it('maps an app scenario onto the snapshot row shape', () => {
    const row = buildScenarioSnapshot({
      scenario,
      userId,
      date: new Date('2027-01-15T09:30:00Z'),
    });

    expect(row).toEqual({
      scenario_id: scenario.id,
      user_id: userId,
      snapshot_date: '2027-01-15',
      scenario_name: 'Retire at 57',
      tsp_data: scenario.tsp,
      fers_data: scenario.fers,
      fire_goal: scenario.fire,
      summary_data: scenario.summary,
    });
  });

  it('produces one identical key for two edits on the same day', () => {
    const morning = buildScenarioSnapshot({
      scenario,
      userId,
      date: new Date('2027-01-15T08:00:00Z'),
    });
    const evening = buildScenarioSnapshot({
      scenario: { ...scenario, name: 'Retire at 58' },
      userId,
      date: new Date('2027-01-15T20:00:00Z'),
    });

    expect(morning.snapshot_date).toBe(evening.snapshot_date);
    expect(morning.scenario_id).toBe(evening.scenario_id);
    // The upsert keeps the day's final state, not the first write.
    expect(evening.scenario_name).toBe('Retire at 58');
  });

  it('separates edits made on different days', () => {
    const january = buildScenarioSnapshot({ scenario, userId, date: new Date('2027-01-15T12:00:00Z') });
    const august = buildScenarioSnapshot({ scenario, userId, date: new Date('2027-08-15T12:00:00Z') });
    expect(january.snapshot_date).not.toBe(august.snapshot_date);
  });

  it('refuses to build a row without a scenario id or user id', () => {
    expect(buildScenarioSnapshot({ scenario: { ...scenario, id: undefined }, userId })).toBeNull();
    expect(buildScenarioSnapshot({ scenario, userId: undefined })).toBeNull();
    expect(buildScenarioSnapshot()).toBeNull();
  });

  it('tolerates a sparse scenario', () => {
    const row = buildScenarioSnapshot({
      scenario: { id: scenario.id },
      userId,
      date: new Date('2027-01-15T12:00:00Z'),
    });
    expect(row.scenario_name).toBeNull();
    expect(row.tsp_data).toBeNull();
  });
});

describe('SNAPSHOT_CONFLICT_TARGET', () => {
  it('names the columns the daily unique index covers', () => {
    expect(SNAPSHOT_CONFLICT_TARGET).toBe('scenario_id,snapshot_date');
  });
});
