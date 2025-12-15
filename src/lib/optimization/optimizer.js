import { calculateTspTraditionalVsRoth } from '../calculations/tsp';
import { calculateFersResults } from '../calculations/fers';

function clampNumber(value, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function estimateEarliestFireAge({
  tspYearlyData,
  safeWithdrawalRate,
  fireIncomeGoalMonthly,
  sideHustleIncome,
  spouseIncome,
  pensionMonthly,
  pensionStartAge,
  ssMonthly,
  ssStartAge,
}) {
  const swr = clampNumber(safeWithdrawalRate, { min: 0.01, max: 0.1, fallback: 0.04 });
  const goal = Math.max(0, clampNumber(fireIncomeGoalMonthly, { min: 0, max: 1e9, fallback: 0 }));
  const side = Math.max(0, clampNumber(sideHustleIncome, { min: 0, max: 1e9, fallback: 0 }));
  const spouse = Math.max(0, clampNumber(spouseIncome, { min: 0, max: 1e9, fallback: 0 }));
  const pension = Math.max(0, clampNumber(pensionMonthly, { min: 0, max: 1e9, fallback: 0 }));
  const pensionAge = clampNumber(pensionStartAge, { min: 0, max: 200, fallback: 0 });
  const ss = Math.max(0, clampNumber(ssMonthly, { min: 0, max: 1e9, fallback: 0 }));
  const ssAge = clampNumber(ssStartAge, { min: 0, max: 200, fallback: 67 });

  const data = Array.isArray(tspYearlyData) ? tspYearlyData : [];
  if (data.length === 0 || goal <= 0) return null;

  for (const point of data) {
    const age = clampNumber(point?.year, { min: 0, max: 200, fallback: 0 });
    const balance = clampNumber(point?.balance, { min: 0, max: 1e12, fallback: 0 });
    const tspWithdrawalMonthly = (balance * swr) / 12;
    const pensionAtAge = pensionAge > 0 && age >= pensionAge ? pension : 0;
    const ssAtAge = ssAge > 0 && age >= ssAge ? ss : 0;
    const totalMonthlyIncome = tspWithdrawalMonthly + side + spouse + pensionAtAge + ssAtAge;
    if (totalMonthlyIncome >= goal) return age;
  }

  return null;
}

function computeSocialSecurityFromScenario(scenario) {
  const ss = scenario?.summary?.socialSecurity ?? {};
  const mode = ss.mode ?? 'not_configured';
  const claimingAge = Number(ss.claimingAge ?? 67);
  const manualMonthly = Number(ss.monthlyBenefit ?? 0);
  const pct = Number(ss.percentOfSalary ?? 30);
  const salary = Number(scenario?.tsp?.annualSalary ?? 0);

  const estimatedMonthly = mode === 'estimate' && salary > 0 ? (salary * (pct / 100)) / 12 : 0;
  const monthly = mode === 'manual' ? manualMonthly : mode === 'estimate' ? estimatedMonthly : 0;

  return {
    claimingAge: Number.isFinite(claimingAge) ? claimingAge : 67,
    monthly: Number.isFinite(monthly) ? monthly : 0,
  };
}

export function buildOptimizationSuggestions(scenario) {
  const tsp = scenario?.tsp ?? {};
  const fers = scenario?.fers ?? {};
  const fire = scenario?.fire ?? {};
  const summary = scenario?.summary ?? {};

  const swr = Number(summary?.assumptions?.safeWithdrawalRate ?? 0.04);

  const currentAge = clampNumber(tsp.currentAge, { min: 0, max: 120, fallback: 0 });
  const baseRetAge = clampNumber(tsp.retirementAge ?? fers.retirementAge, { min: currentAge + 1, max: 80, fallback: 62 });
  const baseContrib = clampNumber(tsp.monthlyContributionPercent, { min: 0, max: 100, fallback: 10 });

  const goalMonthlyBase = Math.max(0, clampNumber(fire.monthlyFireIncomeGoal, { min: 0, max: 1e9, fallback: 0 })) ||
    Math.max(0, clampNumber(summary.monthlyExpenses, { min: 0, max: 1e9, fallback: 0 }));

  const ss = computeSocialSecurityFromScenario(scenario);

  const evalScenario = ({ retirementAge, contributionPct, monthlyExpensesOverride }) => {
    const annualSalaryGrowthRate = Number(tsp.annualSalaryGrowthRate ?? 0) / 100;
    const inflationRate = (tsp.valueMode ?? 'nominal') === 'real' ? Number(tsp.inflationRate ?? 0) / 100 : 0;

    const tspRes = calculateTspTraditionalVsRoth({
      currentBalance: tsp.currentBalance ?? 0,
      annualSalary: tsp.annualSalary ?? 0,
      monthlyContributionPercent: contributionPct,
      currentAge: tsp.currentAge ?? 0,
      retirementAge,
      allocation: tsp.allocation ?? {},
      currentTaxRate: tsp.currentTaxRate ?? 22,
      retirementTaxRate: tsp.retirementTaxRate ?? 15,
      annualSalaryGrowthRate,
      inflationRate,
      includeEmployerMatch: tsp.includeEmployerMatch ?? false,
      includeAutomatic1Percent: tsp.includeAutomatic1Percent ?? true,
      annualEmployeeDeferralLimit: tsp.annualEmployeeDeferralLimit ?? 23500,
      annualCatchUpLimit: tsp.annualCatchUpLimit ?? 7500,
      catchUpAge: tsp.catchUpAge ?? 50,
      fundReturns: tsp.fundReturns
        ? {
            G: Number(tsp.fundReturns.G ?? 2) / 100,
            F: Number(tsp.fundReturns.F ?? 3) / 100,
            C: Number(tsp.fundReturns.C ?? 7) / 100,
            S: Number(tsp.fundReturns.S ?? 8) / 100,
            I: Number(tsp.fundReturns.I ?? 6) / 100,
          }
        : undefined,
    });

    const selected = tsp.contributionType === 'roth' ? tspRes.roth : tspRes.traditional;

    const fersRes = calculateFersResults({
      yearsOfService: fers.yearsOfService ?? 0,
      monthsOfService: fers.monthsOfService ?? 0,
      high3Salary: fers.high3Salary ?? 0,
      currentAge: fers.currentAge ?? 0,
      retirementAge,
      showComparison: false,
      privateJobSalary: fers.privateJobSalary ?? 0,
      privateJobYears: fers.privateJobYears ?? 0,
      includeFutureService: true,
    });

    const pensionMonthly = fersRes.stayFed.monthlyPension ?? 0;

    const goalMonthly =
      Math.max(0, clampNumber(fire.monthlyFireIncomeGoal, { min: 0, max: 1e9, fallback: 0 })) ||
      Math.max(0, clampNumber(monthlyExpensesOverride, { min: 0, max: 1e9, fallback: 0 }));

    const earliestAge = estimateEarliestFireAge({
      tspYearlyData: selected?.yearlyData ?? [],
      safeWithdrawalRate: swr,
      fireIncomeGoalMonthly: goalMonthly,
      sideHustleIncome: fire.sideHustleIncome ?? 0,
      spouseIncome: fire.spouseIncome ?? 0,
      pensionMonthly,
      pensionStartAge: retirementAge,
      ssMonthly: ss.monthly,
      ssStartAge: ss.claimingAge,
    });

    return {
      earliestFireAge: earliestAge,
      tspProjectedBalance: selected?.projectedBalance ?? 0,
      pensionMonthly,
      goalMonthly,
    };
  };

  const baseline = evalScenario({
    retirementAge: baseRetAge,
    contributionPct: baseContrib,
    monthlyExpensesOverride: summary.monthlyExpenses ?? 0,
  });

  const retirementCandidates = Array.from(new Set([
    baseRetAge,
    Math.min(80, baseRetAge + 1),
    Math.min(80, baseRetAge + 2),
    Math.min(80, baseRetAge + 3),
    Math.min(80, baseRetAge + 5),
  ])).filter((x) => x >= currentAge + 1);

  const contribCandidates = Array.from(new Set([
    baseContrib,
    Math.min(50, baseContrib + 2),
    Math.min(50, baseContrib + 5),
    Math.min(50, baseContrib + 10),
  ]));

  const expenseCandidates = Array.from(new Set([
    summary.monthlyExpenses ?? goalMonthlyBase,
    Math.max(0, (summary.monthlyExpenses ?? goalMonthlyBase) * 0.95),
    Math.max(0, (summary.monthlyExpenses ?? goalMonthlyBase) * 0.9),
  ]));

  const scored = [];
  for (const ra of retirementCandidates) {
    for (const cp of contribCandidates) {
      for (const me of expenseCandidates) {
        const metrics = evalScenario({ retirementAge: ra, contributionPct: cp, monthlyExpensesOverride: me });
        const earliest = metrics.earliestFireAge;
        if (!earliest) continue;

        const improvement =
          (baseline.earliestFireAge ? baseline.earliestFireAge - earliest : 0);

        // Score: prioritize earlier FIRE age, then smaller changes.
        const score =
          earliest * 100 +
          Math.abs(ra - baseRetAge) * 10 +
          Math.abs(cp - baseContrib) * 2 +
          Math.abs(me - (summary.monthlyExpenses ?? me)) / 100;

        scored.push({
          retirementAge: ra,
          contributionPct: cp,
          monthlyExpenses: me,
          earliestFireAge: earliest,
          improvementYears: improvement,
          score,
          metrics,
        });
      }
    }
  }

  scored.sort((a, b) => a.score - b.score);

  const top = [];
  for (const candidate of scored) {
    // Only include meaningful improvements or first items if baseline is missing.
    if (baseline.earliestFireAge && candidate.earliestFireAge >= baseline.earliestFireAge) continue;
    top.push(candidate);
    if (top.length >= 3) break;
  }

  return {
    baseline: {
      retirementAge: baseRetAge,
      contributionPct: baseContrib,
      monthlyExpenses: summary.monthlyExpenses ?? goalMonthlyBase,
      earliestFireAge: baseline.earliestFireAge,
    },
    suggestions: top.map((c, idx) => ({
      id: `opt_${idx}_${c.retirementAge}_${c.contributionPct}`,
      retirementAge: c.retirementAge,
      contributionPct: c.contributionPct,
      monthlyExpenses: c.monthlyExpenses,
      earliestFireAge: c.earliestFireAge,
      improvementYears: c.improvementYears,
      metrics: c.metrics,
    })),
  };
}


