/**
 * The lifetime timeline: one row per age from today to the end of the plan.
 *
 * Every other number FireFed shows is a reading from this table. The bridge is
 * the rows between separation and the first guaranteed income; the FIRE date is
 * the earliest separation age for which no row runs dry; the Monte Carlo is this
 * table run a thousand times with different returns; the report is this table
 * with headings. Building each of those separately is how a planner ends up
 * with four calculators that disagree.
 *
 * Each row is nominal. `real` carries the same figures deflated to today's
 * dollars at the scenario's inflation assumption.
 *
 * Funding order when income falls short of outflows:
 *   cash → taxable brokerage → Roth contributions → seasoned Roth conversions →
 *   Traditional TSP → Roth earnings
 * Traditional withdrawals before the penalty-free age carry the 10% penalty
 * unless a 72(t) schedule is running. Roth earnings before qualification are
 * taxed and penalised. See tspAccess.js for the rules.
 */

import { resolveRetirementPlan } from './plan';
import { calculateFersTspEmployerPercent, calculateWeightedReturn } from '../calculations/tsp';
import { getCatchUpLimitForAge } from '../calculations/contributionLimits';
import { calculateFersColaRate, isFersColaPayableAtAge } from '../calculations/cola';
import { applySrsEarningsTest, getSrsEarningsTestExemptAmount } from '../calculations/srs';
import {
  applyTrustFundHaircut,
  birthYearFromAge,
  calculateSocialSecurityBenefit,
  fullRetirementAge,
} from '../calculations/socialSecurity';
import { projectHealthcareCostForYear } from '../calculations/healthcareCosts';
import {
  EARLY_WITHDRAWAL_PENALTY_RATE,
  PENALTY_FREE_AGE,
  calculateSeppAnnualPayment,
  isConversionSeasoned,
  isRothQualified,
  isTraditionalPenaltyFree,
  seppEndAge,
} from '../calculations/tspAccess';
import { calculateHouseholdTaxes, estimateFicaTax, roomInBracket } from '../taxes';
import { calculateFersResults, getFersContributionRate } from '../calculations/fers';
import { CURRENT_PARAMETER_YEAR } from '../calculations/annualParameters';

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const nonNeg = (v) => Math.max(0, num(v));

export const DEFAULT_END_AGE = 95;

/** Share of a taxable brokerage withdrawal treated as long-term gain. */
export const DEFAULT_TAXABLE_GAINS_FRACTION = 0.5;

export const PHASES = Object.freeze({ WORKING: 'working', BRIDGE: 'bridge', RETIRED: 'retired' });

/** The expected nominal return implied by the TSP allocation, as a decimal. */
export function resolveExpectedReturn(scenario) {
  const override = scenario?.summary?.assumptions?.expectedReturnPercent;
  if (override !== null && override !== undefined && override !== '') return num(override) / 100;
  const fr = scenario?.tsp?.fundReturns ?? {};
  const fundReturns = {
    G: num(fr.G, 2) / 100,
    F: num(fr.F, 3) / 100,
    C: num(fr.C, 7) / 100,
    S: num(fr.S, 8) / 100,
    I: num(fr.I, 6) / 100,
  };
  return calculateWeightedReturn({ allocation: scenario?.tsp?.allocation, fundReturns });
}

/** Employee TSP deferral for a year, respecting the elective and catch-up limits. */
function employeeDeferral({ salary, percent, age, tsp }) {
  const raw = salary * (nonNeg(percent) / 100);
  const limit = nonNeg(tsp.annualEmployeeDeferralLimit) || Infinity;
  const catchUp = getCatchUpLimitForAge({
    age,
    catchUpAge: num(tsp.catchUpAge, 50),
    catchUpLimit: nonNeg(tsp.annualCatchUpLimit),
  });
  return Math.min(raw, limit + catchUp);
}

