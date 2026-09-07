/**
 * The rows of the scenario comparison table, read from each scenario's
 * timeline. Kept apart from the page so the "better / worse than baseline"
 * logic can be tested without React.
 */

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const money = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
};

export const pct = (v, digits = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : '—';
};

const yesNo = (v) => (v ? 'Yes' : 'No');
const age = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

export const FEHB_OUTCOME_LABELS = Object.freeze({
  continues: 'Continues',
  suspended_then_reinstated: 'Suspended, then reinstated',
  lost_permanently: 'Lost',
  not_enrolled_long_enough: 'Lost (under five years)',
});

const FEHB_RANK = Object.freeze({
  continues: 2,
  suspended_then_reinstated: 1,
  lost_permanently: 0,
  not_enrolled_long_enough: 0,
});

/**
 * Each metric reads a value from a timeline. `better` says which direction
 * counts as an improvement over the baseline column; null means the metric is
 * descriptive and is never colour-coded.
 */
export const COMPARISON_METRICS = Object.freeze([
  { key: 'separationAge', label: 'Separation age', better: null, read: (t) => t.plan.separationAge, format: age },
  { key: 'path', label: 'Retirement path', better: null, read: (t) => t.plan.pathLabel, format: (v) => String(v) },
  { key: 'yearsWorked', label: 'Years worked (eligibility service)', better: null, read: (t) => t.plan.service.eligibilityYears, format: (v) => `${num(v).toFixed(1)} yrs` },
  { key: 'lifetimeSalary', label: 'Lifetime salary (from today)', better: 'higher', read: (t) => t.summary.cumulativeSalary, format: money },
  { key: 'balanceAtSeparation', label: 'TSP / portfolio at separation', better: 'higher', read: (t) => t.summary.balanceAtSeparation, format: money },
  { key: 'pensionAtStart', label: 'Pension at start (annual)', better: 'higher', read: (t) => t.plan.annuity.annualAtStart, format: money },
  { key: 'multiplier', label: '1.1% multiplier', better: 'higher', read: (t) => (num(t.plan.annuity.multiplier) >= 0.011 ? 1 : 0), format: yesNo },
  { key: 'srsEligible', label: 'SRS eligible', better: 'higher', read: (t) => (t.plan.srs.isEligible ? 1 : 0), format: yesNo },
  { key: 'srsAnnual', label: 'SRS (annual)', better: 'higher', read: (t) => t.plan.srs.annual, format: money },
  { key: 'fehb', label: 'FEHB in retirement', better: 'higher', read: (t) => FEHB_RANK[t.plan.fehb.outcome] ?? 0, format: (v, t) => FEHB_OUTCOME_LABELS[t.plan.fehb.outcome] ?? String(t.plan.fehb.outcome ?? '—') },
  { key: 'tspPenaltyFreeAge', label: 'TSP penalty-free age', better: 'lower', read: (t) => t.plan.tspAccess.traditionalPenaltyFreeAge, format: age },
  { key: 'bridgeYears', label: 'Bridge years', better: 'lower', read: (t) => t.summary.bridge.years, format: (v) => String(num(v)) },
  { key: 'bridgeFunded', label: 'Bridge funded', better: 'higher', read: (t) => t.summary.bridge.fundedPercent, format: (v) => pct(v, 0) },
  { key: 'longevity', label: 'Portfolio longevity', better: 'higher', read: (t) => (t.summary.firstShortfallAge == null ? Infinity : t.summary.firstShortfallAge), format: (v) => (v === Infinity ? 'Lasts to end' : `Runs short at ${age(v)}`) },
  { key: 'minBalance', label: 'Minimum balance', better: 'higher', read: (t) => t.summary.minBalance, format: (v, t) => `${money(v)} at ${age(t.summary.minBalanceAge)}` },
  { key: 'balanceAtEnd', label: 'Ending balance', better: 'higher', read: (t) => t.summary.balanceAtEnd, format: money },
  { key: 'cumulativeTaxes', label: 'Cumulative taxes', better: 'lower', read: (t) => t.summary.cumulativeTaxes, format: money },
  { key: 'cumulativePenalties', label: 'Cumulative penalties', better: 'lower', read: (t) => t.summary.cumulativePenalties, format: money },
  { key: 'sustainable', label: 'Sustainable', better: 'higher', read: (t) => (t.summary.isSustainable ? 1 : 0), format: yesNo },
]);

const EMPTY_CELL = Object.freeze({ text: '—', sort: null });

/**
 * `timelines` is one timeline per column (null where the timeline failed to
 * build). `monteCarlo`, when given, is one Monte Carlo result per column (or
 * null) and adds the success-probability row.
 */
export function buildComparisonRows(timelines, { monteCarlo } = {}) {
  const rows = COMPARISON_METRICS.map((m) => ({
    key: m.key,
    label: m.label,
    better: m.better,
    cells: timelines.map((t) => {
      if (!t) return EMPTY_CELL;
      try {
        const v = m.read(t);
        return { text: m.format(v, t), sort: typeof v === 'number' ? v : null };
      } catch {
        return EMPTY_CELL;
      }
    }),
  }));

  if (Array.isArray(monteCarlo) && monteCarlo.some(Boolean)) {
    rows.push({
      key: 'monteCarloSuccess',
      label: 'Probability funds last to end',
      better: 'higher',
      cells: monteCarlo.map((r) => {
        const p = r?.outcomes?.probabilityFundsLastToEndAge;
        if (p == null) return EMPTY_CELL;
        return { text: pct(num(p) * 100, 0), sort: num(p) };
      }),
    });
  }

  return rows;
}

/** True when every column shows the same text. */
export function isUniformRow(row) {
  if (!row?.cells?.length) return true;
  return row.cells.every((c) => c.text === row.cells[0].text);
}

/**
 * 'better' | 'worse' | null for a column against the baseline column (index
 * 0). Descriptive rows and the baseline itself are never coloured.
 */
export function cellTone(row, index) {
  if (index === 0 || !row?.better) return null;
  const base = row.cells[0];
  const cell = row.cells[index];
  if (!base || !cell || base.sort == null || cell.sort == null) return null;
  if (base.sort === cell.sort || base.text === cell.text) return null;
  const higherIsBetter = row.better === 'higher';
  return cell.sort > base.sort === higherIsBetter ? 'better' : 'worse';
}

const MONEY_PATHS = /(balance|salary|income|expenses|monthlybenefit|high3|goal)/i;

/** A scenario-diff value as the user would read it. */
export function formatDiffValue(diff, value) {
  if (value === null || value === undefined || value === '') {
    return diff?.path === 'profile.annuityStartAge' ? 'Path default' : '—';
  }
  if (typeof value === 'boolean') return yesNo(value);
  if (typeof value === 'number') {
    if (diff?.path === 'summary.assumptions.safeWithdrawalRate') return pct(value * 100, 1);
    if (/percent/i.test(diff?.path ?? '')) return pct(value, 0);
    if (MONEY_PATHS.test(diff?.path ?? '')) return money(value);
    return String(value);
  }
  return String(value).replace(/_/g, ' ');
}

/** The rows as plain text, for the PDF report's comparison section. */
export function toReportComparison(rows, columnNames) {
  return {
    columns: columnNames,
    rows: rows.map((r) => ({ label: r.label, values: r.cells.map((c) => c.text) })),
  };
}
