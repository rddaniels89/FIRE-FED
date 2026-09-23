import { describe, expect, it } from 'vitest';
import { PROFILE_KINDS, applyScenarioUpdates, createDefaultScenario, isFederalEmployeeKind, normalizeScenario, profileKindUpdates } from '../schema';

const base = () => normalizeScenario(createDefaultScenario('k'));

describe('profile kind: who the plan is for', () => {
  it('defaults to a federal employee, and old scenarios read that way', () => {
    expect(base().profile.kind).toBe(PROFILE_KINDS.FEDERAL);
    const old = normalizeScenario({ ...createDefaultScenario('old'), profile: { currentAge: 50, separationAge: 57 } });
    expect(old.profile.kind).toBe(PROFILE_KINDS.FEDERAL);
    expect(isFederalEmployeeKind(PROFILE_KINDS.FEDERAL)).toBe(true);
    expect(isFederalEmployeeKind(PROFILE_KINDS.FEDERAL_WITH_MILITARY)).toBe(true);
    expect(isFederalEmployeeKind(PROFILE_KINDS.MILITARY_ONLY)).toBe(false);
    expect(isFederalEmployeeKind(PROFILE_KINDS.SPOUSE_SURVIVOR)).toBe(false);
  });

  it('a veteran in federal service gets the military connection and keeps every FERS figure', () => {
    const s = base();
    const next = applyScenarioUpdates(s, profileKindUpdates(s, PROFILE_KINDS.FEDERAL_WITH_MILITARY));
    expect(next.profile.kind).toBe(PROFILE_KINDS.FEDERAL_WITH_MILITARY);
    expect(next.military.connection).toBe('self');
    expect(next.fers.yearsOfService).toBe(s.fers.yearsOfService);
    expect(next.tsp.annualSalary).toBe(s.tsp.annualSalary);
  });

  it('a plan with no federal job clears untouched FERS defaults but never an entered figure', () => {
    const s = base();
    const cleared = applyScenarioUpdates(s, profileKindUpdates(s, PROFILE_KINDS.MILITARY_ONLY));
    expect(cleared.military.connection).toBe('self');
    expect(cleared.fers.yearsOfService).toBe(0);
    expect(cleared.tsp.annualSalary).toBe(0);
    expect(cleared.tsp.monthlyContributionPercent).toBe(0);
    const entered = applyScenarioUpdates(s, { fers: { yearsOfService: 12 }, tsp: { annualSalary: 95000 } });
    const kept = applyScenarioUpdates(entered, profileKindUpdates(entered, PROFILE_KINDS.MILITARY_ONLY));
    expect(kept.fers.yearsOfService).toBe(12);
    expect(kept.tsp.annualSalary).toBe(95000);
  });

  it('a spouse or survivor records the connection as another household member, and a recorded connection is never overwritten', () => {
    const s = base();
    expect(profileKindUpdates(s, PROFILE_KINDS.SPOUSE_SURVIVOR).military).toEqual({ connection: 'other_member' });
    const already = applyScenarioUpdates(s, { military: { connection: 'multiple' } });
    expect(profileKindUpdates(already, PROFILE_KINDS.MILITARY_ONLY).military).toBeUndefined();
    expect(profileKindUpdates(s, PROFILE_KINDS.FEDERAL).military).toBeUndefined();
  });
});