function spousePensionForAge({ spouse, spouseAge, inflation, yearsFromNow }) {
  if (!spouse?.enabled) return 0;
  if (spouse.isFederal && num(spouse.fers?.yearsOfService) > 0) {
    const f = spouse.fers;
    const start = f.annuityStartAge ?? f.separationAge;
    if (spouseAge < num(start)) return 0;
    const years = num(f.yearsOfService) + num(f.monthsOfService) / 12 + Math.max(0, num(f.separationAge) - num(spouse.currentAge));
    const res = calculateFersResults({
      yearsOfService: years,
      high3Salary: num(f.high3Salary),
      currentAge: spouse.currentAge,
      retirementAge: start,
      includeFutureService: false,
      mra: f.mra,
      unusedSickLeaveHours: num(f.unusedSickLeaveHours),
      cpiIncrease: inflation,
    });
    const yearsPaying = spouseAge - num(start);
    const colaYears = Math.max(0, Math.min(yearsPaying, spouseAge - 62));
    return res.stayFed.annualPension * Math.pow(1 + calculateFersColaRate(inflation), colaYears);
  }
  if (spouseAge < num(spouse.pensionStartAge, Infinity)) return 0;
  return nonNeg(spouse.pensionAnnual) * Math.pow(1 + inflation, yearsFromNow);
}

/**
 * Builds the timeline.
 *
 * `options.returnsByYear` lets a Monte Carlo or stress test supply the return
 * for each year index; `options.overrides` lets a stress test bend one
 * assumption without editing the scenario.
 */
