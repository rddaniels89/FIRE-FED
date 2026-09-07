import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useScenario } from '../contexts/ScenarioContext';
import { resolveRetirementPlan } from '../lib/projection/plan';
import { buildTimeline, DEFAULT_END_AGE, DEFAULT_TAXABLE_GAINS_FRACTION } from '../lib/projection/timeline';
import { CURRENT_PARAMETER_YEAR, getAnnualParameters } from '../lib/calculations/annualParameters';
import { DEFAULT_MARKETPLACE_ANNUAL_PREMIUM } from '../lib/calculations/healthcareCosts';
import { DEFAULT_PIA_REPLACEMENT_PERCENT, DEFAULT_TRUST_FUND_HAIRCUT } from '../lib/calculations/socialSecurity';
import { FERS_HIRE_COHORT_LABELS } from '../lib/calculations/fers';
import { listRulesByCategory } from '../lib/rules/registry';

/**
 * The assumptions page (ROADMAP.md item 47): everything the plan rests on, in
 * three plain tables — what the user entered, what FireFed derived from it,
 * and what it assumed because nobody entered it — followed by every rule the
 * model applies with its source and verification date. Built to print.
 */

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const money = (v) =>
  v === null || v === undefined || v === ''
    ? '—'
    : `$${Math.round(num(v)).toLocaleString()}`;
const pct = (v, digits = 1) => (v === null || v === undefined || v === '' ? 'Default' : `${num(v).toFixed(digits)}%`);
const yesNo = (v) => (v ? 'Yes' : 'No');
const yearsFmt = (v) => `${num(v).toFixed(1)} years`;
const ageFmt = (v) => (v === null || v === undefined ? 'Path default' : `${num(v)}`);
const text = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

const PATH_LABELS = {
  auto: 'Automatic (best door open)',
  immediate_unreduced: 'Immediate, unreduced',
  mra10_immediate: 'MRA+10, starting now',
  mra10_postponed: 'MRA+10, postponed',
  deferred: 'Deferred',
  vera: 'Early out (VERA)',
};

const EMPLOYEE_TYPE_LABELS = {
  regular: 'Regular FERS',
  leo: 'Law enforcement officer',
  firefighter: 'Firefighter',
  atc: 'Air traffic controller',
  nuclear_materials_courier: 'Nuclear materials courier',
  cbpo: 'Customs and Border Protection officer',
};

const SURVIVOR_LABELS = { none: 'None', partial: 'Partial (25%, costs 5%)', full: 'Full (50%, costs 10%)' };
const SS_MODE_LABELS = { not_configured: 'Not configured', estimate: 'Estimated from salary', manual: 'From SSA statement' };
const ENROLLMENT_LABELS = { self: 'Self', selfPlusOne: 'Self plus one', family: 'Self and family' };

