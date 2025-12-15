export const DEFAULT_FUND_RETURNS = Object.freeze({
  G: 0.02,
  F: 0.03,
  C: 0.07,
  S: 0.08,
  I: 0.06,
});

export function calculateWeightedReturn({ allocation, fundReturns = DEFAULT_FUND_RETURNS }) {
  const funds = Object.keys(fundReturns);
  return funds.reduce((total, fund) => {
    const pct = Number(allocation?.[fund] ?? 0);
    return total + (fundReturns[fund] * pct) / 100;
  }, 0);
}

function clampNumber(value, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Simplified FERS matching: 1% automatic + up to 4% match (100% first 3%, 50% next 2%).
export function calculateFersTspEmployerPercent(employeeDeferralPercent) {
  const p = clampNumber(employeeDeferralPercent, { min: 0, max: 100, fallback: 0 });
  const matchDollarsForDollars = Math.min(p, 3); // 100% match up to 3%
  const matchHalf = Math.min(Math.max(p - 3, 0), 2) * 0.5; // 50% match for next 2%
  const automatic = 1;
  return clampNumber(automatic + matchDollarsForDollars + matchHalf, { min: 0, max: 5, fallback: 0 });
}

function deflateNominalToReal(amountNominal, inflationRate, yearsFromStart) {
  const inf = clampNumber(inflationRate, { min: 0, max: 1, fallback: 0 });
  const y = clampNumber(yearsFromStart, { min: 0, max: 200, fallback: 0 });
  if (inf === 0 || y === 0) return amountNominal;
  return amountNominal / Math.pow(1 + inf, y);
}

function calculateDualBucketTspProjection({
  startTraditionalBalance,
  startRothBalance,
  annualSalary,
  annualSalaryGrowthRate,
  employeeContributionPercent,
  annualEmployeeDeferralLimit,
  annualCatchUpLimit,
  catchUpAge,
  includeEmployerMatch,
  includeAutomatic1Percent,
  annualReturn,
  years,
  currentAge,
  currentTaxRate,
  retirementTaxRate,
  inflationRate,
  employeeContributionType, // 'traditional' | 'roth'
}) {
  const salary0 = clampNumber(annualSalary, { min: 0, max: 1e9, fallback: 0 });
  const salaryGrowth = clampNumber(annualSalaryGrowthRate, { min: -1, max: 1, fallback: 0 });
  const employeePct = clampNumber(employeeContributionPercent, { min: 0, max: 100, fallback: 0 });
  const baseLimit = clampNumber(annualEmployeeDeferralLimit, { min: 0, max: 1e9, fallback: 0 });
  const catchUpLimit = clampNumber(annualCatchUpLimit, { min: 0, max: 1e9, fallback: 0 });
  const catchUpAt = clampNumber(catchUpAge, { min: 0, max: 200, fallback: 50 });

  const monthlyReturn = clampNumber(annualReturn, { min: -1, max: 10, fallback: 0 }) / 12;
  const yearsInt = Math.max(0, Math.floor(clampNumber(years, { min: 0, max: 200, fallback: 0 })));
  const age0 = clampNumber(currentAge, { min: 0, max: 200, fallback: 0 });
  const taxNow = clampNumber(currentTaxRate, { min: 0, max: 100, fallback: 0 }) / 100;
  const taxLater = clampNumber(retirementTaxRate, { min: 0, max: 100, fallback: 0 }) / 100;
  const infl = clampNumber(inflationRate, { min: 0, max: 1, fallback: 0 });

  let trad = clampNumber(startTraditionalBalance, { min: 0, max: 1e12, fallback: 0 });
  let roth = clampNumber(startRothBalance, { min: 0, max: 1e12, fallback: 0 });

  let totalEmployeeGross = 0;
  let totalEmployer = 0;

  const yearlyData = [];

  // Snapshot at "now" (year 0)
  const startGross = trad + roth;
  yearlyData.push({
    year: age0,
    balanceNominal: startGross,
    afterTaxValueNominal: roth + trad * (1 - taxLater),
    balanceReal: deflateNominalToReal(startGross, infl, 0),
    afterTaxValueReal: deflateNominalToReal(roth + trad * (1 - taxLater), infl, 0),
    employeeContributionsNominal: 0,
    employerContributionsNominal: 0,
    totalEmployeeContributionsNominal: 0,
    totalEmployerContributionsNominal: 0,
    salaryNominal: salary0,
    employeeLimitNominal: baseLimit + (age0 >= catchUpAt ? catchUpLimit : 0),
  });

  for (let y = 0; y < yearsInt; y++) {
    const age = age0 + y;
    const salary = salary0 * Math.pow(1 + salaryGrowth, y);
    const monthlySalary = salary / 12;
    const annualLimit = baseLimit + (age >= catchUpAt ? catchUpLimit : 0);

    let employeeGrossThisYear = 0;
    let employerThisYear = 0;

    for (let m = 0; m < 12; m++) {
      const desiredEmployeeGross = (monthlySalary * employeePct) / 100;
      const remaining = Math.max(0, annualLimit - employeeGrossThisYear);
      const employeeGross = Math.min(desiredEmployeeGross, remaining);

      const actualEmployeePct = monthlySalary > 0 ? (employeeGross / monthlySalary) * 100 : 0;

      // Employer contributions are always treated as pre-tax (Traditional) for this simplified model.
      let employerGross = 0;
      if (includeEmployerMatch) {
        const employerPct = calculateFersTspEmployerPercent(actualEmployeePct);
        const automaticPct = includeAutomatic1Percent ? 1 : 0;
        const matchedPct = Math.max(0, employerPct - 1); // employerPct includes the 1% auto
        employerGross = monthlySalary * ((automaticPct + matchedPct) / 100);
      }

      if (employeeContributionType === 'traditional') {
        trad += employeeGross;
      } else {
        // Roth employee deferrals are made with after-tax dollars (simplified: same gross percent, reduced by current marginal tax rate)
        roth += employeeGross * (1 - taxNow);
      }

      trad += employerGross;

      employeeGrossThisYear += employeeGross;
      employerThisYear += employerGross;

      trad *= 1 + monthlyReturn;
      roth *= 1 + monthlyReturn;
    }

    totalEmployeeGross += employeeGrossThisYear;
    totalEmployer += employerThisYear;

    const gross = trad + roth;
    const afterTax = roth + trad * (1 - taxLater);
    const yearIndexFromStart = y + 1;

    yearlyData.push({
      year: age0 + yearIndexFromStart,
      balanceNominal: gross,
      afterTaxValueNominal: afterTax,
      balanceReal: deflateNominalToReal(gross, infl, yearIndexFromStart),
      afterTaxValueReal: deflateNominalToReal(afterTax, infl, yearIndexFromStart),
      employeeContributionsNominal: employeeGrossThisYear,
      employerContributionsNominal: employerThisYear,
      totalEmployeeContributionsNominal: totalEmployeeGross,
      totalEmployerContributionsNominal: totalEmployer,
      salaryNominal: salary,
      employeeLimitNominal: annualLimit,
    });
  }

  const final = yearlyData[yearlyData.length - 1];
  const projectedBalance = final?.balanceNominal ?? 0;
  const afterTaxValue = final?.afterTaxValueNominal ?? 0;

  return {
    projectedBalance,
    afterTaxValue,
    yearlyData,
    totals: {
      employeeContributionsGross: totalEmployeeGross,
      employerContributions: totalEmployer,
      totalContributions: totalEmployeeGross + totalEmployer,
      // "Growth" here is nominal growth vs start balance + contributions; Roth contributions are net-of-tax in the Roth case.
      totalGrowthNominal:
        projectedBalance -
        (clampNumber(startTraditionalBalance, { min: 0, max: 1e12, fallback: 0 }) +
          clampNumber(startRothBalance, { min: 0, max: 1e12, fallback: 0 })) -
        (totalEmployeeGross + totalEmployer),
    },
  };
}

export function calculateTspTraditionalVsRoth({
  currentBalance,
  annualSalary,
  monthlyContributionPercent,
  currentAge,
  retirementAge,
  allocation,
  currentTaxRate,
  retirementTaxRate,
  fundReturns = DEFAULT_FUND_RETURNS,
  annualSalaryGrowthRate = 0,
  inflationRate = 0,
  includeEmployerMatch = false,
  includeAutomatic1Percent = true,
  annualEmployeeDeferralLimit = 23500,
  annualCatchUpLimit = 7500,
  catchUpAge = 50,
}) {
  const years = Number(retirementAge ?? 0) - Number(currentAge ?? 0);

  const weightedReturn = calculateWeightedReturn({ allocation, fundReturns });

  const traditional = calculateDualBucketTspProjection({
    startTraditionalBalance: Number(currentBalance ?? 0),
    startRothBalance: 0,
    annualSalary,
    annualSalaryGrowthRate,
    employeeContributionPercent: monthlyContributionPercent,
    annualEmployeeDeferralLimit,
    annualCatchUpLimit,
    catchUpAge,
    includeEmployerMatch,
    includeAutomatic1Percent,
    annualReturn: weightedReturn,
    years,
    currentAge,
    currentTaxRate,
    retirementTaxRate,
    inflationRate,
    employeeContributionType: 'traditional',
  });

  const roth = calculateDualBucketTspProjection({
    startTraditionalBalance: Number(currentBalance ?? 0),
    startRothBalance: 0,
    annualSalary,
    annualSalaryGrowthRate,
    employeeContributionPercent: monthlyContributionPercent,
    annualEmployeeDeferralLimit,
    annualCatchUpLimit,
    catchUpAge,
    includeEmployerMatch,
    includeAutomatic1Percent,
    annualReturn: weightedReturn,
    years,
    currentAge,
    currentTaxRate,
    retirementTaxRate,
    inflationRate,
    employeeContributionType: 'roth',
  });

  const salary0 = clampNumber(annualSalary, { min: 0, max: 1e9, fallback: 0 });
  const desiredAnnualEmployee = (salary0 * clampNumber(monthlyContributionPercent, { min: 0, max: 100, fallback: 0 })) / 100;
  const age0 = clampNumber(currentAge, { min: 0, max: 200, fallback: 0 });
  const limit0 = clampNumber(annualEmployeeDeferralLimit, { min: 0, max: 1e9, fallback: 0 }) + (age0 >= catchUpAge ? clampNumber(annualCatchUpLimit, { min: 0, max: 1e9, fallback: 0 }) : 0);
  const effectiveAnnualEmployee = Math.min(desiredAnnualEmployee, limit0);

  return {
    traditional: {
      projectedBalance: traditional.projectedBalance,
      totalContributions: traditional.totals.totalContributions,
      totalGrowth: traditional.totals.totalGrowthNominal,
      yearlyData: traditional.yearlyData.map((d) => ({
        year: d.year,
        balance: d.balanceNominal,
        afterTaxValue: d.afterTaxValueNominal,
        balanceReal: d.balanceReal,
        afterTaxValueReal: d.afterTaxValueReal,
        contributions: d.totalEmployeeContributionsNominal + d.totalEmployerContributionsNominal,
        employeeContributions: d.totalEmployeeContributionsNominal,
        employerContributions: d.totalEmployerContributionsNominal,
        salary: d.salaryNominal,
        employeeLimit: d.employeeLimitNominal,
      })),
      afterTaxValue: traditional.afterTaxValue,
    },
    roth: {
      projectedBalance: roth.projectedBalance,
      totalContributions: roth.totals.totalContributions,
      totalGrowth: roth.totals.totalGrowthNominal,
      yearlyData: roth.yearlyData.map((d) => ({
        year: d.year,
        balance: d.balanceNominal,
        afterTaxValue: d.afterTaxValueNominal,
        balanceReal: d.balanceReal,
        afterTaxValueReal: d.afterTaxValueReal,
        contributions: d.totalEmployeeContributionsNominal + d.totalEmployerContributionsNominal,
        employeeContributions: d.totalEmployeeContributionsNominal,
        employerContributions: d.totalEmployerContributionsNominal,
        salary: d.salaryNominal,
        employeeLimit: d.employeeLimitNominal,
      })),
      afterTaxValue: roth.afterTaxValue,
    },
    weightedReturn,
    years,
    limits: {
      desiredAnnualEmployeeContribution: desiredAnnualEmployee,
      effectiveAnnualEmployeeContribution: effectiveAnnualEmployee,
      annualEmployeeDeferralLimit: limit0,
      isOverLimit: desiredAnnualEmployee > limit0,
    },
  };
}


