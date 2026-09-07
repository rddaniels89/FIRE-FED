import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import ProjectionDisclaimer from './ProjectionDisclaimer';
import { Link, useNavigate } from 'react-router-dom';
import AdvancedAnalyticsPanel from './AdvancedAnalyticsPanel';
import OptimizationPanel from './OptimizationPanel';
import { calculateTspTraditionalVsRoth } from '../lib/calculations/tsp';
import { calculateFersResults, DEFAULT_MRA, findEarliestFersImmediateRetirementAge } from '../lib/calculations/fers';
import { calculateFireGap } from '../lib/calculations/fire';
import { calculateSrs } from '../lib/calculations/srs';
import { FEATURES, hasEntitlement } from '../lib/entitlements';
import { trackEvent } from '../lib/telemetry';
import NumberStepper from './NumberStepper';
import { FileDown, Lock, X } from 'lucide-react';
import { createRetirementReportPdf } from '../lib/pdf/report';
import { buildTimeline } from '../lib/projection/timeline';
import { findFireDate } from '../lib/projection/fireDate';
import { oneYearDeltas } from '../lib/projection/deltas';
import { runStressTests } from '../lib/analytics/stressTests';
import { runMonteCarloAnalytics } from '../lib/analytics/monteCarlo';

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
  const navigate = useNavigate();
  
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
    separationAge: 55,
    totalNetWorth: 0,
    fireGoalMonthly: 0
  });

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isPdfSettingsOpen, setIsPdfSettingsOpen] = useState(false);
  const [pdfSettings, setPdfSettings] = useState({
    includeCharts: true,
    detailLevel: 'detailed', // 'compact' | 'detailed'
  });
  const summaryRef = useRef(null);
  const pensionVsTspChartRef = useRef(null);
  const netWorthChartRef = useRef(null);

  const pensionEndAge = Number(currentScenario?.summary?.assumptions?.pensionEndAge ?? 85);

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
          unusedSickLeaveHours: fersScenario.unusedSickLeaveHours ?? 0,
          survivorElection: fersScenario.survivorElection,
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

      // The separation age lives on the profile; `fire.desiredFireAge` is only a mirror.
      if (currentScenario.fire) {
        setFireData(prev => ({
          ...prev,
          separationAge: currentScenario.profile?.separationAge ?? 55,
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

  /**
   * The projected sustainable separation age is owned by My Plan, which reads it
   * from the lifetime timeline: taxes, penalties, healthcare and the supplement
   * all included. This screen used to run its own flat-withdrawal search over
   * the TSP series and print a different number a scroll apart from that one.
   * It now shows the same figure and links to the page that explains it.
   */
  const fireDate = useMemo(() => {
    if (!currentScenario) return null;
    try {
      return findFireDate(currentScenario);
    } catch (e) {
      console.error('FIRE date failed', e);
      return null;
    }
  }, [currentScenario]);

  const calculateFireProjection = useCallback(() => {
    const totalNetWorth = tspData.projectedBalance + pensionData.lifetimePension;

    // Use the user's FIRE goal if provided; otherwise fall back to monthly expenses as a proxy.
    const fireGoalMonthly =
      (currentScenario?.fire?.monthlyFireIncomeGoal ?? 0) > 0
        ? currentScenario.fire.monthlyFireIncomeGoal
        : fireData.monthlyExpenses;

    setFireData(prev => {
      if (prev.totalNetWorth === totalNetWorth && prev.fireGoalMonthly === fireGoalMonthly) {
        return prev;
      }

      return ({
        ...prev,
        totalNetWorth,
        fireGoalMonthly
      });
    });
  }, [tspData.projectedBalance, pensionData.lifetimePension, currentScenario?.fire, fireData.monthlyExpenses]);

  useEffect(() => {
    calculateFireProjection();
  }, [calculateFireProjection]);

  const handleExpenseChange = (value) => {
    setFireData(prev => ({
      ...prev,
      monthlyExpenses: parseFloat(value) || 0
    }));
  };

  const pensionVsTspData = useMemo(() => ({
    labels: ['FERS Pension (Lifetime)', 'TSP Balance'],
    datasets: [
      {
        data: [pensionData.lifetimePension, tspData.projectedBalance],
        backgroundColor: ['#2e4a96', '#d88635'],
        borderColor: ['#253d7a', '#b56d2b'],
        borderWidth: 2
      }
    ]
  }), [pensionData.lifetimePension, tspData.projectedBalance]);

  const netWorthData = useMemo(() => ({
    labels: ['Current', 'At Retirement'],
    datasets: [
      {
        label: 'TSP Balance',
        data: [Number(currentScenario?.tsp?.currentBalance ?? 0), tspData.projectedBalance],
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
  }), [currentScenario?.tsp?.currentBalance, tspData.projectedBalance, pensionData.lifetimePension]);

  const chartOptions = useMemo(() => ({
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
        ticks: { color: '#64748b' },
        grid: { color: '#e2e8f0' }
      },
      y: {
        ticks: {
          color: '#64748b',
          callback: function(value) {
            return '$' + (value / 1000).toFixed(0) + 'K';
          }
        },
        grid: { color: '#e2e8f0' }
      }
    }
  }), []);

  const doughnutOptions = useMemo(() => ({
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
  }), []);

  const generatePDF = async (settingsOverride) => {
    if (!currentScenario) return;

    const settings = settingsOverride || pdfSettings;

    setIsGeneratingPDF(true);
    trackEvent('pdf_export_started', {
      includeCharts: Boolean(settings?.includeCharts),
      detailLevel: settings?.detailLevel || 'detailed',
    });

    try {
      const [{ default: jsPDF }, html2canvasModule] = await Promise.all([
        import('jspdf'),
        settings?.includeCharts ? import('html2canvas') : Promise.resolve(null),
      ]);

      const summaryAssumptionsLocal = currentScenario?.summary?.assumptions ?? {};
      const swrLocal = Number(summaryAssumptionsLocal.safeWithdrawalRate ?? 0.04);
      const pensionEndAgeLocal = Number(summaryAssumptionsLocal.pensionEndAge ?? 85);

      const totalYearsOfService =
        Number(currentScenario?.fers?.yearsOfService ?? 0) + Number(currentScenario?.fers?.monthsOfService ?? 0) / 12;

      const earliestFersImmediateAge = findEarliestFersImmediateRetirementAge({
        currentAge: currentScenario?.fers?.currentAge,
        totalYearsOfService,
        mra: DEFAULT_MRA,
      });

      const pensionStartAge = Number(currentScenario?.fers?.retirementAge ?? pensionData.retirementAge ?? tspData.retirementAge);

      const fersResults = calculateFersResults({
        yearsOfService: currentScenario?.fers?.yearsOfService,
        monthsOfService: currentScenario?.fers?.monthsOfService,
        high3Salary: currentScenario?.fers?.high3Salary,
        currentAge: currentScenario?.fers?.currentAge,
        retirementAge: pensionStartAge,
        showComparison: false,
        includeFutureService: true,
        retirementEndAge: pensionEndAgeLocal,
        mra: DEFAULT_MRA,
        unusedSickLeaveHours: currentScenario?.fers?.unusedSickLeaveHours ?? 0,
        survivorElection: currentScenario?.fers?.survivorElection,
      });

      const ssLocal = currentScenario?.summary?.socialSecurity ?? {};
      const ssModeLocal = ssLocal.mode ?? 'not_configured';
      const ssClaimingAgeLocal = Number(ssLocal.claimingAge ?? 67);
      const ssManualMonthlyLocal = Number(ssLocal.monthlyBenefit ?? 0);
      const ssPctLocal = Number(ssLocal.percentOfSalary ?? 30);
      const tspSalaryLocal = Number(currentScenario?.tsp?.annualSalary ?? 0);
      const ssEstimatedMonthlyLocal =
        ssModeLocal === 'estimate' && tspSalaryLocal > 0 ? (tspSalaryLocal * (ssPctLocal / 100)) / 12 : 0;
      const ssMonthlyLocal =
        ssModeLocal === 'manual' ? ssManualMonthlyLocal : ssModeLocal === 'estimate' ? ssEstimatedMonthlyLocal : 0;

      // Bridge income between retiring and 62. Without it the gap calculation
      // understates early income and hides the drop when the supplement stops.
      const srsLocal = calculateSrs({
        retirementAge: pensionStartAge,
        creditableYearsOfService: fersResults.service.eligibilityYears,
        socialSecurityAt62Monthly: currentScenario?.fers?.socialSecurityAt62Monthly ?? 0,
      });

      const fireGap = calculateFireGap({
        tspProjectedBalance: tspData.projectedBalance,
        pensionMonthly: pensionData.monthlyPension,
        fire: currentScenario?.fire ?? {},
        safeWithdrawalRate: swrLocal,
        desiredFireAge: fireData.separationAge,
        pensionStartAge,
        supplementMonthly: srsLocal.isEligible ? srsLocal.monthlyAfterEarningsTest : 0,
        supplementStartAge: srsLocal.payableFromAge ?? pensionStartAge,
      });

      const totalAnnualIncomeEstimate =
        Number(pensionData.annualPension ?? 0) +
        Number(tspData.projectedBalance ?? 0) * Number(swrLocal || 0.04) +
        Number(ssMonthlyLocal ?? 0) * 12;

      const incomeReplacementPct = (() => {
        const high3 = Number(currentScenario?.fers?.high3Salary ?? pensionData.high3Salary ?? 0);
        if (!high3) return null;
        return Math.round((totalAnnualIncomeEstimate / high3) * 100);
      })();

      const chartImages = {};
      if (settings?.includeCharts && html2canvasModule?.default) {
        const html2canvas = html2canvasModule.default;
        const capture = async (el) => {
          if (!el) return null;
          const canvas = await html2canvas(el, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
          });
          return canvas.toDataURL('image/png');
        };

        chartImages.pensionVsTsp = await capture(pensionVsTspChartRef.current);
        chartImages.netWorth = await capture(netWorthChartRef.current);
      }

      // The report reads from the lifetime timeline. Each analytic is optional:
      // a failure in one of them drops that section rather than the export.
      const attempt = (label, fn) => {
        try {
          return fn();
        } catch (error) {
          console.warn(`PDF export: ${label} skipped`, error);
          return null;
        }
      };
      const reportTimeline = attempt('timeline', () => buildTimeline(currentScenario));
      const reportFireDate = attempt('FIRE date', () => findFireDate(currentScenario));
      const reportDeltas = reportTimeline
        ? attempt('one-year deltas', () => oneYearDeltas(currentScenario, { baseTimeline: reportTimeline }))
        : null;
      const reportStress =
        reportTimeline && hasEntitlement(entitlements, FEATURES.STRESS_TESTS)
          ? attempt('stress tests', () => runStressTests(currentScenario, { baseTimeline: reportTimeline }))
          : null;
      const reportMonteCarlo = hasEntitlement(entitlements, FEATURES.ADVANCED_ANALYTICS)
        ? attempt('Monte Carlo', () => runMonteCarloAnalytics({ scenario: currentScenario, settings: { simulations: 400 } }))
        : null;

      const pdf = createRetirementReportPdf({
        jsPDF,
        scenario: currentScenario,
        timeline: reportTimeline,
        fireDate: reportFireDate,
        deltas: reportDeltas,
        stress: reportStress,
        monteCarlo: reportMonteCarlo,
        settings,
        chartImages,
        computed: {
          generatedAt: new Date().toLocaleString(),
          swr: swrLocal,
          pensionEndAge: pensionEndAgeLocal,
          mra: DEFAULT_MRA,
          earliestFersImmediateAge,

          totalNetWorthAtRetirement: fireData.totalNetWorth,
          tspProjectedBalance: tspData.projectedBalance,
          tspTotalContributions: tspData.totalContributions,
          tspTotalGrowth: tspData.totalGrowth,
          tspCurrentAge: currentScenario?.tsp?.currentAge ?? tspData.currentAge,
          tspRetirementAge: currentScenario?.tsp?.retirementAge ?? tspData.retirementAge,
          tspCurrentBalance: currentScenario?.tsp?.currentBalance ?? 0,
          tspAnnualSalary: currentScenario?.tsp?.annualSalary ?? 0,
          tspEmployeeContributionPct: currentScenario?.tsp?.monthlyContributionPercent ?? null,
          tspAllocation: currentScenario?.tsp?.allocation ?? null,
          tspContributionType: currentScenario?.tsp?.contributionType ?? 'traditional',
          tspValueMode: currentScenario?.tsp?.valueMode ?? 'nominal',
          tspInflationRate: currentScenario?.tsp?.inflationRate ?? 0,

          fersCurrentAge: currentScenario?.fers?.currentAge ?? null,
          plannedRetirementAge: pensionStartAge,
          fersProjectedYearsOfService: Math.round((fersResults.projectedYears ?? fersResults.totalYears ?? 0) * 10) / 10,
          fersHigh3Salary: currentScenario?.fers?.high3Salary ?? pensionData.high3Salary,
          fersMultiplier: fersResults?.stayFed?.multiplier ?? null,
          fersEligibilityMessages: (() => {
            const lines = [];
            const msg = fersResults?.stayFed?.eligibilityMessage;
            if (msg) lines.push(msg);
            if (earliestFersImmediateAge && Number.isFinite(earliestFersImmediateAge)) {
              lines.push(`Earliest immediate retirement age (estimated): ${earliestFersImmediateAge}`);
            }
            return lines;
          })(),

          pensionAnnual: pensionData.annualPension,
          pensionMonthly: pensionData.monthlyPension,
          pensionLifetimeValue: pensionData.lifetimePension,

          desiredFireAge: fireData.separationAge,
          projectedFireAge: reportFireDate?.found ? reportFireDate.separationAge : null,
          fireIncomeGoalMonthly: fireGap.fireIncomeGoal,
          tspMonthlyWithdrawal: fireGap.tspMonthlyWithdrawal,
          monthlyIncomeBeforePension: fireGap.bridge?.monthlyShortfall != null
            ? Math.max(0, fireGap.fireIncomeGoal - fireGap.bridge.monthlyShortfall)
            : fireGap.totalPassiveIncomeAtDesiredAge - (fireGap.pension?.pensionMonthlyAtDesiredAge ?? 0),
          monthlyGapAtDesiredAge: fireGap.monthlyGapAtDesiredAge,
          bridgeYearsToBridge: fireGap.bridge?.yearsToBridge ?? 0,
          bridgeRequiredAssets: fireGap.bridge?.requiredBridgeAssets ?? 0,

          socialSecurityMode: ssModeLocal,
          socialSecurityClaimingAge: ssClaimingAgeLocal,
          socialSecurityMonthly: ssMonthlyLocal,

          totalAnnualIncomeEstimate,
          incomeReplacementPct,
        },
      });

      const safeName = String(currentScenario?.name || 'scenario')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      const dateStamp = new Date().toISOString().slice(0, 10);
      pdf.save(`firefed-report-${safeName || 'scenario'}-${dateStamp}.pdf`);

      trackEvent('pdf_export_succeeded', {
        includeCharts: Boolean(settings?.includeCharts),
        detailLevel: settings?.detailLevel || 'detailed',
      });
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
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold navy-text mb-3">Summary</h1>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              A cross-check of the TSP and pension calculators. The lifetime timeline and the projected sustainable
              separation age are on{' '}
              <Link to="/plan" className="text-navy-600 dark:text-navy-300 hover:underline">
                My Plan
              </Link>
              .
            </p>
          </div>

          {canExportPdf ? (
            <button
              onClick={() => setIsPdfSettingsOpen(true)}
              disabled={isGeneratingPDF}
              className="btn-primary flex items-center gap-2"
            >
              {isGeneratingPDF ? (
                <>
                  <FileDown className="h-4 w-4 animate-pulse" />
                  Generating…
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" />
                  Export PDF
                </>
              )}
            </button>
          ) : (
            <div className="relative group">
              <button
                className="btn-primary opacity-70 hover:opacity-100 flex items-center gap-2"
                title={!isAuthenticated ? "Please log in to export PDF" : "Pro feature — upgrade to export PDF"}
                onClick={() => {
                  if (!isAuthenticated) return;
                  navigate('/pro-features', { state: { reason: 'pdf_export_pro' } });
                }}
              >
                <Lock className="h-4 w-4" />
                Export PDF (Pro)
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 dark:bg-slate-700 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-normal w-64 max-w-[80vw] z-50">
                {!isAuthenticated
                  ? 'Log in to save or export this scenario.'
                  : 'PDF export is a Pro feature. Upgrade on the Pro Features page.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {isPdfSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="absolute inset-0 bg-slate-900/60"
            onClick={() => !isGeneratingPDF && setIsPdfSettingsOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-xl font-semibold navy-text">Export PDF Report</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Choose report options. You’ll get a multi-page report (cover, assumptions, modules, timeline).
                </p>
              </div>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800"
                onClick={() => !isGeneratingPDF && setIsPdfSettingsOpen(false)}
                aria-label="Close export settings"
                disabled={isGeneratingPDF}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={Boolean(pdfSettings.includeCharts)}
                  onChange={(e) => setPdfSettings((prev) => ({ ...prev, includeCharts: e.target.checked }))}
                  disabled={isGeneratingPDF}
                />
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">Include charts</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Embeds the Summary charts as images (optional).</div>
                </div>
              </label>

              <div>
                <div className="font-medium text-slate-800 dark:text-slate-200 mb-2">Detail level</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`px-3 py-2 rounded-lg border text-sm ${
                      pdfSettings.detailLevel === 'compact'
                        ? 'bg-navy-50 dark:bg-navy-900/30 border-navy-300 dark:border-navy-700 text-navy-700 dark:text-navy-300'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                    onClick={() => setPdfSettings((prev) => ({ ...prev, detailLevel: 'compact' }))}
                    disabled={isGeneratingPDF}
                  >
                    Compact
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 rounded-lg border text-sm ${
                      pdfSettings.detailLevel === 'detailed'
                        ? 'bg-navy-50 dark:bg-navy-900/30 border-navy-300 dark:border-navy-700 text-navy-700 dark:text-navy-300'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                    onClick={() => setPdfSettings((prev) => ({ ...prev, detailLevel: 'detailed' }))}
                    disabled={isGeneratingPDF}
                  >
                    Detailed
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                className="btn-secondary"
                onClick={() => setIsPdfSettingsOpen(false)}
                disabled={isGeneratingPDF}
              >
                Cancel
              </button>
              <button
                className="btn-primary flex items-center gap-2"
                onClick={async () => {
                  await generatePDF(pdfSettings);
                  setIsPdfSettingsOpen(false);
                }}
                disabled={isGeneratingPDF}
              >
                <FileDown className="h-4 w-4" />
                {isGeneratingPDF ? 'Generating…' : 'Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={summaryRef} className="bg-white dark:bg-slate-900 p-6 rounded-lg">
        {/* One figure per tile. The third previously packed two numbers and a
            bordered amber panel into a single slot, which read as an error
            state rather than a headline. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <div className="card p-6">
            <div className="stat-label">Net worth at retirement</div>
            <div className="stat-figure mt-2 text-3xl font-semibold text-navy-700 dark:text-navy-300">
              ${fireData.totalNetWorth.toLocaleString()}
            </div>
          </div>

          <div className="card p-6">
            <div className="stat-label">Annual retirement income</div>
            <div className="stat-figure mt-2 text-3xl font-semibold text-slate-900 dark:text-white">
              ${Math.round(pensionData.annualPension + (tspData.projectedBalance * 0.04)).toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {Math.round(((pensionData.annualPension + (tspData.projectedBalance * 0.04)) / pensionData.high3Salary) * 100)}% of your High-3
            </div>
          </div>

          <Link
            to="/plan"
            className="focus-ring card p-6 transition-colors hover:border-gold-300 dark:hover:border-gold-700"
          >
            <div className="stat-label">Projected sustainable separation age</div>
            <div className="stat-figure mt-2 text-3xl font-semibold text-gold-600 dark:text-gold-400">
              {fireDate?.found ? fireDate.separationAge : 'Not found'}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">See it on My Plan</div>
          </Link>

          <div className="card p-6">
            <div className="stat-label">Separation age on file</div>
            <div className="stat-figure mt-2 text-3xl font-semibold text-slate-900 dark:text-white">
              {fireData.separationAge}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Edit under Plan inputs</div>
          </div>
        </div>

        <div className="card p-6 mb-8">
          <h3 className="text-xl font-semibold navy-text mb-1">What the inputs show</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Three readings from the numbers on file, each with the basis it was computed on.
          </p>
          <div className="space-y-4">
            {(() => {
              const workingYears = Math.max(0, tspData.retirementAge - tspData.currentAge);
              const savingsRate = (tspData.totalContributions / (pensionData.high3Salary * workingYears)) * 100;
              return (
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                  <div className="font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                    Savings rate: {Number.isFinite(savingsRate) ? savingsRate.toFixed(1) : '—'}%
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Projected TSP contributions of ${tspData.totalContributions.toLocaleString()} over{' '}
                    {workingYears.toFixed(1)} years, as a share of a ${pensionData.high3Salary.toLocaleString()} high-3
                    salary held flat.
                  </div>
                </div>
              );
            })()}

            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
              <div className="font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                TSP at separation: ${tspData.projectedBalance.toLocaleString()}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                From the current balance and contributions grown at the expected return of the allocation on file, to
                age {tspData.retirementAge}.
              </div>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
              <div className="font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                Projected sustainable separation age:{' '}
                {fireDate?.found ? fireDate.separationAge : 'not found under these inputs'}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                The earliest separation age at which the lifetime timeline never runs short, taxes, penalties,
                healthcare and the supplement included. The separation age on file is {fireData.separationAge}.{' '}
                <Link to="/plan" className="text-navy-600 dark:text-navy-300 hover:underline">
                  See it on My Plan
                </Link>
                .
              </div>
            </div>
          </div>
        </div>

        <AdvancedAnalyticsPanel
          scenario={currentScenario}
          pensionMonthly={pensionData.monthlyPension}
          pensionStartAge={Number(currentScenario?.fers?.retirementAge ?? pensionData.retirementAge ?? tspData.retirementAge ?? 62)}
          entitlements={entitlements}
        />

        <OptimizationPanel />

        <div className="grid lg:grid-cols-2 gap-8 min-w-0 [&>*]:min-w-0">
          <div className="space-y-6">
            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">Pension vs TSP Share</h3>
              <div className="h-64">
                <div ref={pensionVsTspChartRef} className="h-64">
                  <Doughnut data={pensionVsTspData} options={doughnutOptions} />
                </div>
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
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                Lifetime pension value assumes payments through age {pensionEndAge}.
              </p>
              <ProjectionDisclaimer compact className="mt-2" />
            </div>

            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">Net Worth Growth</h3>
              <div className="h-64">
                <div ref={netWorthChartRef} className="h-64">
                  <Bar data={netWorthData} options={chartOptions} />
                </div>
              </div>
              <ProjectionDisclaimer compact className="mt-3" />
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">FIRE Analysis</h3>
              <div className="space-y-4">
                <div>
                  <label className="label">Monthly Expenses</label>
                  <div className="flex items-start gap-2">
                    <input
                      type="number"
                      value={fireData.monthlyExpenses}
                      onChange={(e) => handleExpenseChange(e.target.value)}
                      className="input-field w-full"
                      placeholder="4,000"
                    />
                    <NumberStepper
                      incrementLabel="Increase monthly expenses"
                      decrementLabel="Decrease monthly expenses"
                      onIncrement={() => handleExpenseChange(String((Number(fireData.monthlyExpenses) || 0) + 100))}
                      onDecrement={() => handleExpenseChange(String(Math.max(0, (Number(fireData.monthlyExpenses) || 0) - 100)))}
                      disabledDecrement={(Number(fireData.monthlyExpenses) || 0) <= 0}
                    />
                  </div>
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
                    {fireDate?.found
                      ? `Projected sustainable separation age ${fireDate.separationAge}, against a separation age of ${fireData.separationAge} on file and an income goal of $${Number(fireData.fireGoalMonthly).toLocaleString()} a month.`
                      : fireDate
                        ? 'No separation age within the search range keeps the timeline funded to the end age under these assumptions.'
                        : 'The projected sustainable separation age is unavailable for these inputs.'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    Read from the lifetime timeline on{' '}
                    <Link to="/plan" className="text-navy-600 dark:text-navy-300 hover:underline">
                      My Plan
                    </Link>
                    , which shows what one year either way changes.
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

      {/* FIRE gap analysis at the chosen separation age */}
      <div className="section-divider"></div>
      <FIREGapCalculator 
        tspProjectedBalance={tspData.projectedBalance}
        pensionMonthly={pensionData.monthlyPension}
      />

      <ProjectionDisclaimer className="mt-8" />

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