import { describe, expect, it } from 'vitest';
import {
  SCENARIO_SCHEMA_VERSION,
  applyScenarioUpdates,
  buildScenarioFromTemplate,
  createDefaultScenario,
  getScenarioDiff,
  normalizeScenario,
  translateLegacyUpdates,
} from '../schema';
import { fromScenarioRow, toScenarioRow } from '../storage';
import { normalizeMilitaryServicePeriods } from '../../military/servicePeriods';

describe('scenario schema v3: one profile', () => {
  it('creates a default scenario whose mirrors agree with the profile', () => {
    const s = normalizeScenario(createDefaultScenario('x'));
    expect(s.schemaVersion).toBe(SCENARIO_SCHEMA_VERSION);
    expect(s.tsp.currentAge).toBe(s.profile.currentAge);
    expect(s.fers.currentAge).toBe(s.profile.currentAge);
    expect(s.tsp.retirementAge).toBe(s.profile.separationAge);
    expect(s.fire.desiredFireAge).toBe(s.profile.separationAge);
    expect(s.summary.socialSecurity.claimingAge).toBe(s.profile.socialSecurityClaimAge);
  });

  it('migrates a v2 scenario: leave age becomes separation, later pension age becomes annuity start', () => {
    const legacy = {
      schemaVersion: 2,
      name: 'old',
      tsp: { currentAge: 45, retirementAge: 62, currentBalance: 100 },
      fers: { currentAge: 45, retirementAge: 62, yearsOfService: 15, high3Salary: 100000 },
      fire: { desiredFireAge: 52, monthlyFireIncomeGoal: 5000, spouseIncome: 3000 },
      summary: { monthlyExpenses: 4000, socialSecurity: { claimingAge: 65 } },
    };
    const s = normalizeScenario(legacy);
    expect(s.profile.currentAge).toBe(45);
    expect(s.profile.separationAge).toBe(52);
    expect(s.profile.annuityStartAge).toBe(62);
    expect(s.profile.socialSecurityClaimAge).toBe(65);
    // The legacy monthly spouse figure becomes a structured spouse.
    expect(s.household.spouse.enabled).toBe(true);
    expect(s.household.spouse.annualIncome).toBe(36000);
    expect(s.household.spouse.incomeEndAge).toBeNull();
    // Mirrors follow the profile, not the legacy input.
    expect(s.fire.spouseIncome).toBe(3000);
    expect(s.fers.retirementAge).toBe(62);
    expect(s.tsp.retirementAge).toBe(52);
    // Untouched legacy fields survive.
    expect(s.fers.yearsOfService).toBe(15);
    expect(s.tsp.currentBalance).toBe(100);
  });

  it('migrates a v2 scenario where the pension starts at separation to a null annuity start', () => {
    const s = normalizeScenario({
      schemaVersion: 2,
      tsp: { currentAge: 50, retirementAge: 57 },
      fers: { currentAge: 50, retirementAge: 57 },
      fire: { desiredFireAge: 57 },
      summary: {},
    });
    expect(s.profile.separationAge).toBe(57);
    expect(s.profile.annuityStartAge).toBeNull();
    expect(s.fers.retirementAge).toBe(57);
  });

  it('keeps separation at or after the current age and annuity start at or after separation', () => {
    const s = normalizeScenario({
      ...createDefaultScenario(),
      profile: { currentAge: 50, separationAge: 45, annuityStartAge: 40 },
    });
    expect(s.profile.separationAge).toBe(50);
    expect(s.profile.annuityStartAge).toBe(50);
  });
});

