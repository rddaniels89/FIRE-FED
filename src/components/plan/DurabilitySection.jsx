import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { Lock, Loader2 } from 'lucide-react';
import { FEATURES, hasEntitlement } from '../../lib/entitlements';
import { runMonteCarloAnalytics, monteCarloBySeparationAge } from '../../lib/analytics/monteCarlo';
import { runStressTests } from '../../lib/analytics/stressTests';
import { withSeparationAge } from '../../lib/projection/fireDate';
import { trackEvent } from '../../lib/telemetry';
import { fmtDelta, fmtMoney, fmtPercent } from './planFormat';

const MONTE_CARLO_SIMS = 750;
const COMPARE_SIMS = 200;

function Spinner() {
  return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
}

/** Wraps a card body in a blurred preview with an upgrade CTA when the user lacks the feature. */
function ProGate({ locked, reason, children, preview }) {
  if (!locked) return children;
  return (
    <div className="relative">
      <div className="blur-sm pointer-events-none select-none opacity-70" aria-hidden="true">
        {preview}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-4">
        <Lock className="h-5 w-5 text-slate-500" aria-hidden="true" />
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">Pro feature</div>
        <Link to="/pro-features" state={{ reason }} className="btn-primary py-2 px-4 text-sm">
          Unlock Pro
        </Link>
      </div>
    </div>
  );
}