/** The "You entered" rows, grouped. Every stored field that is not a legacy mirror. */
function enteredRows(s) {
  const p = s.profile ?? {};
  const fers = s.fers ?? {};
  const tsp = s.tsp ?? {};
  const fire = s.fire ?? {};
  const summary = s.summary ?? {};
  const ss = summary.socialSecurity ?? {};
  const a = summary.assumptions ?? {};
  const taxes = s.taxes ?? {};
  const st = taxes.state ?? {};
  const h = s.healthcare ?? {};
  const spouse = s.household?.spouse ?? {};
  const career = s.career ?? {};
  const strat = s.strategies ?? {};

  const groups = [
    {
      title: 'Profile',
      rows: [
        ['Current age', ageFmt(p.currentAge)],
        ['Separation age', ageFmt(p.separationAge)],
        ['Annuity start age', ageFmt(p.annuityStartAge)],
        ['Social Security claiming age', ageFmt(p.socialSecurityClaimAge)],
        ['Retirement path', PATH_LABELS[p.retirementPath] ?? text(p.retirementPath)],
        ['Early-out (VERA) offered', yesNo(p.isVeraOffered)],
        ['Employee type', EMPLOYEE_TYPE_LABELS[p.employeeType] ?? text(p.employeeType)],
        ['FERS hire cohort', FERS_HIRE_COHORT_LABELS[p.hireCohort] ?? text(p.hireCohort)],
        ['Minimum retirement age', ageFmt(p.mra)],
      ],
    },
    {
      title: 'Service',
      rows: [
        ['Years of service today', `${num(fers.yearsOfService)} years ${num(fers.monthsOfService)} months`],
        ['High-3 salary', money(fers.high3Salary)],
        ['Unused sick leave', `${num(fers.unusedSickLeaveHours).toLocaleString()} hours`],
        ['Survivor election', SURVIVOR_LABELS[fers.survivorElection] ?? text(fers.survivorElection)],
        ['Annual leave at separation', `${num(fers.annualLeaveHoursAtSeparation).toLocaleString()} hours`],
        ['Take refund of FERS contributions', yesNo(fers.takeRefundOfContributions)],
        ['Military service', `${num(fers.militaryServiceYears)} years, deposit ${fers.militaryDepositPaid ? 'paid' : 'not paid'}`],
      ],
    },
    {
      title: 'Savings',
      rows: [
        ['TSP balance (total)', money(tsp.currentBalance)],
        ['TSP Roth balance', money(tsp.rothBalance)],
        ['Roth contribution basis', money(tsp.rothContributionBasis)],
        ['TSP contribution', `${num(tsp.monthlyContributionPercent)}% of pay, ${text(tsp.contributionType)}`],
        ['Salary', money(tsp.annualSalary)],
        ['Employer match included', yesNo(tsp.includeEmployerMatch)],
        ['Automatic 1% included', yesNo(tsp.includeAutomatic1Percent)],
        ['Elective deferral limit in use', money(tsp.annualEmployeeDeferralLimit)],
        ['Catch-up limit in use', `${money(tsp.annualCatchUpLimit)} from age ${num(tsp.catchUpAge, 50)}`],
        ['Prior-year wages (Roth catch-up test)', tsp.priorYearWages === undefined || tsp.priorYearWages === null || tsp.priorYearWages === '' ? 'Not given (salary used)' : money(tsp.priorYearWages)],
        ['Fund allocation', ['G', 'F', 'C', 'S', 'I'].map((k) => `${k} ${num(tsp.allocation?.[k])}%`).join(', ')],
        ['Expected fund returns', ['G', 'F', 'C', 'S', 'I'].map((k) => `${k} ${num(tsp.fundReturns?.[k])}%`).join(', ')],
        ['Tax rate now / in retirement', `${num(tsp.currentTaxRate)}% / ${num(tsp.retirementTaxRate)}%`],
        ['Taxable brokerage balance', money(fire.taxableBrokerageBalance)],
        ['Cash balance', money(fire.cashBalance)],
        ['Annual taxable savings', money(fire.annualTaxableSavings)],
      ],
    },
    {
      title: 'Spending',
      rows: [
        ['Monthly expenses while working', money(summary.monthlyExpenses)],
        ['Monthly income goal in retirement', money(fire.monthlyFireIncomeGoal)],
        ['Side income (monthly)', `${money(fire.sideHustleIncome)}${fire.sideHustleEndAge == null ? '' : `, until age ${num(fire.sideHustleEndAge)}`}`],
        ['Safe withdrawal rate (display only)', pct(num(a.safeWithdrawalRate, 0.04) * 100)],
      ],
    },
    {
      title: 'Social Security',
      rows: [
        ['Mode', SS_MODE_LABELS[ss.mode] ?? text(ss.mode)],
        ['Statement amount at full retirement age (monthly)', money(ss.monthlyBenefit)],
        ['Estimate as % of salary', pct(ss.percentOfSalary, 0)],
        ['Trust-fund haircut', ss.trustFundHaircut ? `${num(ss.trustFundHaircut.percent)}% from ${num(ss.trustFundHaircut.startYear)}` : 'Not applied'],
      ],
    },
    {
      title: 'Taxes',
      rows: [
        ['Filing status', text(taxes.filingStatus).replace(/_/g, ' ')],
        ['State tax included', yesNo(taxes.includeStateTax !== false)],
        ['State', text(st.code)],
        ['State effective rate', pct(num(st.rate) * 100)],
        ['State exempts FERS annuity', yesNo(st.exemptsFederalPension)],
        ['State exempts Social Security', yesNo(st.exemptsSocialSecurity)],
        ['State pension exclusion', money(st.pensionExclusion)],
      ],
    },
    {
      title: 'Healthcare',
      rows: [
        ['FEHB enrolled', yesNo(h.fehbEnrolled)],
        ['FEHB enrollment type', ENROLLMENT_LABELS[h.fehbEnrollmentType] ?? text(h.fehbEnrollmentType)],
        ['FEHB annual enrollee share', h.fehbAnnualEnrolleeShare == null ? 'Default for enrollment type' : money(h.fehbAnnualEnrolleeShare)],
        ['FEHB years enrolled', `${num(h.fehbYearsEnrolled)} years`],
        ['Enrolled since first opportunity', yesNo(h.enrolledSinceFirstOpportunity)],
        ['TRICARE years counted', `${num(h.tricareYears)} years`],
        ['Healthcare premium growth', pct(h.premiumGrowthPercent)],
        ['Keep FEHB with Medicare', yesNo(h.keepFehbWithMedicare)],
        ['Enroll in Medicare Part B', yesNo(h.enrollInPartB)],
        ['Include IRMAA', yesNo(h.includeIrmaa)],
        ['Marketplace premium (annual)', h.marketplaceAnnualPremium == null ? 'Default' : money(h.marketplaceAnnualPremium)],
        ['Other coverage', `${text(h.otherCoverage)}${num(h.otherCoverageAnnualCost) > 0 ? `, ${money(h.otherCoverageAnnualCost)}/yr` : ''}`],
        ['Out-of-pocket (annual)', money(h.outOfPocketAnnual)],
      ],
    },
    {
      title: 'Household',
      rows: spouse.enabled
        ? [
            ['Second person modelled', `Yes (${text(spouse.label || 'Person B')})`],
            ['Person B age', ageFmt(spouse.currentAge)],
            ['Person B income', `${money(spouse.annualIncome)}/yr${spouse.incomeEndAge == null ? '' : `, until age ${num(spouse.incomeEndAge)}`}`],
            ['Person B Social Security at FRA (monthly)', money(spouse.socialSecurity?.piaMonthlyAtFra)],
            ['Person B Social Security claiming age', ageFmt(spouse.socialSecurity?.claimAge)],
            ['Person B pension', `${money(spouse.pensionAnnual)}/yr from age ${num(spouse.pensionStartAge)}`],
            ['Person B is federal', yesNo(spouse.isFederal)],
            ...(spouse.isFederal
              ? [
                  ['Person B FERS service', `${num(spouse.fers?.yearsOfService)} years ${num(spouse.fers?.monthsOfService)} months`],
                  ['Person B high-3', money(spouse.fers?.high3Salary)],
                  ['Person B separation / annuity start', `${ageFmt(spouse.fers?.separationAge)} / ${ageFmt(spouse.fers?.annuityStartAge)}`],
                ]
              : []),
            ['Person B TSP balance', money(spouse.tspBalance)],
          ]
        : [['Second person modelled', 'No']],
    },
    {
      title: 'Career projection',
      rows: career.enabled
        ? [
            ['GS grade and step', `GS-${num(career.grade)} step ${num(career.step)}`],
            ['Locality', text(career.localityCode)],
            ['Annual across-the-board raise', pct(career.annualRaisePercent)],
            ['Promotions', (career.promotions ?? []).length > 0 ? career.promotions.map((pr) => `GS-${num(pr.toGrade ?? pr.grade)} at ${num(pr.age)}`).join('; ') : 'None'],
          ]
        : [['Career projection', 'Off (salary growth assumption used)']],
    },
    {
      title: 'Bridge strategies',
      rows: [
        ['72(t) schedule', strat.sepp?.enabled ? `On, ${pct(num(strat.sepp.interestRate) * 100, 2)} rate` : 'Off'],
        ['Roth conversion ladder', strat.rothConversion?.enabled ? `On, fill the ${pct(num(strat.rothConversion.targetBracketRate) * 100, 0)} bracket` : 'Off'],
        ['Roll Roth TSP to a Roth IRA', yesNo(strat.rolloverRothTspToIra !== false)],
      ],
    },
  ];
  return groups;
}

