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
import { SURVIVOR_ELECTIONS, calculateFersResults } from '../lib/calculations/fers';
import { calculateSrs } from '../lib/calculations/srs';
import { evaluateAllRetirementPaths } from '../lib/calculations/retirementPaths';
import { DEFAULT_LOCALITY_CODE, LOCALITY_AREAS, calculateGsSalary } from '../lib/calculations/gsPay';
import { evaluateMilitaryDepositDecision } from '../lib/calculations/militaryDeposit';
import { evaluateFehbContinuation } from '../lib/calculations/fehb';
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
    privateJobYears: '20',
    unusedSickLeaveHours: '0',
    survivorElection: SURVIVOR_ELECTIONS.NONE,
    socialSecurityAt62Monthly: '0',
    militaryYears: '0',
    militaryBasicPay: '0',
    isSpecialProvision: false,
    fehbYearsEnrolled: '5'
  });

  // Pay lookup is a convenience for filling High-3, not part of the scenario.
  const [payLookup, setPayLookup] = useState({ grade: '13', step: '5', locality: DEFAULT_LOCALITY_CODE });

  // Utility function to parse numeric inputs only when needed
  const parseNumericInputs = (inputs) => ({
    yearsOfService: inputs.yearsOfService === '' ? 0 : parseFloat(inputs.yearsOfService) || 0,
    monthsOfService: inputs.monthsOfService === '' ? 0 : parseFloat(inputs.monthsOfService) || 0,
    high3Salary: inputs.high3Salary === '' ? 0 : parseFloat(inputs.high3Salary) || 0,
    currentAge: inputs.currentAge === '' ? 0 : parseFloat(inputs.currentAge) || 0,
    retirementAge: inputs.retirementAge === '' ? 0 : parseFloat(inputs.retirementAge) || 0,
    showComparison: inputs.showComparison,
    privateJobSalary: inputs.privateJobSalary === '' ? 0 : parseFloat(inputs.privateJobSalary) || 0,
    privateJobYears: inputs.privateJobYears === '' ? 0 : parseFloat(inputs.privateJobYears) || 0,
    unusedSickLeaveHours: inputs.unusedSickLeaveHours === '' ? 0 : parseFloat(inputs.unusedSickLeaveHours) || 0,
    survivorElection: inputs.survivorElection,
    socialSecurityAt62Monthly:
      inputs.socialSecurityAt62Monthly === '' ? 0 : parseFloat(inputs.socialSecurityAt62Monthly) || 0,
    militaryYears: inputs.militaryYears === '' ? 0 : parseFloat(inputs.militaryYears) || 0,
    militaryBasicPay: inputs.militaryBasicPay === '' ? 0 : parseFloat(inputs.militaryBasicPay) || 0,
    isSpecialProvision: inputs.isSpecialProvision,
    fehbYearsEnrolled: inputs.fehbYearsEnrolled === '' ? 0 : parseFloat(inputs.fehbYearsEnrolled) || 0
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
    },
    paths: [],
    fehb: { outcome: 'continues', continues: true, meetsFiveYearRule: true, yearsShort: 0, message: '' },
    specialProvision: null,
    military: {
      deposit: { principal: 0, interest: 0, total: 0, interestFreeYearsRemaining: 2, isAccruingInterest: false },
      militaryYears: 0,
      annualAnnuityIncrease: 0,
      monthlyAnnuityIncrease: 0,
      breakEvenYears: null,
      lifetimeIncrease: 0,
      netLifetimeGain: 0,
      isWorthPaying: false,
      addsEligibility: false,
    },
    service: { eligibilityYears: 0, sickLeaveYears: 0, computationYears: 0, unusedSickLeaveHours: 0 },
    // Must exist before the first debounced calculation, or the panels below
    // dereference undefined on the very first render.
    ageReduction: { percent: 0, annual: 0, isMra10: false },
    cola: {
      rate: 0,
      cpiIncrease: 0,
      startAge: 62,
      lifetimeNominal: 0,
      lifetimeReal: 0,
      finalYearNominal: 0,
      finalYearReal: 0,
      purchasingPowerRetained: 1,
    },
    survivor: {
      election: SURVIVOR_ELECTIONS.NONE,
      reductionPercent: 0,
      survivorPercent: 0,
      annualReduction: 0,
      monthlyReduction: 0,
      annualPensionAfterReduction: 0,
      survivorAnnualBenefit: 0,
      survivorMonthlyBenefit: 0
    },
    srs: {
      isEligible: false,
      isPayableNow: false,
      payableFromAge: null,
      reason: null,
      monthlyBeforeEarningsTest: 0,
      monthlyAfterEarningsTest: 0,
      annualBeforeEarningsTest: 0,
      annualAfterEarningsTest: 0,
      earningsTest: null,
      yearsPayable: 0,
      lifetimeTotal: 0
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
        privateJobYears: String(fers.privateJobYears || 20),
        unusedSickLeaveHours: String(fers.unusedSickLeaveHours ?? 0),
        militaryYears: String(fers.militaryYears ?? 0),
        militaryBasicPay: String(fers.militaryBasicPay ?? 0),
        isSpecialProvision: fers.isSpecialProvision || false,
        fehbYearsEnrolled: String(fers.fehbYearsEnrolled ?? 5),
        survivorElection: fers.survivorElection || SURVIVOR_ELECTIONS.NONE,
        socialSecurityAt62Monthly: String(fers.socialSecurityAt62Monthly ?? 0)
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
      unusedSickLeaveHours: numericInputs.unusedSickLeaveHours,
      survivorElection: numericInputs.survivorElection,
      isSpecialProvision: numericInputs.isSpecialProvision,
    });

    // The supplement is a separate benefit, not part of the annuity: it stops at
    // 62, is not reduced by the survivor election, and ignores sick leave.
    const srs = calculateSrs({
      retirementAge: numericInputs.retirementAge,
      creditableYearsOfService: fers.service.eligibilityYears,
      socialSecurityAt62Monthly: numericInputs.socialSecurityAt62Monthly,
    });

    // Which doors are actually open at this age and service, and what each costs.
    // No annuityStartAge: postponing and deferring default to the age that
    // removes their reduction, which is the comparison worth showing.
    const paths = evaluateAllRetirementPaths({
      separationAge: numericInputs.retirementAge,
      yearsOfService: fers.service.eligibilityYears,
    });

    const military = evaluateMilitaryDepositDecision({
      militaryYears: numericInputs.militaryYears,
      militaryBasicPay: numericInputs.militaryBasicPay,
      high3Salary: numericInputs.high3Salary,
      multiplier: fers.stayFed.multiplier,
      yearsOfAnnuityExpected: Math.max(0, 85 - numericInputs.retirementAge),
    });

    const fehb = evaluateFehbContinuation({ yearsEnrolled: numericInputs.fehbYearsEnrolled });

    setResults({
      paths,
      military,
      fehb,
      stayFed: fers.stayFed,
      leaveEarly: fers.leaveEarly,
      service: fers.service,
      survivor: fers.survivor,
      ageReduction: fers.ageReduction,
      cola: fers.cola,
      specialProvision: fers.specialProvision,
      srs,
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
              <details className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                <summary className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  Don&rsquo;t know your High-3? Look it up from your grade
                </summary>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div>
                    <label className="label text-xs" htmlFor="payGrade">Grade</label>
                    <select
                      id="payGrade"
                      className="input-field w-full"
                      value={payLookup.grade}
                      onChange={(e) => setPayLookup((p) => ({ ...p, grade: e.target.value }))}
                    >
                      {Array.from({ length: 15 }, (_, i) => i + 1).map((g) => (
                        <option key={g} value={g}>GS-{g}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs" htmlFor="payStep">Step</label>
                    <select
                      id="payStep"
                      className="input-field w-full"
                      value={payLookup.step}
                      onChange={(e) => setPayLookup((p) => ({ ...p, step: e.target.value }))}
                    >
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs" htmlFor="payLocality">Locality</label>
                    <select
                      id="payLocality"
                      className="input-field w-full"
                      value={payLookup.locality}
                      onChange={(e) => setPayLookup((p) => ({ ...p, locality: e.target.value }))}
                    >
                      {LOCALITY_AREAS.map((l) => (
                        <option key={l.code} value={l.code}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {(() => {
                  const pay = calculateGsSalary({
                    grade: payLookup.grade,
                    step: payLookup.step,
                    localityCode: payLookup.locality,
                  });
                  if (!pay) return null;
                  return (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          ${pay.salary.toLocaleString()}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {' '}&mdash; ${pay.basePay.toLocaleString()} base plus {pay.locality.percent}% locality
                        </span>
                        {pay.wasCapped && (
                          <span className="block text-xs text-amber-700 dark:text-amber-400 mt-1">
                            Capped at Executive Schedule Level IV, so the locality percentage does not apply in full.
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn-secondary text-sm py-2 px-4"
                        onClick={() => handleInputChange('high3Salary', String(pay.salary))}
                      >
                        Use as High-3
                      </button>
                    </div>
                  );
                })()}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  2026 OPM tables. Your real High-3 averages your highest three consecutive years, so this is
                  exact only if you have been at this step that long.
                </p>
              </details>

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
            <h3 className="text-xl font-semibold navy-text mb-4">Credits &amp; Elections</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              Three federal rules that change the result materially. Leave them at zero and none are applied.
            </p>

            <div className="space-y-5">
              <TooltipWrapper text="Unused sick leave adds to the service used to compute your annuity. It cannot make you eligible to retire and does not raise your high-3.">
                <div>
                  <label className="label" htmlFor="unusedSickLeaveHours">Unused Sick Leave (hours)</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      id="unusedSickLeaveHours"
                      type="text"
                      value={getDisplayValue('unusedSickLeaveHours')}
                      onChange={(e) => handleInputChange('unusedSickLeaveHours', e.target.value)}
                      className="input-field w-full"
                      placeholder="0"
                      inputMode="numeric"
                    />
                    <NumberStepper
                      incrementLabel="Increase unused sick leave hours"
                      decrementLabel="Decrease unused sick leave hours"
                      onIncrement={() => stepField('unusedSickLeaveHours', { step: 100, min: 0, integer: true })(+1)}
                      onDecrement={() => stepField('unusedSickLeaveHours', { step: 100, min: 0, integer: true })(-1)}
                      disabledDecrement={numericInputs.unusedSickLeaveHours <= 0}
                    />
                  </div>
                  {results.specialProvision && (
                <div className="mt-4 p-4 rounded-lg bg-navy-50 dark:bg-slate-800/60 border border-navy-200 dark:border-slate-700">
                  <div className="font-medium text-slate-900 dark:text-white text-sm mb-2">
                    Special provision computation
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-slate-600 dark:text-slate-400">
                        First {results.specialProvision.enhancedYears} years at 1.7%
                      </div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        ${Math.round(results.specialProvision.enhancedPortion).toLocaleString()}/yr
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-600 dark:text-slate-400">
                        Remaining {results.specialProvision.standardYears.toFixed(1)} years at 1.0%
                      </div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        ${Math.round(results.specialProvision.standardPortion).toLocaleString()}/yr
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
                    Worth{' '}
                    <strong className="text-green-700 dark:text-green-400">
                      ${Math.round(results.specialProvision.advantageOverStandard).toLocaleString()} a year more
                    </strong>{' '}
                    than the same service under ordinary FERS. You also receive COLAs from the start rather than
                    waiting for 62, and the supplement is exempt from the earnings test until your MRA.
                  </p>
                </div>
              )}

              {!results.fehb.continues && (
                <div className="mt-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800">
                  <div className="font-medium text-amber-900 dark:text-amber-200 text-sm mb-1">
                    You would lose FEHB in retirement
                  </div>
                  <p className="text-xs text-amber-800 dark:text-amber-300">{results.fehb.message}</p>
                </div>
              )}

              {results.military.militaryYears > 0 && results.military.deposit.total > 0 && (
                <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="font-medium text-slate-900 dark:text-white text-sm mb-2">
                    Military service deposit
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-slate-600 dark:text-slate-400">Deposit owed</div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        ${Math.round(results.military.deposit.total).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-600 dark:text-slate-400">Adds to your annuity</div>
                      <div className="font-medium text-green-700 dark:text-green-400">
                        +${Math.round(results.military.annualAnnuityIncrease).toLocaleString()}/yr
                      </div>
                    </div>
                  </div>
                  {results.military.breakEvenYears !== null && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
                      You get the deposit back in{' '}
                      <strong className="text-slate-900 dark:text-white">
                        {results.military.breakEvenYears < 1
                          ? `${Math.round(results.military.breakEvenYears * 12)} months`
                          : `${results.military.breakEvenYears.toFixed(1)} years`}
                      </strong>
                      , then keep the increase for life &mdash; about{' '}
                      ${Math.round(results.military.netLifetimeGain).toLocaleString()} net.
                    </p>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    Without the deposit this service does not count at all &mdash; not toward the annuity, and
                    not toward the years that decide when you may retire. It must be paid before you separate.
                  </p>
                </div>
              )}

              {results.paths.filter((p) => p.isEligible).length > 1 && (
                <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="font-medium text-slate-900 dark:text-white text-sm mb-1">
                    Your options at this age and service
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    The same service can produce very different outcomes depending on which route you take out.
                  </p>
                  <div className="space-y-3">
                    {results.paths
                      .filter((p) => p.isEligible)
                      .map((p) => (
                        <div key={p.path} className="pb-3 border-b border-slate-200 dark:border-slate-700 last:border-0 last:pb-0">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-slate-900 dark:text-white">
                              {p.label}
                              {p.annuityStartAge > numericInputs.retirementAge && (
                                <span className="font-normal text-slate-500 dark:text-slate-400">
                                  {' '}&mdash; payments from {p.annuityStartAge}
                                </span>
                              )}
                            </span>
                            <span className="text-xs font-medium">
                              {p.ageReductionPercent > 0 ? (
                                <span className="text-amber-700 dark:text-amber-400">
                                  &minus;{p.ageReductionPercent.toFixed(1)}% for age
                                </span>
                              ) : (
                                <span className="text-green-700 dark:text-green-400">No age reduction</span>
                              )}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-600 dark:text-slate-400">
                            <span>{p.keepsFehb ? '✅ Keeps FEHB' : '❌ Loses FEHB'}</span>
                            <span>{p.creditsSickLeave ? '✅ Sick leave credited' : '❌ Sick leave lost'}</span>
                            <span>{p.hasSupplement ? '✅ Supplement' : '❌ No supplement'}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                    Losing FEHB is permanent and often costs more than the annuity difference. Postponing an
                    MRA+10 annuity keeps it; deferring does not.
                  </p>
                </div>
              )}

              {results.ageReduction.percent > 0 && (
                <div className="mt-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800">
                  <div className="font-medium text-amber-900 dark:text-amber-200 text-sm mb-2">
                    MRA+10 age reduction &mdash; {results.ageReduction.percent.toFixed(1)}%
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-slate-600 dark:text-slate-400">Before reduction</div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        ${Math.round(results.stayFed.annualPensionBeforeReductions).toLocaleString()}/yr
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-600 dark:text-slate-400">Cost of retiring early</div>
                      <div className="font-medium text-amber-700 dark:text-amber-400">
                        &minus;${Math.round(results.ageReduction.annual).toLocaleString()}/yr
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                    Retiring under MRA+10 costs 5% of your annuity for every year you are under 62, and the
                    reduction is permanent. Postponing the start of your annuity reduces or removes it.
                  </p>
                </div>
              )}

              {results.cola.cpiIncrease > 0 && results.stayFed.lifetimePension > 0 && (
                <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="font-medium text-slate-900 dark:text-white text-sm mb-2">
                    What inflation does to it
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-slate-600 dark:text-slate-400">Lifetime, as paid</div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        ${Math.round(results.cola.lifetimeNominal).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-600 dark:text-slate-400">Lifetime, in today&rsquo;s dollars</div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        ${Math.round(results.cola.lifetimeReal).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                    FERS pays a reduced COLA, and for most retirees none at all before 62
                    {results.cola.startAge > numericInputs.retirementAge
                      ? ` — so your annuity is frozen for the first ${Math.round(results.cola.startAge - numericInputs.retirementAge)} years.`
                      : '.'}
                    {' '}Your last payment is worth about{' '}
                    {Math.round(results.cola.purchasingPowerRetained * 100)}% of what the first one buys today.
                  </p>
                </div>
              )}

              {results.service.sickLeaveYears > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Adds {results.service.sickLeaveYears.toFixed(2)} years of service credit at 2,087 hours per year.
                    </p>
                  )}
                </div>
              </TooltipWrapper>

              <TooltipWrapper text="A survivor annuity reduces your own annuity for life and pays your survivor a percentage after your death. Electing none requires spousal consent if you are married, and ends your spouse's ability to keep FEHB.">
                <div>
                  <label className="label" htmlFor="survivorElection">Survivor Annuity Election</label>
                  <select
                    id="survivorElection"
                    value={inputs.survivorElection}
                    onChange={(e) => handleInputChange('survivorElection', e.target.value)}
                    className="input-field w-full"
                  >
                    <option value={SURVIVOR_ELECTIONS.NONE}>None &mdash; no reduction, no survivor benefit</option>
                    <option value={SURVIVOR_ELECTIONS.PARTIAL}>Partial &mdash; 5% cost, survivor receives 25%</option>
                    <option value={SURVIVOR_ELECTIONS.FULL}>Full &mdash; 10% cost, survivor receives 50%</option>
                  </select>
                </div>
              </TooltipWrapper>

              <TooltipWrapper text="Law enforcement, firefighters and air traffic controllers earn 1.7% for the first 20 years, can retire at 50 with 20 years, face mandatory separation, and receive COLAs before 62.">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inputs.isSpecialProvision}
                    onChange={(e) => handleInputChange('isSpecialProvision', e.target.checked)}
                    className="mt-1 w-4 h-4"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Special provision position
                    <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                      Law enforcement, firefighter, or air traffic controller
                    </span>
                  </span>
                </label>
              </TooltipWrapper>

              <TooltipWrapper text="To keep FEHB in retirement you must have been enrolled for the five years immediately before you retire, and be retiring on an immediate annuity.">
                <div>
                  <label className="label" htmlFor="fehbYearsEnrolled">Years enrolled in FEHB</label>
                  <input
                    id="fehbYearsEnrolled"
                    type="text"
                    value={getDisplayValue('fehbYearsEnrolled')}
                    onChange={(e) => handleInputChange('fehbYearsEnrolled', e.target.value)}
                    className="input-field w-full"
                    placeholder="5"
                    inputMode="decimal"
                  />
                </div>
              </TooltipWrapper>

              <TooltipWrapper text="Post-1956 active duty counts toward your FERS annuity only if you pay a deposit of 3% of the basic pay you earned. Without it the time does not count at all.">
                <div>
                  <label className="label" htmlFor="militaryYears">Military service (years)</label>
                  <input
                    id="militaryYears"
                    type="text"
                    value={getDisplayValue('militaryYears')}
                    onChange={(e) => handleInputChange('militaryYears', e.target.value)}
                    className="input-field w-full"
                    placeholder="0"
                    inputMode="decimal"
                  />
                </div>
              </TooltipWrapper>

              {numericInputs.militaryYears > 0 && (
                <TooltipWrapper text="Total basic pay you earned while serving, in the dollars of the time. The deposit is 3% of it.">
                  <div>
                    <label className="label" htmlFor="militaryBasicPay">Military basic pay earned (total)</label>
                    <input
                      id="militaryBasicPay"
                      type="text"
                      value={getDisplayValue('militaryBasicPay')}
                      onChange={(e) => handleInputChange('militaryBasicPay', e.target.value)}
                      className="input-field w-full"
                      placeholder="0"
                      inputMode="decimal"
                    />
                  </div>
                </TooltipWrapper>
              )}

              <TooltipWrapper text="Your estimated Social Security benefit at age 62, from your Social Security statement. Used only to estimate the Special Retirement Supplement.">
                <div>
                  <label className="label" htmlFor="socialSecurityAt62Monthly">Estimated Social Security at 62 (monthly)</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      id="socialSecurityAt62Monthly"
                      type="text"
                      value={getDisplayValue('socialSecurityAt62Monthly')}
                      onChange={(e) => handleInputChange('socialSecurityAt62Monthly', e.target.value)}
                      className="input-field w-full"
                      placeholder="0"
                      inputMode="decimal"
                    />
                    <NumberStepper
                      incrementLabel="Increase estimated Social Security at 62"
                      decrementLabel="Decrease estimated Social Security at 62"
                      onIncrement={() => stepField('socialSecurityAt62Monthly', { step: 50, min: 0, integer: true })(+1)}
                      onDecrement={() => stepField('socialSecurityAt62Monthly', { step: 50, min: 0, integer: true })(-1)}
                      disabledDecrement={numericInputs.socialSecurityAt62Monthly <= 0}
                    />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    From ssa.gov. Needed to estimate the Special Retirement Supplement.
                  </p>
                </div>
              </TooltipWrapper>
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
                    ${Math.round(results.stayFed.annualPension).toLocaleString()}
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
                    ${Math.round(results.stayFed.lifetimePension).toLocaleString()}
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

              {results.service.sickLeaveYears > 0 && (
                <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="font-medium text-slate-900 dark:text-white text-sm mb-2">Unused sick leave credit</div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Service for eligibility</div>
                      <div className="font-medium text-slate-900 dark:text-white">{results.service.eligibilityYears.toFixed(2)} years</div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Service for computation</div>
                      <div className="font-medium text-slate-900 dark:text-white">{results.service.computationYears.toFixed(2)} years</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    Sick leave raises the annuity only. It cannot make you eligible to retire, and it does not count
                    toward the Special Retirement Supplement.
                  </p>
                </div>
              )}

              {results.survivor.reductionPercent > 0 && (
                <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="font-medium text-slate-900 dark:text-white text-sm mb-2">
                    Survivor election &mdash; {results.survivor.survivorPercent}% benefit
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Annuity before reduction</div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        ${Math.round(results.stayFed.annualPensionBeforeSurvivorReduction).toLocaleString()}/yr
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Cost of the election</div>
                      <div className="font-medium text-amber-700 dark:text-amber-400">
                        &minus;${Math.round(results.survivor.annualReduction).toLocaleString()}/yr
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Your annuity</div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        ${Math.round(results.stayFed.annualPension).toLocaleString()}/yr
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Survivor receives</div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        ${Math.round(results.survivor.survivorAnnualBenefit).toLocaleString()}/yr
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    The survivor benefit is a share of the annuity before the reduction. Electing a survivor annuity
                    is also what lets a spouse keep FEHB after your death.
                  </p>
                </div>
              )}

              <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="font-medium text-slate-900 dark:text-white text-sm mb-2">Special Retirement Supplement</div>
                {results.srs.isEligible && numericInputs.socialSecurityAt62Monthly <= 0 ? (
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    You would qualify for the supplement at this retirement age. Add your estimated Social
                    Security at 62 above and it will be calculated &mdash; it is often over $1,000 a month.
                  </p>
                ) : results.srs.isEligible ? (
                  <>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">Monthly supplement</div>
                        <div className="font-medium text-green-700 dark:text-green-400">
                          ${Math.round(results.srs.monthlyBeforeEarningsTest).toLocaleString()}/mo
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">Paid until 62</div>
                        <div className="font-medium text-slate-900 dark:text-white">
                          {results.srs.yearsPayable} years
                          {!results.srs.isPayableNow && results.srs.payableFromAge
                            ? ` (from age ${results.srs.payableFromAge})`
                            : ''}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      Approximately ${Math.round(results.srs.lifetimeTotal).toLocaleString()} in total. It stops the
                      month you turn 62 whether or not you claim Social Security, and it is reduced if you earn above
                      the Social Security annual limit.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {results.srs.reason === 'age_62_or_over'
                      ? 'Not payable: the supplement bridges the gap to age 62, and this retirement age is already 62 or later.'
                      : results.srs.reason === 'deferred_or_postponed'
                      ? 'Not payable on a deferred or postponed retirement.'
                      : 'Not payable: the supplement requires an immediate, unreduced annuity — MRA with 30 years, or age 60 with 20. MRA+10 is a reduced annuity and does not qualify.'}
                    {numericInputs.socialSecurityAt62Monthly <= 0 &&
                      ' Enter your estimated Social Security at 62 above to model it when you are eligible.'}
                  </p>
                )}
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
                        ${Math.round(results.stayFed.annualPension).toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Annual Pension</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                        ${Math.round(results.stayFed.totalLifetimeEarnings).toLocaleString()}
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
                        ${Math.round(results.leaveEarly.deferredPension).toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Deferred Pension (at {results.leaveEarly.mra})</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                        ${Math.round(results.leaveEarly.totalLifetimeEarnings).toLocaleString()}
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