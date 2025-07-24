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
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useScenario } from '../contexts/ScenarioContext';
import ScenarioManager from './ScenarioManager';

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
  const { currentScenario, updateCurrentScenario } = useScenario();
  
  const [tspData, setTspData] = useState({
    projectedBalance: 800000,
    totalContributions: 300000,
    totalGrowth: 500000,
    retirementAge: 62,
    currentAge: 35
  });

  const [pensionData, setPensionData] = useState({
    annualPension: 25000,
    monthlyPension: 2083,
    lifetimePension: 575000,
    yearsOfService: 20,
    high3Salary: 85000
  });

  const [fireData, setFireData] = useState({
    monthlyExpenses: 4000,
    fireAge: 0,
    fireMessage: '',
    totalNetWorth: 0
  });

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const summaryRef = useRef(null);

  // Load data from current scenario
  useEffect(() => {
    if (currentScenario) {
      // Load TSP data from scenario
      if (currentScenario.tsp) {
        const tspScenario = currentScenario.tsp;
        const yearsToRetirement = tspScenario.retirementAge - tspScenario.currentAge;
        const monthlyContribution = (tspScenario.annualSalary * tspScenario.monthlyContributionPercent / 100) / 12;
        const weightedReturn = Object.keys(tspScenario.allocation).reduce((acc, fund) => {
          const fundReturns = { G: 0.02, F: 0.04, C: 0.07, S: 0.08, I: 0.06 };
          return acc + (tspScenario.allocation[fund] / 100) * fundReturns[fund];
        }, 0);
        
        const monthlyReturn = weightedReturn / 12;
        let balance = tspScenario.currentBalance;
        let totalContributions = 0;
        
        for (let year = 0; year < yearsToRetirement; year++) {
          for (let month = 0; month < 12; month++) {
            balance += monthlyContribution;
            totalContributions += monthlyContribution;
            balance = balance * (1 + monthlyReturn);
          }
        }
        
        setTspData({
          projectedBalance: Math.round(balance),
          totalContributions: Math.round(totalContributions),
          totalGrowth: Math.round(balance - tspScenario.currentBalance - totalContributions),
          retirementAge: tspScenario.retirementAge,
          currentAge: tspScenario.currentAge
        });
      }
      
      // Load FERS data from scenario
      if (currentScenario.fers) {
        const fersScenario = currentScenario.fers;
        const totalYears = fersScenario.yearsOfService + (fersScenario.monthsOfService / 12);
        const additionalYears = Math.max(0, fersScenario.retirementAge - fersScenario.currentAge);
        const finalYears = totalYears + additionalYears;
        
        let multiplier = 0.01;
        if (fersScenario.retirementAge >= 62 && finalYears >= 20) {
          multiplier = 0.011;
        }
        
        const annualPension = fersScenario.high3Salary * finalYears * multiplier;
        const monthlyPension = annualPension / 12;
        const lifeExpectancy = 85;
        const yearsInRetirement = Math.max(0, lifeExpectancy - fersScenario.retirementAge);
        const lifetimePension = annualPension * yearsInRetirement;
        
        setPensionData({
          annualPension: Math.round(annualPension),
          monthlyPension: Math.round(monthlyPension),
          lifetimePension: Math.round(lifetimePension),
          yearsOfService: finalYears,
          high3Salary: fersScenario.high3Salary
        });
      }
      
      // Load summary data from scenario
      if (currentScenario.summary) {
        setFireData(prev => ({
          ...prev,
          monthlyExpenses: currentScenario.summary.monthlyExpenses || 4000
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

  const calculateFireAge = () => {
    const annualExpenses = fireData.monthlyExpenses * 12;
    const fireNumber = annualExpenses * 25; // 4% withdrawal rule
    
    const currentAge = tspData.currentAge;
    const yearsToFire = Math.log(fireNumber / 50000) / Math.log(1.07); // Assuming 7% growth
    const fireAge = Math.max(currentAge, currentAge + yearsToFire);
    
    const totalNetWorth = tspData.projectedBalance + pensionData.lifetimePension;
    
    let fireMessage = '';
    if (fireAge <= tspData.retirementAge) {
      fireMessage = `You may reach FIRE at age ${Math.round(fireAge)} if spending stays at $${fireData.monthlyExpenses.toLocaleString()}/month.`;
    } else {
      fireMessage = `Based on current projections, FIRE would be achieved after your planned retirement age.`;
    }

    setFireData(prev => ({
      ...prev,
      fireAge: Math.round(fireAge),
      fireMessage: fireMessage,
      totalNetWorth: totalNetWorth
    }));
  };

  useEffect(() => {
    calculateFireAge();
  }, [tspData, pensionData, fireData.monthlyExpenses]);

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
    
    try {
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
            <div className="text-3xl font-bold text-slate-600 dark:text-slate-400 mb-2">
              {fireData.fireAge}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">FIRE Age</div>
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
              const fireAchievable = fireData.fireAge <= tspData.retirementAge;
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
                     `Great news! You may achieve FIRE by age ${fireData.fireAge}, before your planned retirement.` :
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
                  <p className="text-xs text-slate-500 mt-1">
                    Annual expenses: ${(fireData.monthlyExpenses * 12).toLocaleString()}
                  </p>
                </div>
                
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-slate-700">
                    <strong>FIRE Number:</strong> ${(fireData.monthlyExpenses * 12 * 25).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Based on 4% withdrawal rule (25x annual expenses)
                  </p>
                </div>
                
                <div className="p-4 bg-navy-50 rounded-lg border border-navy-200">
                  <p className="text-slate-700">
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