import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import { useScenario } from '../contexts/ScenarioContext';
import { useAuth } from '../contexts/AuthContext';
import { FEATURES, hasEntitlement } from '../lib/entitlements';
import { calculateTspTraditionalVsRoth } from '../lib/calculations/tsp';
import { calculateFersResults, findEarliestFersImmediateRetirementAge } from '../lib/calculations/fers';
import { calculateFireGap } from '../lib/calculations/fire';
import { trackEvent } from '../lib/telemetry';

const DEFAULTS = Object.freeze({
  swr: 0.04,
  inflationRate: 2.5,
  annualSalaryGrowthRate: 3,
  includeEmployerMatch: true,
  includeAutomatic1Percent: true,
  annualEmployeeDeferralLimit: 23500,
  annualCatchUpLimit: 7500,
  catchUpAge: 50,
  fundReturns: { G: 2, F: 3, C: 7, S: 8, I: 6 },
  valueMode: 'nominal',
  contributionType: 'traditional',
  currentTaxRate: 22,
  retirementTaxRate: 15,
});

function clampNumber(value, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function isFundReturnsDefault(fundReturns) {
  const fr = fundReturns ?? {};
  return (
    Number(fr.G) === DEFAULTS.fundReturns.G &&
    Number(fr.F) === DEFAULTS.fundReturns.F &&
    Number(fr.C) === DEFAULTS.fundReturns.C &&
    Number(fr.S) === DEFAULTS.fundReturns.S &&
    Number(fr.I) === DEFAULTS.fundReturns.I
  );
}

function estimateEarliestFireAge({
  tspYearlyData,
  safeWithdrawalRate,
  fireIncomeGoalMonthly,
  sideHustleIncome,
  spouseIncome,
  pensionMonthly,
  pensionStartAge,
}) {
  const swr = clampNumber(safeWithdrawalRate, { min: 0.01, max: 0.1, fallback: DEFAULTS.swr });
  const goal = Math.max(0, clampNumber(fireIncomeGoalMonthly, { min: 0, max: 1e9, fallback: 0 }));
  const side = Math.max(0, clampNumber(sideHustleIncome, { min: 0, max: 1e9, fallback: 0 }));
  const spouse = Math.max(0, clampNumber(spouseIncome, { min: 0, max: 1e9, fallback: 0 }));
  const pension = Math.max(0, clampNumber(pensionMonthly, { min: 0, max: 1e9, fallback: 0 }));
  const pensionAge = clampNumber(pensionStartAge, { min: 0, max: 200, fallback: 0 });

  const data = Array.isArray(tspYearlyData) ? tspYearlyData : [];
  if (data.length === 0 || goal <= 0) return null;

  for (const point of data) {
    const age = clampNumber(point?.year, { min: 0, max: 200, fallback: 0 });
    const balance = clampNumber(point?.balance, { min: 0, max: 1e12, fallback: 0 });
    const tspWithdrawalMonthly = (balance * swr) / 12;
    const pensionAtAge = pensionAge > 0 && age >= pensionAge ? pension : 0;
    const totalMonthlyIncome = tspWithdrawalMonthly + side + spouse + pensionAtAge;
    if (totalMonthlyIncome >= goal) return age;
  }

  return null;
}

function buildDefaultFlags(scenario) {
  const tsp = scenario?.tsp ?? {};
  const swr = Number(scenario?.summary?.assumptions?.safeWithdrawalRate ?? DEFAULTS.swr);

  const flags = [];
  if (Number.isFinite(swr) && swr === DEFAULTS.swr) flags.push('SWR is 4% (app default)');
  if ((tsp.valueMode ?? DEFAULTS.valueMode) === DEFAULTS.valueMode) flags.push('TSP value mode is nominal (app default)');
  if (Number(tsp.inflationRate ?? DEFAULTS.inflationRate) === DEFAULTS.inflationRate) flags.push('Inflation is 2.5% (app default)');
  if (Number(tsp.annualSalaryGrowthRate ?? DEFAULTS.annualSalaryGrowthRate) === DEFAULTS.annualSalaryGrowthRate) flags.push('Salary growth is 3% (app default)');
  if (Boolean(tsp.includeEmployerMatch ?? DEFAULTS.includeEmployerMatch) === DEFAULTS.includeEmployerMatch) flags.push('Employer match is enabled (app default)');
  if (Boolean(tsp.includeAutomatic1Percent ?? DEFAULTS.includeAutomatic1Percent) === DEFAULTS.includeAutomatic1Percent) flags.push('Automatic 1% is enabled (app default)');
  if (Number(tsp.annualEmployeeDeferralLimit ?? DEFAULTS.annualEmployeeDeferralLimit) === DEFAULTS.annualEmployeeDeferralLimit) flags.push('Employee deferral limit is $23,500 (app default)');
  if (Number(tsp.annualCatchUpLimit ?? DEFAULTS.annualCatchUpLimit) === DEFAULTS.annualCatchUpLimit) flags.push('Catch-up limit is $7,500 (app default)');
  if (Number(tsp.catchUpAge ?? DEFAULTS.catchUpAge) === DEFAULTS.catchUpAge) flags.push('Catch-up age is 50 (app default)');
  if (isFundReturnsDefault(tsp.fundReturns)) flags.push('Fund returns are defaults (G/F/C/S/I)');
  if ((tsp.contributionType ?? DEFAULTS.contributionType) === DEFAULTS.contributionType) flags.push('Contribution type is Traditional (app default)');
  if (Number(tsp.currentTaxRate ?? DEFAULTS.currentTaxRate) === DEFAULTS.currentTaxRate) flags.push('Current tax rate is 22% (app default)');
  if (Number(tsp.retirementTaxRate ?? DEFAULTS.retirementTaxRate) === DEFAULTS.retirementTaxRate) flags.push('Retirement tax rate is 15% (app default)');

  return flags;
}

function scoreScenarioPlan({
  isFireReadyAtDesiredAge,
  monthlyGapAtDesiredAge,
  fireIncomeGoalMonthly,
  requiredBridgeAssets,
  tspProjectedBalance,
  isEligibleAtPlannedRetirement,
  isOverLimit,
  missingInputsCount,
}) {
  const goal = Math.max(1, clampNumber(fireIncomeGoalMonthly, { min: 0, max: 1e9, fallback: 0 }));
  const gap = clampNumber(monthlyGapAtDesiredAge, { min: -1e9, max: 1e9, fallback: 0 });
  const bridge = Math.max(0, clampNumber(requiredBridgeAssets, { min: 0, max: 1e12, fallback: 0 }));
  const tspBal = Math.max(0, clampNumber(tspProjectedBalance, { min: 0, max: 1e12, fallback: 0 }));

  const readiness = isFireReadyAtDesiredAge
    ? 40
    : Math.max(0, Math.min(40, ((goal + gap) / goal) * 40));

  const bridgePenalty = tspBal > 0 ? Math.min(20, (bridge / tspBal) * 20) : bridge > 0 ? 20 : 0;
  const eligibility = isEligibleAtPlannedRetirement ? 20 : 0;
  const limitPenalty = isOverLimit ? 10 : 0;
  const missingPenalty = Math.min(10, Math.max(0, missingInputsCount) * 2);

  const raw = readiness + eligibility + 40 - bridgePenalty - limitPenalty - missingPenalty;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

function ScenarioCompare() {
  const { scenarios } = useScenario();
  const { entitlements } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const selectedIds = useMemo(
    () => (Array.isArray(location.state?.scenarioIds) ? location.state.scenarioIds : []),
    [location.state?.scenarioIds]
  );

  const selectedScenarios = useMemo(() => {
    const byId = new Map(scenarios.map((s) => [s.id, s]));
    return selectedIds.map((id) => byId.get(id)).filter(Boolean);
  }, [scenarios, selectedIds]);

  const canCompare = hasEntitlement(entitlements, FEATURES.SCENARIO_COMPARE);

  const rows = useMemo(() => {
    return selectedScenarios.map((scenario) => {
      const tsp = scenario.tsp ?? {};
      const fers = scenario.fers ?? {};
      const fire = scenario.fire ?? {};
      const swr = Number(scenario?.summary?.assumptions?.safeWithdrawalRate ?? DEFAULTS.swr);

      const missing = [
        tsp.currentAge,
        tsp.retirementAge,
        tsp.annualSalary,
        fers.currentAge,
        fers.retirementAge,
        fers.yearsOfService,
        fers.high3Salary,
        fire.monthlyFireIncomeGoal,
      ].filter((v) => !Number.isFinite(Number(v)) || Number(v) <= 0).length;

      const tspRes = calculateTspTraditionalVsRoth({
        currentBalance: tsp.currentBalance ?? 0,
        annualSalary: tsp.annualSalary ?? 0,
        monthlyContributionPercent: tsp.monthlyContributionPercent ?? 0,
        currentAge: tsp.currentAge ?? 0,
        retirementAge: tsp.retirementAge ?? 0,
        allocation: tsp.allocation ?? {},
        currentTaxRate: tsp.currentTaxRate ?? 22,
        retirementTaxRate: tsp.retirementTaxRate ?? 15,
        annualSalaryGrowthRate: Number(tsp.annualSalaryGrowthRate ?? 0) / 100,
        inflationRate: (tsp.valueMode ?? DEFAULTS.valueMode) === 'real' ? Number(tsp.inflationRate ?? 0) / 100 : 0,
        includeEmployerMatch: tsp.includeEmployerMatch ?? false,
        includeAutomatic1Percent: tsp.includeAutomatic1Percent ?? true,
        annualEmployeeDeferralLimit: tsp.annualEmployeeDeferralLimit ?? DEFAULTS.annualEmployeeDeferralLimit,
        annualCatchUpLimit: tsp.annualCatchUpLimit ?? DEFAULTS.annualCatchUpLimit,
        catchUpAge: tsp.catchUpAge ?? DEFAULTS.catchUpAge,
        fundReturns: tsp.fundReturns
          ? {
              G: Number(tsp.fundReturns.G ?? DEFAULTS.fundReturns.G) / 100,
              F: Number(tsp.fundReturns.F ?? DEFAULTS.fundReturns.F) / 100,
              C: Number(tsp.fundReturns.C ?? DEFAULTS.fundReturns.C) / 100,
              S: Number(tsp.fundReturns.S ?? DEFAULTS.fundReturns.S) / 100,
              I: Number(tsp.fundReturns.I ?? DEFAULTS.fundReturns.I) / 100,
            }
          : undefined,
      });
      const tspSelected = tsp.contributionType === 'roth' ? tspRes.roth : tspRes.traditional;

      const year1 = tspSelected?.yearlyData?.[1] ?? null;
      const savingsRatePct =
        year1 && year1.salary > 0 ? ((year1.employeeContributions + year1.employerContributions) / year1.salary) * 100 : 0;

      const fersRes = calculateFersResults({
        yearsOfService: fers.yearsOfService ?? 0,
        monthsOfService: fers.monthsOfService ?? 0,
        high3Salary: fers.high3Salary ?? 0,
        currentAge: fers.currentAge ?? 0,
        retirementAge: fers.retirementAge ?? 0,
        showComparison: false,
        privateJobSalary: fers.privateJobSalary ?? 0,
        privateJobYears: fers.privateJobYears ?? 0,
        includeFutureService: true,
      });

      const plannedRetAge = tsp.retirementAge ?? fers.retirementAge ?? 0;

      const gapDesired = calculateFireGap({
        tspProjectedBalance: tspSelected.projectedBalance ?? 0,
        pensionMonthly: fersRes.stayFed.monthlyPension ?? 0,
        fire,
        safeWithdrawalRate: swr,
        desiredFireAge: fire.desiredFireAge ?? undefined,
        pensionStartAge: fers.retirementAge ?? undefined,
      });

      const gapAtPlannedRet = calculateFireGap({
        tspProjectedBalance: tspSelected.projectedBalance ?? 0,
        pensionMonthly: fersRes.stayFed.monthlyPension ?? 0,
        fire,
        safeWithdrawalRate: swr,
        desiredFireAge: plannedRetAge || undefined,
        pensionStartAge: plannedRetAge || undefined,
      });

      const earliestEligibleAge = findEarliestFersImmediateRetirementAge({
        currentAge: fers.currentAge ?? 0,
        totalYearsOfService: Number(fers.yearsOfService ?? 0) + Number(fers.monthsOfService ?? 0) / 12,
      });

      const estimatedEarliestFireAge = estimateEarliestFireAge({
        tspYearlyData: tspSelected?.yearlyData ?? [],
        safeWithdrawalRate: swr,
        fireIncomeGoalMonthly: fire.monthlyFireIncomeGoal ?? 0,
        sideHustleIncome: fire.sideHustleIncome ?? 0,
        spouseIncome: fire.spouseIncome ?? 0,
        pensionMonthly: fersRes.stayFed.monthlyPension ?? 0,
        pensionStartAge: fers.retirementAge ?? 0,
      });

      const defaultFlags = buildDefaultFlags(scenario);
      const planScore = scoreScenarioPlan({
        isFireReadyAtDesiredAge: gapDesired.isFireReadyAtDesiredAge,
        monthlyGapAtDesiredAge: gapDesired.monthlyGapAtDesiredAge,
        fireIncomeGoalMonthly: gapDesired.fireIncomeGoal,
        requiredBridgeAssets: gapDesired.bridge?.requiredBridgeAssets ?? 0,
        tspProjectedBalance: tspSelected.projectedBalance ?? 0,
        isEligibleAtPlannedRetirement: fersRes.stayFed.isEligible,
        isOverLimit: tspRes.limits?.isOverLimit ?? false,
        missingInputsCount: missing,
      });

      return {
        id: scenario.id,
        name: scenario.name,
        tspProjectedBalance: tspSelected.projectedBalance ?? 0,
        tspAfterTaxValue: tspSelected.afterTaxValue ?? 0,
        weightedReturn: tspRes.weightedReturn ?? 0,
        isOverLimit: tspRes.limits?.isOverLimit ?? false,
        employeeLimit: tspRes.limits?.annualEmployeeDeferralLimit ?? null,
        effectiveAnnualEmployeeContribution: tspRes.limits?.effectiveAnnualEmployeeContribution ?? null,
        desiredAnnualEmployeeContribution: tspRes.limits?.desiredAnnualEmployeeContribution ?? null,
        savingsRatePct,
        fersMonthlyPension: fersRes.stayFed.monthlyPension ?? 0,
        fersEligibleAtPlannedRetirement: Boolean(fersRes.stayFed.isEligible),
        fersEligibilityMessage: fersRes.stayFed.eligibilityMessage ?? '',
        earliestFersEligibilityAge: earliestEligibleAge,
        retirementAge: plannedRetAge,
        desiredFireAge: fire.desiredFireAge ?? 0,
        fireGoalMonthly: gapDesired.fireIncomeGoal ?? 0,
        fireGapMonthly: gapDesired.monthlyGap ?? 0,
        fireGapAfterPensionMonthly: gapDesired.monthlyGapAfterPension ?? 0,
        isFireReadyAtDesiredAge: Boolean(gapDesired.isFireReadyAtDesiredAge),
        projectedMonthlyIncomeAtRetirement: gapAtPlannedRet.totalPassiveIncomeAtDesiredAge ?? 0,
        estimatedEarliestFireAge,
        bridgeYears: gapDesired.bridge?.yearsToBridge ?? 0,
        bridgeRequiredAssets: gapDesired.bridge?.requiredBridgeAssets ?? 0,
        swrUsed: gapDesired.inputs?.safeWithdrawalRate ?? swr,
        defaultsUsedCount: defaultFlags.length,
        defaultFlags,
        missingInputsCount: missing,
        planScore,
      };
    });
  }, [selectedScenarios]);

  // Track compare open (best-effort)
  useEffect(() => {
    trackEvent('compare_opened', { selectedCount: selectedIds.length });
  }, [selectedIds.length]);

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);

  const formatPercent = (value, { digits = 1 } = {}) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n.toFixed(digits)}%`;
  };

  const getRowBestWorst = ({ values, higherIsBetter = true }) => {
    const nums = values.map((v) => (Number.isFinite(Number(v)) ? Number(v) : null));
    const filtered = nums.map((v, idx) => ({ v, idx })).filter((x) => x.v !== null);
    if (filtered.length === 0) return { best: new Set(), worst: new Set() };

    const sorted = filtered.slice().sort((a, b) => a.v - b.v);
    const bestValue = higherIsBetter ? sorted[sorted.length - 1].v : sorted[0].v;
    const worstValue = higherIsBetter ? sorted[0].v : sorted[sorted.length - 1].v;

    const best = new Set(filtered.filter((x) => x.v === bestValue).map((x) => x.idx));
    const worst = new Set(filtered.filter((x) => x.v === worstValue).map((x) => x.idx));
    return { best, worst };
  };

  if (!canCompare) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-bold navy-text mb-2">Scenario Comparison</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Scenario comparison is a Pro feature. Join the waitlist to get notified when Pro launches.
        </p>
        <div className="flex justify-center gap-3">
          <Link className="btn-secondary" to="/scenarios">Back to Scenarios</Link>
          <Link className="btn-primary" to="/pro-features" state={{ reason: 'compare_pro' }}>
            View Pro Features
          </Link>
        </div>
      </div>
    );
  }

  if (rows.length < 2) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-bold navy-text mb-2">Scenario Comparison</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Select at least 2 scenarios to compare.
        </p>
        <Link className="btn-primary" to="/scenarios">Go to Scenarios</Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold navy-text">Scenario Comparison</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Comparing {rows.length} scenarios
          </p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={() => navigate(-1)}>Back</button>
          <Link className="btn-secondary" to="/scenarios">Scenarios</Link>
        </div>
      </div>

      <div className="card p-6 overflow-x-auto">
        <table className="min-w-[1100px] w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600 dark:text-slate-300">
              <th className="py-3 pr-4">Metric</th>
              {rows.map((r) => (
                <th key={r.id} className="py-3 pr-4">{r.name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-700 dark:text-slate-200">
            {/* Score */}
            {(() => {
              const { best, worst } = getRowBestWorst({ values: rows.map((r) => r.planScore), higherIsBetter: true });
              return (
                <tr className="border-t border-slate-200 dark:border-slate-700">
                  <td className="py-3 pr-4 font-medium">Plan score (0–100)</td>
                  {rows.map((r, idx) => (
                    <td
                      key={r.id}
                      className={`py-3 pr-4 ${best.has(idx) ? 'bg-emerald-50 dark:bg-emerald-900/20 font-semibold' : ''} ${
                        worst.has(idx) ? 'bg-rose-50 dark:bg-rose-900/20' : ''
                      }`}
                    >
                      {Number.isFinite(r.planScore) ? r.planScore : '—'}
                    </td>
                  ))}
                </tr>
              );
            })()}

            {/* Savings rate */}
            {(() => {
              const { best, worst } = getRowBestWorst({ values: rows.map((r) => r.savingsRatePct), higherIsBetter: true });
              return (
                <tr className="border-t border-slate-200 dark:border-slate-700">
                  <td className="py-3 pr-4 font-medium">Savings rate (employee + employer, year 1)</td>
                  {rows.map((r, idx) => (
                    <td
                      key={r.id}
                      className={`py-3 pr-4 ${best.has(idx) ? 'bg-emerald-50 dark:bg-emerald-900/20 font-semibold' : ''} ${
                        worst.has(idx) ? 'bg-rose-50 dark:bg-rose-900/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{formatPercent(r.savingsRatePct, { digits: 1 })}</span>
                        {r.isOverLimit && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                            Over limit
                          </span>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })()}

            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-3 pr-4 font-medium">TSP projected balance</td>
              {rows.map((r) => (
                <td key={r.id} className="py-3 pr-4">{formatCurrency(r.tspProjectedBalance)}</td>
              ))}
            </tr>

            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-3 pr-4 font-medium">Projected monthly income (at retirement age)</td>
              {rows.map((r) => (
                <td key={r.id} className="py-3 pr-4">{formatCurrency(r.projectedMonthlyIncomeAtRetirement)}</td>
              ))}
            </tr>

            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-3 pr-4 font-medium">FERS monthly pension</td>
              {rows.map((r) => (
                <td key={r.id} className="py-3 pr-4">{formatCurrency(r.fersMonthlyPension)}</td>
              ))}
            </tr>

            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-3 pr-4 font-medium">Earliest FERS eligibility age (immediate)</td>
              {rows.map((r) => (
                <td key={r.id} className="py-3 pr-4">{r.earliestFersEligibilityAge || '—'}</td>
              ))}
            </tr>

            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-3 pr-4 font-medium">FIRE goal (monthly)</td>
              {rows.map((r) => (
                <td key={r.id} className="py-3 pr-4">{formatCurrency(r.fireGoalMonthly)}</td>
              ))}
            </tr>
            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-3 pr-4 font-medium">FIRE gap (monthly)</td>
              {rows.map((r) => (
                <td key={r.id} className={`py-3 pr-4 ${r.fireGapMonthly >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {r.fireGapMonthly >= 0 ? '+' : ''}{formatCurrency(r.fireGapMonthly)}
                </td>
              ))}
            </tr>

            {(() => {
              const { best, worst } = getRowBestWorst({ values: rows.map((r) => r.estimatedEarliestFireAge), higherIsBetter: false });
              return (
                <tr className="border-t border-slate-200 dark:border-slate-700">
                  <td className="py-3 pr-4 font-medium">Estimated earliest FIRE age</td>
                  {rows.map((r, idx) => (
                    <td
                      key={r.id}
                      className={`py-3 pr-4 ${best.has(idx) ? 'bg-emerald-50 dark:bg-emerald-900/20 font-semibold' : ''} ${
                        worst.has(idx) ? 'bg-rose-50 dark:bg-rose-900/20' : ''
                      }`}
                    >
                      {r.estimatedEarliestFireAge || '—'}
                    </td>
                  ))}
                </tr>
              );
            })()}

            {(() => {
              const { best, worst } = getRowBestWorst({ values: rows.map((r) => r.bridgeRequiredAssets), higherIsBetter: false });
              return (
                <tr className="border-t border-slate-200 dark:border-slate-700">
                  <td className="py-3 pr-4 font-medium">Bridge required (assets)</td>
                  {rows.map((r, idx) => (
                    <td
                      key={r.id}
                      className={`py-3 pr-4 ${best.has(idx) ? 'bg-emerald-50 dark:bg-emerald-900/20 font-semibold' : ''} ${
                        worst.has(idx) ? 'bg-rose-50 dark:bg-rose-900/20' : ''
                      }`}
                    >
                      {formatCurrency(r.bridgeRequiredAssets)}
                    </td>
                  ))}
                </tr>
              );
            })()}

            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-3 pr-4 font-medium">Retirement age</td>
              {rows.map((r) => (
                <td key={r.id} className="py-3 pr-4">{r.retirementAge || '—'}</td>
              ))}
            </tr>
            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-3 pr-4 font-medium">Desired FIRE age</td>
              {rows.map((r) => (
                <td key={r.id} className="py-3 pr-4">{r.desiredFireAge || '—'}</td>
              ))}
            </tr>

            {(() => {
              const { best, worst } = getRowBestWorst({ values: rows.map((r) => r.swrUsed), higherIsBetter: false });
              return (
                <tr className="border-t border-slate-200 dark:border-slate-700">
                  <td className="py-3 pr-4 font-medium">SWR used</td>
                  {rows.map((r, idx) => (
                    <td
                      key={r.id}
                      className={`py-3 pr-4 ${best.has(idx) ? 'bg-emerald-50 dark:bg-emerald-900/20 font-semibold' : ''} ${
                        worst.has(idx) ? 'bg-rose-50 dark:bg-rose-900/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{formatPercent(r.swrUsed * 100, { digits: 1 })}</span>
                        {Number(r.swrUsed) === DEFAULTS.swr && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                            Default
                          </span>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })()}

            {(() => {
              const { best, worst } = getRowBestWorst({ values: rows.map((r) => r.defaultsUsedCount), higherIsBetter: false });
              return (
                <tr className="border-t border-slate-200 dark:border-slate-700">
                  <td className="py-3 pr-4 font-medium">App defaults used (count)</td>
                  {rows.map((r, idx) => (
                    <td
                      key={r.id}
                      className={`py-3 pr-4 ${best.has(idx) ? 'bg-emerald-50 dark:bg-emerald-900/20 font-semibold' : ''} ${
                        worst.has(idx) ? 'bg-rose-50 dark:bg-rose-900/20' : ''
                      }`}
                    >
                      {r.defaultsUsedCount}
                    </td>
                  ))}
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>

      <div className="card p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold navy-text">Compare assumptions</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              These inputs explain why two scenarios might diverge even if “headline” numbers look similar.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 dark:text-slate-300">
                <th className="py-3 pr-4">Assumption</th>
                {rows.map((r) => (
                  <th key={r.id} className="py-3 pr-4">{r.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200">
              <tr className="border-t border-slate-200 dark:border-slate-700">
                <td className="py-3 pr-4 font-medium">SWR</td>
                {rows.map((r) => (
                  <td key={r.id} className="py-3 pr-4">{formatPercent(r.swrUsed * 100, { digits: 1 })}</td>
                ))}
              </tr>
              <tr className="border-t border-slate-200 dark:border-slate-700">
                <td className="py-3 pr-4 font-medium">TSP weighted return</td>
                {rows.map((r) => (
                  <td key={r.id} className="py-3 pr-4">{formatPercent(r.weightedReturn * 100, { digits: 2 })}</td>
                ))}
              </tr>
              <tr className="border-t border-slate-200 dark:border-slate-700">
                <td className="py-3 pr-4 font-medium">Tax assumption (current → retirement)</td>
                {rows.map((r) => {
                  const scenario = selectedScenarios.find((s) => s.id === r.id);
                  const tsp = scenario?.tsp ?? {};
                  return (
                    <td key={r.id} className="py-3 pr-4">
                      {formatPercent(Number(tsp.currentTaxRate ?? DEFAULTS.currentTaxRate), { digits: 0 })} →{' '}
                      {formatPercent(Number(tsp.retirementTaxRate ?? DEFAULTS.retirementTaxRate), { digits: 0 })}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-t border-slate-200 dark:border-slate-700">
                <td className="py-3 pr-4 font-medium">Contribution type</td>
                {rows.map((r) => {
                  const scenario = selectedScenarios.find((s) => s.id === r.id);
                  const tsp = scenario?.tsp ?? {};
                  return <td key={r.id} className="py-3 pr-4 capitalize">{tsp.contributionType ?? '—'}</td>;
                })}
              </tr>
              <tr className="border-t border-slate-200 dark:border-slate-700">
                <td className="py-3 pr-4 font-medium">Employer match enabled</td>
                {rows.map((r) => {
                  const scenario = selectedScenarios.find((s) => s.id === r.id);
                  const tsp = scenario?.tsp ?? {};
                  return <td key={r.id} className="py-3 pr-4">{(tsp.includeEmployerMatch ?? false) ? 'Yes' : 'No'}</td>;
                })}
              </tr>
              <tr className="border-t border-slate-200 dark:border-slate-700">
                <td className="py-3 pr-4 font-medium">Inflation used (for “real” mode)</td>
                {rows.map((r) => {
                  const scenario = selectedScenarios.find((s) => s.id === r.id);
                  const tsp = scenario?.tsp ?? {};
                  return <td key={r.id} className="py-3 pr-4">{formatPercent(Number(tsp.inflationRate ?? DEFAULTS.inflationRate), { digits: 1 })}</td>;
                })}
              </tr>
              <tr className="border-t border-slate-200 dark:border-slate-700">
                <td className="py-3 pr-4 font-medium">Salary growth</td>
                {rows.map((r) => {
                  const scenario = selectedScenarios.find((s) => s.id === r.id);
                  const tsp = scenario?.tsp ?? {};
                  return <td key={r.id} className="py-3 pr-4">{formatPercent(Number(tsp.annualSalaryGrowthRate ?? DEFAULTS.annualSalaryGrowthRate), { digits: 1 })}</td>;
                })}
              </tr>
              <tr className="border-t border-slate-200 dark:border-slate-700">
                <td className="py-3 pr-4 font-medium">Defaults flagged</td>
                {rows.map((r) => (
                  <td key={r.id} className="py-3 pr-4">
                    {r.defaultFlags.length === 0 ? (
                      <span className="text-slate-500 dark:text-slate-400">None</span>
                    ) : (
                      <ul className="space-y-1">
                        {r.defaultFlags.slice(0, 4).map((f) => (
                          <li key={f} className="text-xs text-amber-700 dark:text-amber-300">{f}</li>
                        ))}
                        {r.defaultFlags.length > 4 && (
                          <li className="text-xs text-slate-500 dark:text-slate-400">+{r.defaultFlags.length - 4} more</li>
                        )}
                      </ul>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ScenarioCompare;