function MetricTile({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-xl font-bold navy-text mt-0.5 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function BandChart({ byAge }) {
  const data = useMemo(
    () => ({
      labels: byAge.map((b) => String(b.age)),
      datasets: [
        {
          label: '10th percentile',
          data: byAge.map((b) => Math.round(b.p10)),
          borderColor: 'rgba(220, 38, 38, 0.8)',
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
          tension: 0.2,
        },
        {
          label: '90th percentile',
          data: byAge.map((b) => Math.round(b.p90)),
          borderColor: 'rgba(46, 74, 150, 0.6)',
          backgroundColor: 'rgba(46, 74, 150, 0.15)',
          borderWidth: 1,
          pointRadius: 0,
          fill: '-1',
          tension: 0.2,
        },
        {
          label: 'Median',
          data: byAge.map((b) => Math.round(b.p50)),
          borderColor: '#2e4a96',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.2,
        },
      ],
    }),
    [byAge]
  );
  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: '#64748b', boxWidth: 12 } },
        tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${fmtMoney(item.parsed.y)}` } },
      },
      scales: {
        x: { ticks: { color: '#64748b', maxTicksLimit: 14 }, grid: { display: false } },
        y: {
          ticks: { color: '#64748b', callback: (v) => `$${Math.round(v / 1000)}K` },
          grid: { color: 'rgba(148, 163, 184, 0.25)' },
        },
      },
    }),
    []
  );
  return (
    <div className="h-56">
      <Line data={data} options={options} />
    </div>
  );
}

const PREVIEW_MC = (
  <div className="grid sm:grid-cols-3 gap-3">
    <MetricTile label="Funds last to end age" value="87%" />
    <MetricTile label="Balance at end (p10 / p50 / p90)" value="$210K / $1.1M / $2.6M" />
    <MetricTile label="Most vulnerable age" value="63" />
  </div>
);

const PREVIEW_STRESS = (
  <ul className="space-y-2 text-sm">
    {['Poor first decade', 'Crash at separation', 'High inflation', 'Live to 100'].map((l, i) => (
      <li key={l} className="flex justify-between">
        <span>{l}</span>
        <span>{i === 1 ? 'fails' : 'passes'}</span>
      </li>
    ))}
  </ul>
);

/**
 * "How durable is the projection?": Monte Carlo, named stress tests, and the
 * success probability across separation ages. Each is a Pro feature and runs
 * on demand; the work is deferred a tick so the spinner paints first.
 */
export default function DurabilitySection({ scenario, timeline, entitlements }) {
  const canMonteCarlo = hasEntitlement(entitlements, FEATURES.ADVANCED_ANALYTICS);
  const canStress = hasEntitlement(entitlements, FEATURES.STRESS_TESTS);

  const [mc, setMc] = useState({ running: false, result: null, error: '' });
  const [stress, setStress] = useState({ running: false, result: null, error: '' });
  const [compare, setCompare] = useState({ running: false, rows: null, error: '' });
  const cancelRef = useRef({ compare: 0 });

  // Results belong to the scenario they were run for.
  useEffect(() => {
    setMc({ running: false, result: null, error: '' });
    setStress({ running: false, result: null, error: '' });
    setCompare({ running: false, rows: null, error: '' });
    cancelRef.current.compare += 1;
  }, [scenario]);

  const runMonteCarlo = () => {
    setMc({ running: true, result: null, error: '' });
    setTimeout(() => {
      try {
        const result = runMonteCarloAnalytics({ scenario, settings: { simulations: MONTE_CARLO_SIMS } });
        setMc({ running: false, result, error: '' });
        trackEvent('plan_montecarlo_ran', { simulations: MONTE_CARLO_SIMS });
      } catch (e) {
        console.error(e);
        setMc({ running: false, result: null, error: e?.message || 'Simulation failed.' });
      }
    }, 0);
  };

  const runStress = () => {
    setStress({ running: true, result: null, error: '' });
    setTimeout(() => {
      try {
        const result = runStressTests(scenario, { baseTimeline: timeline });
        setStress({ running: false, result, error: '' });
        trackEvent('plan_stress_tests_ran', { survived: result.survivedCount, total: result.totalCount });
      } catch (e) {
        console.error(e);
        setStress({ running: false, result: null, error: e?.message || 'Stress tests failed.' });
      }
    }, 0);
  };

  // One age per tick so the list fills in and the page stays responsive.
  const runCompare = () => {
    const token = (cancelRef.current.compare += 1);
    const fromAge = Math.ceil(Number(scenario.profile.currentAge));
    const toAge = Math.min(70, fromAge + 15);
    setCompare({ running: true, rows: [], error: '' });
    const step = (age) => {
      if (cancelRef.current.compare !== token) return;
      if (age > toAge) {
        setCompare((prev) => ({ ...prev, running: false }));
        trackEvent('plan_compare_separation_ages_ran', { fromAge, toAge });
        return;
      }
      try {
        const [row] = monteCarloBySeparationAge(scenario, {
          fromAge: age,
          toAge: age,
          settings: { simulations: COMPARE_SIMS },
          withSeparationAge,
        });
        setCompare((prev) => ({ ...prev, rows: [...(prev.rows ?? []), row] }));
        setTimeout(() => step(age + 1), 0);
      } catch (e) {
        console.error(e);
        setCompare({ running: false, rows: null, error: e?.message || 'Comparison failed.' });
      }
    };
    setTimeout(() => step(fromAge), 0);
  };

  const o = mc.result?.outcomes;

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold navy-text">Monte Carlo</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {MONTE_CARLO_SIMS} runs of this timeline with returns drawn from the allocation's mean and volatility.
            </p>
          </div>
          {canMonteCarlo && (
            <button type="button" className="btn-primary py-2 px-4 text-sm flex items-center gap-2" onClick={runMonteCarlo} disabled={mc.running}>
              {mc.running ? <Spinner /> : null}
              {mc.running ? 'Running…' : mc.result ? 'Run again' : 'Run'}
            </button>
          )}
        </div>
        <ProGate locked={!canMonteCarlo} reason="plan_montecarlo_pro" preview={PREVIEW_MC}>
          {mc.error && <div className="text-sm text-red-700 dark:text-red-300">{mc.error}</div>}
          {!mc.result && !mc.running && !mc.error && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Run the simulation to see the spread of outcomes.</p>
          )}
          {mc.running && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Spinner /> Simulating {MONTE_CARLO_SIMS} lifetimes…
            </div>
          )}
          {o && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-3">
                <MetricTile
                  label="Funds last to end age"
                  value={fmtPercent(o.probabilityFundsLastToEndAge)}
                  sub={`to age ${mc.result.inputs.endAge}`}
                />
                <MetricTile
                  label="Balance at end"
                  value={fmtMoney(o.balanceAtEnd?.p50, { compact: true })}
                  sub={`p10 ${fmtMoney(o.balanceAtEnd?.p10, { compact: true })} · p90 ${fmtMoney(o.balanceAtEnd?.p90, { compact: true })}`}
                />
                <MetricTile
                  label="Most vulnerable age"
                  value={o.mostVulnerableAge ?? '—'}
                  sub={o.mostVulnerableP10Balance != null ? `p10 balance ${fmtMoney(o.mostVulnerableP10Balance, { compact: true })}` : undefined}
                />
              </div>
              <BandChart byAge={mc.result.byAge} />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Band shows the 10th to 90th percentile of total balance by age; the line is the median. Seeded, so re-running
                gives the same answer for the same inputs.
              </p>
            </div>
          )}
        </ProGate>
      </div>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold navy-text">Stress tests</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">The same timeline with one assumption bent at a time.</p>
          </div>
          {canStress && (
            <button type="button" className="btn-primary py-2 px-4 text-sm flex items-center gap-2" onClick={runStress} disabled={stress.running}>
              {stress.running ? <Spinner /> : null}
              {stress.running ? 'Running…' : stress.result ? 'Run again' : 'Run'}
            </button>
          )}
        </div>
        <ProGate locked={!canStress} reason="plan_stress_tests_pro" preview={PREVIEW_STRESS}>
          {stress.error && <div className="text-sm text-red-700 dark:text-red-300">{stress.error}</div>}
          {!stress.result && !stress.running && !stress.error && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Run the tests to see which shocks the projection survives.</p>
          )}
          {stress.running && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Spinner /> Running stress tests…
            </div>
          )}
          {stress.result && (
            <div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">
                {stress.result.survivedCount} of {stress.result.totalCount} survive
              </div>
              <ul className="space-y-2">
                {stress.result.results.map((r) => (
                  <li key={r.key} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                            r.survives
                              ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                              : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          }`}
                        >
                          {r.survives ? 'pass' : `fails at ${r.firstShortfallAge}`}
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{r.label}</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{r.description}</div>
                    </div>
                    <span
                      className={`whitespace-nowrap tabular-nums text-xs ${r.balanceAtEndDelta < 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}
                      title="Change in balance at end age versus the base projection"
                    >
                      {fmtDelta(r.balanceAtEndDelta)} at end
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ProGate>
      </div>

      <div className="card p-5 lg:col-span-2">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold navy-text">Compare separation ages</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Probability the money lasts to the end age for each separation age, {COMPARE_SIMS} runs each.
            </p>
          </div>
          {canMonteCarlo && (
            <button type="button" className="btn-primary py-2 px-4 text-sm flex items-center gap-2" onClick={runCompare} disabled={compare.running}>
              {compare.running ? <Spinner /> : null}
              {compare.running ? 'Running…' : compare.rows ? 'Run again' : 'Run'}
            </button>
          )}
        </div>
        <ProGate
          locked={!canMonteCarlo}
          reason="plan_compare_ages_pro"
          preview={
            <div className="flex gap-1 items-end h-24">
              {[30, 45, 60, 72, 85, 91, 95, 97].map((p, i) => (
                <div key={i} className="flex-1 bg-navy-300 rounded-t" style={{ height: `${p}%` }} />
              ))}
            </div>
          }
        >
          {compare.error && <div className="text-sm text-red-700 dark:text-red-300">{compare.error}</div>}
          {!compare.rows && !compare.running && !compare.error && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Run to see how the success probability shifts with each year of separation.
            </p>
          )}
          {compare.rows && (
            <div className="space-y-1.5">
              {compare.rows.map((r) => {
                const p = r.probabilityFundsLastToEndAge;
                const tone = p >= 0.9 ? 'bg-green-500' : p >= 0.75 ? 'bg-gold-500' : 'bg-red-500';
                const isCurrent = r.separationAge === Number(scenario.profile.separationAge);
                return (
                  <div key={r.separationAge} className="flex items-center gap-3 text-sm">
                    <span className={`w-8 text-right tabular-nums ${isCurrent ? 'font-bold navy-text' : 'text-slate-600 dark:text-slate-400'}`}>
                      {r.separationAge}
                    </span>
                    <div className="flex-1 h-4 rounded bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div className={`h-full ${tone}`} style={{ width: `${Math.round(p * 100)}%` }} />
                    </div>
                    <span className="w-12 text-right tabular-nums text-slate-800 dark:text-slate-200">{fmtPercent(p)}</span>
                    <span className="w-24 text-right tabular-nums text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
                      p10 {fmtMoney(r.minBalanceP10, { compact: true })}
                    </span>
                  </div>
                );
              })}
              {compare.running && (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1">
                  <Spinner /> simulating…
                </div>
              )}
            </div>
          )}
        </ProGate>
      </div>
    </div>
  );
}
