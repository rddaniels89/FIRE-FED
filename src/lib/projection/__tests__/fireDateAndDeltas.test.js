import { describe, expect, it } from 'vitest';
import { findFireDate, withSeparationAge } from '../fireDate';
import { compareSeparationShift, oneYearDeltas, separationSweep } from '../deltas';
import { runStressTests, STRESS_TESTS } from '../../analytics/stressTests';
import { monteCarloBySeparationAge, runMonteCarloAnalytics } from '../../analytics/monteCarlo';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../scenarios/schema';

const base = () =>
  normalizeScenario({
    ...createDefaultScenario('t'),
    profile: { currentAge: 45, separationAge: 57, socialSecurityClaimAge: 67 },
    tsp: { currentBalance: 500000, annualSalary: 120000, monthlyContributionPercent: 12, annualSalaryGrowthRate: 2, inflationRate: 2.5 },
    fers: { yearsOfService: 18, high3Salary: 115000 },
    fire: { monthlyFireIncomeGoal: 5500, sideHustleIncome: 0 },
    summary: { monthlyExpenses: 5000, socialSecurity: { mode: 'manual', monthlyBenefit: 2500 } },
  });

describe('the Federal FIRE Date', () => {
  it('finds the earliest sustainable separation age', () => {
    const r = findFireDate(base());
    expect(r.found).toBe(true);
    expect(r.separationAge).toBeGreaterThanOrEqual(45);
    expect(r.separationAge).toBeLessThanOrEqual(62);
    expect(r.timeline.summary.isSustainable).toBe(true);
    // Every age tried before it was not sustainable.
    for (const t of r.tried.slice(0, -1)) expect(t.isSustainable).toBe(false);
  });

  it('reports not found when nothing works before the cap', () => {
    const r = findFireDate(applyScenarioUpdates(base(), { fire: { monthlyFireIncomeGoal: 40000 } }), { maxSeparationAge: 60 });
    expect(r.found).toBe(false);
    expect(r.tried).toHaveLength(16);
  });

  it('withSeparationAge resets a chosen annuity start that is no longer later than separation', () => {
    const s = applyScenarioUpdates(base(), { profile: { separationAge: 50, annuityStartAge: 60 } });
    expect(withSeparationAge(s, 62).profile.annuityStartAge).toBeNull();
    expect(withSeparationAge(s, 52).profile.annuityStartAge).toBe(60);
  });
});

describe('one-year deltas', () => {
  it('staying from 56 to 57 gains MRA+30 and the supplement', () => {
    const s = applyScenarioUpdates(base(), { profile: { separationAge: 56 } });
    const d = compareSeparationShift(s, 1);
    expect(d.from.path).toBe('deferred');
    expect(d.to.path).toBe('immediate_unreduced');
    const keys = d.thresholdChanges.map((c) => c.key);
    expect(keys).toContain('srs');
    expect(keys).toContain('fehb');
    expect(d.deltas.pensionAnnualAtStart.delta).toBeGreaterThan(0);
    expect(d.deltas.lifetimeSalary.delta).toBeGreaterThan(100000);
  });

  it('staying from 61 to 62 with 20+ years gains the 1.1% multiplier', () => {
    const s = applyScenarioUpdates(base(), { profile: { separationAge: 61 } });
    const d = compareSeparationShift(s, 1);
    expect(d.from.multiplier).toBe(0.01);
    expect(d.to.multiplier).toBe(0.011);
    expect(d.thresholdChanges.map((c) => c.key)).toContain('multiplier');
  });

  it('produces both cards and a sweep', () => {
    const d = oneYearDeltas(base());
    expect(d.earlier.years).toBe(-1);
    expect(d.later.years).toBe(1);
    const sweep = separationSweep(base(), { fromAge: 50, toAge: 60 });
    expect(sweep).toHaveLength(11);
    expect(sweep[0].separationAge).toBe(50);
  });
});

describe('stress tests', () => {
  it('runs every named test and reports survival', () => {
    const r = runStressTests(base());
    expect(r.results).toHaveLength(STRESS_TESTS.length);
    expect(r.totalCount).toBe(STRESS_TESTS.length);
    expect(r.weakest).not.toBeNull();
    const crash = r.results.find((x) => x.key === 'crash_at_separation');
    expect(crash.balanceAtEndDelta).toBeLessThan(0);
    const longer = r.results.find((x) => x.key === 'live_to_100');
    expect(longer.balanceAtEnd).toBeLessThanOrEqual(r.base.balanceAtEnd);
  });
});

describe('Monte Carlo over the timeline', () => {
  it('reports percentile bands by age, the vulnerable age, and success', () => {
    const r = runMonteCarloAnalytics({ scenario: base(), settings: { simulations: 120, seed: 7 } });
    expect(r.byAge[0].age).toBe(45);
    expect(r.byAge.length).toBe(51);
    const at70 = r.byAge.find((b) => b.age === 70);
    expect(at70.p10).toBeLessThanOrEqual(at70.p50);
    expect(at70.p50).toBeLessThanOrEqual(at70.p90);
    expect(r.outcomes.probabilityFundsLastToEndAge).toBeGreaterThanOrEqual(0);
    expect(r.outcomes.probabilityFundsLastToEndAge).toBeLessThanOrEqual(1);
    expect(r.outcomes.mostVulnerableAge).toBeGreaterThanOrEqual(57);
    expect(r.outcomes.balanceAtRetirement.p50).toBeGreaterThan(500000);
  });

  it('is reproducible for a seed', () => {
    const a = runMonteCarloAnalytics({ scenario: base(), settings: { simulations: 100, seed: 3 } });
    const b = runMonteCarloAnalytics({ scenario: base(), settings: { simulations: 100, seed: 3 } });
    expect(a.outcomes.balanceAtEnd.p50).toBe(b.outcomes.balanceAtEnd.p50);
  });

  it('compares separation ages', () => {
    const rows = monteCarloBySeparationAge(base(), { fromAge: 55, toAge: 57, settings: { simulations: 60, seed: 1 }, withSeparationAge });
    expect(rows).toHaveLength(3);
    expect(rows[2].probabilityFundsLastToEndAge).toBeGreaterThanOrEqual(rows[0].probabilityFundsLastToEndAge - 0.2);
  });
});
