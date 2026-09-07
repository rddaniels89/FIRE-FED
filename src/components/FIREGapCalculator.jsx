import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useScenario } from '../contexts/ScenarioContext';
import ProjectionDisclaimer from './ProjectionDisclaimer';
import { calculateFireGap, SAFE_WITHDRAWAL_RATE_PRESETS } from '../lib/calculations/fire';
import { buildTimeline } from '../lib/projection/timeline';

/**
 * Does projected income cover the income goal at the separation age already on
 * file? That is the only question this card answers.
 *
 * It deliberately does not offer a separation age of its own. The projected
 * sustainable separation age comes from the lifetime timeline on My Plan; two
 * screens answering "when could I leave" with two different methods was the
 * reason this card used to contradict that page.
 */
function FIREGapCalculator({ tspProjectedBalance, pensionMonthly }) {
  const { currentScenario, updateCurrentScenario } = useScenario();
  const [pensionViewMode, setPensionViewMode] = useState('income'); // 'income' | 'asset'
  const [gapAnalysis, setGapAnalysis] = useState({
    totalPassiveIncome: 0,
    fireIncomeGoal: 0,
    monthlyGap: 0,
    isFireReady: false,
    confidenceLevel: 'low',
    monthlyGapAfterPension: 0,
    isFireReadyAfterPension: false,
    bridge: { yearsToBridge: 0, monthlyShortfall: 0, requiredBridgeAssets: 0 },
    pension: {},
  });

  const swr = Number(currentScenario?.summary?.assumptions?.safeWithdrawalRate ?? 0.04);
  // The profile owns both ages; the fire and fers blocks only mirror them.
  const separationAge = Number(currentScenario?.profile?.separationAge ?? 55);
  const annuityStartAge = Number(currentScenario?.profile?.annuityStartAge ?? separationAge);

  const setSafeWithdrawalRate = (next) => {
    const nextRate = Math.min(0.1, Math.max(0.01, Number(next) || 0.04));
    updateCurrentScenario({
      summary: {
        ...(currentScenario?.summary ?? {}),
        assumptions: {
          ...((currentScenario?.summary?.assumptions) ?? {}),
          safeWithdrawalRate: nextRate,
        },
      },
    });
  };

  // Calculate FIRE gap whenever inputs change
  useEffect(() => {
    if (!currentScenario?.fire) return;

    const gap = calculateFireGap({
      tspProjectedBalance,
      pensionMonthly,
      fire: currentScenario.fire,
      safeWithdrawalRate: swr,
      desiredFireAge: separationAge,
      pensionStartAge: annuityStartAge,
    });

    setGapAnalysis({
      totalPassiveIncome: gap.totalPassiveIncome,
      fireIncomeGoal: gap.fireIncomeGoal,
      monthlyGap: gap.monthlyGap,
      isFireReady: gap.isFireReady,
      confidenceLevel: gap.confidenceLevel,
      monthlyGapAfterPension: gap.monthlyGapAfterPension ?? 0,
      isFireReadyAfterPension: gap.isFireReadyAfterPension ?? false,
      bridge: gap.bridge ?? { yearsToBridge: 0, monthlyShortfall: 0, requiredBridgeAssets: 0 },
      pension: gap.pension ?? {},
    });
  }, [currentScenario?.fire, tspProjectedBalance, pensionMonthly, swr, separationAge, annuityStartAge]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Two tones, not a graded verdict: the figure is either a surplus or a shortfall.
  const statusToneClasses = gapAnalysis.isFireReady
    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-800 dark:text-green-300'
    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300';

  /** A neutral reading of the gap figure. No verdict, no instruction. */
  const getStatusMessage = () => {
    const amount = formatCurrency(Math.abs(gapAnalysis.monthlyGap));

    if (gapAnalysis.isFireReady) {
      return `Projected surplus of ${amount} a month at age ${separationAge} under these assumptions.`;
    }

    if (gapAnalysis.isFireReadyAfterPension && separationAge < annuityStartAge) {
      return `Projected shortfall of ${amount} a month at age ${separationAge}. From age ${annuityStartAge}, when the FERS annuity starts, projected income covers the goal; the years in between are funded from savings.`;
    }

    return `Projected shortfall of ${amount} a month at age ${separationAge} under these assumptions.`;
  };

  // The bridge is read from the lifetime timeline, which sequences every income
  // start and charges the taxes and penalties each withdrawal carries.
  const timelineBridge = useMemo(() => {
    if (!currentScenario?.profile) return null;
    try {
      const t = buildTimeline(currentScenario);
      return { ...t.summary.bridge, plan: t.plan, isSustainable: t.summary.isSustainable };
    } catch (e) {
      console.error('Timeline bridge failed', e);
      return null;
    }
  }, [currentScenario]);

  const swrPresets = useMemo(() => SAFE_WITHDRAWAL_RATE_PRESETS.slice(), []);
  const swrSensitivity = useMemo(() => {
    if (!currentScenario?.fire) return [];
    return swrPresets.map((rate) => {
      const g = calculateFireGap({
        tspProjectedBalance,
        pensionMonthly,
        fire: currentScenario.fire,
        safeWithdrawalRate: rate,
        desiredFireAge: separationAge,
        pensionStartAge: annuityStartAge,
      });
      return {
        rate,
        monthlyWithdrawal: g.tspMonthlyWithdrawal ?? 0,
        monthlyGap: g.monthlyGap ?? 0,
        isFireReady: Boolean(g.isFireReady),
      };
    });
  }, [currentScenario?.fire, swrPresets, tspProjectedBalance, pensionMonthly, separationAge, annuityStartAge]);

  const fireNumberAssets = useMemo(() => {
    const annualGoal = Number(gapAnalysis.fireIncomeGoal ?? 0) * 12;
    const rate = Math.min(0.1, Math.max(0.01, Number(swr) || 0.04));
    return rate > 0 ? annualGoal / rate : 0;
  }, [gapAnalysis.fireIncomeGoal, swr]);

  const pensionAssetEquivalent = Number(gapAnalysis.pension?.pensionAssetEquivalent ?? 0);
  const totalAssetEquivalentAtOrAfterPension = (Number(tspProjectedBalance ?? 0) || 0) + pensionAssetEquivalent;

  return (
    <div className="card p-6">
      <h3 className="text-xl font-semibold navy-text mb-1">
        Income gap at separation age {separationAge}
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        Whether projected income covers the income goal at the separation age on file. This is not a recommended age —
        the projected sustainable separation age is on{' '}
        <Link to="/plan" className="text-navy-600 dark:text-navy-300 hover:underline">
          My Plan
        </Link>
        , read from the lifetime timeline.
      </p>

      {/* Assumptions */}
      <div className="card p-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Assumptions</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              SWR (safe withdrawal rate) is used to estimate sustainable portfolio withdrawals. Higher SWR increases estimated income but reduces conservatism.
            </p>
          </div>
          <div className="min-w-[220px]">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">SWR</label>
            <div className="flex gap-2 mt-1">
              {swrPresets.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className={`px-3 py-1 rounded-md border text-xs ${
                    Math.abs((Number(swr) || 0.04) - rate) < 0.0005
                      ? 'bg-navy-600 text-white border-navy-600'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                  onClick={() => setSafeWithdrawalRate(rate)}
                >
                  {(rate * 100).toFixed(rate === 0.035 ? 1 : 0)}%
                </button>
              ))}
              <input
                type="number"
                step="0.001"
                min="0.01"
                max="0.1"
                value={Number.isFinite(swr) ? swr : 0.04}
                onChange={(e) => setSafeWithdrawalRate(e.target.value)}
                className="input-field text-xs w-[90px]"
                aria-label="Safe withdrawal rate"
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* Reading of the gap at the chosen separation age */}
      <div className={`p-4 border-2 rounded-lg mb-6 ${statusToneClasses}`}>
        <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
          <span className="font-semibold">
            {gapAnalysis.isFireReady ? 'Projected surplus' : 'Projected shortfall'}
          </span>
          <span className="text-sm opacity-75">Separation age {separationAge || 55}</span>
        </div>
        <div className="text-sm">
          {getStatusMessage()}
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-sm text-slate-600 dark:text-slate-400">
          FERS annuity treatment:
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`px-3 py-1 rounded-md border text-sm ${
              pensionViewMode === 'income'
                ? 'bg-navy-600 text-white border-navy-600'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
            onClick={() => setPensionViewMode('income')}
          >
            Income view
          </button>
          <button
            type="button"
            className={`px-3 py-1 rounded-md border text-sm ${
              pensionViewMode === 'asset'
                ? 'bg-navy-600 text-white border-navy-600'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
            onClick={() => setPensionViewMode('asset')}
          >
            Asset-equivalent view
          </button>
        </div>
      </div>

      {/* Income / Asset Breakdown */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">
            {pensionViewMode === 'income' ? 'Projected monthly income' : 'Asset-equivalent resources'}
          </h4>
          {pensionViewMode === 'income' ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>TSP ({(Number(swr || 0.04) * 100).toFixed(1)}% SWR):</span>
                <span>{formatCurrency(gapAnalysis.tspMonthlyWithdrawal ?? (tspProjectedBalance || 0) * (Number(swr || 0.04)) / 12)}</span>
              </div>
              <div className="flex justify-between">
                <span>FERS annuity (at separation age {separationAge}):</span>
                <span>{formatCurrency(gapAnalysis.pension?.pensionMonthlyAtDesiredAge ?? 0)}</span>
              </div>
              {separationAge < annuityStartAge ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  The FERS annuity is assumed to start at annuity start age {annuityStartAge}; the years before it are funded from savings.
                </div>
              ) : null}
              <div className="flex justify-between">
                <span>Side income:</span>
                <span>{formatCurrency(currentScenario?.fire?.sideHustleIncome || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Spouse income:</span>
                <span>{formatCurrency(currentScenario?.fire?.spouseIncome || 0)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Total (at separation age {separationAge}):</span>
                <span>{formatCurrency(gapAnalysis.totalPassiveIncomeAtDesiredAge ?? gapAnalysis.totalPassiveIncome)}</span>
              </div>
              {separationAge < annuityStartAge ? (
                <div className="pt-2 border-t flex justify-between text-sm font-semibold">
                  <span>Total (from the annuity start age):</span>
                  <span>{formatCurrency(gapAnalysis.totalPassiveIncomeAfterPension ?? 0)}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>TSP balance:</span>
                <span>{formatCurrency(tspProjectedBalance || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>FERS annuity “asset-equivalent”:</span>
                <span>{formatCurrency(pensionAssetEquivalent)}</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                This treats the FERS annuity as an income stream capitalized by the SWR (annual annuity / SWR). It is a mental model, not cash you can withdraw early.
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Total (from the annuity start age):</span>
                <span>{formatCurrency(totalAssetEquivalentAtOrAfterPension)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="card p-4">
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">
            {pensionViewMode === 'income' ? 'Income goal' : 'Asset target'}
          </h4>
          {pensionViewMode === 'income' ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Monthly goal:</span>
                <span>{formatCurrency(gapAnalysis.fireIncomeGoal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Annual goal:</span>
                <span>{formatCurrency((gapAnalysis.fireIncomeGoal || 0) * 12)}</span>
              </div>
              <div className={`border-t pt-2 flex justify-between font-semibold ${
                gapAnalysis.isFireReady ? 'text-green-600' : 'text-red-600'
              }`}>
                <span>Gap (at separation age {separationAge}):</span>
                <span>
                  {gapAnalysis.isFireReady ? '+' : ''}{formatCurrency(gapAnalysis.monthlyGap)}
                </span>
              </div>
              {separationAge < annuityStartAge ? (
                <div className={`pt-2 border-t flex justify-between text-sm font-semibold ${
                  gapAnalysis.isFireReadyAfterPension ? 'text-green-600' : 'text-red-600'
                }`}>
                  <span>Gap (from the annuity start age):</span>
                  <span>
                    {gapAnalysis.isFireReadyAfterPension ? '+' : ''}{formatCurrency(gapAnalysis.monthlyGapAfterPension || 0)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>FIRE number (assets):</span>
                <span>{formatCurrency(fireNumberAssets)}</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Calculated as annual spending goal / SWR. This view compares “asset-equivalent” resources to an “asset” target.
              </div>
              <div className={`border-t pt-2 flex justify-between font-semibold ${
                totalAssetEquivalentAtOrAfterPension >= fireNumberAssets ? 'text-green-600' : 'text-red-600'
              }`}>
                <span>Status (from the annuity start age):</span>
                <span>
                  {totalAssetEquivalentAtOrAfterPension >= fireNumberAssets ? 'Meets target' : 'Below target'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SWR Sensitivity */}
      <div className="card p-4 mb-6">
        <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">
          SWR sensitivity (at separation age {separationAge})
        </h4>
        <div className="overflow-x-auto">
          <table className="min-w-[520px] w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 dark:text-slate-300">
                <th className="py-2 pr-3">SWR</th>
                <th className="py-2 pr-3">TSP withdrawal (mo)</th>
                <th className="py-2 pr-3">Gap (mo)</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200">
              {swrSensitivity.map((row) => (
                <tr key={row.rate} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="py-2 pr-3 font-medium">{(row.rate * 100).toFixed(row.rate === 0.035 ? 1 : 0)}%</td>
                  <td className="py-2 pr-3">{formatCurrency(row.monthlyWithdrawal)}</td>
                  <td className={`py-2 pr-3 ${row.monthlyGap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {row.monthlyGap >= 0 ? '+' : ''}{formatCurrency(row.monthlyGap)}
                  </td>
                  <td className="py-2 pr-3">{row.isFireReady ? 'Surplus' : 'Shortfall'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bridge, from the lifetime timeline */}
      {timelineBridge && timelineBridge.years > 0 ? (
        <div className="card p-4 mb-6">
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Bridge (early exit)
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Leaving at {timelineBridge.startAge} via {timelineBridge.plan?.pathLabel?.toLowerCase()}. Guaranteed income covers
            spending and healthcare from age {timelineBridge.endAge}; the years in between are funded from savings, with taxes and
            any early-withdrawal penalties included.
          </p>
          <div className="grid md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="text-slate-500 dark:text-slate-400 text-xs">Bridge years</div>
              <div className="font-semibold">{timelineBridge.years}</div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="text-slate-500 dark:text-slate-400 text-xs">Withdrawals needed</div>
              <div className="font-semibold">{formatCurrency(timelineBridge.withdrawalsNeeded ?? 0)}</div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="text-slate-500 dark:text-slate-400 text-xs">Assets at separation</div>
              <div className="font-semibold">{formatCurrency(timelineBridge.assetsAtSeparation ?? 0)}</div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="text-slate-500 dark:text-slate-400 text-xs">Bridge funded</div>
              <div className="font-semibold">{Math.round(timelineBridge.fundedPercent ?? 0)}%</div>
            </div>
          </div>
          {Array.isArray(timelineBridge.incomeStarts) && timelineBridge.incomeStarts.length > 0 ? (
            <ul className="mt-3 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              {timelineBridge.incomeStarts.map((s) => (
                <li key={s.source}>
                  {s.source} starts at {s.age}
                  {s.endAge ? ` and ends at ${s.endAge}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
          {timelineBridge.penalties > 0 ? (
            <div className="disclaimer mt-3">
              {formatCurrency(timelineBridge.penalties)} of early-withdrawal penalties fall inside the bridge. The plan page
              shows the 72(t) and Roth ladder strategies that can remove them.
            </div>
          ) : null}
          <ProjectionDisclaimer compact className="mt-3" />
        </div>
      ) : null}

      <div className="card p-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          What actually moves this gap is shown on{' '}
          <Link to="/plan" className="text-navy-600 dark:text-navy-300 hover:underline">
            My Plan
          </Link>
          : the one-year-either-way delta cards run each change through the full timeline.
        </p>
      </div>

      <ProjectionDisclaimer className="mt-6" />
    </div>
  );
}

export default FIREGapCalculator; 