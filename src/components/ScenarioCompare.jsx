import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { CategoryScale, Chart as ChartJS, Legend, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js';
import { useScenario } from '../contexts/ScenarioContext';
import { useAuth } from '../contexts/AuthContext';
import { FEATURES, hasEntitlement } from '../lib/entitlements';
import { buildTimeline } from '../lib/projection/timeline';
import { runMonteCarloAnalytics } from '../lib/analytics/monteCarlo';
import { trackEvent } from '../lib/telemetry';
import { buildComparisonRows, cellTone, formatDiffValue, isUniformRow } from './compare/compareRows';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export const MIN_COMPARE = 2;
export const MAX_COMPARE = 5;
const MONTE_CARLO_SIMULATIONS = 300;

const SERIES_COLORS = ['#1e3a8a', '#0d9488', '#d97706', '#be185d', '#6d28d9'];

const TONE_CLASSES = Object.freeze({
  better: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-200',
  worse: 'bg-rose-50 text-rose-800 dark:bg-rose-900/25 dark:text-rose-200',
});

function compactMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

function ScenarioCompare() {
  const { scenarios, currentScenario, getScenarioDiff } = useScenario();
  const { entitlements } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const canCompare = hasEntitlement(entitlements, FEATURES.SCENARIO_COMPARE);
  const canMonteCarlo = hasEntitlement(entitlements, FEATURES.ADVANCED_ANALYTICS);

  // The selection starts from the ids handed over by the Scenarios page, with
  // the current scenario first so it is the baseline; otherwise just the
  // current scenario.
  const [selectedIds, setSelectedIds] = useState(() => {
    const handed = Array.isArray(location.state?.scenarioIds) ? location.state.scenarioIds : [];
    const ordered = currentScenario && handed.includes(currentScenario.id)
      ? [currentScenario.id, ...handed.filter((id) => id !== currentScenario.id)]
      : handed;
    if (ordered.length > 0) return ordered.slice(0, MAX_COMPARE);
    return currentScenario ? [currentScenario.id] : [];
  });
  const [highlightOnly, setHighlightOnly] = useState(true);
  const [monteCarloById, setMonteCarloById] = useState({});
  const [isRunningMonteCarlo, setIsRunningMonteCarlo] = useState(false);

  // Scenarios load asynchronously: keep the selection to ids that exist and
  // seed it with the current scenario once one appears.
  useEffect(() => {
    const known = new Set(scenarios.map((s) => s.id));
    setSelectedIds((prev) => {
      const kept = prev.filter((id) => known.has(id));
      if (kept.length === 0 && currentScenario && known.has(currentScenario.id)) return [currentScenario.id];
      return kept.length === prev.length ? prev : kept;
    });
  }, [scenarios, currentScenario]);

  const selectedScenarios = useMemo(() => {
    const byId = new Map(scenarios.map((s) => [s.id, s]));
    return selectedIds.map((id) => byId.get(id)).filter(Boolean);
  }, [scenarios, selectedIds]);

  // One timeline per column. A scenario whose timeline cannot be built keeps
  // its column with empty cells rather than taking the page down.
  const columns = useMemo(
    () =>
      selectedScenarios.map((scenario) => {
        try {
          return { scenario, timeline: buildTimeline(scenario), error: null };
        } catch (error) {
          return { scenario, timeline: null, error };
        }
      }),
    [selectedScenarios]
  );

  const monteCarloColumns = useMemo(
    () => (Object.keys(monteCarloById).length ? columns.map((c) => monteCarloById[c.scenario.id] ?? null) : null),
    [columns, monteCarloById]
  );

  const rows = useMemo(
    () => buildComparisonRows(columns.map((c) => c.timeline), { monteCarlo: monteCarloColumns }),
    [columns, monteCarloColumns]
  );

  const visibleRows = useMemo(() => (highlightOnly ? rows.filter((r) => !isUniformRow(r)) : rows), [rows, highlightOnly]);

  const inputDiffs = useMemo(() => {
    const baseline = selectedScenarios[0];
    if (!baseline) return [];
    return selectedScenarios.slice(1).map((scenario) => ({ scenario, diffs: getScenarioDiff(baseline, scenario) }));
  }, [selectedScenarios, getScenarioDiff]);

  const chart = useMemo(() => {
    const built = columns.filter((c) => c.timeline);
    if (built.length === 0) return null;
    const first = Math.min(...built.map((c) => c.timeline.rows[0].age));
    const last = Math.max(...built.map((c) => c.timeline.rows[c.timeline.rows.length - 1].age));
    const labels = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    return {
      labels,
      datasets: built.map((c, i) => {
        const byAge = new Map(c.timeline.rows.map((r) => [r.age, r.balances.total]));
        const color = SERIES_COLORS[i % SERIES_COLORS.length];
        return {
          label: c.scenario.name,
          data: labels.map((a) => byAge.get(a) ?? null),
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 8,
          tension: 0.15,
          spanGaps: false,
        };
      }),
    };
  }, [columns]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: '#64748b', usePointStyle: true } },
        tooltip: {
          callbacks: {
            title: (items) => (items[0] ? `Age ${items[0].label}` : ''),
            label: (item) => `${item.dataset.label}: ${compactMoney(item.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { title: { display: true, text: 'Age', color: '#64748b' }, ticks: { color: '#64748b', maxTicksLimit: 12 }, grid: { display: false } },
        y: { ticks: { color: '#64748b', callback: (v) => compactMoney(v) }, grid: { color: '#e2e8f0' } },
      },
    }),
    []
  );

  useEffect(() => {
    trackEvent('compare_opened', { selectedCount: selectedIds.length });
    // Only the first open is worth recording.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleScenario = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  };

  const makeBaseline = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? [id, ...prev.filter((x) => x !== id)] : prev));
  };

  const runMonteCarlo = () => {
    if (!canMonteCarlo) {
      navigate('/pro-features', { state: { reason: 'compare_monte_carlo_pro' } });
      return;
    }
    if (isRunningMonteCarlo || columns.length === 0) return;
    setIsRunningMonteCarlo(true);
    trackEvent('compare_monte_carlo_started', { selectedCount: columns.length, simulations: MONTE_CARLO_SIMULATIONS });
    // Yield once so the button can show its running state before the work starts.
    setTimeout(() => {
      const results = {};
      for (const c of columns) {
        try {
          results[c.scenario.id] = runMonteCarloAnalytics({
            scenario: c.scenario,
            settings: { simulations: MONTE_CARLO_SIMULATIONS },
          });
        } catch (error) {
          console.warn('Monte Carlo failed for scenario', c.scenario.name, error);
          results[c.scenario.id] = null;
        }
      }
      setMonteCarloById(results);
      setIsRunningMonteCarlo(false);
    }, 0);
  };

  if (!canCompare) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-bold navy-text mb-2">Scenario Comparison</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Scenario comparison is a Pro feature. Upgrade on the Pro Features page to unlock it.
        </p>
        <div className="flex justify-center gap-3">
          <Link className="btn-secondary" to="/scenarios">Back to Scenarios</Link>
          <Link className="btn-primary" to="/pro-features" state={{ reason: 'compare_pro' }}>
            View Pro Features
          </Link>
        </div>
      </div>
    );
  }

  const enoughSelected = columns.length >= MIN_COMPARE;
  const monteCarloDone = Boolean(monteCarloColumns) && columns.every((c) => c.scenario.id in monteCarloById);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold navy-text">Scenario Comparison</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Pick {MIN_COMPARE} to {MAX_COMPARE} scenarios. Each is run through the full timeline; the first is the baseline.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={() => navigate(-1)}>Back</button>
          <Link className="btn-secondary" to="/scenarios">Scenarios</Link>
        </div>
      </div>

      {/* Selection */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold navy-text">Scenarios to compare</h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">{selectedIds.length} of {MAX_COMPARE} selected</span>
        </div>
        {scenarios.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">No saved scenarios yet.</p>
        ) : (
          <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
            {scenarios.map((s) => {
              const checked = selectedIds.includes(s.id);
              const disabled = !checked && selectedIds.length >= MAX_COMPARE;
              const position = selectedIds.indexOf(s.id);
              return (
                <li key={s.id}>
                  <label
                    className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                      checked
                        ? 'border-navy-300 dark:border-navy-700 bg-navy-50 dark:bg-navy-900/30'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    } ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleScenario(s.id)}
                      aria-label={`Compare ${s.name}`}
                    />
                    <span className="flex-1 text-slate-800 dark:text-slate-100 truncate">
                      {s.name}
                      {currentScenario?.id === s.id && (
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">(current)</span>
                      )}
                    </span>
                    {checked && (
                      position === 0 ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-navy-100 text-navy-800 dark:bg-navy-800 dark:text-navy-100">
                          Baseline
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="text-xs text-navy-700 dark:text-navy-300 hover:underline"
                          onClick={(e) => {
                            e.preventDefault();
                            makeBaseline(s.id);
                          }}
                        >
                          Make baseline
                        </button>
                      )
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!enoughSelected ? (
        <div className="card p-8 text-center">
          <p className="text-slate-600 dark:text-slate-400">Select at least {MIN_COMPARE} scenarios to compare.</p>
        </div>
      ) : (
        <>
          {/* Inputs that differ */}
          <div className="card p-6 mb-6">
            <h2 className="text-lg font-semibold navy-text mb-1">Inputs that differ from the baseline</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Baseline: <span className="font-medium">{selectedScenarios[0]?.name}</span>. These are the inputs behind any
              difference in the table below.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {inputDiffs.map(({ scenario, diffs }) => (
                <div key={scenario.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                  <div className="font-medium text-slate-800 dark:text-slate-100 mb-2">{scenario.name}</div>
                  {diffs.length === 0 ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">No tracked inputs differ.</div>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {diffs.map((d) => (
                        <li key={d.path} className="flex justify-between gap-3">
                          <span className="text-slate-600 dark:text-slate-400">{d.label}</span>
                          <span className="text-slate-800 dark:text-slate-100 text-right">
                            {formatDiffValue(d, d.from)} <span className="text-slate-400">→</span> {formatDiffValue(d, d.to)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Comparison table */}
          <div className="card p-6 mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold navy-text">What the timeline says</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Green is better than the baseline for that row, red is worse. Rows with no direction are descriptive.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={highlightOnly}
                    onChange={(e) => setHighlightOnly(e.target.checked)}
                  />
                  Highlight only what changes
                </label>
                <button
                  type="button"
                  className="btn-primary flex items-center gap-2"
                  onClick={runMonteCarlo}
                  disabled={isRunningMonteCarlo}
                  title={canMonteCarlo ? `${MONTE_CARLO_SIMULATIONS} simulations per scenario` : 'Pro feature'}
                >
                  {isRunningMonteCarlo ? 'Running…' : monteCarloDone ? 'Re-run Monte Carlo' : 'Run Monte Carlo for each'}
                  {!canMonteCarlo && <span className="text-xs opacity-80">(Pro)</span>}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600 dark:text-slate-300">
                    <th className="py-2 pr-4 font-medium">Metric</th>
                    {columns.map((c, idx) => (
                      <th key={c.scenario.id} className="py-2 pr-4 font-medium">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length] }}
                            aria-hidden="true"
                          />
                          <span>{c.scenario.name}</span>
                          {idx === 0 && <span className="text-xs text-slate-500 dark:text-slate-400">baseline</span>}
                        </div>
                        {c.error && (
                          <div className="text-xs font-normal text-rose-600 dark:text-rose-300 mt-1">Timeline could not be built.</div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-slate-700 dark:text-slate-200">
                  {visibleRows.length === 0 ? (
                    <tr className="border-t border-slate-200 dark:border-slate-700">
                      <td className="py-4 text-slate-500 dark:text-slate-400" colSpan={columns.length + 1}>
                        Every row is identical across the selected scenarios.
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((row) => (
                      <tr key={row.key} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="py-2.5 pr-4 font-medium whitespace-nowrap">{row.label}</td>
                        {row.cells.map((cell, idx) => {
                          const tone = cellTone(row, idx);
                          return (
                            <td
                              key={columns[idx]?.scenario.id ?? idx}
                              className={`py-2.5 pr-4 whitespace-nowrap rounded ${tone ? TONE_CLASSES[tone] : ''}`}
                            >
                              {cell.text}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {monteCarloDone && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                Monte Carlo: {MONTE_CARLO_SIMULATIONS} simulations per scenario, each the full timeline with returns drawn from the
                allocation&apos;s mean and volatility.
              </p>
            )}
          </div>

          {/* Balances by age */}
          {chart && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold navy-text mb-1">Portfolio balance by age</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Total of Traditional, Roth, taxable and cash, nominal dollars, one line per scenario.
              </p>
              <div className="h-80">
                <Line data={chart} options={chartOptions} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ScenarioCompare;
