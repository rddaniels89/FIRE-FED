import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScenario } from '../contexts/ScenarioContext';
import { useAuth } from '../contexts/AuthContext';
import { FEATURES, hasEntitlement } from '../lib/entitlements';
import { buildOptimizationSuggestions } from '../lib/optimization/optimizer';
import { trackEvent } from '../lib/telemetry';

const FUND_STDDEV = Object.freeze({ G: 0.01, F: 0.05, C: 0.16, S: 0.18, I: 0.17 });

function clampNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function toWeights(allocationPct) {
  const a = allocationPct || {};
  const entries = ['G', 'F', 'C', 'S', 'I'].map((k) => [k, clampNumber(a[k], 0)]);
  const sum = entries.reduce((acc, [, v]) => acc + v, 0);
  if (sum <= 0) return { G: 0.1, F: 0.2, C: 0.4, S: 0.2, I: 0.1 };
  const w = {};
  for (const [k, v] of entries) w[k] = v / sum;
  return w;
}

function portfolioMean({ weights, fundReturnsPct }) {
  const fr = fundReturnsPct || {};
  return (
    weights.G * (clampNumber(fr.G, 2) / 100) +
    weights.F * (clampNumber(fr.F, 3) / 100) +
    weights.C * (clampNumber(fr.C, 7) / 100) +
    weights.S * (clampNumber(fr.S, 8) / 100) +
    weights.I * (clampNumber(fr.I, 6) / 100)
  );
}

function portfolioStdDev({ weights }) {
  const varApprox =
    Math.pow(weights.G * FUND_STDDEV.G, 2) +
    Math.pow(weights.F * FUND_STDDEV.F, 2) +
    Math.pow(weights.C * FUND_STDDEV.C, 2) +
    Math.pow(weights.S * FUND_STDDEV.S, 2) +
    Math.pow(weights.I * FUND_STDDEV.I, 2);
  return Math.sqrt(varApprox);
}

const RISK_PRESETS = Object.freeze([
  {
    key: 'conservative',
    label: 'Conservative',
    allocation: { G: 40, F: 30, C: 20, S: 5, I: 5 },
    description: 'Lower volatility, lower expected growth.',
  },
  {
    key: 'balanced',
    label: 'Balanced',
    allocation: { G: 10, F: 20, C: 40, S: 20, I: 10 },
    description: 'A middle-of-the-road allocation (app default).',
  },
  {
    key: 'aggressive',
    label: 'Aggressive',
    allocation: { G: 5, F: 5, C: 50, S: 25, I: 15 },
    description: 'Higher volatility, higher expected growth.',
  },
]);

