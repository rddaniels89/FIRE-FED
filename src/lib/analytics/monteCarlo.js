import { mulberry32, normal01 } from './random';
import { summarizePercentiles } from './stats';

const FUND_STDDEV = Object.freeze({
  // Coarse volatility assumptions (annualized), used to approximate portfolio volatility.
  G: 0.01,
  F: 0.05,
  C: 0.16,
  S: 0.18,
  I: 0.17,
});

function clampNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toWeightMap(allocationPct) {
  const a = allocationPct || {};
  const entries = ['G', 'F', 'C', 'S', 'I'].map((k) => [k, clampNumber(a[k], 0)]);
  const sum = entries.reduce((acc, [, v]) => acc + v, 0);
  if (sum <= 0) {
    return { G: 0.1, F: 0.2, C: 0.4, S: 0.2, I: 0.1 };
  }
  const weights = {};
  for (const [k, v] of entries) weights[k] = v / sum;
  return weights;
}

function portfolioMeanReturn({ weights, fundReturnsPct }) {
  const fr = fundReturnsPct || {};
  return (
    weights.G * (clampNumber(fr.G, 2) / 100) +
    weights.F * (clampNumber(fr.F, 3) / 100) +
    weights.C * (clampNumber(fr.C, 7) / 100) +
    weights.S * (clampNumber(fr.S, 8) / 100) +
    weights.I * (clampNumber(fr.I, 6) / 100)
  );
}

function portfolioStdDev({ weights }) {
  // Naive approximation (ignores correlations): sqrt(sum((w*sd)^2))
  const varApprox =
    Math.pow(weights.G * FUND_STDDEV.G, 2) +
    Math.pow(weights.F * FUND_STDDEV.F, 2) +
    Math.pow(weights.C * FUND_STDDEV.C, 2) +
    Math.pow(weights.S * FUND_STDDEV.S, 2) +
    Math.pow(weights.I * FUND_STDDEV.I, 2);
  return Math.sqrt(varApprox);
}

function computeEmployerMatchPct(employeePct) {
  // TSP: 1% automatic + up to 4% match (3% dollar-for-dollar + next 2% at 50%)
  const p = Math.max(0, clampNumber(employeePct, 0));
  const first3 = Math.min(3, p);
  const next2 = Math.max(0, Math.min(5, p) - 3);
  return first3 + next2 * 0.5;
}

function annualContribution({
  salary,
  employeePct,
  includeEmployerMatch,
  includeAutomatic1Percent,
  annualEmployeeDeferralLimit,
  annualCatchUpLimit,
  age,
  catchUpAge,
}) {
  const sal = Math.max(0, clampNumber(salary, 0));
  const pct = Math.max(0, clampNumber(employeePct, 0));

  const rawEmployee = sal * (pct / 100);
  const limit = Math.max(0, clampNumber(annualEmployeeDeferralLimit, 23500));
  const catchUp = age >= Math.max(0, clampNumber(catchUpAge, 50)) ? Math.max(0, clampNumber(annualCatchUpLimit, 7500)) : 0;

  const employee = Math.min(rawEmployee, limit + catchUp);

  const auto1 = includeAutomatic1Percent ? sal * 0.01 : 0;
  const matchPct = includeEmployerMatch ? computeEmployerMatchPct(pct) : 0;
  const match = includeEmployerMatch ? sal * (matchPct / 100) : 0;

  return employee + auto1 + match;
}

function calcPassiveMonthlyIncome({
  balance,
  swr,
  pensionMonthly,
  pensionStartAge,
  ssMonthly,
  ssStartAge,
  age,
  sideHustleIncome,
  spouseIncome,
}) {
  const b = Math.max(0, clampNumber(balance, 0));
  const swrLocal = clampNumber(swr, 0.04);
  const tspMonthly = (b * swrLocal) / 12;
  const pension = age >= pensionStartAge ? Math.max(0, clampNumber(pensionMonthly, 0)) : 0;
  const ss = age >= ssStartAge ? Math.max(0, clampNumber(ssMonthly, 0)) : 0;
  const side = Math.max(0, clampNumber(sideHustleIncome, 0));
  const spouse = Math.max(0, clampNumber(spouseIncome, 0));
  return tspMonthly + pension + ss + side + spouse;
}

