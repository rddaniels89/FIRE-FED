import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { useScenario } from '../contexts/ScenarioContext';
import { useAuth } from '../contexts/AuthContext';
import ScenarioManager from './ScenarioManager';
import { calculateTspTraditionalVsRoth } from '../lib/calculations/tsp';
import TooltipWrapper from './TooltipWrapper';
import NumberStepper from './NumberStepper';
import { FEATURES, hasEntitlement } from '../lib/entitlements';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function TSPForecast() {
  const { currentScenario, updateCurrentScenario } = useScenario();
  const { entitlements } = useAuth();
  const canEditFundAssumptions = hasEntitlement(entitlements, FEATURES.ADVANCED_ANALYTICS);
  
  // Flag to prevent loading from scenario while user is typing
  const [, setIsUserTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const didInitialCalcRef = useRef(false);
  
  // Main inputs state - using string values for controlled inputs
  const [inputs, setInputs] = useState({
    currentBalance: '50000',
    currentAge: '35',
    retirementAge: '62',
    monthlyContributionPercent: '10',
    annualSalary: '80000',
    annualSalaryGrowthRate: '3',
    includeEmployerMatch: true,
    includeAutomatic1Percent: true,
    annualEmployeeDeferralLimit: '23500',
    annualCatchUpLimit: '7500',
    catchUpAge: '50',
    inflationRate: '2.5',
    valueMode: 'nominal', // 'nominal' | 'real'
    allocation: {
      G: '10',
      F: '20',
      C: '40',
      S: '20',
      I: '10'
    },
    fundReturns: {
      G: '2',
      F: '3',
      C: '7',
      S: '8',
      I: '6'
    },
    contributionType: 'traditional',
    currentTaxRate: '22',
    retirementTaxRate: '15',
    showComparison: false
  });

  // Utility function to parse numeric inputs only when needed
  const parseNumericInputs = (inputs) => {
    const toNumber = (val) => {
      if (val === '' || val === null || val === undefined) return 0;
      const normalized = String(val).replace(/,/g, '');
      const parsed = parseFloat(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return ({
      currentBalance: toNumber(inputs.currentBalance),
      currentAge: toNumber(inputs.currentAge),
      retirementAge: toNumber(inputs.retirementAge),
      monthlyContributionPercent: toNumber(inputs.monthlyContributionPercent),
      annualSalary: toNumber(inputs.annualSalary),
      annualSalaryGrowthRate: toNumber(inputs.annualSalaryGrowthRate),
      includeEmployerMatch: Boolean(inputs.includeEmployerMatch),
      includeAutomatic1Percent: Boolean(inputs.includeAutomatic1Percent),
      annualEmployeeDeferralLimit: toNumber(inputs.annualEmployeeDeferralLimit),
      annualCatchUpLimit: toNumber(inputs.annualCatchUpLimit),
      catchUpAge: toNumber(inputs.catchUpAge),
      inflationRate: toNumber(inputs.inflationRate),
      valueMode: inputs.valueMode === 'real' ? 'real' : 'nominal',
      allocation: {
        G: toNumber(inputs.allocation.G),
        F: toNumber(inputs.allocation.F),
        C: toNumber(inputs.allocation.C),
        S: toNumber(inputs.allocation.S),
        I: toNumber(inputs.allocation.I)
      },
      fundReturns: {
        G: toNumber(inputs.fundReturns?.G),
        F: toNumber(inputs.fundReturns?.F),
        C: toNumber(inputs.fundReturns?.C),
        S: toNumber(inputs.fundReturns?.S),
        I: toNumber(inputs.fundReturns?.I),
      },
      contributionType: inputs.contributionType,
      currentTaxRate: toNumber(inputs.currentTaxRate),
      retirementTaxRate: toNumber(inputs.retirementTaxRate),
      showComparison: inputs.showComparison
    });
  };
  
  // Results state
  const [results, setResults] = useState({
    traditional: {
      projectedBalance: 0,
      totalContributions: 0,
      totalGrowth: 0,
      yearlyData: [],
      afterTaxValue: 0
    },
    roth: {
      projectedBalance: 0,
      totalContributions: 0,
      totalGrowth: 0,
      yearlyData: [],
      afterTaxValue: 0
    }
  });
  const [calcMeta, setCalcMeta] = useState({
    weightedReturn: 0,
    years: 0,
    limits: null,
  });

  // Validation state
  const [validationErrors, setValidationErrors] = useState({});

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Load from scenario context ONLY when the scenario changes (by id)
  const lastScenarioIdRef = useRef(null);
  useEffect(() => {
    const scenarioId = currentScenario?.id;
    if (!scenarioId || !currentScenario?.tsp) return;

    // Skip if this is the same scenario, to avoid clobbering in-progress edits
    if (lastScenarioIdRef.current === scenarioId) return;
    lastScenarioIdRef.current = scenarioId;

    const tsp = currentScenario.tsp;
    const newInputs = {
      currentBalance: String(tsp.currentBalance ?? 50000),
      currentAge: String(tsp.currentAge ?? 35),
      retirementAge: String(tsp.retirementAge ?? 62),
      monthlyContributionPercent: String(tsp.monthlyContributionPercent ?? 10),
      annualSalary: String(tsp.annualSalary ?? 80000),
      annualSalaryGrowthRate: String(tsp.annualSalaryGrowthRate ?? 3),
      includeEmployerMatch: Boolean(tsp.includeEmployerMatch ?? true),
      includeAutomatic1Percent: Boolean(tsp.includeAutomatic1Percent ?? true),
      annualEmployeeDeferralLimit: String(tsp.annualEmployeeDeferralLimit ?? 23500),
      annualCatchUpLimit: String(tsp.annualCatchUpLimit ?? 7500),
      catchUpAge: String(tsp.catchUpAge ?? 50),
      inflationRate: String(tsp.inflationRate ?? 2.5),
      valueMode: tsp.valueMode === 'real' ? 'real' : 'nominal',
      allocation: {
        G: String(tsp.allocation?.G ?? 10),
        F: String(tsp.allocation?.F ?? 20),
        C: String(tsp.allocation?.C ?? 40),
        S: String(tsp.allocation?.S ?? 20),
        I: String(tsp.allocation?.I ?? 10)
      },
      fundReturns: {
        G: String((tsp.fundReturns?.G ?? 2)),
        F: String((tsp.fundReturns?.F ?? 3)),
        C: String((tsp.fundReturns?.C ?? 7)),
        S: String((tsp.fundReturns?.S ?? 8)),
        I: String((tsp.fundReturns?.I ?? 6)),
      },
      contributionType: tsp.contributionType ?? 'traditional',
      currentTaxRate: String(tsp.currentTaxRate ?? 22),
      retirementTaxRate: String(tsp.retirementTaxRate ?? 15),
      showComparison: Boolean(tsp.showComparison)
    };

    setInputs(prevInputs => ({ ...prevInputs, ...newInputs }));
  }, [currentScenario?.id]);

  // Save to scenario context when inputs change (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (currentScenario && Object.keys(inputs).length > 0) {
        // Only update if we have actual input values
        const hasValidInputs = inputs.currentAge && inputs.retirementAge;
        if (hasValidInputs) {
          updateCurrentScenario({
            tsp: parseNumericInputs(inputs)
          });
        }
      }
    }, 1000); // Standard debounce

    return () => clearTimeout(timeoutId);
  }, [inputs, updateCurrentScenario]);

  // Handle numeric input changes with validation
  const handleInputChange = useCallback((field, value) => {
    // Keep input handling максимально permissive to avoid “stuck” controlled inputs.
    // Validation/parsing happens elsewhere (validateInputs + parseNumericInputs).
    const nextValue = String(value ?? '');
    
    setIsUserTyping(true);
    setInputs(prev => ({
      ...prev,
      [field]: nextValue
    }));
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout to clear typing flag
    typingTimeoutRef.current = setTimeout(() => {
      setIsUserTyping(false);
    }, 1500);
  }, []);

  // Handle allocation input changes with decimal validation
  const handleAllocationChange = useCallback((fund, value) => {
    const nextValue = String(value ?? '');
    
    setIsUserTyping(true);
    setInputs(prev => ({
      ...prev,
      allocation: {
        ...prev.allocation,
        [fund]: nextValue
      }
    }));
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout to clear typing flag
    typingTimeoutRef.current = setTimeout(() => {
      setIsUserTyping(false);
    }, 1500);
  }, []);

  const stepField = useCallback((field, { step = 1, min = -Infinity, max = Infinity, integer = true } = {}) => {
    const numeric = parseNumericInputs(inputs);
    const current = Number(numeric?.[field] ?? 0);
    const safeCurrent = Number.isFinite(current) ? current : 0;

    return (direction) => {
      const nextRaw = safeCurrent + direction * step;
      const clamped = Math.min(max, Math.max(min, nextRaw));
      const next = integer ? Math.round(clamped) : clamped;
      handleInputChange(field, String(next));
    };
  }, [inputs, handleInputChange]);

  const stepAllocation = useCallback((fund, { step = 1, min = 0, max = 100, integer = false } = {}) => {
    const numeric = parseNumericInputs(inputs);
    const current = Number(numeric?.allocation?.[fund] ?? 0);
    const safeCurrent = Number.isFinite(current) ? current : 0;

    return (direction) => {
      const nextRaw = safeCurrent + direction * step;
      const clamped = Math.min(max, Math.max(min, nextRaw));
      const next = integer ? Math.round(clamped) : Math.round(clamped * 100) / 100;
      handleAllocationChange(fund, String(next));
    };
  }, [inputs, handleAllocationChange]);

  // Contribution type change handler
  const handleContributionTypeChange = useCallback((type) => {
    setInputs(prev => ({
      ...prev,
      contributionType: type
    }));
  }, []);

  // Toggle comparison handler
  const handleToggleComparison = useCallback(() => {
    setInputs(prev => ({
      ...prev,
      showComparison: !prev.showComparison
    }));
  }, []);

  const handleToggleEmployerMatch = useCallback(() => {
    setInputs(prev => ({
      ...prev,
      includeEmployerMatch: !prev.includeEmployerMatch
    }));
  }, []);

  const handleToggleAutomatic1Percent = useCallback(() => {
    setInputs(prev => ({
      ...prev,
      includeAutomatic1Percent: !prev.includeAutomatic1Percent
    }));
  }, []);

  const handleValueModeChange = useCallback((mode) => {
    setInputs(prev => ({
      ...prev,
      valueMode: mode === 'real' ? 'real' : 'nominal'
    }));
  }, []);

  const handleFundReturnChange = useCallback((fund, value) => {
    const nextValue = String(value ?? '');
    setIsUserTyping(true);
    setInputs(prev => ({
      ...prev,
      fundReturns: {
        ...prev.fundReturns,
        [fund]: nextValue
      }
    }));

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsUserTyping(false), 1500);
  }, []);

  // Auto-adjust allocation to 100% helper
  const autoAdjustAllocation = useCallback(() => {
    const numericInputs = parseNumericInputs(inputs);
    const currentTotal = Object.values(numericInputs.allocation).reduce((sum, val) => sum + val, 0);
    if (currentTotal === 0) return;

    const scaleFactor = 100 / currentTotal;
    const adjustedAllocation = {};
    
    Object.keys(numericInputs.allocation).forEach(fund => {
      adjustedAllocation[fund] = String(Math.round(numericInputs.allocation[fund] * scaleFactor * 100) / 100);
    });

    setInputs(prev => ({
      ...prev,
      allocation: adjustedAllocation
    }));
  }, [inputs]);

  // Validation function
  const validateInputs = useCallback(() => {
    const numericInputs = parseNumericInputs(inputs);
    const errors = {};
    
    if (numericInputs.currentBalance < 0) {
      errors.currentBalance = 'Current balance cannot be negative';
    }
    if (numericInputs.currentAge < 18 || numericInputs.currentAge > 999) {
      errors.currentAge = 'Current age must be between 18 and 999';
    }
    if (numericInputs.retirementAge <= numericInputs.currentAge || numericInputs.retirementAge > 999) {
      errors.retirementAge = 'Retirement age must be greater than current age and less than 999';
    }
    if (numericInputs.monthlyContributionPercent < 0 || numericInputs.monthlyContributionPercent > 100) {
      errors.monthlyContributionPercent = 'Contribution percentage must be between 0 and 100';
    }
    if (numericInputs.annualSalary <= 0) {
      errors.annualSalary = 'Annual salary must be greater than 0';
    }
    if (numericInputs.annualSalaryGrowthRate < -100 || numericInputs.annualSalaryGrowthRate > 100) {
      errors.annualSalaryGrowthRate = 'Salary growth rate must be between -100% and 100%';
    }
    if (numericInputs.inflationRate < 0 || numericInputs.inflationRate > 25) {
      errors.inflationRate = 'Inflation rate must be between 0% and 25%';
    }
    if (numericInputs.annualEmployeeDeferralLimit < 0) {
      errors.annualEmployeeDeferralLimit = 'Annual deferral limit must be 0 or greater';
    }
    if (numericInputs.annualCatchUpLimit < 0) {
      errors.annualCatchUpLimit = 'Catch-up limit must be 0 or greater';
    }
    if (numericInputs.catchUpAge < 0 || numericInputs.catchUpAge > 200) {
      errors.catchUpAge = 'Catch-up age must be between 0 and 200';
    }

    const allocationTotal = Object.values(numericInputs.allocation).reduce((sum, val) => sum + val, 0);
    if (Math.abs(allocationTotal - 100) > 0.1) {
      errors.allocation = 'Fund allocation must total 100%';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [inputs]);

  // Calculate projections
  const calculateProjections = useCallback(() => {
    if (!validateInputs()) return;

    const numericInputs = parseNumericInputs(inputs);
    const fundReturns = canEditFundAssumptions
      ? {
          G: (numericInputs.fundReturns.G ?? 0) / 100,
          F: (numericInputs.fundReturns.F ?? 0) / 100,
          C: (numericInputs.fundReturns.C ?? 0) / 100,
          S: (numericInputs.fundReturns.S ?? 0) / 100,
          I: (numericInputs.fundReturns.I ?? 0) / 100,
        }
      : undefined;

    const res = calculateTspTraditionalVsRoth({
      currentBalance: numericInputs.currentBalance,
      annualSalary: numericInputs.annualSalary,
      monthlyContributionPercent: numericInputs.monthlyContributionPercent,
      currentAge: numericInputs.currentAge,
      retirementAge: numericInputs.retirementAge,
      allocation: numericInputs.allocation,
      currentTaxRate: numericInputs.currentTaxRate,
      retirementTaxRate: numericInputs.retirementTaxRate,
      fundReturns,
      annualSalaryGrowthRate: (numericInputs.annualSalaryGrowthRate ?? 0) / 100,
      inflationRate: (numericInputs.inflationRate ?? 0) / 100,
      includeEmployerMatch: numericInputs.includeEmployerMatch,
      includeAutomatic1Percent: numericInputs.includeAutomatic1Percent,
      annualEmployeeDeferralLimit: numericInputs.annualEmployeeDeferralLimit,
      annualCatchUpLimit: numericInputs.annualCatchUpLimit,
      catchUpAge: numericInputs.catchUpAge,
    });

    setResults({ traditional: res.traditional, roth: res.roth });
    setCalcMeta({ weightedReturn: res.weightedReturn ?? 0, years: res.years ?? 0, limits: res.limits ?? null });
  }, [inputs, validateInputs, canEditFundAssumptions]);

  // Calculate on input changes (debounced)
  useEffect(() => {
    // Run once immediately on mount; debounce thereafter to keep typing responsive.
    if (!didInitialCalcRef.current) {
      didInitialCalcRef.current = true;
      calculateProjections();
      return;
    }

    const timeoutId = setTimeout(calculateProjections, 300); // Shorter debounce for calculations

    return () => clearTimeout(timeoutId);
  }, [calculateProjections]);

  // Memoize chart props so typing doesn't trigger Chart.js redraws unless results/value mode changed.
  const useRealMode = inputs.valueMode === 'real';

  const traditionalChartData = useMemo(() => {
    const data = results.traditional;
    return {
      labels: data.yearlyData.map(d => d.year),
      datasets: [
        {
          label: 'Traditional TSP Balance',
          data: data.yearlyData.map(d => useRealMode ? (d.balanceReal ?? d.balance) : d.balance),
          borderColor: '#2e4a96',
          backgroundColor: 'rgba(46, 74, 150, 0.1)',
          fill: true,
          tension: 0.1
        },
        {
          label: 'After-Tax Value',
          data: data.yearlyData.map(d => useRealMode ? (d.afterTaxValueReal ?? d.afterTaxValue) : d.afterTaxValue),
          borderColor: '#1a2b55',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          fill: false,
          tension: 0.1
        }
      ]
    };
  }, [results.traditional, useRealMode]);

  const rothChartData = useMemo(() => {
    const data = results.roth;
    return {
      labels: data.yearlyData.map(d => d.year),
      datasets: [
        {
          label: 'Roth TSP Balance',
          data: data.yearlyData.map(d => useRealMode ? (d.balanceReal ?? d.balance) : d.balance),
          borderColor: '#d88635',
          backgroundColor: 'rgba(216, 134, 53, 0.1)',
          fill: true,
          tension: 0.1
        },
        {
          label: 'After-Tax Value',
          data: data.yearlyData.map(d => useRealMode ? (d.afterTaxValueReal ?? d.afterTaxValue) : d.afterTaxValue),
          borderColor: '#b56d2b',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          fill: false,
          tension: 0.1
        }
      ]
    };
  }, [results.roth, useRealMode]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      title: { display: false },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return '$' + value.toLocaleString();
          }
        }
      }
    }
  }), []);

  const primaryChartData = inputs.showComparison
    ? traditionalChartData
    : (inputs.contributionType === 'roth' ? rothChartData : traditionalChartData);

  // Get recommendation for Traditional vs Roth
  const getRecommendation = () => {
    const rothAdvantage = results.roth.afterTaxValue - results.traditional.afterTaxValue;
    const rothAdvantagePercent = results.traditional.afterTaxValue > 0 ? (rothAdvantage / results.traditional.afterTaxValue) * 100 : 0;
    const diffAbs = Math.round(Math.abs(rothAdvantage));
    const taxNow = numericInputs.currentTaxRate;
    const taxLater = numericInputs.retirementTaxRate;
    
    if (Math.abs(rothAdvantagePercent) < 5) {
      return {
        type: 'neutral',
        title: 'Similar Outcomes',
        message: `Both Traditional and Roth TSP provide similar after-tax values (within ~5%). Consider splitting contributions to diversify tax treatment.`,
        details: [
          `Current vs retirement tax rate: ${taxNow}% vs ${taxLater}%`,
          numericInputs.includeEmployerMatch ? 'Employer contributions are included (assumed pre-tax).' : 'Employer contributions are not included.',
          calcMeta?.limits?.isOverLimit ? 'Your selected contribution % exceeds the annual limit; employee contributions are capped in this model.' : 'Employee contributions are within the annual limit (based on settings).'
        ],
        icon: '⚖️'
      };
    } else if (rothAdvantagePercent > 5) {
      return {
        type: 'roth',
        title: 'Roth TSP Recommended',
        message: `Roth TSP provides ~${Math.round(rothAdvantagePercent)}% more after-tax value (about ${formatDollars(diffAbs)}). This usually happens when your current tax rate is lower than your expected retirement tax rate.`,
        details: [
          `Current vs retirement tax rate: ${taxNow}% vs ${taxLater}%`,
          numericInputs.includeEmployerMatch ? 'Employer contributions are included (assumed pre-tax, taxed in retirement).' : 'Employer contributions are not included.',
          'Recommendation is based on after-tax retirement value (not take-home pay today).'
        ],
        icon: '🟢'
      };
    } else {
      return {
        type: 'traditional',
        title: 'Traditional TSP Recommended',
        message: `Traditional TSP provides ~${Math.round(Math.abs(rothAdvantagePercent))}% more after-tax value (about ${formatDollars(diffAbs)}). This usually happens when your current tax rate is higher than your expected retirement tax rate.`,
        details: [
          `Current vs retirement tax rate: ${taxNow}% vs ${taxLater}%`,
          numericInputs.includeEmployerMatch ? 'Employer contributions are included (assumed pre-tax, taxed in retirement).' : 'Employer contributions are not included.',
          'Recommendation is based on after-tax retirement value (not take-home pay today).'
        ],
        icon: '🔵'
      };
    }
  };

  // Helper to get input display value or actual value
  const getDisplayValue = (field) => {
    return inputs[field];
  };

  const getAllocationDisplayValue = (fund) => {
    return inputs.allocation[fund];
  };

  // Parse numeric inputs for rendering
  const numericInputs = parseNumericInputs(inputs);

  const formatDollars = (amount) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount ?? 0);

  const desiredAnnualEmployeeContribution =
    (numericInputs.annualSalary * numericInputs.monthlyContributionPercent) / 100;
  const employeeLimitThisYear = calcMeta?.limits?.annualEmployeeDeferralLimit ?? 0;
  const effectiveAnnualEmployeeContribution = calcMeta?.limits?.effectiveAnnualEmployeeContribution ?? desiredAnnualEmployeeContribution;
  const isOverLimit = Boolean(calcMeta?.limits?.isOverLimit);

  return (
    <div className="animate-fade-in">
      <ScenarioManager />
      
      <div className="mb-8">
        <h1 className="text-3xl font-bold navy-text mb-3">TSP Forecast Calculator</h1>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
          Calculate your Thrift Savings Plan growth using compound interest projections 
          and compare Traditional vs Roth contribution strategies.
        </p>
      </div>

      {/* Validation Error Summary */}
      {Object.keys(validationErrors).length > 0 && (
        <div className="mb-6 card p-4 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <h3 className="text-red-600 dark:text-red-400 font-medium mb-2">Please fix the following issues:</h3>
          <ul className="list-disc list-inside space-y-1">
            {Object.values(validationErrors).map((error, index) => (
              <li key={index} className="text-red-600 dark:text-red-400 text-sm">{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Input Section */}
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-xl font-semibold navy-text mb-6">Current Information</h3>
            <div className="grid grid-cols-2 gap-6">
              <TooltipWrapper text="Your current TSP account balance">
                <div>
                  <label className="label" htmlFor="currentBalance">Starting TSP Balance</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      id="currentBalance"
                      type="text"
                      value={getDisplayValue('currentBalance')}
                      onChange={(e) => handleInputChange('currentBalance', e.target.value)}
                      className="input-field w-full"
                      placeholder="1000000"
                      inputMode="decimal"
                    />
                    <NumberStepper
                      incrementLabel="Increase starting TSP balance"
                      decrementLabel="Decrease starting TSP balance"
                      onIncrement={() => stepField('currentBalance', { step: 1000, min: 0, integer: true })(+1)}
                      onDecrement={() => stepField('currentBalance', { step: 1000, min: 0, integer: true })(-1)}
                      disabledDecrement={numericInputs.currentBalance <= 0}
                    />
                  </div>
                  {validationErrors.currentBalance && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.currentBalance}</p>
                  )}
                </div>
              </TooltipWrapper>
              
              <TooltipWrapper text="Your current age in years">
                <div>
                  <label className="label" htmlFor="currentAge">Current Age</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      id="currentAge"
                      type="text"
                      value={getDisplayValue('currentAge')}
                      onChange={(e) => handleInputChange('currentAge', e.target.value)}
                      className="input-field w-full"
                      placeholder="e.g. 35"
                      inputMode="numeric"
                    />
                    <NumberStepper
                      incrementLabel="Increase current age"
                      decrementLabel="Decrease current age"
                      onIncrement={() => stepField('currentAge', { step: 1, min: 18, max: 999, integer: true })(+1)}
                      onDecrement={() => stepField('currentAge', { step: 1, min: 18, max: 999, integer: true })(-1)}
                      disabledDecrement={numericInputs.currentAge <= 18}
                    />
                  </div>
                  {validationErrors.currentAge && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.currentAge}</p>
                  )}
                </div>
              </TooltipWrapper>
              
              <TooltipWrapper text="Age when you plan to retire">
                <div>
                  <label className="label" htmlFor="retirementAge">Target Retirement Age</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      id="retirementAge"
                      type="text"
                      value={getDisplayValue('retirementAge')}
                      onChange={(e) => handleInputChange('retirementAge', e.target.value)}
                      className="input-field w-full"
                      placeholder="62"
                      inputMode="numeric"
                    />
                    <NumberStepper
                      incrementLabel="Increase target retirement age"
                      decrementLabel="Decrease target retirement age"
                      onIncrement={() => stepField('retirementAge', { step: 1, min: 19, max: 999, integer: true })(+1)}
                      onDecrement={() => stepField('retirementAge', { step: 1, min: 19, max: 999, integer: true })(-1)}
                      disabledDecrement={numericInputs.retirementAge <= 19}
                    />
                  </div>
                  {validationErrors.retirementAge && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.retirementAge}</p>
                  )}
                </div>
              </TooltipWrapper>
              
              <TooltipWrapper text="Your current annual salary">
                <div>
                  <label className="label" htmlFor="annualSalary">Annual Salary</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      id="annualSalary"
                      type="text"
                      value={getDisplayValue('annualSalary')}
                      onChange={(e) => handleInputChange('annualSalary', e.target.value)}
                      className="input-field w-full"
                      placeholder="1000000"
                      inputMode="decimal"
                    />
                    <NumberStepper
                      incrementLabel="Increase annual salary"
                      decrementLabel="Decrease annual salary"
                      onIncrement={() => stepField('annualSalary', { step: 1000, min: 0, integer: true })(+1)}
                      onDecrement={() => stepField('annualSalary', { step: 1000, min: 0, integer: true })(-1)}
                      disabledDecrement={numericInputs.annualSalary <= 0}
                    />
                  </div>
                  {validationErrors.annualSalary && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.annualSalary}</p>
                  )}
                </div>
              </TooltipWrapper>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-xl font-semibold navy-text mb-6">Contribution Settings</h3>
            
            <div className="mb-6">
              <label className="label">Contribution Type</label>
              <div className="flex space-x-4 mb-4">
                <button
                  onClick={() => handleContributionTypeChange('traditional')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    inputs.contributionType === 'traditional'
                      ? 'bg-navy-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  Traditional
                </button>
                <button
                  onClick={() => handleContributionTypeChange('roth')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    inputs.contributionType === 'roth'
                      ? 'bg-gold-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  Roth
                </button>
              </div>
              
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="showComparison"
                  checked={inputs.showComparison}
                  onChange={handleToggleComparison}
                  className="w-4 h-4 text-navy-600"
                />
                <label htmlFor="showComparison" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Show Traditional vs Roth Comparison
                </label>
              </div>
            </div>

            <TooltipWrapper text="Percentage of salary contributed to TSP each month">
              <div className="mb-4">
                <label className="label" htmlFor="monthlyContributionPercent">Monthly Contribution %</label>
                <div className="flex items-stretch gap-2">
                  <input
                    id="monthlyContributionPercent"
                    type="text"
                    value={getDisplayValue('monthlyContributionPercent')}
                    onChange={(e) => handleInputChange('monthlyContributionPercent', e.target.value)}
                    className="input-field w-full"
                    placeholder="10"
                    inputMode="decimal"
                  />
                  <NumberStepper
                    incrementLabel="Increase monthly contribution percent"
                    decrementLabel="Decrease monthly contribution percent"
                    onIncrement={() => stepField('monthlyContributionPercent', { step: 1, min: 0, max: 100, integer: false })(+1)}
                    onDecrement={() => stepField('monthlyContributionPercent', { step: 1, min: 0, max: 100, integer: false })(-1)}
                    disabledDecrement={numericInputs.monthlyContributionPercent <= 0}
                  />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  Desired monthly employee contribution: ${((numericInputs.annualSalary * numericInputs.monthlyContributionPercent / 100) / 12).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
                <p className={`text-sm mt-1 ${isOverLimit ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                  Annual employee contribution: {formatDollars(desiredAnnualEmployeeContribution)}{' '}
                  {employeeLimitThisYear > 0 && (
                    <>
                      (limit {formatDollars(employeeLimitThisYear)}
                      {isOverLimit ? `, capped to ${formatDollars(effectiveAnnualEmployeeContribution)}` : ''})
                    </>
                  )}
                </p>
                {validationErrors.monthlyContributionPercent && (
                  <p className="text-red-500 text-xs mt-1">{validationErrors.monthlyContributionPercent}</p>
                )}
              </div>
            </TooltipWrapper>

            <div className="mt-4 space-y-3">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="includeEmployerMatch"
                  checked={Boolean(inputs.includeEmployerMatch)}
                  onChange={handleToggleEmployerMatch}
                  className="w-4 h-4 text-navy-600"
                />
                <label htmlFor="includeEmployerMatch" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Include agency automatic 1% + match (simplified FERS formula)
                </label>
              </div>

              {inputs.includeEmployerMatch && (
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="includeAutomatic1Percent"
                    checked={Boolean(inputs.includeAutomatic1Percent)}
                    onChange={handleToggleAutomatic1Percent}
                    className="w-4 h-4 text-navy-600"
                  />
                  <label htmlFor="includeAutomatic1Percent" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Include automatic 1% (even if employee contributions are capped)
                  </label>
                </div>
              )}
            </div>

            {inputs.showComparison && (
              <div className="grid grid-cols-2 gap-4">
                <TooltipWrapper text="Your current marginal tax rate">
                  <div>
                    <label className="label">Current Tax Rate %</label>
                    <div className="flex items-stretch gap-2">
                      <input
                        type="text"
                        value={getDisplayValue('currentTaxRate')}
                        onChange={(e) => handleInputChange('currentTaxRate', e.target.value)}
                        className="input-field w-full"
                        placeholder="22"
                        inputMode="decimal"
                      />
                      <NumberStepper
                        incrementLabel="Increase current tax rate"
                        decrementLabel="Decrease current tax rate"
                        onIncrement={() => stepField('currentTaxRate', { step: 1, min: 0, max: 60, integer: false })(+1)}
                        onDecrement={() => stepField('currentTaxRate', { step: 1, min: 0, max: 60, integer: false })(-1)}
                        disabledDecrement={numericInputs.currentTaxRate <= 0}
                      />
                    </div>
                    {validationErrors.currentTaxRate && (
                      <p className="text-red-500 text-xs mt-1">{validationErrors.currentTaxRate}</p>
                    )}
                  </div>
                </TooltipWrapper>
                
                <TooltipWrapper text="Expected tax rate in retirement">
                  <div>
                    <label className="label">Retirement Tax Rate %</label>
                    <div className="flex items-stretch gap-2">
                      <input
                        type="text"
                        value={getDisplayValue('retirementTaxRate')}
                        onChange={(e) => handleInputChange('retirementTaxRate', e.target.value)}
                        className="input-field w-full"
                        placeholder="15"
                        inputMode="decimal"
                      />
                      <NumberStepper
                        incrementLabel="Increase retirement tax rate"
                        decrementLabel="Decrease retirement tax rate"
                        onIncrement={() => stepField('retirementTaxRate', { step: 1, min: 0, max: 60, integer: false })(+1)}
                        onDecrement={() => stepField('retirementTaxRate', { step: 1, min: 0, max: 60, integer: false })(-1)}
                        disabledDecrement={numericInputs.retirementTaxRate <= 0}
                      />
                    </div>
                    {validationErrors.retirementTaxRate && (
                      <p className="text-red-500 text-xs mt-1">{validationErrors.retirementTaxRate}</p>
                    )}
                  </div>
                </TooltipWrapper>
              </div>
            )}
          </div>

          <div className="card p-6">
            <h3 className="text-xl font-semibold navy-text mb-6">Assumptions</h3>

            <div className="grid grid-cols-2 gap-6">
              <TooltipWrapper text="Expected annual salary growth used for future contributions">
                <div>
                  <label className="label" htmlFor="annualSalaryGrowthRate">Salary Growth % (annual)</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      id="annualSalaryGrowthRate"
                      type="text"
                      value={getDisplayValue('annualSalaryGrowthRate')}
                      onChange={(e) => handleInputChange('annualSalaryGrowthRate', e.target.value)}
                      className="input-field w-full"
                      placeholder="3"
                      inputMode="decimal"
                    />
                    <NumberStepper
                      incrementLabel="Increase salary growth rate"
                      decrementLabel="Decrease salary growth rate"
                      onIncrement={() => stepField('annualSalaryGrowthRate', { step: 0.5, min: -100, max: 100, integer: false })(+1)}
                      onDecrement={() => stepField('annualSalaryGrowthRate', { step: 0.5, min: -100, max: 100, integer: false })(-1)}
                    />
                  </div>
                  {validationErrors.annualSalaryGrowthRate && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.annualSalaryGrowthRate}</p>
                  )}
                </div>
              </TooltipWrapper>

              <TooltipWrapper text="Used only when displaying values in today's dollars (inflation-adjusted)">
                <div>
                  <label className="label" htmlFor="inflationRate">Inflation % (annual)</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      id="inflationRate"
                      type="text"
                      value={getDisplayValue('inflationRate')}
                      onChange={(e) => handleInputChange('inflationRate', e.target.value)}
                      className="input-field w-full"
                      placeholder="2.5"
                      inputMode="decimal"
                    />
                    <NumberStepper
                      incrementLabel="Increase inflation rate"
                      decrementLabel="Decrease inflation rate"
                      onIncrement={() => stepField('inflationRate', { step: 0.25, min: 0, max: 25, integer: false })(+1)}
                      onDecrement={() => stepField('inflationRate', { step: 0.25, min: 0, max: 25, integer: false })(-1)}
                      disabledDecrement={numericInputs.inflationRate <= 0}
                    />
                  </div>
                  {validationErrors.inflationRate && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.inflationRate}</p>
                  )}
                </div>
              </TooltipWrapper>
            </div>

            <div className="mt-5">
              <label className="label">Display values</label>
              <div className="flex gap-3">
                <button
                  onClick={() => handleValueModeChange('nominal')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    inputs.valueMode !== 'real'
                      ? 'bg-navy-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  Future dollars
                </button>
                <button
                  onClick={() => handleValueModeChange('real')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    inputs.valueMode === 'real'
                      ? 'bg-gold-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  Today&apos;s dollars (inflation-adjusted)
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Weighted portfolio return (based on your allocation): {(Number(calcMeta.weightedReturn ?? 0) * 100).toFixed(2)}% annual
              </p>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-xl font-semibold navy-text mb-6">Contribution Limits</h3>
            <div className="grid grid-cols-2 gap-6">
              <TooltipWrapper text="Annual employee elective deferral limit (editable; limits change over time)">
                <div>
                  <label className="label" htmlFor="annualEmployeeDeferralLimit">Annual deferral limit ($)</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      id="annualEmployeeDeferralLimit"
                      type="text"
                      value={getDisplayValue('annualEmployeeDeferralLimit')}
                      onChange={(e) => handleInputChange('annualEmployeeDeferralLimit', e.target.value)}
                      className="input-field w-full"
                      placeholder="23500"
                      inputMode="decimal"
                    />
                    <NumberStepper
                      incrementLabel="Increase annual deferral limit"
                      decrementLabel="Decrease annual deferral limit"
                      onIncrement={() => stepField('annualEmployeeDeferralLimit', { step: 500, min: 0, max: 1000000, integer: true })(+1)}
                      onDecrement={() => stepField('annualEmployeeDeferralLimit', { step: 500, min: 0, max: 1000000, integer: true })(-1)}
                      disabledDecrement={numericInputs.annualEmployeeDeferralLimit <= 0}
                    />
                  </div>
                  {validationErrors.annualEmployeeDeferralLimit && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.annualEmployeeDeferralLimit}</p>
                  )}
                </div>
              </TooltipWrapper>

              <TooltipWrapper text="Additional catch-up amount allowed at/after the catch-up age (editable)">
                <div>
                  <label className="label" htmlFor="annualCatchUpLimit">Catch-up limit ($)</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      id="annualCatchUpLimit"
                      type="text"
                      value={getDisplayValue('annualCatchUpLimit')}
                      onChange={(e) => handleInputChange('annualCatchUpLimit', e.target.value)}
                      className="input-field w-full"
                      placeholder="7500"
                      inputMode="decimal"
                    />
                    <NumberStepper
                      incrementLabel="Increase annual catch-up limit"
                      decrementLabel="Decrease annual catch-up limit"
                      onIncrement={() => stepField('annualCatchUpLimit', { step: 250, min: 0, max: 1000000, integer: true })(+1)}
                      onDecrement={() => stepField('annualCatchUpLimit', { step: 250, min: 0, max: 1000000, integer: true })(-1)}
                      disabledDecrement={numericInputs.annualCatchUpLimit <= 0}
                    />
                  </div>
                  {validationErrors.annualCatchUpLimit && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.annualCatchUpLimit}</p>
                  )}
                </div>
              </TooltipWrapper>
            </div>

            <div className="mt-4">
              <TooltipWrapper text="Age at which catch-up is applied in this model (editable)">
                <div className="max-w-xs">
                  <label className="label" htmlFor="catchUpAge">Catch-up age</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      id="catchUpAge"
                      type="text"
                      value={getDisplayValue('catchUpAge')}
                      onChange={(e) => handleInputChange('catchUpAge', e.target.value)}
                      className="input-field w-full"
                      placeholder="50"
                      inputMode="numeric"
                    />
                    <NumberStepper
                      incrementLabel="Increase catch-up age"
                      decrementLabel="Decrease catch-up age"
                      onIncrement={() => stepField('catchUpAge', { step: 1, min: 0, max: 200, integer: true })(+1)}
                      onDecrement={() => stepField('catchUpAge', { step: 1, min: 0, max: 200, integer: true })(-1)}
                      disabledDecrement={numericInputs.catchUpAge <= 0}
                    />
                  </div>
                  {validationErrors.catchUpAge && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.catchUpAge}</p>
                  )}
                </div>
              </TooltipWrapper>

              {isOverLimit && (
                <div className="mt-4 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
                  <div className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Your selected contribution % exceeds the annual employee limit.
                  </div>
                  <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    This forecast caps employee contributions at {formatDollars(employeeLimitThisYear)} for the current age/year setting.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold navy-text">Fund Allocation</h3>
              {Math.abs(Object.values(numericInputs.allocation).reduce((sum, val) => sum + val, 0) - 100) > 0.01 && (
                <button
                  onClick={autoAdjustAllocation}
                  className="text-sm bg-navy-100 dark:bg-navy-900 text-navy-600 dark:text-navy-400 px-3 py-1 rounded-lg hover:bg-navy-200 dark:hover:bg-navy-800 transition-colors"
                >
                  Auto-adjust to 100%
                </button>
              )}
            </div>
            <div className="space-y-4">
              {Object.entries(numericInputs.allocation).map(([fund, percentage]) => (
                <div key={fund} className="flex items-center space-x-4">
                  <div className="w-20 text-sm text-slate-600 dark:text-slate-400 font-medium">{fund} Fund</div>
                  <div className="flex items-stretch gap-2 flex-1">
                    <input
                      type="text"
                      value={getAllocationDisplayValue(fund)}
                      onChange={(e) => handleAllocationChange(fund, e.target.value)}
                      className="input-field flex-1"
                      placeholder="0"
                      inputMode="decimal"
                    />
                    <NumberStepper
                      incrementLabel={`Increase ${fund} fund allocation`}
                      decrementLabel={`Decrease ${fund} fund allocation`}
                      onIncrement={() => stepAllocation(fund, { step: 1, min: 0, max: 100, integer: false })(+1)}
                      onDecrement={() => stepAllocation(fund, { step: 1, min: 0, max: 100, integer: false })(-1)}
                      disabledDecrement={Number(percentage) <= 0}
                    />
                  </div>
                  <div className="w-12 text-sm text-slate-500 dark:text-slate-400">%</div>
                  <div className="w-12 text-xs text-slate-400 dark:text-slate-500">
                    {(fund === 'G' ? 2 : fund === 'F' ? 3 : fund === 'C' ? 7 : fund === 'S' ? 8 : 6)}%
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between items-center">
              <span className={`text-sm font-medium ${
                Math.abs(Object.values(numericInputs.allocation).reduce((sum, val) => sum + val, 0) - 100) < 0.01 
                  ? 'text-navy-600 dark:text-navy-400' 
                  : 'text-red-500'
              }`}>
                Total: {Object.values(numericInputs.allocation).reduce((sum, val) => sum + val, 0).toFixed(1)}%
              </span>
              {Math.abs(Object.values(numericInputs.allocation).reduce((sum, val) => sum + val, 0) - 100) > 0.01 && (
                <span className="text-red-500 text-sm">
                  Must equal 100%
                </span>
              )}
            </div>
            {validationErrors.allocation && (
              <p className="text-red-500 text-xs mt-2">{validationErrors.allocation}</p>
            )}
          </div>
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          {!inputs.showComparison ? (
            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">
                {inputs.contributionType === 'traditional' ? 'Traditional' : 'Roth'} TSP Projection
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold navy-text mb-2">
                    {formatDollars(inputs.contributionType === 'traditional' ? results.traditional.projectedBalance : results.roth.projectedBalance)}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Projected Balance</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold gold-accent mb-2">
                    {formatDollars(inputs.contributionType === 'traditional' ? results.traditional.afterTaxValue : results.roth.afterTaxValue)}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">After-Tax Value</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-slate-600 dark:text-slate-400 mb-2">
                    ${(inputs.contributionType === 'traditional' ? results.traditional.totalContributions : results.roth.totalContributions).toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Total Contributions</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-slate-600 dark:text-slate-400 mb-2">
                    {numericInputs.retirementAge - numericInputs.currentAge}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Years to Retirement</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">Traditional vs Roth Comparison</h3>
              <div className="grid grid-cols-2 gap-8">
                <div className="text-center">
                  <h4 className="text-lg font-medium text-navy-600 dark:text-navy-400 mb-4">Traditional TSP</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                        {formatDollars(results.traditional.projectedBalance)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Gross Balance</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-navy-600 dark:text-navy-400">
                        {formatDollars(results.traditional.afterTaxValue)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">After-Tax Value</div>
                    </div>
                  </div>
                </div>
                
                <div className="text-center">
                  <h4 className="text-lg font-medium text-gold-600 dark:text-gold-400 mb-4">Roth TSP</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                        {formatDollars(results.roth.projectedBalance)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Balance (Tax-Free)</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gold-600 dark:text-gold-400">
                        {formatDollars(results.roth.afterTaxValue)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">After-Tax Value</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="card p-6">
            <h3 className="text-xl font-semibold navy-text mb-6">Growth Projection</h3>
            <div className="h-64">
              <Line 
                data={primaryChartData} 
                options={chartOptions} 
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="text-slate-500 dark:text-slate-400">Employee contributions (gross, capped)</div>
                <div className="font-semibold text-slate-700 dark:text-slate-200">{formatDollars(effectiveAnnualEmployeeContribution)} / year (approx)</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="text-slate-500 dark:text-slate-400">Employer contributions</div>
                <div className="font-semibold text-slate-700 dark:text-slate-200">
                  {numericInputs.includeEmployerMatch ? 'Included (simplified)' : 'Not included'}
                </div>
              </div>
            </div>
          </div>

          {/* Comparison Chart for Roth */}
          {inputs.showComparison && (
            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">Roth TSP Growth</h3>
              <div className="h-64">
                <Line 
                  data={rothChartData} 
                  options={chartOptions} 
                />
              </div>
            </div>
          )}

          {/* Recommendation */}
          {inputs.showComparison && (
            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">Recommendation</h3>
              {(() => {
                const rec = getRecommendation();
                return (
                  <div className={`p-4 rounded-lg ${
                    rec.type === 'roth' ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' :
                    rec.type === 'traditional' ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' :
                    'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                  }`}>
                    <div className="flex items-start space-x-3">
                      <span className="text-2xl">{rec.icon}</span>
                      <div>
                        <h4 className={`font-semibold mb-2 ${
                          rec.type === 'roth' ? 'text-green-700 dark:text-green-300' :
                          rec.type === 'traditional' ? 'text-blue-700 dark:text-blue-300' :
                          'text-yellow-700 dark:text-yellow-300'
                        }`}>
                          {rec.title}
                        </h4>
                        <p className={`text-sm ${
                          rec.type === 'roth' ? 'text-green-600 dark:text-green-400' :
                          rec.type === 'traditional' ? 'text-blue-600 dark:text-blue-400' :
                          'text-yellow-600 dark:text-yellow-400'
                        }`}>
                          {rec.message}
                        </p>
                        {Array.isArray(rec.details) && rec.details.length > 0 && (
                          <ul className="mt-3 space-y-1 text-xs text-slate-700 dark:text-slate-200">
                            {rec.details.map((d, idx) => (
                              <li key={idx}>- {d}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="card p-6">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xl font-semibold navy-text">Fund Returns (Assumed)</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Defaults are editable annually; this is a simplified planner assumption.
                </p>
              </div>
              {!canEditFundAssumptions && (
                <Link to="/pro-features" state={{ reason: 'tsp_assumptions_pro' }} className="text-sm text-navy-600 dark:text-navy-400 hover:underline">
                  Unlock editing (Pro)
                </Link>
              )}
            </div>

            <div className="space-y-3">
              {Object.entries(inputs.fundReturns).map(([fund, returnPct]) => (
                <div key={fund} className="flex justify-between items-center gap-3">
                  <span className="text-slate-600 dark:text-slate-400">{fund} Fund</span>
                  {canEditFundAssumptions ? (
                    <div className="flex items-stretch gap-2">
                      <input
                        aria-label={`${fund} fund return`}
                        type="text"
                        value={String(returnPct)}
                        onChange={(e) => handleFundReturnChange(fund, e.target.value)}
                        className="input-field w-24 text-right"
                        placeholder="0"
                        inputMode="decimal"
                      />
                      <div className="w-10 flex items-center justify-center text-slate-500 dark:text-slate-400">%</div>
                    </div>
                  ) : (
                    <span className="font-medium text-navy-600 dark:text-navy-400">
                      {Number(returnPct || 0).toFixed(1)}% annual
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TSPForecast; 