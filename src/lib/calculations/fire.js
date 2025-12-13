export const DEFAULT_SAFE_WITHDRAWAL_RATE = 0.04;

export function calculateFireGap({
  tspProjectedBalance = 0,
  pensionMonthly = 0,
  fire = {},
  safeWithdrawalRate = DEFAULT_SAFE_WITHDRAWAL_RATE,
}) {
  const tspMonthlyWithdrawal = Number(tspProjectedBalance ?? 0) * Number(safeWithdrawalRate ?? 0.04) / 12;

  const sideHustleIncome = Number(fire.sideHustleIncome ?? 0);
  const spouseIncome = Number(fire.spouseIncome ?? 0);
  const fireIncomeGoal = Number(fire.monthlyFireIncomeGoal ?? 0);

  const totalPassiveIncome =
    tspMonthlyWithdrawal +
    Number(pensionMonthly ?? 0) +
    sideHustleIncome +
    spouseIncome;

  const monthlyGap = totalPassiveIncome - fireIncomeGoal;
  const isFireReady = monthlyGap >= 0;

  let confidenceLevel = 'low';
  if (isFireReady) {
    const denom = fireIncomeGoal <= 0 ? 1 : fireIncomeGoal;
    const surplusPercentage = (monthlyGap / denom) * 100;
    if (surplusPercentage >= 25) confidenceLevel = 'high';
    else if (surplusPercentage >= 10) confidenceLevel = 'medium';
  }

  return {
    tspMonthlyWithdrawal,
    totalPassiveIncome,
    fireIncomeGoal,
    monthlyGap,
    isFireReady,
    confidenceLevel,
    inputs: {
      safeWithdrawalRate: Number(safeWithdrawalRate ?? 0.04),
      sideHustleIncome,
      spouseIncome,
    },
  };
}


