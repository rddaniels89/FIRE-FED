import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import ProjectionDisclaimer from './ProjectionDisclaimer';
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

function formatCount(n) {
  const value = Number(n);
  return Number.isFinite(value) ? value.toLocaleString() : '—';
}

/**
 * Monte Carlo over the lifetime timeline. The pension, Social Security and
 * start ages now come from the scenario itself, so the legacy props
 * (`pensionMonthly`, `pensionStartAge`) are accepted and ignored.
 */
export default function AdvancedAnalyticsPanel({ scenario, entitlements }) {
  const navigate = useNavigate();
  const canAnalytics = hasEntitlement(entitlements, FEATURES.ADVANCED_ANALYTICS);

  const [settings, setSettings] = useState({
    simulations: 750,
    endAge: 95,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const run = () => {
    if (!scenario) return;
    setError('');
    setIsRunning(true);
    // Defer a tick so the button repaints as "Running…" before the work starts.
    setTimeout(() => {
      try {
        const res = runMonteCarloAnalytics({ scenario, settings });
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
    }, 0);
  };

  const outcomes = result?.outcomes;

  return (
    <div className="card p-6 mb-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="inline-flex items-center gap-2 text-xl font-semibold navy-text">
            <BarChart3 className="h-5 w-5 shrink-0 text-navy-600 dark:text-navy-300" strokeWidth={1.75} aria-hidden="true" />
            Advanced analytics
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Monte Carlo simulations estimate variability in outcomes (not guarantees).
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            The fuller version of this lives on{' '}
            <Link to="/plan" className="underline underline-offset-2 text-navy-700 dark:text-navy-300">
              your plan
            </Link>
            , alongside the durability view.
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

          {/* The count behind the answer, stated before the run as well as after. */}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {formatCount(settings.simulations)} simulated lifetimes through age {settings.endAge}, each with its own
            sequence of returns.
          </p>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-200">
              {error}
            </div>
          )}

          {result && outcomes && (
            <div className="mt-6 space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Bridge fully funded</div>
                  <div className="text-2xl font-bold navy-text mt-1">
                    {formatPercent(outcomes.probabilityFireByDesiredAge)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Separation at {result.inputs.retirementAge}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Funds last to end age</div>
                  <div className="text-2xl font-bold navy-text mt-1">
                    {formatPercent(outcomes.probabilityFundsLastToEndAge)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    End age: {result.inputs.endAge}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Most vulnerable age</div>
                  <div className="text-2xl font-bold navy-text mt-1">{outcomes.mostVulnerableAge ?? '—'}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Lowest 10th-percentile balance{' '}
                    {outcomes.mostVulnerableP10Balance != null ? formatMoney(outcomes.mostVulnerableP10Balance) : ''}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900">
                <div className="font-semibold text-slate-900 dark:text-white mb-2">Balance percentiles</div>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-medium text-slate-700 dark:text-slate-200 mb-1">
                      At separation ({result.inputs.retirementAge})
                    </div>
                    <div className="text-slate-600 dark:text-slate-400">
                      p10 {formatMoney(outcomes.balanceAtRetirement?.p10)} · p50 {formatMoney(outcomes.balanceAtRetirement?.p50)} · p90{' '}
                      {formatMoney(outcomes.balanceAtRetirement?.p90)}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-slate-700 dark:text-slate-200 mb-1">At end age ({result.inputs.endAge})</div>
                    <div className="text-slate-600 dark:text-slate-400">
                      p10 {formatMoney(outcomes.balanceAtEnd?.p10)} · p50 {formatMoney(outcomes.balanceAtEnd?.p50)} · p90{' '}
                      {formatMoney(outcomes.balanceAtEnd?.p90)}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-slate-700 dark:text-slate-200 mb-1">Lowest balance</div>
                    <div className="text-slate-600 dark:text-slate-400">
                      p10 {formatMoney(outcomes.minBalance?.p10)} · p50 {formatMoney(outcomes.minBalance?.p50)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900 text-sm">
                <div className="font-medium text-slate-700 dark:text-slate-200 mb-1">Return assumptions</div>
                <div className="text-slate-600 dark:text-slate-400">
                  Mean {formatPercent(result.inputs.meanReturn)} · Volatility {formatPercent(result.inputs.portfolioStdDev)} ·{' '}
                  {result.inputs.simulations} simulations
                </div>
              </div>

              <ProjectionDisclaimer compact />
            </div>
          )}
        </>
      )}
    </div>
  );
}