export default function OptimizationPanel() {
  const navigate = useNavigate();
  const { entitlements } = useAuth();
  const { currentScenario, updateCurrentScenario } = useScenario();
  const canOptimize = hasEntitlement(entitlements, FEATURES.OPTIMIZATION);

  const [selectedPresetKey, setSelectedPresetKey] = useState('balanced');

  const optimizer = useMemo(() => {
    if (!currentScenario) return null;
    return buildOptimizationSuggestions(currentScenario);
  }, [currentScenario]);

  const selectedPreset = useMemo(
    () => RISK_PRESETS.find((p) => p.key === selectedPresetKey) || RISK_PRESETS[1],
    [selectedPresetKey]
  );

  const presetStats = useMemo(() => {
    const tsp = currentScenario?.tsp ?? {};
    const weights = toWeights(selectedPreset.allocation);
    const mean = portfolioMean({ weights, fundReturnsPct: tsp.fundReturns });
    const vol = portfolioStdDev({ weights });
    return { mean, vol };
  }, [currentScenario, selectedPreset]);

  const applyPreset = async () => {
    if (!canOptimize) {
      navigate('/pro-features', { state: { reason: 'optimization_pro' } });
      return;
    }
    if (!currentScenario) return;
    await updateCurrentScenario({
      tsp: { allocation: { ...selectedPreset.allocation } },
    });
    trackEvent('pro_allocation_preset_applied', { preset: selectedPreset.key });
  };

  const applySuggestion = async (s) => {
    if (!canOptimize) {
      navigate('/pro-features', { state: { reason: 'optimization_pro' } });
      return;
    }
    if (!currentScenario) return;

    const next = {
      tsp: {
        retirementAge: s.retirementAge,
        monthlyContributionPercent: s.contributionPct,
      },
      fers: {
        retirementAge: s.retirementAge,
      },
      summary: {
        monthlyExpenses: s.monthlyExpenses,
      },
    };

    await updateCurrentScenario(next);
    trackEvent('pro_optimizer_suggestion_applied', {
      retirementAge: s.retirementAge,
      contributionPct: s.contributionPct,
    });
  };

  return (
    <div className="card p-6 mb-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold navy-text">🎯 Optimization suggestions</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Explore tradeoffs to reach FIRE sooner (simplified, educational).
          </p>
        </div>
        {!canOptimize && (
          <button
            className="btn-primary"
            onClick={() => navigate('/pro-features', { state: { reason: 'optimization_pro' } })}
          >
            Unlock Pro
          </button>
        )}
      </div>

      {/* Parameter search suggestions */}
      <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="font-semibold text-slate-900 dark:text-white mb-2">Quick optimizer</div>
        {!optimizer ? (
          <div className="text-sm text-slate-600 dark:text-slate-400">No scenario loaded.</div>
        ) : (
          <>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Baseline: retirement age <span className="font-medium">{optimizer.baseline.retirementAge}</span>, contribution{' '}
              <span className="font-medium">{optimizer.baseline.contributionPct}%</span>, expenses{' '}
              <span className="font-medium">{formatMoney(optimizer.baseline.monthlyExpenses)}/mo</span>
              {optimizer.baseline.earliestFireAge ? (
                <>
                  {' '}→ earliest FIRE age <span className="font-medium">{optimizer.baseline.earliestFireAge}</span>
                </>
              ) : (
                ''
              )}
            </div>

            {optimizer.suggestions.length === 0 ? (
              <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                No clear improvement found in the small search space. Try increasing your FIRE goal inputs or adjusting assumptions.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {optimizer.suggestions.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/40"
                  >
                    <div className="text-sm text-slate-700 dark:text-slate-200">
                      <div className="font-medium">
                        Estimated earliest FIRE age: {s.earliestFireAge}
                        {Number.isFinite(s.improvementYears) && s.improvementYears > 0 ? ` (−${s.improvementYears}y)` : ''}
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 mt-1">
                        Retirement age {s.retirementAge} · Contribution {s.contributionPct}% · Expenses {formatMoney(s.monthlyExpenses)}/mo
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn-secondary"
                        onClick={() => navigate('/summary')}
                        title="Review the Summary dashboard after applying"
                      >
                        Review
                      </button>
                      <button className="btn-primary" onClick={() => applySuggestion(s)}>
                        Apply
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!canOptimize && (
          <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Pro required to apply recommendations.
          </div>
        )}
      </div>

      {/* Allocation presets */}
      <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="font-semibold text-slate-900 dark:text-white mb-2">TSP allocation presets</div>
        <div className="grid md:grid-cols-3 gap-3">
          {RISK_PRESETS.map((p) => (
            <button
              key={p.key}
              className={`text-left rounded-lg border p-4 transition-colors ${
                selectedPresetKey === p.key
                  ? 'border-navy-300 dark:border-navy-700 bg-navy-50 dark:bg-navy-900/30'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
              onClick={() => setSelectedPresetKey(p.key)}
              type="button"
            >
              <div className="font-medium text-slate-900 dark:text-white">{p.label}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{p.description}</div>
            </button>
          ))}
        </div>

        <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/40">
            <div className="font-medium text-slate-800 dark:text-slate-200 mb-2">Allocation</div>
            <div className="grid grid-cols-5 gap-2 text-xs text-slate-600 dark:text-slate-400">
              {(['G', 'F', 'C', 'S', 'I']).map((k) => (
                <div key={k} className="text-center">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">{k}</div>
                  <div>{selectedPreset.allocation[k] ?? 0}%</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/40">
            <div className="font-medium text-slate-800 dark:text-slate-200 mb-2">Estimated profile</div>
            <div className="text-slate-600 dark:text-slate-400">
              Mean return: <span className="font-medium text-slate-800 dark:text-slate-200">{formatPercent(presetStats.mean)}</span>
            </div>
            <div className="text-slate-600 dark:text-slate-400 mt-1">
              Volatility: <span className="font-medium text-slate-800 dark:text-slate-200">{formatPercent(presetStats.vol)}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={applyPreset}>
            Apply allocation preset
          </button>
        </div>
      </div>
    </div>
  );
}


