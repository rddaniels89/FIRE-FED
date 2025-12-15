import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FEATURES, hasEntitlement } from '../lib/entitlements';
import { runMonteCarloAnalytics } from '../lib/analytics/monteCarlo';
import { trackEvent } from '../lib/telemetry';

function formatPercent(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n * 100)}%`;
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

function computeSocialSecurityFromScenario(scenario) {
  const ss = scenario?.summary?.socialSecurity ?? {};
  const mode = ss.mode ?? 'not_configured'; // 'not_configured' | 'estimate' | 'manual'
  const claimingAge = Number(ss.claimingAge ?? 67);
  const manualMonthly = Number(ss.monthlyBenefit ?? 0);
  const pct = Number(ss.percentOfSalary ?? 30);
  const salary = Number(scenario?.tsp?.annualSalary ?? 0);

  const estimatedMonthly = mode === 'estimate' && salary > 0 ? (salary * (pct / 100)) / 12 : 0;
  const monthly = mode === 'manual' ? manualMonthly : mode === 'estimate' ? estimatedMonthly : 0;

  return {
    mode,
    claimingAge: Number.isFinite(claimingAge) ? claimingAge : 67,
    monthly: Number.isFinite(monthly) ? monthly : 0,
  };
}

export default function AdvancedAnalyticsPanel({
  scenario,
  pensionMonthly,
  pensionStartAge,
  entitlements,
}) {
  const navigate = useNavigate();
  const canAnalytics = hasEntitlement(entitlements, FEATURES.ADVANCED_ANALYTICS);

  const ss = useMemo(() => computeSocialSecurityFromScenario(scenario), [scenario]);

  const [settings, setSettings] = useState({
    simulations: 750,
    endAge: 95,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const run = async () => {
    if (!scenario) return;
    setError('');
    setIsRunning(true);
    try {
      const res = runMonteCarloAnalytics({
        scenario,
        pensionMonthly,
        pensionStartAge,
        socialSecurityMonthly: ss.monthly,
        socialSecurityStartAge: ss.claimingAge,
        settings,
      });
      setResult(res);
      trackEvent('pro_montecarlo_ran', {
        simulations: settings.simulations,
        endAge: settings.endAge,
      });
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Failed to run simulation.');
      trackEvent('pro_montecarlo_failed', { message: e?.message || 'unknown' });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="card p-6 mb-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold navy-text">📊 Advanced analytics</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Monte Carlo simulations estimate variability in outcomes (not guarantees).
          </p>
        </div>
        {!canAnalytics && (
          <button
            className="btn-primary"
            onClick={() => navigate('/pro-features', { state: { reason: 'advanced_analytics_pro' } })}
          >
            Unlock Pro
          </button>
        )}
      </div>

      {!canAnalytics ? (
        <div className="mt-5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
          <div className="font-medium text-slate-900 dark:text-white">Pro feature</div>
          <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Run Monte Carlo simulations, see probability of hitting your FIRE goal, and stress-test retirement cashflow.
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 grid md:grid-cols-3 gap-4">
            <label className="block">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Simulations</div>
              <input
                type="number"
                className="input-field w-full"
                min={100}
                max={5000}
                value={settings.simulations}
                onChange={(e) => setSettings((prev) => ({ ...prev, simulations: Number(e.target.value) }))}
                disabled={isRunning}
              />
            </label>

            <label className="block">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End age</div>
              <input
                type="number"
                className="input-field w-full"
                min={60}
                max={110}
                value={settings.endAge}
                onChange={(e) => setSettings((prev) => ({ ...prev, endAge: Number(e.target.value) }))}
                disabled={isRunning}
              />
            </label>

            <div className="flex items-end">
              <button className="btn-primary w-full" onClick={run} disabled={isRunning}>
                {isRunning ? 'Running…' : 'Run simulation'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-200">
              {error}
            </div>
          )}

          {result && (
            <div className="mt-6 space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">FIRE by desired age</div>
                  <div className="text-2xl font-bold navy-text mt-1">
                    {formatPercent(result.outcomes.probabilityFireByDesiredAge)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Goal: {formatMoney(result.inputs.fireGoalMonthly)}/mo
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Funds last to end age</div>
                  <div className="text-2xl font-bold navy-text mt-1">
                    {formatPercent(result.outcomes.probabilityFundsLastToEndAge)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    End age: {result.inputs.endAge}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Return assumptions</div>
                  <div className="text-sm text-slate-700 dark:text-slate-200 mt-2">
                    Mean: <span className="font-medium">{formatPercent(result.inputs.meanReturn)}</span>
                  </div>
                  <div className="text-sm text-slate-700 dark:text-slate-200 mt-1">
                    Volatility: <span className="font-medium">{formatPercent(result.inputs.portfolioStdDev)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900">
                <div className="font-semibold text-slate-900 dark:text-white mb-2">Balance percentiles</div>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-medium text-slate-700 dark:text-slate-200 mb-1">At retirement age ({result.inputs.retirementAge})</div>
                    <div className="text-slate-600 dark:text-slate-400">
                      P10 {formatMoney(result.outcomes.balanceAtRetirement?.p10)} · P50 {formatMoney(result.outcomes.balanceAtRetirement?.p50)} · P90 {formatMoney(result.outcomes.balanceAtRetirement?.p90)}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-slate-700 dark:text-slate-200 mb-1">At desired FIRE age ({result.inputs.desiredFireAge})</div>
                    <div className="text-slate-600 dark:text-slate-400">
                      P10 {formatMoney(result.outcomes.balanceAtDesiredFireAge?.p10)} · P50 {formatMoney(result.outcomes.balanceAtDesiredFireAge?.p50)} · P90 {formatMoney(result.outcomes.balanceAtDesiredFireAge?.p90)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400">
                Educational estimates only. This model simplifies taxes, withdrawals, and market behavior.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}


