import { useState, useEffect } from 'react';
import { useScenario } from '../contexts/ScenarioContext';

/**
 * FIREGapCalculator Component - Core MVP feature for FireFed SaaS
 * 
 * Analyzes the gap between projected passive income and FIRE income goals
 * Shows surplus or shortfall with visual indicators and recommendations
 */
function FIREGapCalculator({ tspProjectedBalance, pensionMonthly }) {
  const { currentScenario, updateCurrentScenario } = useScenario();
  const [gapAnalysis, setGapAnalysis] = useState({
    totalPassiveIncome: 0,
    fireIncomeGoal: 0,
    monthlyGap: 0,
    isFireReady: false,
    confidenceLevel: 'low'
  });

  // Calculate FIRE gap whenever inputs change
  useEffect(() => {
    if (!currentScenario?.fire) return;

    const fire = currentScenario.fire;
    
    // Calculate TSP withdrawal using 4% rule (monthly)
    const tspMonthlyWithdrawal = (tspProjectedBalance || 0) * 0.04 / 12;
    
    // Total projected passive income
    const totalPassiveIncome = 
      tspMonthlyWithdrawal + 
      (pensionMonthly || 0) + 
      (fire.sideHustleIncome || 0) + 
      (fire.spouseIncome || 0);

    const fireIncomeGoal = fire.monthlyFireIncomeGoal || 0;
    const monthlyGap = totalPassiveIncome - fireIncomeGoal;
    const isFireReady = monthlyGap >= 0;
    
    // Determine confidence level based on surplus/shortfall percentage
    let confidenceLevel = 'low';
    if (isFireReady) {
      const surplusPercentage = (monthlyGap / fireIncomeGoal) * 100;
      if (surplusPercentage >= 25) confidenceLevel = 'high';
      else if (surplusPercentage >= 10) confidenceLevel = 'medium';
      else confidenceLevel = 'low';
    }

    setGapAnalysis({
      totalPassiveIncome,
      fireIncomeGoal,
      monthlyGap,
      isFireReady,
      confidenceLevel
    });
  }, [currentScenario?.fire, tspProjectedBalance, pensionMonthly]);

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
      return `📈 You need an additional ${formatCurrency(shortfall)} per month to reach your FIRE goal.`;
    }
  };

  const getRecommendations = () => {
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
      
      {/* Main Status Card */}
      <div className={`p-4 border-2 rounded-lg mb-6 ${colorClasses[getStatusColor()]}`}>
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold">
            {gapAnalysis.isFireReady ? 'FIRE Ready' : 'FIRE Gap'}
          </span>
          <span className="text-sm opacity-75">
            Age {currentScenario?.fire?.desiredFireAge || 55}
          </span>
        </div>
        <div className="text-sm mb-3">
          {getStatusMessage()}
        </div>
      </div>

      {/* Income Breakdown */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">
            Projected Monthly Income
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>TSP (4% rule):</span>
              <span>{formatCurrency((tspProjectedBalance || 0) * 0.04 / 12)}</span>
            </div>
            <div className="flex justify-between">
              <span>FERS Pension:</span>
              <span>{formatCurrency(pensionMonthly || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Side Hustle:</span>
              <span>{formatCurrency(currentScenario?.fire?.sideHustleIncome || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Spouse Income:</span>
              <span>{formatCurrency(currentScenario?.fire?.spouseIncome || 0)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>Total:</span>
              <span>{formatCurrency(gapAnalysis.totalPassiveIncome)}</span>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">
            FIRE Target
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Monthly Goal:</span>
              <span>{formatCurrency(gapAnalysis.fireIncomeGoal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Annual Goal:</span>
              <span>{formatCurrency(gapAnalysis.fireIncomeGoal * 12)}</span>
            </div>
            <div className={`border-t pt-2 flex justify-between font-semibold ${
              gapAnalysis.isFireReady ? 'text-green-600' : 'text-red-600'
            }`}>
              <span>Gap:</span>
              <span>
                {gapAnalysis.isFireReady ? '+' : ''}{formatCurrency(gapAnalysis.monthlyGap)}
              </span>
            </div>
          </div>
        </div>
      </div>

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