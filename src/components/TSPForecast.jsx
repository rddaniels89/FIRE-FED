import { useState, useEffect, useCallback, useRef } from 'react';
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
import ScenarioManager from './ScenarioManager';

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
  
  // Flag to prevent loading from scenario while user is typing
  const [isUserTyping, setIsUserTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  
  // Main inputs state - using string values for controlled inputs
  const [inputs, setInputs] = useState({
    currentBalance: '50000',
    currentAge: '35',
    retirementAge: '62',
    monthlyContributionPercent: '10',
    annualSalary: '80000',
    allocation: {
      G: '10',
      F: '20',
      C: '40',
      S: '20',
      I: '10'
    },
    contributionType: 'traditional',
    currentTaxRate: '22',
    retirementTaxRate: '15',
    showComparison: false
  });

  // Utility function to parse numeric inputs only when needed
  const parseNumericInputs = (inputs) => ({
    currentBalance: inputs.currentBalance === '' ? 0 : parseFloat(inputs.currentBalance) || 0,
    currentAge: inputs.currentAge === '' ? 0 : parseFloat(inputs.currentAge) || 0,
    retirementAge: inputs.retirementAge === '' ? 0 : parseFloat(inputs.retirementAge) || 0,
    monthlyContributionPercent: inputs.monthlyContributionPercent === '' ? 0 : parseFloat(inputs.monthlyContributionPercent) || 0,
    annualSalary: inputs.annualSalary === '' ? 0 : parseFloat(inputs.annualSalary) || 0,
    allocation: {
      G: inputs.allocation.G === '' ? 0 : parseFloat(inputs.allocation.G) || 0,
      F: inputs.allocation.F === '' ? 0 : parseFloat(inputs.allocation.F) || 0,
      C: inputs.allocation.C === '' ? 0 : parseFloat(inputs.allocation.C) || 0,
      S: inputs.allocation.S === '' ? 0 : parseFloat(inputs.allocation.S) || 0,
      I: inputs.allocation.I === '' ? 0 : parseFloat(inputs.allocation.I) || 0
    },
    contributionType: inputs.contributionType,
    currentTaxRate: inputs.currentTaxRate === '' ? 0 : parseFloat(inputs.currentTaxRate) || 0,
    retirementTaxRate: inputs.retirementTaxRate === '' ? 0 : parseFloat(inputs.retirementTaxRate) || 0,
    showComparison: inputs.showComparison
  });
  
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
      allocation: {
        G: String(tsp.allocation?.G ?? 10),
        F: String(tsp.allocation?.F ?? 20),
        C: String(tsp.allocation?.C ?? 40),
        S: String(tsp.allocation?.S ?? 20),
        I: String(tsp.allocation?.I ?? 10)
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
    // Define field validation rules
    const fieldRules = {
      currentAge: { type: 'integer', maxLength: 3 },
      retirementAge: { type: 'integer', maxLength: 3 },
      currentBalance: { type: 'decimal', maxLength: 12 },
      annualSalary: { type: 'decimal', maxLength: 10 },
      monthlyContributionPercent: { type: 'decimal', maxLength: 5 },
      currentTaxRate: { type: 'decimal', maxLength: 5 },
      retirementTaxRate: { type: 'decimal', maxLength: 5 }
    };
    
    const rule = fieldRules[field];
    if (rule) {
      // Check max length
      if (value.length > rule.maxLength) {
        return; // Don't update if too long
      }
      
      if (rule.type === 'integer') {
        // Allow only digits for integer fields
        if (value !== '' && !/^\d+$/.test(value)) {
          return; // Don't update if input contains non-digits
        }
      } else if (rule.type === 'decimal') {
        // Allow digits and one decimal point for decimal fields
        if (value !== '' && !/^\d*\.?\d*$/.test(value)) {
          return; // Don't update if input contains invalid characters
        }
      }
    }
    
    setIsUserTyping(true);
    setInputs(prev => ({
      ...prev,
      [field]: value
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
    // Validate allocation percentages (max 3 digits + decimal)
    if (value.length > 5) {
      return; // Don't update if too long
    }
    
    // Allow digits and one decimal point for percentages
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) {
      return; // Don't update if input contains invalid characters
    }
    
    setIsUserTyping(true);
    setInputs(prev => ({
      ...prev,
      allocation: {
        ...prev.allocation,
        [fund]: value
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
    const years = numericInputs.retirementAge - numericInputs.currentAge;
    const monthlyContribution = (numericInputs.annualSalary * numericInputs.monthlyContributionPercent / 100) / 12;
    
    // Expected returns for each fund
    const fundReturns = {
      G: 0.02,  // 2% for G Fund
      F: 0.03,  // 3% for F Fund  
      C: 0.07,  // 7% for C Fund
      S: 0.08,  // 8% for S Fund
      I: 0.06   // 6% for I Fund
    };

    // Calculate weighted average return
    const weightedReturn = Object.keys(fundReturns).reduce((total, fund) => {
      return total + (fundReturns[fund] * numericInputs.allocation[fund] / 100);
    }, 0);

    // Calculate traditional TSP
    const traditional = calculateTSPProjection(
      numericInputs.currentBalance,
      monthlyContribution,
      weightedReturn,
      years,
      'traditional',
      numericInputs.currentAge,
      numericInputs.retirementTaxRate
    );

    // Calculate Roth TSP  
    const roth = calculateTSPProjection(
      numericInputs.currentBalance,
      monthlyContribution * (1 - numericInputs.currentTaxRate / 100), // After-tax contribution
      weightedReturn,
      years,
      'roth',
      numericInputs.currentAge,
      numericInputs.retirementTaxRate
    );

    setResults({ traditional, roth });
  }, [inputs, validateInputs]);

  // TSP projection calculation helper
  const calculateTSPProjection = useCallback((startBalance, monthlyContrib, annualReturn, years, type, currentAge, retirementTaxRate) => {
    let balance = startBalance;
    const yearlyData = [];
    let totalContributions = 0;

    for (let year = 0; year <= years; year++) {
      const ageAtYear = currentAge + year;
      
      if (year > 0) {
        // Add monthly contributions for the year
        for (let month = 0; month < 12; month++) {
          balance += monthlyContrib;
          totalContributions += monthlyContrib;
          balance *= (1 + annualReturn / 12);
        }
      }
      
      // Calculate after-tax value
      let afterTaxValue = balance;
      if (type === 'traditional') {
        afterTaxValue = balance * (1 - retirementTaxRate / 100);
      }
      // Roth is already after-tax

      yearlyData.push({
        year: ageAtYear,
        balance: balance,
        afterTaxValue: afterTaxValue,
        contributions: totalContributions
      });
    }

    return {
      projectedBalance: balance,
      totalContributions: totalContributions,
      totalGrowth: balance - startBalance - totalContributions,
      yearlyData: yearlyData,
      afterTaxValue: yearlyData[yearlyData.length - 1]?.afterTaxValue || 0
    };
  }, []);

  // Calculate on input changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      calculateProjections();
    }, 300); // Shorter debounce for calculations

    return () => clearTimeout(timeoutId);
  }, [calculateProjections]);

  // Initial calculation
  useEffect(() => {
    calculateProjections();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Chart data generation
  const generateChartData = (type) => {
    const data = type === 'traditional' ? results.traditional : results.roth;
    return {
      labels: data.yearlyData.map(d => d.year),
      datasets: [
        {
          label: `${type === 'traditional' ? 'Traditional' : 'Roth'} TSP Balance`,
          data: data.yearlyData.map(d => d.balance),
          borderColor: type === 'traditional' ? '#2e4a96' : '#d88635',
          backgroundColor: type === 'traditional' ? 'rgba(46, 74, 150, 0.1)' : 'rgba(216, 134, 53, 0.1)',
          fill: true,
          tension: 0.1
        },
        {
          label: 'After-Tax Value',
          data: data.yearlyData.map(d => d.afterTaxValue),
          borderColor: type === 'traditional' ? '#1a2b55' : '#b56d2b',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          fill: false,
          tension: 0.1
        }
      ]
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: false,
      },
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
  };

  // Get recommendation for Traditional vs Roth
  const getRecommendation = () => {
    const rothAdvantage = results.roth.afterTaxValue - results.traditional.afterTaxValue;
    const rothAdvantagePercent = results.traditional.afterTaxValue > 0 ? (rothAdvantage / results.traditional.afterTaxValue) * 100 : 0;
    
    if (Math.abs(rothAdvantagePercent) < 5) {
      return {
        type: 'neutral',
        title: 'Similar Outcomes',
        message: 'Both Traditional and Roth TSP provide similar after-tax values. Consider diversifying with both.',
        icon: '⚖️'
      };
    } else if (rothAdvantagePercent > 5) {
      return {
        type: 'roth',
        title: 'Roth TSP Recommended',
        message: `Roth TSP provides ${Math.round(rothAdvantagePercent)}% more after-tax value. This suggests you're currently in a lower tax bracket than expected in retirement.`,
        icon: '🟢'
      };
    } else {
      return {
        type: 'traditional',
        title: 'Traditional TSP Recommended',
        message: `Traditional TSP provides ${Math.round(Math.abs(rothAdvantagePercent))}% more after-tax value. This suggests you're currently in a higher tax bracket than expected in retirement.`,
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

  const TooltipWrapper = ({ children, text }) => (
    <div className="tooltip-trigger relative">
      {children}
      <div className="tooltip -top-12 left-0 w-64">
        {text}
      </div>
    </div>
  );

  // Expected returns for fund info
  const fundReturns = {
    G: 0.02,
    F: 0.03,
    C: 0.07,
    S: 0.08,
    I: 0.06
  };

  // Parse numeric inputs for rendering
  const numericInputs = parseNumericInputs(inputs);

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
                  <label className="label">Starting TSP Balance</label>
                  <input
                    type="text"
                    value={getDisplayValue('currentBalance')}
                    onChange={(e) => handleInputChange('currentBalance', e.target.value)}
                    className="input-field w-full"
                    placeholder="1000000"
                    inputMode="decimal"
                  />
                  {validationErrors.currentBalance && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.currentBalance}</p>
                  )}
                </div>
              </TooltipWrapper>
              
              <TooltipWrapper text="Your current age in years">
                <div>
                  <label className="label">Current Age</label>
                  <input
                    type="text"
                    value={getDisplayValue('currentAge')}
                    onChange={(e) => handleInputChange('currentAge', e.target.value)}
                    className="input-field w-full"
                    placeholder="35"
                    inputMode="numeric"
                  />
                  {validationErrors.currentAge && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.currentAge}</p>
                  )}
                </div>
              </TooltipWrapper>
              
              <TooltipWrapper text="Age when you plan to retire">
                <div>
                  <label className="label">Target Retirement Age</label>
                  <input
                    type="text"
                    value={getDisplayValue('retirementAge')}
                    onChange={(e) => handleInputChange('retirementAge', e.target.value)}
                    className="input-field w-full"
                    placeholder="62"
                    inputMode="numeric"
                  />
                  {validationErrors.retirementAge && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.retirementAge}</p>
                  )}
                </div>
              </TooltipWrapper>
              
              <TooltipWrapper text="Your current annual salary">
                <div>
                  <label className="label">Annual Salary</label>
                  <input
                    type="text"
                    value={getDisplayValue('annualSalary')}
                    onChange={(e) => handleInputChange('annualSalary', e.target.value)}
                    className="input-field w-full"
                    placeholder="1000000"
                    inputMode="decimal"
                  />
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
                <label className="label">Monthly Contribution %</label>
                <input
                  type="text"
                  value={getDisplayValue('monthlyContributionPercent')}
                  onChange={(e) => handleInputChange('monthlyContributionPercent', e.target.value)}
                                        className="input-field w-full"
                  placeholder="10"
                  inputMode="decimal"
                />
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  Monthly contribution: ${((numericInputs.annualSalary * numericInputs.monthlyContributionPercent / 100) / 12).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
                {validationErrors.monthlyContributionPercent && (
                  <p className="text-red-500 text-xs mt-1">{validationErrors.monthlyContributionPercent}</p>
                )}
              </div>
            </TooltipWrapper>

            {inputs.showComparison && (
              <div className="grid grid-cols-2 gap-4">
                <TooltipWrapper text="Your current marginal tax rate">
                  <div>
                    <label className="label">Current Tax Rate %</label>
                    <input
                      type="text"
                      value={getDisplayValue('currentTaxRate')}
                      onChange={(e) => handleInputChange('currentTaxRate', e.target.value)}
                      className="input-field w-full"
                      placeholder="22"
                      inputMode="decimal"
                    />
                    {validationErrors.currentTaxRate && (
                      <p className="text-red-500 text-xs mt-1">{validationErrors.currentTaxRate}</p>
                    )}
                  </div>
                </TooltipWrapper>
                
                <TooltipWrapper text="Expected tax rate in retirement">
                  <div>
                    <label className="label">Retirement Tax Rate %</label>
                    <input
                      type="text"
                      value={getDisplayValue('retirementTaxRate')}
                      onChange={(e) => handleInputChange('retirementTaxRate', e.target.value)}
                      className="input-field w-full"
                      placeholder="15"
                      inputMode="decimal"
                    />
                    {validationErrors.retirementTaxRate && (
                      <p className="text-red-500 text-xs mt-1">{validationErrors.retirementTaxRate}</p>
                    )}
                  </div>
                </TooltipWrapper>
              </div>
            )}
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
                  <input
                    type="text"
                    value={getAllocationDisplayValue(fund)}
                    onChange={(e) => handleAllocationChange(fund, e.target.value)}
                    className="input-field flex-1"
                    placeholder="0"
                    inputMode="decimal"
                  />
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
                    ${(inputs.contributionType === 'traditional' ? results.traditional.projectedBalance : results.roth.projectedBalance).toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Projected Balance</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold gold-accent mb-2">
                    ${(inputs.contributionType === 'traditional' ? results.traditional.afterTaxValue : results.roth.afterTaxValue).toLocaleString()}
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
                        ${results.traditional.projectedBalance.toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Gross Balance</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-navy-600 dark:text-navy-400">
                        ${results.traditional.afterTaxValue.toLocaleString()}
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
                        ${results.roth.projectedBalance.toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Balance (Tax-Free)</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gold-600 dark:text-gold-400">
                        ${results.roth.afterTaxValue.toLocaleString()}
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
                data={generateChartData(inputs.showComparison ? 'traditional' : inputs.contributionType)} 
                options={chartOptions} 
              />
            </div>
          </div>

          {/* Comparison Chart for Roth */}
          {inputs.showComparison && (
            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">Roth TSP Growth</h3>
              <div className="h-64">
                <Line 
                  data={generateChartData('roth')} 
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
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="card p-6">
            <h3 className="text-xl font-semibold navy-text mb-6">Fund Returns (Assumed)</h3>
            <div className="space-y-3">
              {Object.entries(fundReturns).map(([fund, returnRate]) => (
                <div key={fund} className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">{fund} Fund</span>
                  <span className="font-medium text-navy-600 dark:text-navy-400">{(returnRate * 100).toFixed(1)}% annual</span>
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