export function buildTimeline(scenario, options = {}) {
  const asOfYear = num(options.asOfYear, CURRENT_PARAMETER_YEAR);
  const overrides = options.overrides ?? {};
  const plan = options.plan ?? resolveRetirementPlan(scenario, { asOfYear });

  const profile = scenario.profile;
  const tsp = scenario.tsp ?? {};
  const fire = scenario.fire ?? {};
  const summary = scenario.summary ?? {};
  const assumptions = summary.assumptions ?? {};
  const taxes = scenario.taxes ?? {};
  const healthcare = scenario.healthcare ?? {};
  const spouse = scenario.household?.spouse ?? null;
  const strategies = { ...(scenario.strategies ?? {}), ...(options.strategies ?? {}) };

  const currentAge = num(profile.currentAge);
  const separationAge = plan.separationAge;
  const endAge = Math.max(separationAge + 1, num(options.endAge ?? assumptions.endAge, DEFAULT_END_AGE));
  const inflation = num(overrides.inflationPercent ?? tsp.inflationRate, 2.5) / 100;
  const spendingInflation =
    assumptions.spendingInflationPercent === null || assumptions.spendingInflationPercent === undefined
      ? inflation
      : num(assumptions.spendingInflationPercent) / 100;
  const salaryGrowth = num(tsp.annualSalaryGrowthRate, 3) / 100;
  const expectedReturn = num(overrides.expectedReturn, resolveExpectedReturn(scenario));
  const cashReturn = num(tsp.fundReturns?.G, 2) / 100;
  const returnsByYear = Array.isArray(options.returnsByYear) ? options.returnsByYear : null;

  const filingStatus = taxes.filingStatus ?? 'single';
  const state = taxes.includeStateTax === false ? null : taxes.state ?? null;
  const spendingMultiplier = num(overrides.spendingMultiplier, 1);
  const healthcareOverride = overrides.healthcarePremiumGrowthPercent;
  const healthcareConfig =
    healthcareOverride === undefined ? healthcare : { ...healthcare, premiumGrowthPercent: healthcareOverride };
  const trustFundHaircut = overrides.trustFundHaircut !== undefined ? overrides.trustFundHaircut : plan.socialSecurity.trustFundHaircut;

  // Balances
  let traditional = nonNeg(tsp.currentBalance) - nonNeg(tsp.rothBalance);
  if (traditional < 0) traditional = 0;
  let roth = nonNeg(tsp.rothBalance);
  let rothBasis = Math.min(roth, nonNeg(tsp.rothContributionBasis));
  let taxable = nonNeg(fire.taxableBrokerageBalance);
  let taxableBasis = taxable * (1 - DEFAULT_TAXABLE_GAINS_FRACTION);
  let cash = nonNeg(fire.cashBalance);
  const conversions = []; // { age, amount, remaining }
  let firstRothContributionAge = roth > 0 ? Math.min(currentAge, 40) : null;

  const fersRate = getFersContributionRate(profile.hireCohort);
  const salary0 = nonNeg(tsp.annualSalary);
  const salaryPath = plan.high3.salaryPath;

  // Annuity
  const annuityStartAge = plan.annuityStartAge;
  const annuityAtStart = plan.annuity.annualAtStart;
  const colaRate = calculateFersColaRate(inflation);

  // Social Security
  const ss = plan.socialSecurity;
  const ssBenefit =
    ss.piaMonthlyAtFra > 0
      ? calculateSocialSecurityBenefit({ piaMonthlyAtFra: ss.piaMonthlyAtFra, claimAge: ss.claimAge, birthYear: ss.birthYear })
      : null;
  const ssFra = ss.fra?.decimal ?? 67;

  const spouseBirthYear = spouse?.enabled ? birthYearFromAge({ currentAge: num(spouse.currentAge), asOfYear }) : null;
  const spouseSs =
    spouse?.enabled && nonNeg(spouse.socialSecurity?.piaMonthlyAtFra) > 0
      ? calculateSocialSecurityBenefit({
          piaMonthlyAtFra: nonNeg(spouse.socialSecurity.piaMonthlyAtFra),
          claimAge: num(spouse.socialSecurity.claimAge, 67),
          birthYear: spouseBirthYear,
        })
      : null;
  const spouseFra = spouse?.enabled ? fullRetirementAge({ birthYear: spouseBirthYear }).decimal : null;

  // 72(t)
  const seppEnabled = Boolean(strategies.sepp?.enabled);
  let seppAnnual = 0;
  let seppStopAge = null;

  const rothConversionEnabled = Boolean(strategies.rothConversion?.enabled);
  const rothTargetRate = num(strategies.rothConversion?.targetBracketRate, 0.12);

  const rows = [];
  const magiByAge = {};
  let firstShortfallAge = null;
  let cumulativePenalties = 0;
  let cumulativeTaxes = 0;
  let cumulativeSalary = 0;
  let cumulativeShortfall = 0;

  for (let age = currentAge; age <= endAge; age++) {
    const i = age - currentAge;
    const year = asOfYear + i;
    const isWorking = age < separationAge;
    const deflator = Math.pow(1 + inflation, i);
    const spouseAge = spouse?.enabled ? num(spouse.currentAge) + i : null;

    // ---------- Income ----------
    let salary = 0;
    if (isWorking) {
      const fromPath = salaryPath?.find((r) => r.age === age)?.salary;
      salary = fromPath !== undefined ? fromPath : salary0 * Math.pow(1 + salaryGrowth, i);
    }
    cumulativeSalary += salary;

    const fersContribution = salary * fersRate;
    const employeeContribution = isWorking
      ? employeeDeferral({ salary, percent: tsp.monthlyContributionPercent, age, tsp })
      : 0;
    const employerPercent = isWorking
      ? (tsp.includeAutomatic1Percent === false ? 0 : 1) +
        (tsp.includeEmployerMatch === false ? 0 : calculateFersTspEmployerPercent(tsp.monthlyContributionPercent) - 1)
      : 0;
    const employerContribution = salary * (employerPercent / 100);
    const employeeIsRoth = tsp.contributionType === 'roth';
    if (employeeIsRoth && employeeContribution > 0 && firstRothContributionAge === null) firstRothContributionAge = age;

    let pension = 0;
    if (annuityStartAge != null && age >= annuityStartAge && annuityAtStart > 0) {
      const colaStart = Math.max(annuityStartAge, plan.annuity.colaStartAge);
      const colaYears = isFersColaPayableAtAge({ age, isSpecialProvision: plan.isSpecialProvision })
        ? Math.max(0, age - colaStart)
        : 0;
      pension = annuityAtStart * Math.pow(1 + colaRate, colaYears);
    }

    const sideHustle =
      !isWorking && (fire.sideHustleEndAge == null || age < num(fire.sideHustleEndAge))
        ? nonNeg(fire.sideHustleIncome) * 12 * deflator
        : 0;

    let srs = 0;
    if (plan.srs.isEligible && age >= plan.srs.startAge && age < plan.srs.endAge) {
      const exempt = getSrsEarningsTestExemptAmount(CURRENT_PARAMETER_YEAR) * deflator;
      // Special provision retirees are exempt from the earnings test until MRA.
      const exemptFromTest = plan.isSpecialProvision && age < plan.mra;
      srs = exemptFromTest
        ? plan.srs.annual
        : applySrsEarningsTest({ srsAnnual: plan.srs.annual, annualEarnedIncome: sideHustle, exemptAmount: exempt }).srsAnnualAfterTest;
    }

    let socialSecurity = 0;
    if (ssBenefit && age >= ss.claimAge) {
      const monthly = applyTrustFundHaircut({ monthly: ssBenefit.monthlyAtClaim * deflator, year, trustFundHaircut });
      socialSecurity = monthly * 12;
    }

    let spouseIncome = 0;
    let spouseSocialSecurity = 0;
    let spousePension = 0;
    if (spouse?.enabled) {
      const incomeEnds = spouse.incomeEndAge == null ? Infinity : num(spouse.incomeEndAge);
      if (spouseAge < incomeEnds) spouseIncome = nonNeg(spouse.annualIncome) * Math.pow(1 + salaryGrowth, i);
      if (spouseSs && spouseAge >= num(spouse.socialSecurity.claimAge, 67)) {
        spouseSocialSecurity =
          applyTrustFundHaircut({ monthly: spouseSs.monthlyAtClaim * deflator, year, trustFundHaircut }) * 12;
      }
      spousePension = spousePensionForAge({ spouse, spouseAge, inflation, yearsFromNow: i });
    }

    const lumpSums = age === separationAge ? nonNeg(plan.annualLeave.grossPayment) + nonNeg(plan.refund?.refundAmount) : 0;

    // ---------- Outflows ----------
    const spendingBase = isWorking ? nonNeg(summary.monthlyExpenses) : nonNeg(fire.monthlyFireIncomeGoal);
    const spending = spendingBase * 12 * Math.pow(1 + spendingInflation, i) * spendingMultiplier;

    const fehbOutcome = isWorking ? 'continues' : plan.fehb.outcome;
    const health = projectHealthcareCostForYear({
      age,
      yearsFromNow: i,
      healthcare: healthcareConfig,
      fehbOutcome,
      isAnnuityPaying: annuityStartAge != null && age >= annuityStartAge,
      isEmployed: isWorking,
      magiTwoYearsPrior: magiByAge[age - 2] ?? 0,
      filingStatus,
      includeIrmaa: Boolean(healthcare.includeIrmaa),
    });
    const healthcareCost = health.total;

    const taxableSavings = isWorking ? nonNeg(fire.annualTaxableSavings) : 0;

    // ---------- 72(t) schedule ----------
    if (seppEnabled && !isWorking && seppAnnual === 0 && seppStopAge === null && age < PENALTY_FREE_AGE) {
      const startAge = Math.max(separationAge, num(strategies.sepp?.startAge, separationAge));
      if (age >= startAge && traditional > 0) {
        seppAnnual = calculateSeppAnnualPayment({ balance: traditional, startAge: age, interestRate: num(strategies.sepp?.interestRate, 0.05) });
        seppStopAge = seppEndAge({ startAge: age });
      }
    }
    const seppActive = seppAnnual > 0 && age < seppStopAge;
    const seppDraw = seppActive ? Math.min(seppAnnual, traditional) : 0;

    // ---------- Fund the gap ----------
    const guaranteedIncome = pension + srs + socialSecurity + spouseIncome + spouseSocialSecurity + spousePension + sideHustle;
    const wages = salary + spouseIncome;

    const w = { cash: 0, taxable: 0, taxableGains: 0, rothBasis: 0, conversions: 0, traditional: seppDraw, rothEarnings: 0 };
    let penalties = 0;
    let conversionThisYear = 0;
    let taxResult = null;
    let fica = 0;
    let shortfall = 0;

    // Fixed-point iteration: withdrawals change taxes, taxes change the gap.
    for (let iter = 0; iter < 4; iter++) {
      const nonQualifiedRoth = isRothQualified({ age, firstRothContributionAge }) ? 0 : w.rothEarnings;
      fica = estimateFicaTax({ wages: salary }).totalTax + (spouseIncome > 0 ? estimateFicaTax({ wages: spouseIncome }).totalTax : 0);
      taxResult = calculateHouseholdTaxes({
        year: CURRENT_PARAMETER_YEAR,
        filingStatus,
        ages: spouse?.enabled ? [age, spouseAge] : [age],
        income: {
          wages: Math.max(0, wages - (employeeIsRoth ? 0 : employeeContribution) - fersContribution),
          federalPension: pension + spousePension,
          srs,
          traditionalWithdrawals: w.traditional + conversionThisYear,
          rothWithdrawals: w.rothBasis + w.conversions + (w.rothEarnings - nonQualifiedRoth),
          longTermCapitalGains: w.taxableGains,
          socialSecurity: socialSecurity + spouseSocialSecurity,
          otherTaxable: sideHustle + nonQualifiedRoth + (age === separationAge ? nonNeg(plan.annualLeave.grossPayment) + nonNeg(plan.refund?.refundAmount) : 0),
        },
        state,
      });

      const incomeTax = taxResult.totalTax + fica + penalties;
      const outflows = spending + healthcareCost + incomeTax + (isWorking ? fersContribution + employeeContribution + taxableSavings : 0);
      const inflows = wages + guaranteedIncome + lumpSums + seppDraw;
      let need = outflows - inflows;

      // Reset discretionary withdrawals and re-fund.
      w.cash = 0; w.taxable = 0; w.taxableGains = 0; w.rothBasis = 0; w.conversions = 0; w.rothEarnings = 0;
      w.traditional = seppDraw;
      penalties = 0;
      shortfall = 0;

      if (need > 0) {
        const takeCash = Math.min(need, cash);
        w.cash = takeCash; need -= takeCash;

        if (need > 0 && taxable > 0) {
          const take = Math.min(need, taxable);
          w.taxable = take;
          w.taxableGains = take * (taxable > 0 ? Math.max(0, 1 - taxableBasis / taxable) : 0);
          need -= take;
        }
        if (need > 0 && rothBasis > 0) {
          const take = Math.min(need, rothBasis);
          w.rothBasis = take; need -= take;
        }
        if (need > 0) {
          const seasoned = conversions.filter((c) => isConversionSeasoned({ age, conversionAge: c.age })).reduce((s, c) => s + c.remaining, 0);
          const take = Math.min(need, seasoned);
          w.conversions = take; need -= take;
        }
        if (need > 0 && traditional - seppDraw > 0) {
          const take = Math.min(need, traditional - seppDraw);
          w.traditional += take; need -= take;
          if (!isTraditionalPenaltyFree({ age, separationAge, isSpecialProvision: plan.isSpecialProvision, seppActive })) {
            penalties += take * EARLY_WITHDRAWAL_PENALTY_RATE;
          }
        }
        if (need > 0) {
          const rothEarningsAvailable = Math.max(0, roth - rothBasis - conversions.reduce((s, c) => s + c.remaining, 0));
          const take = Math.min(need, rothEarningsAvailable);
          w.rothEarnings = take; need -= take;
          if (!isRothQualified({ age, firstRothContributionAge })) penalties += take * EARLY_WITHDRAWAL_PENALTY_RATE;
        }
        shortfall = Math.max(0, need);
      }

      // Roth conversion ladder: fill the target bracket in low-income years.
      conversionThisYear = 0;
      if (rothConversionEnabled && !isWorking && traditional - w.traditional > 0 && age < 73) {
        const taxable0 = taxResult.federal?.taxableIncome ?? 0;
        let room = 0;
        try { room = roomInBracket({ filingStatus, taxableIncome: taxable0, targetRate: rothTargetRate }); } catch { room = 0; }
        if (Number.isFinite(room) && room > 0) conversionThisYear = Math.min(room, traditional - w.traditional);
      }
    }

    // Excess when income exceeds outflows in retirement is kept as cash.
    const totalTax = (taxResult?.totalTax ?? 0) + fica + penalties;
    const totalOutflow = spending + healthcareCost + totalTax + (isWorking ? fersContribution + employeeContribution + taxableSavings : 0);
    const totalInflow = wages + guaranteedIncome + lumpSums;
    const totalWithdrawals = w.cash + w.taxable + w.rothBasis + w.conversions + w.traditional + w.rothEarnings;
    const surplus = totalInflow + totalWithdrawals - totalOutflow - shortfall;

    // ---------- Apply to balances ----------
    cash -= w.cash;
    if (taxable > 0) taxableBasis -= w.taxable * (taxableBasis / taxable);
    taxable -= w.taxable;
    rothBasis -= w.rothBasis;
    roth -= w.rothBasis + w.conversions + w.rothEarnings;
    let toTake = w.conversions;
    for (const c of conversions) {
      if (toTake <= 0) break;
      const t = Math.min(c.remaining, toTake);
      c.remaining -= t; toTake -= t;
    }
    traditional -= w.traditional;

    if (conversionThisYear > 0) {
      traditional -= conversionThisYear;
      roth += conversionThisYear;
      conversions.push({ age, amount: conversionThisYear, remaining: conversionThisYear });
      if (firstRothContributionAge === null) firstRothContributionAge = age;
    }

    if (isWorking) {
      if (employeeIsRoth) { roth += employeeContribution; rothBasis += employeeContribution; } else traditional += employeeContribution;
      traditional += employerContribution;
      taxable += taxableSavings; taxableBasis += taxableSavings;
    }
    if (age === separationAge) cash += lumpSums;
    if (surplus > 0) cash += surplus;

    const r = returnsByYear ? num(returnsByYear[i], expectedReturn) : expectedReturn;
    const growth = 1 + r;
    traditional = Math.max(0, traditional * growth);
    roth = Math.max(0, roth * growth);
    taxable = Math.max(0, taxable * growth);
    cash = Math.max(0, cash * (1 + cashReturn));

    const totalBalance = traditional + roth + taxable + cash;
    cumulativePenalties += penalties;
    cumulativeTaxes += totalTax;
    cumulativeShortfall += shortfall;
    if (shortfall > 0 && firstShortfallAge === null) firstShortfallAge = age;

    const magi = (taxResult?.federal?.agi ?? 0);
    magiByAge[age] = magi;

    const phase = isWorking ? PHASES.WORKING : annuityStartAge != null && age < annuityStartAge ? PHASES.BRIDGE : PHASES.RETIRED;

    rows.push({
      age,
      year,
      yearsFromNow: i,
      phase,
      spouseAge,
      salary,
      fersContribution,
      tspEmployeeContribution: employeeContribution,
      tspEmployerContribution: employerContribution,
      pension,
      srs,
      socialSecurity,
      spouseIncome,
      spouseSocialSecurity,
      spousePension,
      sideHustle,
      lumpSums,
      withdrawals: { ...w, total: totalWithdrawals, sepp: seppDraw },
      rothConversion: conversionThisYear,
      penalties,
      taxes: { federal: taxResult?.federalTax ?? 0, state: taxResult?.stateTax ?? 0, fica, penalties, total: totalTax, effectiveRate: taxResult?.effectiveRate ?? 0 },
      healthcare: { ...health },
      spending,
      totalIncome: totalInflow,
      guaranteedIncome,
      totalOutflow,
      shortfall,
      surplus: Math.max(0, surplus),
      returnRate: r,
      balances: { traditional, roth, rothBasis, taxable, cash, total: totalBalance },
      real: {
        deflator,
        spending: spending / deflator,
        totalIncome: totalInflow / deflator,
        pension: pension / deflator,
        socialSecurity: socialSecurity / deflator,
        totalBalance: totalBalance / deflator,
      },
    });
  }

  return {
    plan,
    rows,
    inputs: { asOfYear, endAge, inflation, expectedReturn, salaryGrowth, filingStatus, seppEnabled, rothConversionEnabled },
    summary: summarizeTimeline({ rows, plan, currentAge, separationAge, annuityStartAge, ssClaimAge: ss.claimAge, ssFra, spouseFra, cumulativePenalties, cumulativeTaxes, cumulativeSalary, cumulativeShortfall, firstShortfallAge, spouse }),
  };
}

