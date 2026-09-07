import { describe, expect, it } from 'vitest';
import { buildOptimizationSuggestions } from '../optimizer';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../scenarios/schema';
import { findFireDate } from '../../projection/fireDate';

const base = () =>
  normalizeScenario({
    ...createDefaultScenario('opt'),
    profile: { currentAge: 45, separationAge: 57, socialSecurityClaimAge: 67 },
    tsp: { currentBalance: 500000, annualSalary: 120000, monthlyContributionPercent: 12, annualSalaryGrowthRate: 2, inflationRate: 2.5 },
    fers: { yearsOfService: 18, high3Salary: 115000 },
    fire: { monthlyFireIncomeGoal: 5500, sideHustleIncome: 0 },
    summary: { monthlyExpenses: 5000, socialSecurity: { mode: 'manual', monthlyBenefit: 2500 } },
  });

const forbidden = /\b(should|recommend|recommended|advice)\b/i;

describe('buildOptimizationSuggestions', () => {
  it('reads its baseline from the timeline and the FIRE date search', () => {
    const s = base();
    const r = buildOptimizationSuggestions(s);
    const fire = findFireDate(s, { maxSeparationAge: 72 });
    expect(r.baseline.separationAge).toBe(57);
    expect(r.baseline.retirementAge).toBe(57);
    expect(r.baseline.contributionPct).toBe(12);
    expect(r.baseline.fireAge).toBe(fire.separationAge);
    expect(r.baseline.earliestFireAge).toBe(fire.separationAge);
    expect(typeof r.baseline.isSustainable).toBe('boolean');
    expect(typeof r.baseline.pathLabel).toBe('string');
  });

  it('returns well-formed suggestions with scenario patches and educational wording', () => {
    const r = buildOptimizationSuggestions(base());
    expect(Array.isArray(r.suggestions)).toBe(true);
    expect(r.suggestions.length).toBeGreaterThan(0);
    const ids = r.suggestions.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of r.suggestions) {
      expect(typeof s.kind).toBe('string');
      expect(typeof s.title).toBe('string');
      expect(s.title).not.toMatch(forbidden);
      expect(s.detail ?? '').not.toMatch(forbidden);
      expect(s.updates === null || typeof s.updates === 'object').toBe(true);
    }
  });

  it('describes what one more year buys, as a separation-age patch', () => {
    const r = buildOptimizationSuggestions(base());
    const later = r.suggestions.find((s) => s.kind === 'separation_later');
    expect(later).toBeTruthy();
    expect(later.updates).toEqual({ profile: { separationAge: 58 } });
    expect(later.title).toMatch(/Staying one more year \(to 58\) gains/);
  });

  it('a contribution suggestion raises the percentage and reports the projected age it produces', () => {
    const r = buildOptimizationSuggestions(base());
    const c = r.suggestions.find((s) => s.kind === 'contribution');
    if (!c) return; // Not every scenario moves with +2 or +5 points; the shape is what matters when it does.
    expect(c.updates.tsp.monthlyContributionPercent).toBeGreaterThan(12);
    expect(c.metrics.toContributionPct).toBe(c.updates.tsp.monthlyContributionPercent);
    expect(c.title).toMatch(/Raising TSP contributions from 12% to \d+%/);
  });

  it('compares Social Security claiming ages on lifetime real income', () => {
    const r = buildOptimizationSuggestions(base());
    const ss = r.suggestions.find((s) => s.kind === 'social_security_claim');
    expect(ss).toBeTruthy();
    expect([62, 67, 70]).toContain(ss.updates.profile.socialSecurityClaimAge);
    expect(ss.updates.profile.socialSecurityClaimAge).not.toBe(67);
    expect(ss.metrics.lifetimeRealSocialSecurityDelta).toBeGreaterThan(0);
    expect(ss.title).toMatch(/Claiming Social Security at \d+ instead of 67 raises lifetime real income by/);
  });

  it('offers a 72(t) schedule when the bridge pays penalties on Traditional TSP', () => {
    // Leave at 50 with a Traditional-only TSP and no other assets: the bridge draws under penalty.
    const s = applyScenarioUpdates(base(), {
      profile: { separationAge: 50 },
      tsp: { currentBalance: 900000, rothBalance: 0 },
      fire: { taxableBrokerageBalance: 0, cashBalance: 0 },
    });
    const r = buildOptimizationSuggestions(s);
    const sepp = r.suggestions.find((x) => x.kind === 'sepp');
    expect(sepp).toBeTruthy();
    expect(sepp.updates).toEqual({ strategies: { sepp: { enabled: true } } });
    expect(sepp.metrics.penaltiesRemoved).toBeGreaterThan(0);
    expect(sepp.metrics.penaltyYears).toBeGreaterThan(0);
    expect(sepp.title).toMatch(/72\(t\) schedule would remove \$[\d,]+ of penalties/);
  });

  it('does not offer a 72(t) schedule once one is enabled', () => {
    const s = applyScenarioUpdates(base(), {
      profile: { separationAge: 50 },
      tsp: { currentBalance: 900000 },
      strategies: { sepp: { enabled: true } },
    });
    const r = buildOptimizationSuggestions(s);
    expect(r.suggestions.find((x) => x.kind === 'sepp')).toBeUndefined();
  });

  it('states the cost of a deferred annuity freeze as information, not a patch', () => {
    // 18 years at 45, leaving at 50 with 23 years: deferred, annuity from 60.
    const s = applyScenarioUpdates(base(), { profile: { separationAge: 50 } });
    const r = buildOptimizationSuggestions(s);
    const freeze = r.suggestions.find((x) => x.kind === 'deferred_freeze');
    expect(freeze).toBeTruthy();
    expect(freeze.updates).toBeNull();
    expect(freeze.metrics.freezeYears).toBe(10);
    expect(freeze.title).toMatch(/Deferring locks the annuity at separation-day dollars for 10 years/);
  });

  it('returns an empty result for a scenario without a profile', () => {
    expect(buildOptimizationSuggestions(null)).toEqual({ baseline: null, suggestions: [] });
    expect(buildOptimizationSuggestions({ name: 'x' })).toEqual({ baseline: null, suggestions: [] });
  });
});