describe('legacy writes are translated onto the profile', () => {
  const current = normalizeScenario(createDefaultScenario());

  it('tsp.currentAge → profile.currentAge', () => {
    const next = applyScenarioUpdates(current, { tsp: { currentAge: 30 } });
    expect(next.profile.currentAge).toBe(30);
    expect(next.fers.currentAge).toBe(30);
  });

  it('fire.desiredFireAge → profile.separationAge', () => {
    const next = applyScenarioUpdates(current, { fire: { desiredFireAge: 50 } });
    expect(next.profile.separationAge).toBe(50);
    expect(next.tsp.retirementAge).toBe(50);
  });

  it('fers.retirementAge later than separation → annuityStartAge; earlier → separation follows', () => {
    const later = applyScenarioUpdates(current, { fers: { retirementAge: 62 } });
    expect(later.profile.separationAge).toBe(current.profile.separationAge);
    expect(later.profile.annuityStartAge).toBe(62);

    const earlier = applyScenarioUpdates(current, { fers: { retirementAge: 50 } });
    expect(earlier.profile.separationAge).toBe(50);
    expect(earlier.profile.annuityStartAge).toBeNull();
  });

  it('summary.socialSecurity.claimingAge → profile.socialSecurityClaimAge', () => {
    const next = applyScenarioUpdates(current, { summary: { socialSecurity: { claimingAge: 70 } } });
    expect(next.profile.socialSecurityClaimAge).toBe(70);
    // A partial summary patch must not wipe the rest of summary.
    expect(next.summary.monthlyExpenses).toBe(current.summary.monthlyExpenses);
    expect(next.summary.assumptions.safeWithdrawalRate).toBe(0.04);
  });

  it('fire.spouseIncome → household.spouse', () => {
    const next = applyScenarioUpdates(current, { fire: { spouseIncome: 2500 } });
    expect(next.household.spouse.enabled).toBe(true);
    expect(next.household.spouse.annualIncome).toBe(30000);
    expect(next.fire.spouseIncome).toBe(2500);
  });

  it('writing both legacy mirrors together sets separation and leaves the annuity at the path default', () => {
    // The FERS pension calculator's age control is a separation age: every
    // figure on that page is computed from separating then. Writing only
    // fers.retirementAge would move the annuity start instead, so it writes
    // both mirrors. This pins that behaviour.
    const next = applyScenarioUpdates(current, {
      fers: { retirementAge: 60, yearsOfService: 25 },
      fire: { desiredFireAge: 60 },
    });
    expect(next.profile.separationAge).toBe(60);
    expect(next.profile.annuityStartAge).toBeNull();
    expect(next.fers.yearsOfService).toBe(25);
  });

  it('leaves non-legacy updates alone', () => {
    const translated = translateLegacyUpdates({ profile: { hireCohort: 'fers' } }, current);
    expect(translated).toEqual({ profile: { hireCohort: 'fers' } });
  });
});

describe('templates and diffs', () => {
  it('builds a template with a coherent profile', () => {
    const s = buildScenarioFromTemplate('template_40s');
    expect(s.profile.currentAge).toBe(45);
    expect(s.profile.separationAge).toBe(57);
    expect(s.tsp.currentAge).toBe(45);
    expect(s.fers.yearsOfService).toBe(15);
  });

  it('diffs profile fields', () => {
    const a = buildScenarioFromTemplate('template_30s');
    const b = applyScenarioUpdates(a, { profile: { separationAge: 60 } });
    const diff = getScenarioDiff(a, b);
    expect(diff.map((d) => d.path)).toContain('profile.separationAge');
  });
});

