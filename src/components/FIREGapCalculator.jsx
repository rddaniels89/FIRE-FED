import { useMemo, useState, useEffect } from 'react';
import { useScenario } from '../contexts/ScenarioContext';
import { calculateFireGap, SAFE_WITHDRAWAL_RATE_PRESETS } from '../lib/calculations/fire';

/**
 * FIREGapCalculator Component - Core MVP feature for FireFed SaaS
 * 
 * Analyzes the gap between projected passive income and FIRE income goals
 * Shows surplus or shortfall with visual indicators and recommendations
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
  const desiredFireAge = Number(currentScenario?.fire?.desiredFireAge ?? 55);
  const pensionStartAge = Number(currentScenario?.fers?.retirementAge ?? currentScenario?.tsp?.retirementAge ?? 62);

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
      desiredFireAge,
      pensionStartAge,
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
  }, [currentScenario?.fire, tspProjectedBalance, pensionMonthly, swr, desiredFireAge, pensionStartAge]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = () => {
    if (gapAnalysis.isFireReady) {
      switch (gapAnalysis.confidenceLevel) {
        case 'high': return 'green';
        case 'medium': return 'blue';
        default: return 'yellow';
      }
    }
    return 'red';
  };

  const getStatusMessage = () => {
    if (gapAnalysis.isFireReady) {
      const surplus = Math.abs(gapAnalysis.monthlyGap);
      switch (gapAnalysis.confidenceLevel) {
        case 'high': 
          return `🎉 Excellent! You have a ${formatCurrency(surplus)} monthly surplus. You're well-prepared for FIRE.`;
        case 'medium': 
          return `✅ Good! You have a ${formatCurrency(surplus)} monthly surplus. Consider building more buffer.`;
        default: 
          return `⚠️ Close! You have a ${formatCurrency(surplus)} monthly surplus, but it's tight. Consider optimizing.`;
      }
    } else {
      const shortfall = Math.abs(gapAnalysis.monthlyGap);

      if (gapAnalysis.isFireReadyAfterPension && desiredFireAge < pensionStartAge) {
        return `📈 At age ${desiredFireAge}, you're short ${formatCurrency(shortfall)}/mo. Once your pension starts at age ${pensionStartAge}, your plan becomes FIRE-ready (bridge needed).`;
      }

      return `📈 You need an additional ${formatCurrency(shortfall)} per month to reach your FIRE goal.`;
    }
  };

  const getRecommendations = () => {
    const needsBridge = desiredFireAge < pensionStartAge && (gapAnalysis.bridge?.yearsToBridge ?? 0) > 0;

    if (gapAnalysis.isFireReady && gapAnalysis.confidenceLevel === 'high') {
      return [
        "You're in great shape for FIRE! Consider geographic arbitrage or lifestyle optimization.",
        "Explore tax-efficient withdrawal strategies in retirement.",
        "Consider mentoring others or pursuing passion projects."
      ];
    } else if (gapAnalysis.isFireReady) {
      return [
        "Build a larger emergency fund for additional security.",
        "Consider delaying FIRE by 1-2 years for more cushion.",
        "Optimize your expense budget to reduce monthly needs."
      ];
    } else {
      const recommendations = [
        "Increase TSP contributions if possible (maximize employer match).",
        "Consider extending your federal career for higher pension.",
        "Explore additional income streams or side hustles."
      ];

      if (needsBridge) {
        recommendations.unshift("You likely need a bridge strategy for the years before your pension starts (see Bridge Strategy below).");
      }
      
      // Add specific recommendations based on the gap size
      const gapSize = Math.abs(gapAnalysis.monthlyGap);
      if (gapSize > 2000) {
        recommendations.push("Consider significantly delaying FIRE date to allow more growth.");
      } else if (gapSize > 1000) {
        recommendations.push("Small adjustments to retirement age could close this gap.");
      } else {
        recommendations.push("You're close! Small optimizations could get you there.");
      }
      
      return recommendations;
    }
  };

  const swrPresets = useMemo(() => SAFE_WITHDRAWAL_RATE_PRESETS.slice(), []);
  const swrSensitivity = useMemo(() => {
    if (!currentScenario?.fire) return [];
    return swrPresets.map((rate) => {
      const g = calculateFireGap({
        tspProjectedBalance,
        pensionMonthly,
        fire: currentScenario.fire,
        safeWithdrawalRate: rate,
        desiredFireAge,
        pensionStartAge,
      });
      return {
        rate,
        monthlyWithdrawal: g.tspMonthlyWithdrawal ?? 0,
        monthlyGap: g.monthlyGap ?? 0,
        isFireReady: Boolean(g.isFireReady),
      };
    });
  }, [currentScenario?.fire, swrPresets, tspProjectedBalance, pensionMonthly, desiredFireAge, pensionStartAge]);

  const fireNumberAssets = useMemo(() => {
    const annualGoal = Number(gapAnalysis.fireIncomeGoal ?? 0) * 12;
    const rate = Math.min(0.1, Math.max(0.01, Number(swr) || 0.04));
    return rate > 0 ? annualGoal / rate : 0;
  }, [gapAnalysis.fireIncomeGoal, swr]);

  const pensionAssetEquivalent = Number(gapAnalysis.pension?.pensionAssetEquivalent ?? 0);
  const totalAssetEquivalentAtOrAfterPension = (Number(tspProjectedBalance ?? 0) || 0) + pensionAssetEquivalent;

  const colorClasses = {
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-800 dark:text-green-300',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-300',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-800 dark:text-red-300'
  };

  return (
    <div className="card p-6">
      <h3 className="text-xl font-semibold navy-text mb-4">
        🎯 FIRE Gap Analysis
      </h3>

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
      
      {/* Main Status Card */}
      <div className={`p-4 border-2 rounded-lg mb-6 ${colorClasses[getStatusColor()]}`}>
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold">
            {gapAnalysis.isFireReady ? 'FIRE Ready' : 'FIRE Gap'}
          </span>
          <span className="text-sm opacity-75">
            Age {desiredFireAge || 55}
          </span>
        </div>
        <div className="text-sm mb-3">
          {getStatusMessage()}
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-sm text-slate-600 dark:text-slate-400">
          Pension treatment:
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
            {pensionViewMode === 'income' ? 'Projected Monthly Income' : 'Asset-Equivalent Resources'}
          </h4>
          {pensionViewMode === 'income' ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>TSP ({(Number(swr || 0.04) * 100).toFixed(1)}% SWR):</span>
                <span>{formatCurrency(gapAnalysis.tspMonthlyWithdrawal ?? (tspProjectedBalance || 0) * (Number(swr || 0.04)) / 12)}</span>
              </div>
              <div className="flex justify-between">
                <span>FERS Pension (at age {desiredFireAge}):</span>
                <span>{formatCurrency(gapAnalysis.pension?.pensionMonthlyAtDesiredAge ?? 0)}</span>
              </div>
              {desiredFireAge < pensionStartAge ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Pension assumed to start at age {pensionStartAge}. (Bridge needed before then.)
                </div>
              ) : null}
              <div className="flex justify-between">
                <span>Side Hustle:</span>
                <span>{formatCurrency(currentScenario?.fire?.sideHustleIncome || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Spouse Income:</span>
                <span>{formatCurrency(currentScenario?.fire?.spouseIncome || 0)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Total (at age {desiredFireAge}):</span>
                <span>{formatCurrency(gapAnalysis.totalPassiveIncomeAtDesiredAge ?? gapAnalysis.totalPassiveIncome)}</span>
              </div>
              {desiredFireAge < pensionStartAge ? (
                <div className="pt-2 border-t flex justify-between text-sm font-semibold">
                  <span>Total (after pension starts):</span>
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
                <span>Pension “asset-equivalent”:</span>
                <span>{formatCurrency(pensionAssetEquivalent)}</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                This treats pension as an income stream capitalized by SWR (annual pension / SWR). It’s a mental model, not cash you can withdraw early.
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Total (at/after pension start):</span>
                <span>{formatCurrency(totalAssetEquivalentAtOrAfterPension)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="card p-4">
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">
            {pensionViewMode === 'income' ? 'FIRE Target (Income)' : 'FIRE Target (Assets)'}
          </h4>
          {pensionViewMode === 'income' ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Monthly Goal:</span>
                <span>{formatCurrency(gapAnalysis.fireIncomeGoal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Annual Goal:</span>
                <span>{formatCurrency((gapAnalysis.fireIncomeGoal || 0) * 12)}</span>
              </div>
              <div className={`border-t pt-2 flex justify-between font-semibold ${
                gapAnalysis.isFireReady ? 'text-green-600' : 'text-red-600'
              }`}>
                <span>Gap (at age {desiredFireAge}):</span>
                <span>
                  {gapAnalysis.isFireReady ? '+' : ''}{formatCurrency(gapAnalysis.monthlyGap)}
                </span>
              </div>
              {desiredFireAge < pensionStartAge ? (
                <div className={`pt-2 border-t flex justify-between text-sm font-semibold ${
                  gapAnalysis.isFireReadyAfterPension ? 'text-green-600' : 'text-red-600'
                }`}>
                  <span>Gap (after pension starts):</span>
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
                <span>Status (at/after pension start):</span>
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
          SWR Sensitivity (at age {desiredFireAge})
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
                  <td className="py-2 pr-3">{row.isFireReady ? 'FIRE-ready' : 'Gap'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bridge Strategy */}
      {desiredFireAge < pensionStartAge ? (
        <div className="card p-4 mb-6">
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Bridge Strategy (early exit)
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            If you stop working at age {desiredFireAge}, your pension is assumed to start at age {pensionStartAge}. This section estimates the shortfall you’d need to fund for those bridge years.
          </p>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="text-slate-500 dark:text-slate-400 text-xs">Years to bridge</div>
              <div className="font-semibold">{gapAnalysis.bridge?.yearsToBridge ?? 0}</div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="text-slate-500 dark:text-slate-400 text-xs">Monthly shortfall (pre-pension)</div>
              <div className="font-semibold">{formatCurrency(gapAnalysis.bridge?.monthlyShortfall ?? 0)}</div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="text-slate-500 dark:text-slate-400 text-xs">Estimated bridge assets needed</div>
              <div className="font-semibold">{formatCurrency(gapAnalysis.bridge?.requiredBridgeAssets ?? 0)}</div>
            </div>
          </div>
          <div className="disclaimer mt-3">
            Simplified estimate: assumes level dollars and no investment growth/interest during the bridge period.
          </div>
        </div>
      ) : null}

      {/* Recommendations */}
      <div className="card p-4">
        <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">
          💡 Recommendations
        </h4>
        <ul className="space-y-2 text-sm">
          {getRecommendations().map((rec, index) => (
            <li key={index} className="flex items-start space-x-2">
              <span className="text-blue-500 mt-1">•</span>
              <span className="text-slate-600 dark:text-slate-400">{rec}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default FIREGapCalculator; 