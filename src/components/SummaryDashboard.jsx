import { useState, useEffect, useRef } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { useScenario } from '../contexts/ScenarioContext';
import { useAuth } from '../contexts/AuthContext';
import ScenarioManager from './ScenarioManager';
import FIREGapCalculator from './FIREGapCalculator';
import { calculateTspTraditionalVsRoth } from '../lib/calculations/tsp';
import { calculateFersResults } from '../lib/calculations/fers';
import { FEATURES, hasEntitlement } from '../lib/entitlements';
import { trackEvent } from '../lib/telemetry';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

function SummaryDashboard() {
  const { isAuthenticated, entitlements } = useAuth();
  const { currentScenario, updateCurrentScenario } = useScenario();
  const canExportPdf = hasEntitlement(entitlements, FEATURES.PDF_EXPORT);
  
  const [tspData, setTspData] = useState({
    projectedBalance: 800000,
    totalContributions: 300000,
    totalGrowth: 500000,
    yearlyData: [],
    retirementAge: 62,
    currentAge: 35
  });

  const [pensionData, setPensionData] = useState({
    annualPension: 25000,
    monthlyPension: 2083,
    lifetimePension: 575000,
    yearsOfService: 20,
    high3Salary: 85000,
    retirementAge: 62
  });

  const [fireData, setFireData] = useState({
    monthlyExpenses: 4000,
    desiredFireAge: 55,
    projectedFireAge: 0,
    fireMessage: '',
    totalNetWorth: 0,
    fireGoalMonthly: 0
  });

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const summaryRef = useRef(null);

  // Load data from current scenario
  useEffect(() => {
    if (currentScenario) {
      // Load TSP data from scenario
      if (currentScenario.tsp) {
        const tspScenario = currentScenario.tsp;

        const { traditional, roth } = calculateTspTraditionalVsRoth({
          currentBalance: tspScenario.currentBalance,
          annualSalary: tspScenario.annualSalary,
          monthlyContributionPercent: tspScenario.monthlyContributionPercent,
          currentAge: tspScenario.currentAge,
          retirementAge: tspScenario.retirementAge,
          allocation: tspScenario.allocation,
          currentTaxRate: tspScenario.currentTaxRate ?? 22,
          retirementTaxRate: tspScenario.retirementTaxRate ?? 15,
        });

        const selected = tspScenario.contributionType === 'roth' ? roth : traditional;

        setTspData({
          projectedBalance: Math.round(selected.projectedBalance),
          totalContributions: Math.round(selected.totalContributions),
          totalGrowth: Math.round(selected.totalGrowth),
          yearlyData: selected.yearlyData || [],
          retirementAge: tspScenario.retirementAge,
          currentAge: tspScenario.currentAge
        });
      }
      
      // Load FERS data from scenario
      if (currentScenario.fers) {
        const fersScenario = currentScenario.fers;
        const fers = calculateFersResults({
          yearsOfService: fersScenario.yearsOfService,
          monthsOfService: fersScenario.monthsOfService,
          high3Salary: fersScenario.high3Salary,
          currentAge: fersScenario.currentAge,
          retirementAge: fersScenario.retirementAge,
          showComparison: false,
          privateJobSalary: fersScenario.privateJobSalary ?? 0,
          privateJobYears: fersScenario.privateJobYears ?? 0,
          includeFutureService: true,
        });

        setPensionData({
          annualPension: Math.round(fers.stayFed.annualPension),
          monthlyPension: Math.round(fers.stayFed.monthlyPension),
          lifetimePension: Math.round(fers.stayFed.lifetimePension),
          yearsOfService: Math.round((fers.projectedYears ?? fers.totalYears) * 10) / 10,
          high3Salary: fersScenario.high3Salary,
          retirementAge: fersScenario.retirementAge
        });
      }
      
      // Load summary data from scenario
      if (currentScenario.summary) {
        setFireData(prev => ({
          ...prev,
          monthlyExpenses: currentScenario.summary.monthlyExpenses || 4000
        }));
      }

      // Load FIRE goal inputs from scenario (user-configured FIRE age, etc.)
      if (currentScenario.fire) {
        setFireData(prev => ({
          ...prev,
          desiredFireAge: currentScenario.fire.desiredFireAge || 55,
          fireGoalMonthly: currentScenario.fire.monthlyFireIncomeGoal || 0
        }));
      }
    }
  }, [currentScenario]);

  // Save fire data changes to scenario
  useEffect(() => {
    if (currentScenario && fireData.monthlyExpenses !== 4000) {
      updateCurrentScenario({
        summary: {
          monthlyExpenses: fireData.monthlyExpenses
        }
      });
    }
  }, [fireData.monthlyExpenses, currentScenario, updateCurrentScenario]);

  const calculateFireProjection = () => {
    const totalNetWorth = tspData.projectedBalance + pensionData.lifetimePension;

    // Use the user's FIRE goal if provided; otherwise fall back to monthly expenses as a proxy.
    const fireGoalMonthly =
      (currentScenario?.fire?.monthlyFireIncomeGoal ?? 0) > 0
        ? currentScenario.fire.monthlyFireIncomeGoal
        : fireData.monthlyExpenses;

    const sideHustleIncome = currentScenario?.fire?.sideHustleIncome ?? 0;
    const spouseIncome = currentScenario?.fire?.spouseIncome ?? 0;

    const pensionStartAge = currentScenario?.fers?.retirementAge ?? pensionData.retirementAge ?? tspData.retirementAge;
    const pensionMonthly = pensionData.monthlyPension || 0;

    // Find first age where projected passive income meets FIRE goal.
    let projectedFireAge = 0;
    const series = Array.isArray(tspData.yearlyData) ? tspData.yearlyData : [];
    for (const point of series) {
      const age = Number(point.year ?? 0);
      const balance = Number(point.balance ?? 0);
      if (!age) continue;

      const tspMonthlyWithdrawal = balance * 0.04 / 12; // 4% SWR assumption
      const pensionThisAge = age >= pensionStartAge ? pensionMonthly : 0;
      const totalMonthlyIncome = tspMonthlyWithdrawal + pensionThisAge + sideHustleIncome + spouseIncome;

      if (totalMonthlyIncome >= fireGoalMonthly) {
        projectedFireAge = Math.round(age);
        break;
      }
    }

    let fireMessage = '';
    if (projectedFireAge > 0) {
      const isBeforeRetirement = projectedFireAge <= tspData.retirementAge;
      fireMessage = isBeforeRetirement
        ? `Projected to reach FIRE at age ${projectedFireAge} given your current plan and income goal of $${Number(fireGoalMonthly).toLocaleString()}/month.`
        : `Projected to reach FIRE after your planned retirement age (age ${projectedFireAge}). Consider reducing expenses or increasing savings/income.`;
    } else {
      fireMessage = 'Projected FIRE age not available with current inputs.';
    }

    setFireData(prev => ({
      ...prev,
      projectedFireAge,
      fireMessage,
      totalNetWorth,
      fireGoalMonthly
    }));
  };

  useEffect(() => {
    calculateFireProjection();
  }, [tspData, pensionData, fireData.monthlyExpenses, currentScenario?.fire, currentScenario?.fers]);

  const handleExpenseChange = (value) => {
    setFireData(prev => ({
      ...prev,
      monthlyExpenses: parseFloat(value) || 0
    }));
  };

  const pensionVsTspData = {
    labels: ['FERS Pension (Lifetime)', 'TSP Balance'],
    datasets: [
      {
        data: [pensionData.lifetimePension, tspData.projectedBalance],
        backgroundColor: ['#2e4a96', '#d88635'],
        borderColor: ['#253d7a', '#b56d2b'],
        borderWidth: 2
      }
    ]
  };

  const netWorthData = {
    labels: ['Current', 'At Retirement'],
    datasets: [
      {
        label: 'TSP Balance',
        data: [50000, tspData.projectedBalance],
        backgroundColor: '#2e4a96',
        borderColor: '#253d7a',
        borderWidth: 1
      },
      {
        label: 'Pension Value',
        data: [0, pensionData.lifetimePension],
        backgroundColor: '#d88635',
        borderColor: '#b56d2b',
        borderWidth: 1
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#64748b'
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#64748b'
        },
        grid: {
          color: '#e2e8f0'
        }
      },
      y: {
        ticks: {
          color: '#64748b',
          callback: function(value) {
            return '$' + (value / 1000).toFixed(0) + 'K';
          }
        },
        grid: {
          color: '#e2e8f0'
        }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#64748b',
          padding: 20
        }
      }
    }
  };

  const generatePDF = async () => {
    if (!summaryRef.current) return;
    
    setIsGeneratingPDF(true);
    trackEvent('pdf_export_started', {});
    
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const canvas = await html2canvas(summaryRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF();
      
      const imgWidth = 190;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.setFontSize(16);
      pdf.text('Federal Retirement Summary', 20, 20);
      
      pdf.setFontSize(8);
      pdf.text('This estimate is educational and not official financial advice.', 20, 30);
      
      pdf.addImage(imgData, 'PNG', 10, 40, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.text('Generated by Fed Retire Advisor - For Educational Use Only', 20, 285);
        pdf.text(`Page ${i} of ${pageCount}`, 180, 285);
      }
      
      pdf.save('federal-retirement-summary.pdf');
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      trackEvent('pdf_export_failed', { message: error?.message || 'unknown' });
      alert('Error generating PDF. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <ScenarioManager />
      
      <div className="mb-8">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold navy-text mb-3">Retirement Summary Dashboard</h1>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Combined analysis of your TSP investments and FERS pension with FIRE calculations 
              and retirement readiness assessment.
            </p>
          </div>
          
          {canExportPdf ? (
            <button
              onClick={generatePDF}
              disabled={isGeneratingPDF}
              className="btn-primary flex items-center gap-2"
            >
              {isGeneratingPDF ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Generating...
                </>
              ) : (
                <>
                  📄 Download PDF
                </>
              )}
            </button>
          ) : (
            <div className="relative group">
              <button
                disabled
                className="btn-primary opacity-50 cursor-not-allowed flex items-center gap-2"
                title={!isAuthenticated ? "Please log in to export PDF" : "Pro feature - join the waitlist to export PDF"}
              >
                🔒 Download PDF
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap z-50">
                {!isAuthenticated ? '🔒 Please log in to save or export your FIRE scenario.' : '🔒 PDF export is a Pro feature. Join the waitlist in Pro Features.'}
              </div>
            </div>
          )}
        </div>
      </div>

      <div ref={summaryRef} className="bg-white dark:bg-slate-900 p-6 rounded-lg">
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <div className="card p-6 text-center">
            <div className="text-3xl font-bold navy-text mb-2">
              ${fireData.totalNetWorth.toLocaleString()}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Total Net Worth at Retirement</div>
          </div>
          <div className="card p-6 text-center">
            <div className="text-3xl font-bold gold-accent mb-2">
              ${(pensionData.annualPension + (tspData.projectedBalance * 0.04)).toLocaleString()}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Annual Retirement Income</div>
          </div>
          <div className="card p-6 text-center">
            <div className="grid grid-cols-2 gap-4 items-start">
              <div>
                <div className="text-3xl font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {fireData.desiredFireAge}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Desired FIRE Age</div>
              </div>
              <div className="rounded-lg border border-gold-200 dark:border-gold-700 bg-gold-50 dark:bg-gold-900/20 p-2">
                <div className="text-3xl font-bold text-gold-700 dark:text-gold-300 mb-1">
                  {fireData.projectedFireAge || '—'}
                </div>
                <div className="text-xs font-semibold text-gold-700 dark:text-gold-300">Projected FIRE Age</div>
              </div>
            </div>
          </div>
          <div className="card p-6 text-center">
            <div className="text-3xl font-bold text-slate-600 dark:text-slate-400 mb-2">
              {Math.round(((pensionData.annualPension + (tspData.projectedBalance * 0.04)) / pensionData.high3Salary) * 100)}%
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Income Replacement</div>
          </div>
        </div>

        <div className="card p-6 mb-8">
          <h3 className="text-xl font-semibold navy-text mb-4">Smart Analysis</h3>
          <div className="space-y-4">
            {(() => {
              const savingsRate = (tspData.totalContributions / (pensionData.high3Salary * (tspData.retirementAge - tspData.currentAge))) * 100;
              return (
                <div className={`p-4 rounded-lg border ${
                  savingsRate > 20 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700' :
                  savingsRate > 10 ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700' :
                  'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                }`}>
                  <div className={`font-medium ${
                    savingsRate > 20 ? 'text-green-700 dark:text-green-300' :
                    savingsRate > 10 ? 'text-yellow-700 dark:text-yellow-300' :
                    'text-red-700 dark:text-red-300'
                  }`}>
                    Savings Rate: {savingsRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {savingsRate > 20 ? 'Excellent! Your savings rate is strong — you\'re on track for early retirement.' :
                     savingsRate > 10 ? 'Good savings rate, but consider increasing contributions to reach your FIRE goal earlier.' :
                     'Your savings rate could be improved. Consider increasing TSP contributions for better retirement outcomes.'}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const tspStrong = tspData.projectedBalance > 500000;
              return (
                <div className={`p-4 rounded-lg border ${
                  tspStrong ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700' :
                  'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700'
                }`}>
                  <div className={`font-medium ${
                    tspStrong ? 'text-green-700 dark:text-green-300' : 'text-yellow-700 dark:text-yellow-300'
                  }`}>
                    TSP Projection: ${tspData.projectedBalance.toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {tspStrong ? 'Strong TSP balance projected! This provides excellent retirement security.' :
                     'Consider maximizing TSP contributions and reviewing your fund allocation for optimal growth.'}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const fireAchievable = (fireData.projectedFireAge || 0) > 0 && fireData.projectedFireAge <= tspData.retirementAge;
              return (
                <div className={`p-4 rounded-lg border ${
                  fireAchievable ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700' :
                  'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700'
                }`}>
                  <div className={`font-medium ${
                    fireAchievable ? 'text-green-700 dark:text-green-300' : 'text-blue-700 dark:text-blue-300'
                  }`}>
                    FIRE Status: {fireAchievable ? 'Achievable' : 'Post-Retirement'}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {fireAchievable ? 
                     `Great news! You may achieve FIRE by age ${fireData.projectedFireAge}, before your planned retirement.` :
                     'FIRE would be achieved after retirement age. Consider reducing expenses or increasing savings rate.'}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">Pension vs TSP Share</h3>
              <div className="h-64">
                <Doughnut data={pensionVsTspData} options={doughnutOptions} />
              </div>
              <div className="mt-6 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">FERS Pension (Lifetime)</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    ${pensionData.lifetimePension.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">TSP Balance</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    ${tspData.projectedBalance.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">Total Net Worth</span>
                  <span className="font-bold text-navy-600 dark:text-navy-400">
                    ${fireData.totalNetWorth.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="disclaimer">
                Estimates only. For educational use. Pension value assumes life expectancy of 85 years.
              </div>
            </div>

            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">Net Worth Growth</h3>
              <div className="h-64">
                <Bar data={netWorthData} options={chartOptions} />
              </div>
              <div className="disclaimer">
                Estimates only. For educational use. Actual results may vary based on market performance.
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">FIRE Analysis</h3>
              <div className="space-y-4">
                <div>
                  <label className="label">Monthly Expenses</label>
                  <input
                    type="number"
                    value={fireData.monthlyExpenses}
                    onChange={(e) => handleExpenseChange(e.target.value)}
                    className="input-field w-full"
                    placeholder="4,000"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Annual expenses: ${(fireData.monthlyExpenses * 12).toLocaleString()}
                  </p>
                </div>
                
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <p className="text-slate-800 dark:text-slate-200">
                    <strong>FIRE Number:</strong> ${(fireData.monthlyExpenses * 12 * 25).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Based on 4% withdrawal rule (25x annual expenses)
                  </p>
                </div>
                
                <div className="p-4 bg-navy-50 dark:bg-navy-900/20 rounded-lg border border-navy-200 dark:border-navy-700">
                  <p className="text-slate-800 dark:text-slate-200">
                    {fireData.fireMessage}
                  </p>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">Retirement Income Breakdown</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">FERS Pension (Annual)</span>
                  <span className="font-medium text-slate-800">
                    ${pensionData.annualPension.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">TSP Withdrawals (4%)</span>
                  <span className="font-medium text-slate-800">
                    ${Math.round(tspData.projectedBalance * 0.04).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Social Security (Est.)</span>
                  <span className="font-medium text-slate-800">
                    ${Math.round(pensionData.high3Salary * 0.4).toLocaleString()}
                  </span>
                </div>
                <div className="section-divider"></div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 font-medium">Total Annual Income</span>
                  <span className="font-bold text-navy-600">
                    ${Math.round(pensionData.annualPension + (tspData.projectedBalance * 0.04) + (pensionData.high3Salary * 0.4)).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">Key Insights</h3>
              <div className="space-y-4">
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-green-700 font-medium mb-1">Strengths</div>
                  <ul className="text-sm text-green-600 space-y-1">
                    <li>• Diversified retirement income sources</li>
                    <li>• Government pension provides stability</li>
                    <li>• TSP offers growth potential</li>
                  </ul>
                </div>
                
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-blue-700 font-medium mb-1">Recommendations</div>
                  <ul className="text-sm text-blue-600 space-y-1">
                    <li>• Review TSP allocation for your age</li>
                    <li>• Consider maximizing TSP contributions</li>
                    <li>• Plan for healthcare costs in retirement</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">Planning Checklist</h3>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <input type="checkbox" className="w-4 h-4 text-navy-600" />
                  <span className="text-slate-600">Calculate Social Security benefits</span>
                </div>
                <div className="flex items-center space-x-3">
                  <input type="checkbox" className="w-4 h-4 text-navy-600" />
                  <span className="text-slate-600">Review TSP investment allocation</span>
                </div>
                <div className="flex items-center space-x-3">
                  <input type="checkbox" className="w-4 h-4 text-navy-600" />
                  <span className="text-slate-600">Plan healthcare coverage</span>
                </div>
                <div className="flex items-center space-x-3">
                  <input type="checkbox" className="w-4 h-4 text-navy-600" />
                  <span className="text-slate-600">Create withdrawal strategy</span>
                </div>
                <div className="flex items-center space-x-3">
                  <input type="checkbox" className="w-4 h-4 text-navy-600" />
                  <span className="text-slate-600">Review estate planning</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 🔥 FIRE Gap Calculator - New FireFed Feature */}
      <div className="section-divider"></div>
      <FIREGapCalculator 
        tspProjectedBalance={tspData.projectedBalance}
        pensionMonthly={pensionData.monthlyPension}
      />

      <div className="mt-8 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            📋 This estimate is educational and not official financial advice.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            All calculations are estimates for educational purposes only. 
            Consult with official government resources and financial advisors for authoritative retirement planning.
          </p>
        </div>
      </div>

      <div className="section-divider"></div>
      <div className="card p-6">
        <h3 className="text-xl font-semibold navy-text mb-6">Official Resources</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-3">TSP Resources</h4>
            <div className="space-y-2">
              <a href="https://www.tsp.gov" target="_blank" rel="noopener noreferrer" 
                 className="block text-navy-600 dark:text-navy-400 hover:text-gold-600 dark:hover:text-gold-400 transition-colors">
                → TSP.gov Official Website
              </a>
              <a href="https://www.tsp.gov/calculators" target="_blank" rel="noopener noreferrer"
                 className="block text-navy-600 dark:text-navy-400 hover:text-gold-600 dark:hover:text-gold-400 transition-colors">
                → TSP Calculators
              </a>
            </div>
          </div>
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-3">FERS Resources</h4>
            <div className="space-y-2">
              <a href="https://www.opm.gov/retirement-services/fers-information" target="_blank" rel="noopener noreferrer"
                 className="block text-navy-600 dark:text-navy-400 hover:text-gold-600 dark:hover:text-gold-400 transition-colors">
                → OPM FERS Information
              </a>
              <a href="https://www.opm.gov/retirement-services/calculators" target="_blank" rel="noopener noreferrer"
                 className="block text-navy-600 dark:text-navy-400 hover:text-gold-600 dark:hover:text-gold-400 transition-colors">
                → OPM Retirement Calculators
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SummaryDashboard; 