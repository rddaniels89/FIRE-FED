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