describe('storage row mapping', () => {
  it('round-trips the extension blocks through summary_data', () => {
    const s = normalizeScenario(createDefaultScenario('rt'));
    s.profile.hireCohort = 'fers';
    s.taxes.filingStatus = 'married_joint';
    const row = toScenarioRow(s);
    expect(row.summary_data.extensions.profile.hireCohort).toBe('fers');
    expect(row.summary_data.extensions.taxes.filingStatus).toBe('married_joint');
    expect(row.summary_data.monthlyExpenses).toBe(s.summary.monthlyExpenses);
    expect(row.summary_data.extensions.summary).toBeUndefined();

    const back = normalizeScenario(fromScenarioRow({ ...row, id: 'abc', created_at: 'now' }));
    expect(back.id).toBe('abc');
    expect(back.profile.hireCohort).toBe('fers');
    expect(back.taxes.filingStatus).toBe('married_joint');
    expect(back.summary.extensions).toBeUndefined();
  });

  it('reads a pre-v3 row that has no extensions', () => {
    const back = normalizeScenario(
      fromScenarioRow({
        id: '1',
        scenario_name: 'legacy',
        tsp_data: { currentAge: 40, retirementAge: 60 },
        fers_data: { currentAge: 40, retirementAge: 60, yearsOfService: 10 },
        fire_goal: { desiredFireAge: 55 },
        summary_data: { monthlyExpenses: 3000 },
      })
    );
    expect(back.profile.currentAge).toBe(40);
    expect(back.profile.separationAge).toBe(55);
    expect(back.profile.annuityStartAge).toBe(60);
  });
});

describe('scenario schema v4: military block', () => {
  it('creates a default scenario with an empty military block and the rules version', () => {
    const s = normalizeScenario(createDefaultScenario('m'));
    expect(SCENARIO_SCHEMA_VERSION).toBe(4);
    expect(s.military.connection).toBe('none');
    expect(s.military.servicePeriods).toEqual([]);
    expect(s.military.deposit.status).toBe('not_requested');
    expect(s.military.rulesVersion).toMatch(/^\d{4}\.\d+$/);
    // The legacy fields are mirrors of an empty block.
    expect(s.fers.militaryServiceYears).toBe(0);
    expect(s.fers.militaryDepositPaid).toBe(false);
  });

  it('migrates a v3 year count into one undated legacy period that is shown but not credited', () => {
    const s = normalizeScenario({
      schemaVersion: 3,
      profile: { currentAge: 40, separationAge: 57 },
      fers: { yearsOfService: 10, militaryServiceYears: 4, militaryDepositPaid: true },
    });
    expect(s.military.connection).toBe('self');
    expect(s.military.servicePeriods).toHaveLength(1);
    expect(s.military.servicePeriods[0].id).toBe('legacy_military_years');
    expect(s.military.servicePeriods[0].approximateYears).toBe(4);
    expect(s.military.servicePeriods[0].startDate).toBeNull();
    expect(s.military.deposit.status).toBe('paid_in_full');
    // Mirrors reflect the block.
    expect(s.fers.militaryServiceYears).toBe(4);
    expect(s.fers.militaryDepositPaid).toBe(true);
  });

  it('leaves a v3 scenario with no military service with an empty block', () => {
    const s = normalizeScenario({ schemaVersion: 3, fers: { yearsOfService: 10, militaryServiceYears: 0 } });
    expect(s.military.connection).toBe('none');
    expect(s.military.servicePeriods).toEqual([]);
    expect(s.military.deposit.status).toBe('not_requested');
  });

  it('re-migration is a no-op once the block exists (rows do not persist their version)', () => {
    const first = normalizeScenario({ schemaVersion: 3, fers: { militaryServiceYears: 4 } });
    const again = normalizeScenario({ ...first, schemaVersion: undefined });
    expect(again.military.servicePeriods).toHaveLength(1);
    expect(again.military).toEqual(first.military);
  });

  it('derives the legacy year mirror from dated periods, rounded to the month', () => {
    const s = normalizeScenario({
      ...createDefaultScenario(),
      military: {
        servicePeriods: [
          {
            id: 'a',
            dutyStatus: 'active_duty',
            startDate: '1998-06-15',
            endDate: '2001-12-14',
            characterStatus: 'confirmed_honorable_conditions',
            documentationStatus: 'dd214',
            inputProvenance: 'user_entered_official',
          },
        ],
      },
    });
    expect(s.fers.militaryServiceYears).toBeCloseTo(3.5, 10);
  });

  it('translates a legacy militaryServiceYears write onto the legacy period, and drops it once dated periods exist', () => {
    const current = normalizeScenario(createDefaultScenario());
    const next = applyScenarioUpdates(current, { fers: { militaryServiceYears: 3, militaryDepositPaid: true } });
    expect(next.military.servicePeriods[0].approximateYears).toBe(3);
    expect(next.military.connection).toBe('self');
    expect(next.military.deposit.status).toBe('paid_in_full');
    expect(next.fers.militaryServiceYears).toBe(3);

    const cleared = applyScenarioUpdates(next, { fers: { militaryServiceYears: 0 } });
    expect(cleared.military.servicePeriods).toEqual([]);
    expect(cleared.fers.militaryServiceYears).toBe(0);

    const dated = applyScenarioUpdates(current, {
      military: {
        servicePeriods: [
          { id: 'a', dutyStatus: 'active_duty', startDate: '2000-01-01', endDate: '2001-12-31', characterStatus: 'confirmed_honorable_conditions' },
        ],
      },
    });
    const ignored = applyScenarioUpdates(dated, { fers: { militaryServiceYears: 9 } });
    expect(ignored.military.servicePeriods).toHaveLength(1);
    expect(ignored.military.servicePeriods[0].id).toBe('a');
    expect(ignored.fers.militaryServiceYears).toBe(2);
  });

  it('round-trips the military block through summary_data.extensions', () => {
    const s = normalizeScenario({ schemaVersion: 3, fers: { militaryServiceYears: 2 } });
    const row = toScenarioRow(s);
    expect(row.summary_data.extensions.military.servicePeriods).toHaveLength(1);
    expect(row.fers_data.militaryServiceYears).toBe(2);
    const back = normalizeScenario(fromScenarioRow({ ...row, id: 'r1', created_at: 'now' }));
    expect(back.military.servicePeriods[0].approximateYears).toBe(2);
    expect(back.fers.militaryServiceYears).toBe(2);
  });

  it('reads a v3 row whose fers_data carries the year count but has no military extension', () => {
    const back = normalizeScenario(
      fromScenarioRow({
        id: '1',
        scenario_name: 'v3',
        tsp_data: { currentAge: 40, retirementAge: 60 },
        fers_data: { currentAge: 40, retirementAge: 60, yearsOfService: 10, militaryServiceYears: 5, militaryDepositPaid: false },
        fire_goal: { desiredFireAge: 55 },
        summary_data: { monthlyExpenses: 3000, extensions: { profile: { currentAge: 40 } } },
      })
    );
    expect(back.military.servicePeriods[0].approximateYears).toBe(5);
    expect(back.military.deposit.status).toBe('unknown');
  });
});

