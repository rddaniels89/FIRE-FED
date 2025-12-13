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

export function calculateTspProjection({
  startBalance,
  monthlyContribution,
  annualReturn,
  years,
  type, // 'traditional' | 'roth'
  currentAge,
  retirementTaxRate,
}) {
  let balance = Number(startBalance ?? 0);
  const yearlyData = [];
  let totalContributions = 0;

  const monthlyReturn = Number(annualReturn ?? 0) / 12;

  for (let year = 0; year <= years; year++) {
    const ageAtYear = Number(currentAge ?? 0) + year;

    if (year > 0) {
      for (let month = 0; month < 12; month++) {
        const contrib = Number(monthlyContribution ?? 0);
        balance += contrib;
        totalContributions += contrib;
        balance *= 1 + monthlyReturn;
      }
    }

    let afterTaxValue = balance;
    if (type === 'traditional') {
      afterTaxValue = balance * (1 - Number(retirementTaxRate ?? 0) / 100);
    }

    yearlyData.push({
      year: ageAtYear,
      balance,
      afterTaxValue,
      contributions: totalContributions,
    });
  }

  return {
    projectedBalance: balance,
    totalContributions,
    totalGrowth: balance - Number(startBalance ?? 0) - totalContributions,
    yearlyData,
    afterTaxValue: yearlyData[yearlyData.length - 1]?.afterTaxValue ?? 0,
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
}) {
  const years = Number(retirementAge ?? 0) - Number(currentAge ?? 0);
  const monthlyContribution =
    (Number(annualSalary ?? 0) * Number(monthlyContributionPercent ?? 0)) / 100 / 12;

  const weightedReturn = calculateWeightedReturn({ allocation, fundReturns });

  const traditional = calculateTspProjection({
    startBalance: Number(currentBalance ?? 0),
    monthlyContribution,
    annualReturn: weightedReturn,
    years,
    type: 'traditional',
    currentAge,
    retirementTaxRate,
  });

  const roth = calculateTspProjection({
    startBalance: Number(currentBalance ?? 0),
    monthlyContribution: monthlyContribution * (1 - Number(currentTaxRate ?? 0) / 100),
    annualReturn: weightedReturn,
    years,
    type: 'roth',
    currentAge,
    retirementTaxRate,
  });

  return { traditional, roth, weightedReturn, monthlyContribution, years };
}


