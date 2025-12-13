import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import { useScenario } from '../contexts/ScenarioContext';
import { useAuth } from '../contexts/AuthContext';
import { FEATURES, hasEntitlement } from '../lib/entitlements';
import { calculateTspTraditionalVsRoth } from '../lib/calculations/tsp';
import { calculateFersResults } from '../lib/calculations/fers';
import { calculateFireGap } from '../lib/calculations/fire';
import { trackEvent } from '../lib/telemetry';

function ScenarioCompare() {
  const { scenarios } = useScenario();
  const { entitlements } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const selectedIds = Array.isArray(location.state?.scenarioIds) ? location.state.scenarioIds : [];

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

      const tspRes = calculateTspTraditionalVsRoth({
        currentBalance: tsp.currentBalance ?? 0,
        annualSalary: tsp.annualSalary ?? 0,
        monthlyContributionPercent: tsp.monthlyContributionPercent ?? 0,
        currentAge: tsp.currentAge ?? 0,
        retirementAge: tsp.retirementAge ?? 0,
        allocation: tsp.allocation ?? {},
        currentTaxRate: tsp.currentTaxRate ?? 22,
        retirementTaxRate: tsp.retirementTaxRate ?? 15,
      });
      const tspSelected = tsp.contributionType === 'roth' ? tspRes.roth : tspRes.traditional;

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

      const gap = calculateFireGap({
        tspProjectedBalance: tspSelected.projectedBalance ?? 0,
        pensionMonthly: fersRes.stayFed.monthlyPension ?? 0,
        fire,
      });

      return {
        id: scenario.id,
        name: scenario.name,
        tspProjectedBalance: tspSelected.projectedBalance ?? 0,
        fersMonthlyPension: fersRes.stayFed.monthlyPension ?? 0,
        fireGoalMonthly: gap.fireIncomeGoal ?? 0,
        fireGapMonthly: gap.monthlyGap ?? 0,
        retirementAge: tsp.retirementAge ?? fers.retirementAge ?? 0,
        desiredFireAge: fire.desiredFireAge ?? 0,
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
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600 dark:text-slate-300">
              <th className="py-3 pr-4">Metric</th>
              {rows.map((r) => (
                <th key={r.id} className="py-3 pr-4">{r.name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-700 dark:text-slate-200">
            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-3 pr-4 font-medium">TSP projected balance</td>
              {rows.map((r) => (
                <td key={r.id} className="py-3 pr-4">{formatCurrency(r.tspProjectedBalance)}</td>
              ))}
            </tr>
            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-3 pr-4 font-medium">FERS monthly pension</td>
              {rows.map((r) => (
                <td key={r.id} className="py-3 pr-4">{formatCurrency(r.fersMonthlyPension)}</td>
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
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ScenarioCompare;