function calculatedRows(plan, timeline) {
  const fra = plan.socialSecurity?.fra;
  const fraText = fra ? `${fra.years}${fra.months ? ` and ${fra.months} months` : ''}` : '67';
  return [
    ['Retirement path', plan.pathLabel],
    ['Eligible for an annuity', yesNo(plan.isEligibleForAnnuity)],
    ['Annuity start age', plan.annuityStartAge == null ? 'None' : String(plan.annuityStartAge)],
    ['Service for eligibility at separation', yearsFmt(plan.service.eligibilityYears)],
    ['Service for computation (with sick leave)', yearsFmt(plan.service.computationYears)],
    ['High-3 at separation', `${money(plan.high3.high3AtSeparation)} (${plan.high3.basis === 'career' ? 'from GS career projection' : 'from salary growth'})`],
    ['Multiplier', pct(num(plan.annuity.multiplier) * 100)],
    ['MRA+10 age reduction', pct(plan.annuity.ageReductionPercent)],
    ['Annuity at start (annual, nominal)', money(plan.annuity.annualAtStart)],
    ['Annuity at start in today\'s dollars', money(plan.annuity.realValueAtStartInTodaysDollars)],
    ['Years the annuity is frozen before it starts', String(plan.annuity.nominalFreezeYears)],
    ['COLA begins at', String(plan.annuity.colaStartAge)],
    ['Special Retirement Supplement', plan.srs.isEligible ? `${money(plan.srs.monthly)}/mo from ${plan.srs.startAge} to 62` : `Not payable${plan.srs.reason ? ` (${String(plan.srs.reason).replace(/_/g, ' ')})` : ''}`],
    ['FEHB in retirement', plan.fehb.message],
    ['Traditional TSP penalty-free from age', String(plan.tspAccess.traditionalPenaltyFreeAge)],
    ['72(t) available', yesNo(plan.tspAccess.seppAvailable)],
    ['Social Security full retirement age', fraText],
    ['Social Security at 62 (monthly, used for the supplement)', money(plan.socialSecurity.monthlyAt62)],
    ['FERS contribution rate', pct(num(plan.fersContributionRate) * 100)],
    ['Annual leave lump sum at separation', money(plan.annualLeave.grossPayment)],
    ['Refund of FERS contributions', plan.refund ? money(plan.refund.refundAmount) : 'Not taken'],
    ['Expected nominal return', pct(num(timeline.inputs.expectedReturn) * 100, 2)],
    ['Bridge (separation to first year guaranteed income covers spending)', `${plan.separationAge} to ${timeline.summary.bridge.endAge} (${timeline.summary.bridge.years} years)`],
  ];
}