function summarizeTimeline({ rows, plan, currentAge, separationAge, annuityStartAge, ssClaimAge, ssFra, spouseFra, cumulativePenalties, cumulativeTaxes, cumulativeSalary, cumulativeShortfall, firstShortfallAge, spouse }) {
  const atSeparation = rows.find((r) => r.age === separationAge) ?? rows[0];
  const before = rows.find((r) => r.age === separationAge - 1);
  const balanceAtSeparation = before ? before.balances.total : atSeparation?.balances.total ?? 0;
  const last = rows[rows.length - 1];

  let minRow = rows[0];
  for (const r of rows) if (r.balances.total < minRow.balances.total) minRow = r;

  // The bridge: from separation until the first year guaranteed income covers spending and healthcare.
  const bridgeRows = rows.filter((r) => r.age >= separationAge && r.guaranteedIncome < r.spending + r.healthcare.total);
  const bridgeEndAge = bridgeRows.length > 0 ? bridgeRows[bridgeRows.length - 1].age + 1 : separationAge;
  const bridgeWithdrawals = bridgeRows.reduce((s, r) => s + r.withdrawals.total, 0);
  const bridgeShortfall = bridgeRows.reduce((s, r) => s + r.shortfall, 0);
  const bridgePenalties = bridgeRows.reduce((s, r) => s + r.penalties, 0);
  const bridgeRequired = bridgeWithdrawals + bridgeShortfall;
  const fundedPercent = bridgeRequired > 0 ? Math.min(100, (bridgeWithdrawals / bridgeRequired) * 100) : 100;

  const incomeStarts = [];
  const firstAge = (key) => rows.find((r) => r[key] > 0)?.age ?? null;
  if (plan.annuity.annualAtStart > 0) incomeStarts.push({ source: 'FERS annuity', age: annuityStartAge });
  if (plan.srs.isEligible) incomeStarts.push({ source: 'Special Retirement Supplement', age: plan.srs.startAge, endAge: 62 });
  if (firstAge('socialSecurity')) incomeStarts.push({ source: 'Social Security', age: firstAge('socialSecurity') });
  if (firstAge('spouseSocialSecurity')) incomeStarts.push({ source: 'Spouse Social Security', age: firstAge('spouseSocialSecurity') });
  if (firstAge('spousePension')) incomeStarts.push({ source: 'Spouse pension', age: firstAge('spousePension') });

  const milestones = buildMilestones({ plan, currentAge, separationAge, annuityStartAge, ssClaimAge, ssFra, spouseFra, spouse });

  return {
    isSustainable: firstShortfallAge === null && last.balances.total >= 0,
    firstShortfallAge,
    cumulativeShortfall,
    balanceAtSeparation,
    balanceAtEnd: last.balances.total,
    balanceAtEndReal: last.real.totalBalance,
    minBalance: minRow.balances.total,
    minBalanceAge: minRow.age,
    cumulativePenalties,
    cumulativeTaxes,
    cumulativeSalary,
    bridge: {
      startAge: separationAge,
      endAge: bridgeEndAge,
      years: Math.max(0, bridgeEndAge - separationAge),
      withdrawalsNeeded: bridgeRequired,
      withdrawalsFunded: bridgeWithdrawals,
      shortfall: bridgeShortfall,
      penalties: bridgePenalties,
      assetsAtSeparation: balanceAtSeparation,
      fundedPercent,
      incomeStarts,
    },
    milestones,
  };
}

