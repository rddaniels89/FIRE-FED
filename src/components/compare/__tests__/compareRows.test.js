import { describe, expect, it } from 'vitest';
import { COMPARISON_METRICS, buildComparisonRows, cellTone, formatDiffValue, isUniformRow, toReportComparison } from '../compareRows';
import { buildTimeline } from '../../../lib/projection/timeline';
import { applyScenarioUpdates, createDefaultScenario, getScenarioDiff, normalizeScenario } from '../../../lib/scenarios/schema';

const base = () =>
  normalizeScenario({
    ...createDefaultScenario('Base'),
    profile: { currentAge: 45, separationAge: 57, socialSecurityClaimAge: 67 },
    tsp: { currentBalance: 500000, annualSalary: 120000, monthlyContributionPercent: 12, annualSalaryGrowthRate: 2, inflationRate: 2.5 },
    fers: { yearsOfService: 18, high3Salary: 115000 },
    fire: { monthlyFireIncomeGoal: 5500, sideHustleIncome: 0 },
    summary: { monthlyExpenses: 5000, socialSecurity: { mode: 'manual', monthlyBenefit: 2500 } },
  });

describe('comparison rows', () => {
  it('reads every listed metric from each timeline in column order', () => {
    const a = buildTimeline(base());
    const b = buildTimeline(applyScenarioUpdates(base(), { profile: { separationAge: 62 } }));
    const rows = buildComparisonRows([a, b]);
    expect(rows).toHaveLength(COMPARISON_METRICS.length);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.separationAge.cells.map((c) => c.text)).toEqual(['57', '62']);
    expect(byKey.multiplier.cells.map((c) => c.text)).toEqual(['No', 'Yes']);
    expect(byKey.path.cells[1].text).toBe(b.plan.pathLabel);
    expect(byKey.sustainable.cells[0].text).toBe(a.summary.isSustainable ? 'Yes' : 'No');
    for (const key of ['separationAge', 'path', 'yearsWorked', 'lifetimeSalary', 'balanceAtSeparation', 'pensionAtStart', 'multiplier', 'srsEligible', 'srsAnnual', 'fehb', 'tspPenaltyFreeAge', 'bridgeYears', 'bridgeFunded', 'longevity', 'minBalance', 'balanceAtEnd', 'cumulativeTaxes', 'cumulativePenalties', 'sustainable']) {
      expect(byKey[key]).toBeTruthy();
    }
  });

  it('colour-codes columns against the baseline in the direction each metric improves', () => {
    const a = buildTimeline(base());
    const b = buildTimeline(applyScenarioUpdates(base(), { profile: { separationAge: 62 } }));
    const rows = buildComparisonRows([a, b]);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    // Five more years of salary: better. Baseline column is never coloured.
    expect(cellTone(byKey.lifetimeSalary, 1)).toBe('better');
    expect(cellTone(byKey.lifetimeSalary, 0)).toBeNull();
    // Descriptive rows are never coloured.
    expect(cellTone(byKey.separationAge, 1)).toBeNull();
    expect(cellTone(byKey.path, 1)).toBeNull();
    // Lower is better for taxes: more taxes reads as worse.
    const taxes = byKey.cumulativeTaxes;
    const expected = taxes.cells[1].sort > taxes.cells[0].sort ? 'worse' : 'better';
    expect(cellTone(taxes, 1)).toBe(expected);
  });

  it('marks a row uniform only when every column reads the same', () => {
    const a = buildTimeline(base());
    const rows = buildComparisonRows([a, a, a]);
    expect(rows.every(isUniformRow)).toBe(true);
    const b = buildTimeline(applyScenarioUpdates(base(), { profile: { separationAge: 58 } }));
    const mixed = buildComparisonRows([a, b]);
    expect(mixed.find((r) => r.key === 'separationAge') && isUniformRow(mixed.find((r) => r.key === 'separationAge'))).toBe(false);
  });

  it('adds a Monte Carlo row when results are supplied and tolerates missing columns', () => {
    const a = buildTimeline(base());
    const rows = buildComparisonRows([a, null], { monteCarlo: [{ outcomes: { probabilityFundsLastToEndAge: 0.87 } }, null] });
    const mc = rows.find((r) => r.key === 'monteCarloSuccess');
    expect(mc.cells[0].text).toBe('87%');
    expect(mc.cells[1].text).toBe('—');
    expect(rows.find((r) => r.key === 'balanceAtEnd').cells[1].text).toBe('—');
  });

  it('formats scenario input differences by what the field means', () => {
    const diffs = getScenarioDiff(base(), applyScenarioUpdates(base(), { profile: { separationAge: 60, annuityStartAge: null }, tsp: { monthlyContributionPercent: 15, annualSalary: 130000 }, summary: { assumptions: { safeWithdrawalRate: 0.035 } } }));
    const byPath = Object.fromEntries(diffs.map((d) => [d.path, d]));
    expect(formatDiffValue(byPath['tsp.annualSalary'], 130000)).toBe('$130,000');
    expect(formatDiffValue(byPath['tsp.monthlyContributionPercent'], 15)).toBe('15%');
    expect(formatDiffValue(byPath['summary.assumptions.safeWithdrawalRate'], 0.035)).toBe('3.5%');
    expect(formatDiffValue({ path: 'profile.annuityStartAge' }, null)).toBe('Path default');
    expect(formatDiffValue({ path: 'household.spouse.enabled' }, true)).toBe('Yes');
    expect(formatDiffValue({ path: 'profile.retirementPath' }, 'mra10_postponed')).toBe('mra10 postponed');
  });

  it('flattens rows into the shape the PDF comparison section reads', () => {
    const a = buildTimeline(base());
    const report = toReportComparison(buildComparisonRows([a, a]), ['One', 'Two']);
    expect(report.columns).toEqual(['One', 'Two']);
    expect(report.rows[0]).toEqual({ label: 'Separation age', values: ['57', '57'] });
  });
});