function assumedRows(scenario, timeline) {
  const tsp = scenario.tsp ?? {};
  const a = scenario.summary?.assumptions ?? {};
  const h = scenario.healthcare ?? {};
  const params = getAnnualParameters(CURRENT_PARAMETER_YEAR);
  const nextYear = getAnnualParameters(CURRENT_PARAMETER_YEAR + 1);
  const fehbDefaults = params.fehb?.defaultAnnualEnrolleeShare ?? {};
  return [
    ['Inflation', pct(num(tsp.inflationRate, 2.5))],
    ['Spending inflation', a.spendingInflationPercent == null ? `Same as inflation (${pct(num(tsp.inflationRate, 2.5))})` : pct(a.spendingInflationPercent)],
    ['Salary growth', pct(num(tsp.annualSalaryGrowthRate, 3))],
    ['Expected nominal return', a.expectedReturnPercent == null ? `Weighted from the fund allocation (${pct(num(timeline.inputs.expectedReturn) * 100, 2)})` : `${pct(a.expectedReturnPercent)} (override)`],
    ['Cash return', `${pct(num(tsp.fundReturns?.G, 2))} (the G Fund assumption)`],
    [
      'Working-year surplus',
      scenario.summary?.assumptions?.saveWorkingSurplus === false
        ? 'Treated as spent'
        : 'Take-home pay left after spending and contributions is kept as cash',
    ],
    ['Healthcare premium growth', pct(num(h.premiumGrowthPercent, 5))],
    ['Plan end age', String(num(a.endAge, DEFAULT_END_AGE))],
    ['Share of a brokerage withdrawal treated as long-term gain', pct(DEFAULT_TAXABLE_GAINS_FRACTION * 100, 0)],
    ['Marketplace premium defaults (if FEHB is lost)', `Self ${money(DEFAULT_MARKETPLACE_ANNUAL_PREMIUM.self)}/yr, family ${money(DEFAULT_MARKETPLACE_ANNUAL_PREMIUM.family)}/yr (KFF 2025 benchmark)`],
    ['FEHB enrollee share defaults', `Self ${money(fehbDefaults.self)}, self plus one ${money(fehbDefaults.selfPlusOne)}, family ${money(fehbDefaults.family)} per year`],
    ['Medicare Part B (2026)', `${money(num(params.medicare?.partBStandardMonthlyPremium) * 12)}/yr, IRMAA from the tax return two years earlier`],
    ['Social Security trust-fund default', `${DEFAULT_TRUST_FUND_HAIRCUT.percent}% cut from ${DEFAULT_TRUST_FUND_HAIRCUT.startYear} when enabled (2025 Trustees Report)`],
    ['Social Security estimate when no statement is given', `${DEFAULT_PIA_REPLACEMENT_PERCENT}% of salary at full retirement age`],
    ['FERS COLA', 'Applied to the inflation assumption using the diet-COLA formula; none before 62 (special provision excepted)'],
    ['Tax year', `${CURRENT_PARAMETER_YEAR}. ${nextYear.isExact ? '' : `Later years use the ${CURRENT_PARAMETER_YEAR} figures carried forward: brackets, deductions, limits and IRMAA tiers are not indexed in the projection.`}`],
    ['Federal tax scope', 'Ordinary brackets, stacked capital gains, standard deduction with age-65 additions, senior bonus; no credits, AMT or NIIT'],
    ['State tax', 'One effective rate per state preset; a planning approximation'],
    ['Deterministic returns', 'The same expected return every year; see the Monte Carlo view for the spread'],
  ];
}