/** What changes at each age, for the timeline's markers. */
export function buildMilestones({ plan, currentAge, separationAge, annuityStartAge, ssClaimAge, ssFra, spouseFra, spouse }) {
  const list = [
    { age: separationAge, key: 'separation', label: 'Separation', detail: `Federal employment ends via ${plan.pathLabel.toLowerCase()}.` },
    {
      age: plan.tspAccess.traditionalPenaltyFreeAge,
      key: 'tsp_access',
      label: 'TSP penalty-free',
      detail: plan.tspAccess.usesSeparationYearRule
        ? 'Traditional TSP withdrawals are penalty-free from separation.'
        : 'Traditional TSP withdrawals are penalty-free from 59½.',
    },
    { age: plan.mra, key: 'mra', label: 'MRA', detail: 'Minimum retirement age: MRA+30 unreduced, MRA+10 reduced.' },
    { age: 62, key: 'age_62', label: '62', detail: 'Supplement ends; FERS COLA begins; earliest Social Security; 1.1% multiplier with 20 years.' },
    { age: 65, key: 'medicare', label: '65', detail: 'Medicare eligibility.' },
    { age: ssFra, key: 'fra', label: 'FRA', detail: 'Social Security full retirement age.' },
    { age: 70, key: 'age_70', label: '70', detail: 'Delayed Social Security credits stop accruing.' },
  ];
  if (annuityStartAge != null && annuityStartAge !== separationAge) {
    list.push({ age: annuityStartAge, key: 'annuity_start', label: 'Annuity starts', detail: `FERS annuity begins at ${annuityStartAge}.` });
  }
  if (ssClaimAge) list.push({ age: ssClaimAge, key: 'ss_claim', label: 'SS claim', detail: `Social Security claimed at ${ssClaimAge}.` });
  if (plan.srs.isEligible) list.push({ age: plan.srs.startAge, key: 'srs_start', label: 'SRS starts', detail: 'Special Retirement Supplement begins.' });
  if (spouse?.enabled && spouseFra) {
    list.push({ age: currentAge + (spouseFra - num(spouse.currentAge)), key: 'spouse_fra', label: 'Spouse FRA', detail: 'Spouse full retirement age.' });
  }
  return list
    .filter((m) => Number.isFinite(m.age) && m.age >= currentAge)
    .sort((a, b) => a.age - b.age);
}
