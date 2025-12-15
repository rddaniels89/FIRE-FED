export const DEFAULT_SAFE_WITHDRAWAL_RATE = 0.04;
export const SAFE_WITHDRAWAL_RATE_PRESETS = Object.freeze([0.03, 0.035, 0.04]);

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function calculateBridgeStrategy({
  desiredFireAge,
  pensionStartAge,
  fireIncomeGoalMonthly,
  monthlyIncomeBeforePension,
}) {
  const desired = toNumber(desiredFireAge, 0);
  const pensionStart = toNumber(pensionStartAge, 0);

  const yearsToBridge = desired > 0 && pensionStart > 0 ? Math.max(0, pensionStart - desired) : 0;
  const goal = Math.max(0, toNumber(fireIncomeGoalMonthly, 0));
  const pre = Math.max(0, toNumber(monthlyIncomeBeforePension, 0));
  const monthlyShortfall = Math.max(0, goal - pre);

  // Simple “cash needed” bridge estimate: assumes no growth/interest and level dollars.
  const requiredBridgeAssets = monthlyShortfall * 12 * yearsToBridge;

  return {
    yearsToBridge,
    monthlyShortfall,
    requiredBridgeAssets,
  };
}

export function calculatePensionAssetEquivalent({
  pensionMonthly,
  safeWithdrawalRate = DEFAULT_SAFE_WITHDRAWAL_RATE,
}) {
  const swr = clamp(toNumber(safeWithdrawalRate, DEFAULT_SAFE_WITHDRAWAL_RATE), 0.01, 0.1);
  const annualPension = Math.max(0, toNumber(pensionMonthly, 0)) * 12;
  return annualPension / swr;
}

export function calculateFireGap({
  tspProjectedBalance = 0,
  pensionMonthly = 0,
  fire = {},
  safeWithdrawalRate = DEFAULT_SAFE_WITHDRAWAL_RATE,
  desiredFireAge = undefined,
  pensionStartAge = undefined,
}) {
  const swr = clamp(toNumber(safeWithdrawalRate, DEFAULT_SAFE_WITHDRAWAL_RATE), 0.01, 0.1);
  const tspMonthlyWithdrawal = toNumber(tspProjectedBalance, 0) * swr / 12;

  const sideHustleIncome = toNumber(fire.sideHustleIncome, 0);
  const spouseIncome = toNumber(fire.spouseIncome, 0);
  const fireIncomeGoal = toNumber(fire.monthlyFireIncomeGoal, 0);

  const desired = toNumber(desiredFireAge, 0);
  const pensionStart = toNumber(pensionStartAge, 0);
  const pensionAvailableAtDesiredAge =
    desired > 0 && pensionStart > 0 ? desired >= pensionStart : true;

  const pensionAtDesiredAge = pensionAvailableAtDesiredAge ? toNumber(pensionMonthly, 0) : 0;
  const pensionAfterStart = toNumber(pensionMonthly, 0);

  const monthlyIncomeBeforePension =
    tspMonthlyWithdrawal + sideHustleIncome + spouseIncome;

  const totalPassiveIncomeAtDesiredAge =
    monthlyIncomeBeforePension + pensionAtDesiredAge;

  const totalPassiveIncomeAfterPension =
    monthlyIncomeBeforePension + pensionAfterStart;

  const monthlyGapAtDesiredAge = totalPassiveIncomeAtDesiredAge - fireIncomeGoal;
  const monthlyGapAfterPension = totalPassiveIncomeAfterPension - fireIncomeGoal;

  const isFireReadyAtDesiredAge = monthlyGapAtDesiredAge >= 0;
  const isFireReadyAfterPension = monthlyGapAfterPension >= 0;

  let confidenceLevel = 'low';
  if (isFireReadyAtDesiredAge) {
    const denom = fireIncomeGoal <= 0 ? 1 : fireIncomeGoal;
    const surplusPercentage = (monthlyGapAtDesiredAge / denom) * 100;
    if (surplusPercentage >= 25) confidenceLevel = 'high';
    else if (surplusPercentage >= 10) confidenceLevel = 'medium';
  }

  const bridge = calculateBridgeStrategy({
    desiredFireAge: desired,
    pensionStartAge: pensionStart,
    fireIncomeGoalMonthly: fireIncomeGoal,
    monthlyIncomeBeforePension,
  });

  return {
    tspMonthlyWithdrawal,
    totalPassiveIncome: totalPassiveIncomeAtDesiredAge,
    totalPassiveIncomeAtDesiredAge,
    totalPassiveIncomeAfterPension,
    fireIncomeGoal,
    monthlyGap: monthlyGapAtDesiredAge,
    monthlyGapAtDesiredAge,
    monthlyGapAfterPension,
    isFireReady: isFireReadyAtDesiredAge,
    isFireReadyAtDesiredAge,
    isFireReadyAfterPension,
    confidenceLevel,
    pension: {
      desiredFireAge: desired || null,
      pensionStartAge: pensionStart || null,
      pensionMonthlyAtDesiredAge: pensionAtDesiredAge,
      pensionMonthlyAfterStart: pensionAfterStart,
      pensionIncludedAtDesiredAge: pensionAvailableAtDesiredAge,
      pensionAssetEquivalent: calculatePensionAssetEquivalent({ pensionMonthly, safeWithdrawalRate: swr }),
    },
    bridge,
    inputs: {
      safeWithdrawalRate: swr,
      sideHustleIncome,
      spouseIncome,
      desiredFireAge: desired || null,
      pensionStartAge: pensionStart || null,
    },
  };
}


