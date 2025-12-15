import { useState, useEffect, useCallback, useMemo } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { useScenario } from '../contexts/ScenarioContext';
import ScenarioManager from './ScenarioManager';
import { calculateFersResults } from '../lib/calculations/fers';
import TooltipWrapper from './TooltipWrapper';
import NumberStepper from './NumberStepper';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function FERSPensionCalc() {
  const { currentScenario, updateCurrentScenario } = useScenario();
  
  // Main inputs state - using string values for controlled inputs
  const [inputs, setInputs] = useState({
    yearsOfService: '20',
    monthsOfService: '0',
    high3Salary: '85000',
    currentAge: '42',
    retirementAge: '62',
    showComparison: false,
    privateJobSalary: '95000',
    privateJobYears: '20'
  });

  // Utility function to parse numeric inputs only when needed
  const parseNumericInputs = (inputs) => ({
    yearsOfService: inputs.yearsOfService === '' ? 0 : parseFloat(inputs.yearsOfService) || 0,
    monthsOfService: inputs.monthsOfService === '' ? 0 : parseFloat(inputs.monthsOfService) || 0,
    high3Salary: inputs.high3Salary === '' ? 0 : parseFloat(inputs.high3Salary) || 0,
    currentAge: inputs.currentAge === '' ? 0 : parseFloat(inputs.currentAge) || 0,
    retirementAge: inputs.retirementAge === '' ? 0 : parseFloat(inputs.retirementAge) || 0,
    showComparison: inputs.showComparison,
    privateJobSalary: inputs.privateJobSalary === '' ? 0 : parseFloat(inputs.privateJobSalary) || 0,
    privateJobYears: inputs.privateJobYears === '' ? 0 : parseFloat(inputs.privateJobYears) || 0
  });

  // Results state
  const [results, setResults] = useState({
    stayFed: {
      annualPension: 0,
      monthlyPension: 0,
      multiplier: 0.01,
      lifetimePension: 0,
      isEligible: false,
      eligibilityMessage: '',
      totalLifetimeEarnings: 0
    },
    leaveEarly: {
      deferredPension: 0,
      mra: 57,
      lifetimeDeferred: 0,
      totalLifetimeEarnings: 0,
      breakEvenAge: 0
    }
  });

  // Validation state
  const [validationErrors, setValidationErrors] = useState({});



  // Load from scenario context
  useEffect(() => {
    if (currentScenario?.fers) {
      const fers = currentScenario.fers;
      // Only update inputs if the values are actually different to prevent loops
      const newInputs = {
        yearsOfService: String(fers.yearsOfService || 20),
        monthsOfService: String(fers.monthsOfService || 0),
        high3Salary: String(fers.high3Salary || 85000),
        currentAge: String(fers.currentAge || 42),
        retirementAge: String(fers.retirementAge || 62),
        showComparison: fers.showComparison || false,
        privateJobSalary: String(fers.privateJobSalary || 95000),
        privateJobYears: String(fers.privateJobYears || 20)
      };
      
      // Only update if different to prevent unnecessary re-renders
      setInputs(prevInputs => {
        const isDifferent = Object.keys(newInputs).some(key => 
          newInputs[key] !== prevInputs[key]
        );
        
        return isDifferent ? newInputs : prevInputs;
      });
    }
  }, [currentScenario]);

  // Save to scenario context when inputs change (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (currentScenario && Object.keys(inputs).length > 0) {
        // Only update if we have actual input values
        const hasValidInputs = inputs.currentAge && inputs.retirementAge;
        if (hasValidInputs) {
          updateCurrentScenario({
            fers: parseNumericInputs(inputs)
          });
        }
      }
    }, 1000); // Standard debounce

    return () => clearTimeout(timeoutId);
  }, [inputs, currentScenario, updateCurrentScenario]);

  // Store raw input values without any parsing or cleanup
  const handleInputChange = useCallback((field, value) => {
    setInputs(prev => ({
      ...prev,
      [field]: value
    }));
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

  // Toggle comparison handler
  const handleToggleComparison = useCallback(() => {
    setInputs(prev => ({
      ...prev,
      showComparison: !prev.showComparison
    }));
  }, []);

  // Calculate total years of service including months
  const totalYears = useMemo(() => {
    const numericInputs = parseNumericInputs(inputs);
    return numericInputs.yearsOfService + (numericInputs.monthsOfService / 12);
  }, [inputs]);

  // Validation function
  const validateInputs = useCallback(() => {
    const numericInputs = parseNumericInputs(inputs);
    const errors = {};
    
    if (numericInputs.yearsOfService < 0 || numericInputs.yearsOfService > 50) {
      errors.yearsOfService = 'Years of service must be between 0 and 50';
    }
    if (numericInputs.monthsOfService < 0 || numericInputs.monthsOfService > 11) {
      errors.monthsOfService = 'Months of service must be between 0 and 11';
    }
    if (numericInputs.high3Salary <= 0) {
      errors.high3Salary = 'High-3 salary must be greater than 0';
    }
    if (numericInputs.currentAge < 18 || numericInputs.currentAge > 999) {
      errors.currentAge = 'Current age must be between 18 and 999';
    }
    if (numericInputs.retirementAge <= numericInputs.currentAge || numericInputs.retirementAge > 999) {
      errors.retirementAge = 'Retirement age must be greater than current age and less than 999';
    }
    if (numericInputs.showComparison && numericInputs.privateJobSalary <= 0) {
      errors.privateJobSalary = 'Private sector salary must be greater than 0';
    }
    if (numericInputs.showComparison && (numericInputs.privateJobYears < 1 || numericInputs.privateJobYears > 40)) {
      errors.privateJobYears = 'Private sector years must be between 1 and 40';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [inputs]);

  // Main calculation functions
  const calculateFERSPension = useCallback(() => {
    if (!validateInputs()) return;

    const numericInputs = parseNumericInputs(inputs);

    const fers = calculateFersResults({
      yearsOfService: numericInputs.yearsOfService,
      monthsOfService: numericInputs.monthsOfService,
      high3Salary: numericInputs.high3Salary,
      currentAge: numericInputs.currentAge,
      retirementAge: numericInputs.retirementAge,
      showComparison: numericInputs.showComparison,
      privateJobSalary: numericInputs.privateJobSalary,
      privateJobYears: numericInputs.privateJobYears,
      includeFutureService: true,
    });

    setResults({
      stayFed: fers.stayFed,
      leaveEarly: fers.leaveEarly
    });
  }, [inputs, validateInputs]);

  // Calculate on input changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      calculateFERSPension();
    }, 300); // Shorter debounce for calculations

    return () => clearTimeout(timeoutId);
  }, [calculateFERSPension]);

  // Initial calculation
  useEffect(() => {
    calculateFERSPension();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Chart generation
  const generateLifetimeChart = () => {
    const ages = [];
    const stayFedData = [];
    const leaveEarlyData = [];
    
    let stayFedTotal = 0;
    let leaveEarlyTotal = 0;
    
    for (let age = numericInputs.currentAge; age <= 85; age++) {
      ages.push(age);
      
      // Stay Federal scenario
      if (age < numericInputs.retirementAge) {
        stayFedTotal += numericInputs.high3Salary;
      } else {
        stayFedTotal += results.stayFed.annualPension;
      }
      
      // Leave Early scenario
      if (age < (numericInputs.currentAge + 20)) {
        leaveEarlyTotal += numericInputs.high3Salary;
      } else if (age < results.leaveEarly.mra) {
        leaveEarlyTotal += numericInputs.privateJobSalary;
      } else {
        leaveEarlyTotal += results.leaveEarly.deferredPension;
      }
      
      stayFedData.push(stayFedTotal);
      leaveEarlyData.push(leaveEarlyTotal);
    }

    return {
      labels: ages,
      datasets: [
        {
          label: 'Stay Federal',
          data: stayFedData,
          borderColor: '#2e4a96',
          backgroundColor: 'rgba(46, 74, 150, 0.1)',
          fill: false,
          tension: 0.1
        },
        {
          label: 'Leave After 20 Years',
          data: leaveEarlyData,
          borderColor: '#d88635',
          backgroundColor: 'rgba(216, 134, 53, 0.1)',
          fill: false,
          tension: 0.1
        }
      ]
    };
  };

  const generateBarChart = () => {
    return {
      labels: ['Stay Federal', 'Leave After 20 Years'],
      datasets: [
        {
          label: 'Working Years Earnings',
          data: [
            (numericInputs.retirementAge - numericInputs.currentAge) * numericInputs.high3Salary,
            20 * numericInputs.high3Salary + numericInputs.privateJobYears * numericInputs.privateJobSalary
          ],
          backgroundColor: '#2e4a96',
          borderColor: '#253d7a',
          borderWidth: 1
        },
        {
          label: 'Pension/Retirement Earnings',
          data: [
            results.stayFed.lifetimePension,
            results.leaveEarly.lifetimeDeferred
          ],
          backgroundColor: '#d88635',
          borderColor: '#b56d2b',
          borderWidth: 1
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
            return '$' + (value / 1000).toFixed(0) + 'K';
          }
        }
      }
    }
  };

  const barChartOptions = {
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
            return '$' + (value / 1000).toFixed(0) + 'K';
          }
        }
      }
    }
  };

  // Helper to get input display value or actual value
  const getDisplayValue = (field) => {
    return inputs[field];
  };

  // Parse numeric inputs for rendering
  const numericInputs = parseNumericInputs(inputs);

  return (
    <div className="animate-fade-in">
      <ScenarioManager />
      
      <div className="mb-8">
        <h1 className="text-3xl font-bold navy-text mb-3">FERS Pension Calculator</h1>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
          Calculate your Federal Employees Retirement System pension and compare staying federal 
          versus leaving after 20 years for private sector opportunities.
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
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-xl font-semibold navy-text mb-6">Service Information</h3>
            <div className="grid grid-cols-2 gap-6">
              <TooltipWrapper text="Years completed so far. We'll project additional service from your current age to your planned retirement age to estimate total years at retirement.">
                <div>
                  <label className="label">Years of Service</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      type="text"
                      value={getDisplayValue('yearsOfService')}
                      onChange={(e) => handleInputChange('yearsOfService', e.target.value)}
                      className="input-field w-full"
                      placeholder="20"
                      inputMode="decimal"
                    />
                    <NumberStepper
                      incrementLabel="Increase years of service"
                      decrementLabel="Decrease years of service"
                      onIncrement={() => stepField('yearsOfService', { step: 1, min: 0, max: 50, integer: true })(+1)}
                      onDecrement={() => stepField('yearsOfService', { step: 1, min: 0, max: 50, integer: true })(-1)}
                      disabledDecrement={numericInputs.yearsOfService <= 0}
                    />
                  </div>
                  {validationErrors.yearsOfService && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.yearsOfService}</p>
                  )}
                </div>
              </TooltipWrapper>
              
              <TooltipWrapper text="Additional months of service (0-11)">
                <div>
                  <label className="label">Additional Months</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      type="text"
                      value={getDisplayValue('monthsOfService')}
                      onChange={(e) => handleInputChange('monthsOfService', e.target.value)}
                      className="input-field w-full"
                      placeholder="0"
                      inputMode="numeric"
                    />
                    <NumberStepper
                      incrementLabel="Increase months of service"
                      decrementLabel="Decrease months of service"
                      onIncrement={() => stepField('monthsOfService', { step: 1, min: 0, max: 11, integer: true })(+1)}
                      onDecrement={() => stepField('monthsOfService', { step: 1, min: 0, max: 11, integer: true })(-1)}
                      disabledDecrement={numericInputs.monthsOfService <= 0}
                    />
                  </div>
                  {validationErrors.monthsOfService && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.monthsOfService}</p>
                  )}
                </div>
              </TooltipWrapper>
            </div>
            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Service entered (today): <span className="font-medium">{totalYears.toFixed(1)} years</span>
              </p>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-xl font-semibold navy-text mb-6">Salary Information</h3>
            <div className="space-y-4">
              <TooltipWrapper text="Average of your highest 3 consecutive years of basic pay">
                <div>
                  <label className="label">High-3 Average Salary</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      type="text"
                      value={getDisplayValue('high3Salary')}
                      onChange={(e) => handleInputChange('high3Salary', e.target.value)}
                      className="input-field w-full"
                      placeholder="1000000"
                      inputMode="decimal"
                    />
                    <NumberStepper
                      incrementLabel="Increase high-3 average salary"
                      decrementLabel="Decrease high-3 average salary"
                      onIncrement={() => stepField('high3Salary', { step: 1000, min: 0, integer: true })(+1)}
                      onDecrement={() => stepField('high3Salary', { step: 1000, min: 0, integer: true })(-1)}
                      disabledDecrement={numericInputs.high3Salary <= 0}
                    />
                  </div>
                  {validationErrors.high3Salary && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.high3Salary}</p>
                  )}
                </div>
              </TooltipWrapper>
              
              <div className="grid grid-cols-2 gap-4">
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
                    <label className="label">Planned Retirement Age</label>
                    <div className="flex items-stretch gap-2">
                      <input
                        type="text"
                        value={getDisplayValue('retirementAge')}
                        onChange={(e) => handleInputChange('retirementAge', e.target.value)}
                        className="input-field w-full"
                        placeholder="62"
                        inputMode="numeric"
                      />
                      <NumberStepper
                        incrementLabel="Increase planned retirement age"
                        decrementLabel="Decrease planned retirement age"
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
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-xl font-semibold navy-text mb-4">Comparison Analysis</h3>
            <div className="flex items-center space-x-3 mb-6">
              <input
                type="checkbox"
                id="showComparison"
                checked={inputs.showComparison}
                onChange={handleToggleComparison}
                className="w-4 h-4 text-navy-600"
              />
              <label htmlFor="showComparison" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Compare "Stay Federal" vs "Leave After 20 Years"
              </label>
            </div>

            {inputs.showComparison && (
              <div className="space-y-4">
                <TooltipWrapper text="Expected salary in private sector job">
                  <div>
                    <label className="label">Private Sector Salary</label>
                    <div className="flex items-stretch gap-2">
                      <input
                        type="text"
                        value={getDisplayValue('privateJobSalary')}
                        onChange={(e) => handleInputChange('privateJobSalary', e.target.value)}
                        className="input-field w-full"
                        placeholder="1000000"
                        inputMode="decimal"
                      />
                      <NumberStepper
                        incrementLabel="Increase private sector salary"
                        decrementLabel="Decrease private sector salary"
                        onIncrement={() => stepField('privateJobSalary', { step: 1000, min: 0, integer: true })(+1)}
                        onDecrement={() => stepField('privateJobSalary', { step: 1000, min: 0, integer: true })(-1)}
                        disabledDecrement={numericInputs.privateJobSalary <= 0}
                      />
                    </div>
                    {validationErrors.privateJobSalary && (
                      <p className="text-red-500 text-xs mt-1">{validationErrors.privateJobSalary}</p>
                    )}
                  </div>
                </TooltipWrapper>
                
                <TooltipWrapper text="Expected years working in private sector">
                  <div>
                    <label className="label">Private Sector Working Years</label>
                    <div className="flex items-stretch gap-2">
                      <input
                        type="text"
                        value={getDisplayValue('privateJobYears')}
                        onChange={(e) => handleInputChange('privateJobYears', e.target.value)}
                        className="input-field w-full"
                        placeholder="20"
                        inputMode="numeric"
                      />
                      <NumberStepper
                        incrementLabel="Increase private sector working years"
                        decrementLabel="Decrease private sector working years"
                        onIncrement={() => stepField('privateJobYears', { step: 1, min: 0, max: 40, integer: true })(+1)}
                        onDecrement={() => stepField('privateJobYears', { step: 1, min: 0, max: 40, integer: true })(-1)}
                        disabledDecrement={numericInputs.privateJobYears <= 0}
                      />
                    </div>
                    {validationErrors.privateJobYears && (
                      <p className="text-red-500 text-xs mt-1">{validationErrors.privateJobYears}</p>
                    )}
                  </div>
                </TooltipWrapper>
              </div>
            )}
          </div>

          <div className="card p-6">
            <h3 className="text-xl font-semibold navy-text mb-4">FERS Pension Formula</h3>
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Annual Pension = High-3 × Years of Service × Multiplier
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your current multiplier: <span className="font-medium">{(results.stayFed.multiplier * 100).toFixed(1)}%</span>
                </p>
              </div>
              
              <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                <div>• <strong>1.0%</strong> multiplier for most retirements</div>
                <div>• <strong>1.1%</strong> multiplier if you retire at age 62+ with 20+ years</div>
                <div>• <strong>Deferred pension</strong> available at MRA (age 57) with 20+ years</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {!inputs.showComparison ? (
            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">Pension Calculation</h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold navy-text mb-2">
                    ${results.stayFed.annualPension.toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Annual Pension</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold gold-accent mb-2">
                    ${Math.round(results.stayFed.monthlyPension).toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Monthly Pension</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-slate-600 dark:text-slate-400 mb-2">
                    ${results.stayFed.lifetimePension.toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Lifetime Estimate</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-slate-600 dark:text-slate-400 mb-2">
                    {numericInputs.high3Salary > 0 ? (results.stayFed.annualPension / numericInputs.high3Salary * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Replacement Ratio</div>
                </div>
              </div>
              
              <div className="mt-6 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className={`text-sm font-medium ${results.stayFed.isEligible ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {results.stayFed.eligibilityMessage}
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-6">
              <h3 className="text-xl font-semibold navy-text mb-6">Career Path Comparison</h3>
              <div className="grid grid-cols-2 gap-8">
                <div className="text-center">
                  <h4 className="text-lg font-medium text-navy-600 dark:text-navy-400 mb-4">Stay Federal</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="text-2xl font-bold text-navy-600 dark:text-navy-400">
                        ${results.stayFed.annualPension.toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Annual Pension</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                        ${results.stayFed.totalLifetimeEarnings.toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Lifetime Earnings</div>
                    </div>
                  </div>
                </div>
                
                <div className="text-center">
                  <h4 className="text-lg font-medium text-gold-600 dark:text-gold-400 mb-4">Leave After 20 Years</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="text-2xl font-bold text-gold-600 dark:text-gold-400">
                        ${results.leaveEarly.deferredPension.toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Deferred Pension (at {results.leaveEarly.mra})</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                        ${results.leaveEarly.totalLifetimeEarnings.toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Lifetime Earnings</div>
                    </div>
                  </div>
                </div>
              </div>
              
              {results.leaveEarly.breakEvenAge > 0 && (
                <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    <strong>Break-even analysis:</strong> Private sector becomes more profitable until age {Math.round(results.leaveEarly.breakEvenAge)}, 
                    after which staying federal provides better lifetime value.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Charts */}
          {inputs.showComparison && (
            <>
              <div className="card p-6">
                <h3 className="text-xl font-semibold navy-text mb-6">Lifetime Earnings Comparison</h3>
                <div className="h-64">
                  <Line data={generateLifetimeChart()} options={chartOptions} />
                </div>
              </div>

              <div className="card p-6">
                <h3 className="text-xl font-semibold navy-text mb-6">Earnings Breakdown</h3>
                <div className="h-64">
                  <Bar data={generateBarChart()} options={barChartOptions} />
                </div>
              </div>
            </>
          )}

          {/* Eligibility Information */}
          <div className="card p-6">
            <h3 className="text-xl font-semibold navy-text mb-4">FERS Eligibility Guide</h3>
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Immediate Retirement</div>
                  <div>• Age 62 with 5+ years</div>
                  <div>• Age 60 with 20+ years</div>
                  <div>• MRA with 30+ years</div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Deferred Retirement</div>
                  <div>• Age 62 with 5+ years</div>
                  <div>• MRA (57) with 20+ years</div>
                  <div>• Reduced if under 62</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FERSPensionCalc; 