describe('pass 1 exit criterion', () => {
  it('round-trips three service periods through storage and classifies them the same on both sides', () => {
    const periods = [
      { id: 'ad', dutyStatus: 'active_duty', startDate: '1998-06-15', endDate: '2002-06-14', characterStatus: 'confirmed_honorable_conditions', documentationStatus: 'dd214', inputProvenance: 'user_entered_official' },
      { id: 'drill', dutyStatus: 'inactive_duty_training', startDate: '2003-01-01', endDate: '2006-12-31', characterStatus: 'confirmed_honorable_conditions' },
      { id: 't32', dutyStatus: 'title32_full_time', component: 'national_guard', startDate: '2007-01-01', endDate: '2007-12-31', characterStatus: 'confirmed_honorable_conditions' },
    ];
    const s = normalizeScenario({ ...createDefaultScenario('rt'), military: { connection: 'self', servicePeriods: periods } });
    const before = normalizeMilitaryServicePeriods(s.military.servicePeriods);

    const row = toScenarioRow(s);
    const back = normalizeScenario(fromScenarioRow({ ...row, id: 'r', created_at: 'now' }));
    const after = normalizeMilitaryServicePeriods(back.military.servicePeriods);

    expect(back.military.servicePeriods).toEqual(s.military.servicePeriods);
    expect(after.periods.map((p) => p.classification.status)).toEqual(['supported', 'not_supported', 'official_determination_required']);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(back.fers.militaryServiceYears).toBe(4);
  });
});