function Table({ caption, rows }) {
  return (
    <table className="w-full border-collapse text-sm">
      {caption && <caption className="sr-only">{caption}</caption>}
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-slate-200 dark:border-slate-700 align-top">
            <th scope="row" className="w-1/2 py-1.5 pr-3 text-left font-medium text-slate-600 dark:text-slate-300">
              {label}
            </th>
            <td className="py-1.5 text-slate-900 dark:text-slate-100">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="mb-10 break-inside-avoid">
      <h2 className="mb-3 text-xl font-semibold navy-text">{title}</h2>
      {children}
    </section>
  );
}

export default function AssumptionsPage() {
  const { currentScenario } = useScenario();

  const derived = useMemo(() => {
    if (!currentScenario?.profile) return null;
    try {
      const plan = resolveRetirementPlan(currentScenario);
      const timeline = buildTimeline(currentScenario, { plan });
      return { plan, timeline };
    } catch (err) {
      return { error: err };
    }
  }, [currentScenario]);

  const rulesByCategory = useMemo(() => listRulesByCategory(), []);

  return (
    <div className="mx-auto max-w-4xl p-6 print:p-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold navy-text">Assumptions</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Everything this plan rests on: what you entered, what FireFed derived, what it assumed, and the rules it
            applied. {currentScenario?.name ? <>Scenario: <strong>{currentScenario.name}</strong>.</> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 print:hidden"
        >
          Print
        </button>
      </div>

      {!currentScenario?.profile ? (
        <p className="rounded-md border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
          No scenario is selected. Create or open one from the{' '}
          <Link to="/scenarios" className="underline">
            scenarios page
          </Link>{' '}
          to see its assumptions. The rules applied are listed below regardless.
        </p>
      ) : derived?.error ? (
        <p className="rounded-md border border-red-200 p-4 text-sm text-red-700 dark:border-red-800 dark:text-red-300">
          The plan could not be computed for this scenario: {String(derived.error?.message ?? derived.error)}
        </p>
      ) : (
        <>
          <Section id="entered" title="You entered">
            <div className="space-y-5">
              {enteredRows(currentScenario).map((g) => (
                <div key={g.title}>
                  <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{g.title}</h3>
                  <Table caption={`You entered: ${g.title}`} rows={g.rows} />
                </div>
              ))}
            </div>
          </Section>

          <Section id="calculated" title="FireFed calculated">
            <Table caption="FireFed calculated" rows={calculatedRows(derived.plan, derived.timeline)} />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              The projected sustainable separation age and the year-by-year table are on the plan page; they are readings
              from the same timeline these figures come from.
            </p>
          </Section>

          <Section id="assumed" title="Assumed">
            <Table caption="Assumed" rows={assumedRows(currentScenario, derived.timeline)} />
          </Section>
        </>
      )}

      <Section id="rules" title="Rules applied">
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          Each rule FireFed applies, with its primary source, the year its figures apply to, and when it was last
          verified against that source. Click any ⓘ in the app to see the same entry beside the figure it explains.
        </p>
        <div className="space-y-6">
          {rulesByCategory.map((g) => (
            <div key={g.category} className="break-inside-avoid">
              <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{g.label}</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:text-slate-400">
                      <th scope="col" className="py-1.5 pr-3 font-medium">Rule</th>
                      <th scope="col" className="py-1.5 pr-3 font-medium">Source</th>
                      <th scope="col" className="py-1.5 pr-3 font-medium">Rule year</th>
                      <th scope="col" className="py-1.5 font-medium">Last verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rules.map((r) => (
                      <tr key={r.id} className="border-b border-slate-200 align-top dark:border-slate-700">
                        <td className="py-1.5 pr-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{r.title}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            <code>{r.id}</code>
                            {r.statute ? ` · ${r.statute}` : ''}
                          </div>
                        </td>
                        <td className="py-1.5 pr-3">
                          <a
                            href={r.source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-navy-700 underline hover:text-navy-900 dark:text-navy-300"
                          >
                            {r.source.name}
                          </a>
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{r.ruleYear}</td>
                        <td className="py-1.5 whitespace-nowrap">{r.lastVerified}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="current-law" title="Current law">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          All dollar figures, brackets, limits and premiums are the {CURRENT_PARAMETER_YEAR} figures. Years beyond{' '}
          {CURRENT_PARAMETER_YEAR} use them carried forward. FireFed does not anticipate legislation: the OBBBA changes
          already in force for 2026 are included, and nothing proposed is. The annual update checklist in{' '}
          <code>docs/ANNUAL-UPDATE.md</code> governs how and when these figures are refreshed; every rule above carries
          the date it was last verified so you can judge its age.
        </p>
      </Section>
    </div>
  );
}