export function runMonteCarloAnalytics({
  scenario,
  pensionMonthly,
  pensionStartAge,
  socialSecurityMonthly,
  socialSecurityStartAge,
  settings,
}) {
  const tsp = scenario?.tsp ?? {};
  const fire = scenario?.fire ?? {};
  const summary = scenario?.summary ?? {};
  const assumptions = summary?.assumptions ?? {};

  const currentAge = clampNumber(tsp.currentAge, 0);
  const retirementAge = clampNumber(tsp.retirementAge, 0);
  const desiredFireAge = clampNumber(fire.desiredFireAge, retirementAge);

  const sims = Math.max(100, clampNumber(settings?.simulations ?? 750, 750));
  const endAge = Math.max(desiredFireAge, clampNumber(settings?.endAge ?? 95, 95));
  const swr = clampNumber(assumptions.safeWithdrawalRate ?? settings?.swr ?? 0.04, 0.04);
  const inflation = clampNumber(tsp.inflationRate ?? settings?.inflationRate ?? 2.5, 2.5) / 100;

  const fireGoalMonthly = Math.max(
    0,
    clampNumber(fire.monthlyFireIncomeGoal, 0) || clampNumber(summary.monthlyExpenses, 0)
  );

  const weights = toWeightMap(tsp.allocation);
  const mu = portfolioMeanReturn({ weights, fundReturnsPct: tsp.fundReturns });
  const sigma = portfolioStdDev({ weights });

  const annualSalary0 = Math.max(0, clampNumber(tsp.annualSalary, 0));
  const salaryGrowth = clampNumber(tsp.annualSalaryGrowthRate ?? 3, 3) / 100;
  const employeePct = clampNumber(tsp.monthlyContributionPercent, 0);

  const includeEmployerMatch = Boolean(tsp.includeEmployerMatch ?? true);
  const includeAutomatic1Percent = Boolean(tsp.includeAutomatic1Percent ?? true);
  const annualEmployeeDeferralLimit = clampNumber(tsp.annualEmployeeDeferralLimit ?? 23500, 23500);
  const annualCatchUpLimit = clampNumber(tsp.annualCatchUpLimit ?? 7500, 7500);
  const catchUpAge = clampNumber(tsp.catchUpAge ?? 50, 50);

  const baseBalance = Math.max(0, clampNumber(tsp.currentBalance, 0));
  const sideHustleIncome = Math.max(0, clampNumber(fire.sideHustleIncome, 0));
  const spouseIncome = Math.max(0, clampNumber(fire.spouseIncome, 0));

  const pensionStart = Math.max(0, clampNumber(pensionStartAge, retirementAge));
  const ssStart = Math.max(0, clampNumber(socialSecurityStartAge, 67));

  const balancesAtRetirement = [];
  const balancesAtDesired = [];
  const succeededToEnd = [];
  const achievedFireByDesired = [];

  for (let i = 0; i < sims; i++) {
    const rng = mulberry32((settings?.seed ?? Date.now()) + i * 7919);

    let balance = baseBalance;
    let salary = annualSalary0;
    let failed = false;
    let balanceAtRetirementThisSim = null;
    let balanceAtDesiredThisSim = null;
    const workEndAge = Math.min(retirementAge, desiredFireAge);

    for (let age = currentAge; age <= endAge; age++) {
      const isWorkingYear = age < workEndAge;

      // Random annual return (clamped to avoid extreme tails).
      const r = Math.max(-0.65, Math.min(0.65, mu + sigma * normal01(rng)));

      if (isWorkingYear) {
        const contrib = annualContribution({
          salary,
          employeePct,
          includeEmployerMatch,
          includeAutomatic1Percent,
          annualEmployeeDeferralLimit,
          annualCatchUpLimit,
          age,
          catchUpAge,
        });
        balance = (balance + contrib) * (1 + r);
        salary = salary * (1 + salaryGrowth);
      } else {
        // Withdrawal model: start at desired FIRE age.
        if (age >= desiredFireAge) {
          const yearsSince = age - desiredFireAge;
          const inflatedNeedAnnual = fireGoalMonthly * 12 * Math.pow(1 + inflation, yearsSince);
          const pensionAnnual = age >= pensionStart ? Math.max(0, clampNumber(pensionMonthly, 0) * 12) : 0;
          const ssAnnual = age >= ssStart ? Math.max(0, clampNumber(socialSecurityMonthly, 0) * 12) : 0;
          const otherAnnual = (sideHustleIncome + spouseIncome) * 12;

          const needFromTsp = Math.max(0, inflatedNeedAnnual - pensionAnnual - ssAnnual - otherAnnual);
          balance = balance - needFromTsp;
          if (balance < 0) {
            failed = true;
            balance = 0;
            break;
          }
        }

        balance = balance * (1 + r);
      }

      if (age === retirementAge) balanceAtRetirementThisSim = balance;
      if (age === desiredFireAge) balanceAtDesiredThisSim = balance;
    }

    const passiveAtDesired = calcPassiveMonthlyIncome({
      balance: balanceAtDesiredThisSim,
      swr,
      pensionMonthly,
      pensionStartAge: pensionStart,
      ssMonthly: socialSecurityMonthly,
      ssStartAge: ssStart,
      age: desiredFireAge,
      sideHustleIncome,
      spouseIncome,
    });

    if (balanceAtRetirementThisSim != null) balancesAtRetirement.push(balanceAtRetirementThisSim);
    if (balanceAtDesiredThisSim != null) balancesAtDesired.push(balanceAtDesiredThisSim);
    achievedFireByDesired.push(passiveAtDesired >= fireGoalMonthly);
    succeededToEnd.push(!failed);
  }

  const retirementPct = summarizePercentiles(balancesAtRetirement);
  const desiredPct = summarizePercentiles(balancesAtDesired);

  const pFireByDesired =
    achievedFireByDesired.length > 0
      ? achievedFireByDesired.filter(Boolean).length / achievedFireByDesired.length
      : 0;
  const pSuccessToEnd =
    succeededToEnd.length > 0 ? succeededToEnd.filter(Boolean).length / succeededToEnd.length : 0;

  return {
    inputs: {
      simulations: sims,
      currentAge,
      retirementAge,
      desiredFireAge,
      endAge,
      swr,
      inflationRate: inflation,
      meanReturn: mu,
      portfolioStdDev: sigma,
      fireGoalMonthly,
    },
    outcomes: {
      probabilityFireByDesiredAge: pFireByDesired,
      probabilityFundsLastToEndAge: pSuccessToEnd,
      balanceAtRetirement: retirementPct,
      balanceAtDesiredFireAge: desiredPct,
    },
  };
}


