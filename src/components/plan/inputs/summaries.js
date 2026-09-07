/**
 * One-line summaries shown on each collapsed section of /plan/inputs, so the
 * page still reads as a profile with everything closed.
 */

import { SPECIAL_PROVISION_LABELS } from '../../../lib/calculations/specialProvisions';
import { PATH_LABELS } from '../../../lib/calculations/retirementPaths';
import { OTHER_COVERAGE_TYPES } from '../../../lib/calculations/healthcareCosts';
import { estimatePiaFromSalary } from '../../../lib/calculations/socialSecurity';
import { RETIREMENT_PATH_AUTO } from '../../../lib/scenarios/schema';
import { fractionToPercent, money, pct } from './format';
import {
  ENROLLMENT_OPTIONS,
  FILING_OPTIONS,
  OTHER_COVERAGE_OPTIONS,
  SURVIVOR_SHORT,
  findStatePreset,
  labelFor,
} from './options';

export function youSummary(scenario) {
  const p = scenario.profile;
  const employee = p.employeeType === 'regular' ? 'Regular' : SPECIAL_PROVISION_LABELS[p.employeeType] ?? p.employeeType;
  const annuity = p.annuityStartAge == null ? 'annuity at separation' : `annuity at ${p.annuityStartAge}`;
  const path = p.retirementPath === RETIREMENT_PATH_AUTO ? 'Auto path' : PATH_LABELS[p.retirementPath] ?? p.retirementPath;
  const age = p.currentAgeMonths ? `${p.currentAge}y ${p.currentAgeMonths}m` : `${p.currentAge}`;
  return `Age ${age} · leaves at ${p.separationAge} · ${annuity} · Social Security at ${p.socialSecurityClaimAge} · ${path} · ${employee}`;
}

export function serviceSummary(scenario) {
  const f = scenario.fers;
  const parts = [
    `${f.yearsOfService}y ${f.monthsOfService}m service`,
    `High-3 ${money(f.high3Salary)}`,
    `salary ${money(scenario.tsp.annualSalary)} (+${pct(scenario.tsp.annualSalaryGrowthRate)}/yr)`,
    SURVIVOR_SHORT[f.survivorElection] ?? f.survivorElection,
  ];
  if (f.takeRefundOfContributions) parts.push('refund instead of deferred annuity');
  return parts.join(' · ');
}

export function savingsSummary(scenario) {
  const t = scenario.tsp;
  const f = scenario.fire;
  return [
    `TSP ${money(t.currentBalance)} (Roth ${money(t.rothBalance)})`,
    `contributing ${pct(t.monthlyContributionPercent)} ${t.contributionType}`,
    `brokerage ${money(f.taxableBrokerageBalance)}`,
    `cash ${money(f.cashBalance)}`,
  ].join(' · ');
}

export function spendingSummary(scenario) {
  const f = scenario.fire;
  const side = Number(f.sideHustleIncome) > 0
    ? `side income ${money(f.sideHustleIncome)}/mo${f.sideHustleEndAge == null ? '' : ` until ${f.sideHustleEndAge}`}`
    : 'no side income';
  return `Spending ${money(scenario.summary.monthlyExpenses)}/mo now · goal ${money(f.monthlyFireIncomeGoal)}/mo in retirement · ${side}`;
}

export function socialSecuritySummary(scenario) {
  const ss = scenario.summary.socialSecurity;
  const haircut = ss.trustFundHaircut ? ` · ${pct(ss.trustFundHaircut.percent, 0)} cut from ${ss.trustFundHaircut.startYear}` : '';
  if (ss.mode === 'manual') return `${money(ss.monthlyBenefit)}/mo at full retirement age (SSA statement)${haircut}`;
  if (ss.mode === 'estimate') {
    const est = estimatePiaFromSalary({ annualSalary: scenario.tsp.annualSalary, replacementPercent: ss.percentOfSalary });
    return `Estimated ${money(est)}/mo at full retirement age (${pct(ss.percentOfSalary, 0)} of salary)${haircut}`;
  }
  return 'Not modeled';
}

export function taxesSummary(scenario) {
  const t = scenario.taxes;
  const filing = labelFor(FILING_OPTIONS, t.filingStatus);
  const preset = findStatePreset(t.state?.code);
  const state = preset.code === 'NONE'
    ? 'no state tax modeled'
    : `${preset.name} ${pct((t.state?.rate ?? 0) * 100)}${t.includeStateTax ? '' : ' (off)'}`;
  return `${filing} · ${state}`;
}

export function healthcareSummary(scenario) {
  const h = scenario.healthcare;
  const fehb = h.fehbEnrolled
    ? `FEHB ${labelFor(ENROLLMENT_OPTIONS, h.fehbEnrollmentType)}, ${h.fehbYearsEnrolled} yrs enrolled`
    : 'No FEHB';
  const medicare = h.enrollInPartB ? 'Part B at 65' : 'no Part B';
  const other = h.otherCoverage !== OTHER_COVERAGE_TYPES.NONE ? ` · ${labelFor(OTHER_COVERAGE_OPTIONS, h.otherCoverage)}` : '';
  return `${fehb} · ${medicare} · out-of-pocket ${money(h.outOfPocketAnnual)}/yr${other}${h.includeIrmaa ? ' · IRMAA' : ''}`;
}

export function householdSummary(scenario, allowed) {
  const s = scenario.household.spouse;
  if (!allowed) return 'Add a second person (Pro)';
  if (!s.enabled) return 'No second person modeled';
  const parts = [`${s.label || 'Person B'}, age ${s.currentAge}`];
  if (Number(s.annualIncome) > 0) parts.push(`${money(s.annualIncome)}/yr${s.incomeEndAge == null ? '' : ` until ${s.incomeEndAge}`}`);
  if (Number(s.socialSecurity?.piaMonthlyAtFra) > 0) parts.push(`SS ${money(s.socialSecurity.piaMonthlyAtFra)}/mo at ${s.socialSecurity.claimAge}`);
  if (Number(s.pensionAnnual) > 0) parts.push(`pension ${money(s.pensionAnnual)}/yr`);
  if (s.isFederal) parts.push(`federal, ${s.fers.yearsOfService}y service`);
  return parts.join(' · ');
}

export function strategiesSummary(scenario, allowed) {
  if (!allowed) return 'Bridge strategies (Pro)';
  const s = scenario.strategies;
  const parts = [];
  if (s.sepp?.enabled) parts.push(`72(t) at ${pct(fractionToPercent(s.sepp.interestRate), 2)}`);
  if (s.rothConversion?.enabled) parts.push(`Roth ladder to the ${pct(fractionToPercent(s.rothConversion.targetBracketRate), 0)} bracket`);
  return parts.length ? parts.join(' · ') : 'No bridge strategies enabled';
}

export function assumptionsSummary(scenario) {
  const a = scenario.summary.assumptions;
  const ret = a.expectedReturnPercent == null ? 'return from TSP allocation' : `${pct(a.expectedReturnPercent)} return`;
  return `Inflation ${pct(scenario.tsp.inflationRate)} · plan to age ${a.endAge} · ${ret} · ${pct(fractionToPercent(a.safeWithdrawalRate))} withdrawal rate`;
}
