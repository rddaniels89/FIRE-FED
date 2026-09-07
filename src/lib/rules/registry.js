/**
 * Rule provenance registry: every rule FireFed applies, with its formula, the
 * primary source, the year the figures apply to, and when it was last verified
 * against that source. ROADMAP.md items 45 and 46.
 *
 * Formulas and source URLs are copied from the JSDoc of the module that
 * implements each rule, so this file never disagrees with the code. If a
 * module's rule changes, change the entry here in the same commit; the annual
 * update checklist (docs/ANNUAL-UPDATE.md) re-verifies every entry each year.
 *
 * Shape of a rule:
 *   id              dotted, category-first ('fers.annuity')
 *   category        one of RULE_CATEGORIES
 *   title           short name shown in the UI
 *   formula         plain text, as a person would write it on paper
 *   plainEnglish    one or two sentences
 *   source          { name, url } — the primary source
 *   statute         optional citation ('5 U.S.C. 8415')
 *   ruleYear        the year the figures / rules apply to
 *   lastVerified    ISO date the entry was last checked against the source
 *   verifiedAgainst short note on what was checked
 *   inputs          names of the inputs the rule reads
 *   caveats         known simplifications
 */

export const RULE_CATEGORIES = Object.freeze({
  fers: 'FERS annuity',
  srs: 'Special Retirement Supplement',
  tsp: 'Thrift Savings Plan',
  ss: 'Social Security',
  tax: 'Taxes',
  healthcare: 'Healthcare',
  cola: 'Cost-of-living adjustments',
  fehb: 'FEHB',
  timeline: 'Timeline and projection',
  career: 'Career and pay',
});

const RULE_YEAR = 2026;
const LAST_VERIFIED = '2026-09-07';

const OPM_FERS = 'https://www.opm.gov/retirement-center/fers-information/';
const OPM_FERS_COMPUTATION = 'https://www.opm.gov/retirement-center/fers-information/computation/';
const OPM_FERS_TYPES = 'https://www.opm.gov/retirement-center/fers-information/types-of-retirement/';
const OPM_FEHB_PLAN_INFO = 'https://www.opm.gov/healthcare-insurance/healthcare/plan-information/';
const TSP_TAX_RULES = 'https://www.tsp.gov/publications/tspbk26.pdf';
const IRS_REV_PROC = 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf';

function rule(def) {
  const { source, inputs, caveats, ...rest } = def;
  return Object.freeze({
    statute: null,
    ruleYear: RULE_YEAR,
    lastVerified: LAST_VERIFIED,
    ...rest,
    source: Object.freeze({ ...source }),
    inputs: Object.freeze([...(inputs ?? [])]),
    caveats: Object.freeze([...(caveats ?? [])]),
  });
}

const RULE_LIST = [
  // ------------------------------------------------------------------ FERS
  rule({
    id: 'fers.annuity',
    category: 'fers',
    title: 'FERS basic annuity',
    formula: 'Annual annuity = High-3 average salary × creditable service (years, with unused sick leave) × multiplier',
    plainEnglish:
      'Your pension is your highest three consecutive years of basic pay, multiplied by your years of service and by 1.0% (or 1.1% if you retire at 62 or later with 20 or more years).',
    source: { name: 'OPM — FERS computation', url: OPM_FERS_COMPUTATION },
    statute: '5 U.S.C. 8415',
    verifiedAgainst: 'OPM computation page and the conformance tests in src/lib/calculations/__tests__/opmConformance.test.js',
    inputs: ['high3Salary', 'yearsOfService', 'monthsOfService', 'unusedSickLeaveHours', 'retirementAge'],
    caveats: [
      'Service is carried in years and months; OPM drops days that do not make a full month.',
      'The MRA+10 age reduction and any survivor election are applied after this figure.',
    ],
  }),
  rule({
    id: 'fers.multiplier',
    category: 'fers',
    title: 'FERS multiplier',
    formula: 'Multiplier = 1.1% if age at annuity start ≥ 62 and service ≥ 20 years, otherwise 1.0%',
    plainEnglish:
      'Most FERS retirements use 1% of high-3 per year of service. Retiring at 62 or later with at least 20 years raises it to 1.1% for every year, not just the years after 62.',
    source: { name: 'OPM — FERS computation', url: OPM_FERS_COMPUTATION },
    statute: '5 U.S.C. 8415(a), (h)',
    verifiedAgainst: 'OPM computation page',
    inputs: ['retirementAge', 'yearsOfService'],
    caveats: [
      'Unused sick leave cannot be used to reach the 20-year threshold; the test uses eligibility service only.',
      'Special provision (LEO, firefighter, ATC) service uses 1.7% for the first 20 years and 1.0% after, which is a different formula rather than a different multiplier.',
    ],
  }),
  rule({
    id: 'fers.mra10_reduction',
    category: 'fers',
    title: 'MRA+10 age reduction',
    formula: 'Reduction = 5/12 of 1% × full months under age 62 at annuity start (5% per year)',
    plainEnglish:
      'Retiring at your minimum retirement age with between 10 and 29 years of service permanently reduces the annuity by 5% for every year you are under 62 when it starts. Postponing the start date shrinks or removes the reduction.',
    source: { name: 'OPM — FERS types of retirement (MRA+10)', url: OPM_FERS_TYPES },
    statute: '5 U.S.C. 8415(h)',
    verifiedAgainst: 'OPM wording: "reduced by 5/12 of 1 percent for each full month (5 percent per year) that you were under age 62"',
    inputs: ['annuityStartAge', 'mra'],
    caveats: ['Counted in whole months. FireFed stores ages in whole and fractional years, so a start age of 57.5 is read as 57 years 6 months.'],
  }),
  rule({
    id: 'fers.deferred_freeze',
    category: 'fers',
    title: 'Deferred and postponed annuity freeze',
    formula:
      'Annuity at start = High-3 on the separation date × service at separation × multiplier; no COLA between separation and the start date. Purchasing power lost = 1 − 1 / (1 + inflation)^(years of freeze)',
    plainEnglish:
      'A deferred or postponed annuity is computed on the salary you had when you left and receives no cost-of-living increases until it begins, so every year of waiting erodes it by inflation.',
    source: { name: 'OPM — FERS types of retirement (deferred, MRA+10 postponed)', url: OPM_FERS_TYPES },
    statute: '5 U.S.C. 8413',
    verifiedAgainst: 'OPM deferred retirement page; src/lib/projection/plan.js nominalFreezeYears',
    inputs: ['separationAge', 'annuityStartAge', 'inflationRate'],
    caveats: [
      'Deferred retirement forfeits unused sick leave credit and ends FEHB permanently; postponed MRA+10 keeps both.',
      'The earliest unreduced deferred start is 62 with 5 years, 60 with 20, or MRA with 30; with 10 to 29 years it can start at MRA with the MRA+10 reduction.',
    ],
  }),
  rule({
    id: 'fers.sick_leave',
    category: 'fers',
    title: 'Unused sick leave credit',
    formula: 'Sick leave service (years) = unused sick leave hours ÷ 2,087',
    plainEnglish:
      'Unused sick leave is converted to service time and added to the annuity computation only. It cannot make you eligible to retire, raise your high-3, or count toward the supplement.',
    source: { name: 'OPM — FERS computation (credit for unused sick leave)', url: OPM_FERS_COMPUTATION },
    statute: '5 U.S.C. 8415(l)',
    verifiedAgainst: 'OPM 2,087-hour work year; full credit for FERS retirements on or after 1 January 2014',
    inputs: ['unusedSickLeaveHours'],
    caveats: ['Credited only on an immediate annuity (including postponed MRA+10). A deferred annuitant loses it.'],
  }),
  rule({
    id: 'fers.survivor',
    category: 'fers',
    title: 'Survivor annuity election',
    formula:
      'Full: retiree annuity − 10%, survivor receives 50% of the unreduced annuity. Partial: retiree annuity − 5%, survivor receives 25%. None: no reduction, no survivor benefit',
    plainEnglish:
      'Electing a survivor annuity reduces your own pension for life and pays your survivor a share of the pension as it was before that reduction. It is also what lets a spouse keep FEHB after your death.',
    source: { name: 'OPM — FERS survivor benefits', url: 'https://www.opm.gov/retirement-center/fers-information/survivors/' },
    statute: '5 U.S.C. 8442',
    verifiedAgainst: 'OPM survivor election page: 10% reduction for the 50% benefit, 5% for the 25% benefit',
    inputs: ['survivorElection', 'annualPensionBeforeSurvivorReduction'],
    caveats: ['OPM applies the age reduction first and the survivor reduction to what remains; FireFed does the same.', 'Electing none while married requires notarised spousal consent.'],
  }),
  rule({
    id: 'fers.contribution_rate',
    category: 'fers',
    title: 'FERS employee contribution rate',
    formula: 'Contribution = basic pay × 0.8% (hired before 2013), 3.1% (FERS-RAE, hired 2013), or 4.4% (FERS-FRAE, hired 2014 or later)',
    plainEnglish:
      'What you pay toward the FERS basic benefit depends on when you were first hired. The three tiers buy the same annuity.',
    source: { name: 'OPM — FERS information', url: OPM_FERS },
    statute: '5 U.S.C. 8422(a)',
    verifiedAgainst: 'Middle Class Tax Relief and Job Creation Act of 2012; Bipartisan Budget Act of 2013',
    inputs: ['hireCohort', 'annualSalary'],
    caveats: ['Special provision employees pay 0.5 percentage points more in each tier; FireFed does not model that difference in the contribution.'],
  }),
  rule({
    id: 'fers.refund',
    category: 'fers',
    title: 'Refund of FERS contributions',
    formula: 'Refund = sum over each year of (salary × contribution rate), compounded at the Treasury market rate; no interest for service under one year',
    plainEnglish:
      'Leaving before retirement lets you take back what you paid into the basic benefit, with interest, but doing so forfeits the deferred annuity for that service unless you later redeposit it.',
    source: { name: 'OPM — service credit and refund interest', url: 'https://www.opm.gov/retirement-center/csrs-information/service-credit/' },
    statute: '5 U.S.C. 8422(i)',
    verifiedAgainst: 'OPM SF 3106 instructions; 2025 rate 4.5%, 2026 rate carried as an estimate until OPM publishes it',
    inputs: ['hireCohort', 'currentSalary', 'yearsOfService', 'annualSalaryGrowthRate'],
    caveats: ['The salary history is reconstructed by walking today\'s salary back at the growth rate; a real refund uses actual pay records.'],
  }),
  rule({
    id: 'fers.eligibility',
    category: 'fers',
    title: 'FERS retirement eligibility',
    formula:
      'Immediate unreduced: MRA with 30 years, or 60 with 20, or 62 with 5. MRA+10: MRA with 10 to 29 years (reduced). VERA: 50 with 20 or any age with 25. Deferred: 5 years, annuity later',
    plainEnglish:
      'Which door you leave through is set by your age and service on the day you separate, and it decides the age reduction, sick leave credit, FEHB, and the supplement.',
    source: { name: 'OPM — FERS types of retirement', url: OPM_FERS_TYPES },
    statute: '5 U.S.C. 8412, 8413, 8414',
    verifiedAgainst: 'OPM eligibility table; MRA of 57 for those born 1970 or later',
    inputs: ['separationAge', 'yearsOfService', 'monthsOfService', 'mra', 'isVeraOffered', 'retirementPath'],
    caveats: ['Months of service are carried, so 29 years 6 months at 57 is not MRA+30.', 'Special provision employees (LEO, firefighter, ATC) qualify at 50 with 20 covered years or any age with 25, and face mandatory separation.'],
  }),
  rule({
    id: 'leave.lump_sum',
    category: 'fers',
    title: 'Lump-sum annual leave payment',
    formula: 'Payment = (annual salary ÷ 2,087) × unused annual leave hours',
    plainEnglish:
      'Unused annual leave is paid out at your hourly rate shortly after separation, giving you cash on day one of retirement. Most employees may carry over 240 hours.',
    source: { name: 'OPM — lump-sum payments for annual leave', url: 'https://www.opm.gov/policy-data-oversight/pay-leave/leave-administration/fact-sheets/lump-sum-payments-for-annual-leave/' },
    statute: '5 U.S.C. 5551',
    verifiedAgainst: 'OPM fact sheet; 240-hour carryover cap (SES 720, overseas 360)',
    inputs: ['annualLeaveHoursAtSeparation', 'salaryAtSeparation'],
    caveats: ['The payment is taxable wages in the year paid; FireFed taxes it as ordinary income in the separation year.'],
  }),

  // ------------------------------------------------------------------- SRS
  rule({
    id: 'srs.amount',
    category: 'srs',
    title: 'Special Retirement Supplement amount',
    formula: 'Monthly supplement = estimated Social Security benefit at 62 × (whole years of civilian FERS service ÷ 40)',
    plainEnglish:
      'The supplement approximates the Social Security you earned during federal service and is paid from retirement until the month you turn 62. It is payable only on an immediate, unreduced annuity taken before 62 (MRA+30 or 60+20), or on a VERA once you reach MRA.',
    source: { name: 'OPM — FERS types of retirement (annuity supplement)', url: OPM_FERS_TYPES },
    statute: '5 U.S.C. 8421',
    verifiedAgainst: 'CSRS/FERS Handbook chapter 51: divide by 40, civilian service rounded to whole years',
    inputs: ['socialSecurityAt62Monthly', 'creditableYearsOfService', 'retirementAge', 'mra', 'retirementPath'],
    caveats: ['Not payable on MRA+10, deferred, or postponed retirement.', 'Military service and unused sick leave never count.', 'OPM\'s own estimate uses a full earnings history; this is the planning approximation OPM publishes.'],
  }),
  rule({
    id: 'srs.earnings_test',
    category: 'srs',
    title: 'Supplement earnings test',
    formula: 'Withheld = (earned income − exempt amount) ÷ 2, capped at the annual supplement; 2026 exempt amount $24,480',
    plainEnglish:
      'Wages and self-employment income above the Social Security annual limit reduce the supplement by $1 for every $2 over. Pensions, TSP withdrawals and investment income do not count.',
    source: { name: 'SSA — retirement earnings test exempt amounts', url: 'https://www.ssa.gov/oact/cola/rtea.html' },
    statute: '5 U.S.C. 8421a; 42 U.S.C. 403(b)',
    verifiedAgainst: 'SSA 2026 under-FRA exempt amount; OPM applies the same test to the supplement',
    inputs: ['annualEarnedIncome', 'srsAnnual', 'exemptAmount'],
    caveats: ['OPM surveys earnings annually and applies the reduction the following year; FireFed applies it in the same year.', 'The test does not apply before MRA, which matters only to VERA and special provision retirees.'],
  }),

  // -------------------------------------------------------------------- SS
  rule({
    id: 'ss.claiming_factor',
    category: 'ss',
    title: 'Social Security claiming adjustment',
    formula:
      'Early: −5/9 of 1% per month for the first 36 months before FRA, −5/12 of 1% per month beyond. Late: +2/3 of 1% per month past FRA, up to 70. Benefit = PIA × factor',
    plainEnglish:
      'Claiming before your full retirement age permanently reduces the benefit and claiming after permanently increases it. With FRA 67, 62 pays 70% of the statement amount and 70 pays 124%.',
    source: { name: 'SSA — early or late retirement', url: 'https://www.ssa.gov/oact/quickcalc/early_late.html' },
    statute: '42 U.S.C. 402(q), 402(w)',
    verifiedAgainst: 'SSA agereduction and delayret planner pages',
    inputs: ['piaMonthlyAtFra', 'socialSecurityClaimAge', 'birthYear'],
    caveats: ['SSA rounds each step down to the dime; FireFed does not.', 'Delayed credits earned in a year are paid from the following January; ignored for planning.'],
  }),
  rule({
    id: 'ss.fra',
    category: 'ss',
    title: 'Social Security full retirement age',
    formula: 'Born 1937 or earlier: 65. 1938–1942: 65 + 2 months per year. 1943–1954: 66. 1955–1959: 66 + 2 months per year. 1960 or later: 67',
    plainEnglish:
      'Your full retirement age depends on your year of birth. Everyone born in 1960 or later has an FRA of 67.',
    source: { name: 'SSA — retirement age reduction table', url: 'https://www.ssa.gov/benefits/retirement/planner/agereduction.html' },
    statute: '42 U.S.C. 416(l)',
    verifiedAgainst: 'SSA published FRA table',
    inputs: ['currentAge'],
    caveats: ['FireFed stores an age, not a birth date, so the birth year is recovered to within a year; this only matters in the 1955–1959 band.'],
  }),
  rule({
    id: 'ss.taxation',
    category: 'tax',
    title: 'Taxation of Social Security benefits',
    formula:
      'Provisional income = other income + tax-exempt interest + ½ benefits. Up to $25,000 single / $32,000 joint: none taxable. Up to $34,000 / $44,000: lesser of 50% of the excess or 50% of benefits. Above: lesser of 85% of benefits, or 85% of the excess over the upper threshold plus the smaller of the 50%-tier maximum or 50% of benefits',
    plainEnglish:
      'Up to 85% of Social Security can be taxable, depending on your other income. The thresholds were set in 1984 and 1994 and are not indexed.',
    source: { name: 'IRS Publication 915', url: 'https://www.irs.gov/publications/p915' },
    statute: '26 U.S.C. 86',
    verifiedAgainst: 'Pub 915 worksheet 1',
    inputs: ['socialSecurity', 'otherIncome', 'filingStatus'],
    caveats: ['Married filing separately while living with the spouse: both thresholds are zero.'],
  }),

  // ------------------------------------------------------------------- TSP
  rule({
    id: 'tsp.access',
    category: 'tsp',
    title: 'Penalty-free TSP access',
    formula:
      'Traditional TSP penalty-free from separation if separated in or after the year you turn 55 (50 for special provision); otherwise from 59½. Early withdrawals: +10% penalty',
    plainEnglish:
      'Leaving at 55 or later opens the Traditional TSP immediately; leaving earlier means a 10% penalty on top of tax until 59½ unless you use a 72(t) schedule or Roth basis.',
    source: { name: 'TSP — Tax rules about TSP payments (TSPBK26)', url: TSP_TAX_RULES },
    statute: '26 U.S.C. 72(t)(2)(A)(v), 72(t)(10)',
    verifiedAgainst: 'TSPBK26 and IRS retirement topics on early distributions',
    inputs: ['separationAge', 'employeeType'],
    caveats: ['The rule keys on the calendar year of separation; FireFed stores ages, so separating at 55 or later is used as the test.'],
  }),
  rule({
    id: 'tsp.sepp',
    category: 'tsp',
    title: '72(t) substantially equal periodic payments',
    formula:
      'Annual payment (amortization) = balance × r ÷ (1 − (1 + r)^−n), where n is single life expectancy and r ≤ the greater of 5% or 120% of the federal mid-term rate. Schedule runs the longer of 5 years or until 59½',
    plainEnglish:
      'A fixed annual withdrawal computed from your balance and life expectancy avoids the 10% penalty at any age, but the schedule cannot be changed once started without a retroactive penalty.',
    source: { name: 'IRS — retirement topics, tax on early distributions', url: 'https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-tax-on-early-distributions' },
    statute: '26 U.S.C. 72(t)(2)(A)(iv); IRS Notice 2022-6',
    verifiedAgainst: 'Notice 2022-6 interest cap; Publication 590-B single life table (2022 revision)',
    inputs: ['traditionalBalance', 'separationAge', 'strategies.sepp.interestRate'],
    caveats: ['Only the amortization method is modelled; the RMD and annuitization methods produce different amounts.', 'TSP installments must be set up to match the IRS-computed amount; the TSP does not compute 72(t) payments for you.'],
  }),
  rule({
    id: 'tsp.roth_ladder',
    category: 'tsp',
    title: 'Roth conversion ladder',
    formula:
      'Each year: convert min(room left in the target bracket, Traditional balance) to Roth; each conversion is penalty-free 5 tax years later or at 59½. Roth contributions: penalty-free any time once rolled to a Roth IRA. Roth earnings: qualified at 59½ with 5 years since the first Roth contribution',
    plainEnglish:
      'Converting Traditional money to Roth in low-income years pays tax now at a low rate and makes that money available penalty-free five years later, which is how an early retiree bridges to 59½.',
    source: { name: 'TSP — Tax rules about TSP payments (TSPBK26)', url: TSP_TAX_RULES },
    statute: '26 U.S.C. 408A(d)(3)',
    verifiedAgainst: 'TSPBK26 on Roth withdrawals; IRS Publication 590-B on the five-year rules',
    inputs: ['strategies.rothConversion.targetBracketRate', 'taxableIncome', 'traditionalBalance', 'rothContributionBasis'],
    caveats: ['The TSP itself pays Roth withdrawals pro rata between contributions and earnings; withdrawing basis first requires a rollover to a Roth IRA.', 'Conversions are stopped at 73 in the model.'],
  }),
  rule({
    id: 'tsp.employer_match',
    category: 'tsp',
    title: 'FERS agency TSP contributions',
    formula: 'Agency contribution = 1% automatic + 100% match on the first 3% of pay you contribute + 50% match on the next 2%; maximum 5% of pay',
    plainEnglish:
      'Contributing at least 5% of pay captures the full 5% from your agency. Agency contributions are always Traditional.',
    source: { name: 'TSP — contribution types', url: 'https://www.tsp.gov/making-contributions/contribution-types/' },
    statute: '5 U.S.C. 8432(c)',
    verifiedAgainst: 'tsp.gov matching schedule',
    inputs: ['monthlyContributionPercent', 'annualSalary', 'includeEmployerMatch', 'includeAutomatic1Percent'],
    caveats: ['Matching is computed per pay period; hitting the elective deferral limit early in the year forfeits match for the remaining periods. FireFed models this monthly.'],
  }),
  rule({
    id: 'tsp.limits',
    category: 'tsp',
    title: 'TSP contribution limits',
    formula:
      '2026: elective deferral $24,500; catch-up $8,000 from age 50; super catch-up $11,250 at ages 60–63 (replaces the regular catch-up); catch-up must be Roth if prior-year FICA wages exceeded $150,000',
    plainEnglish:
      'Your own contributions are capped each year, with a higher cap from 50 and a higher one still at 60 to 63. Higher earners must make catch-up contributions as Roth.',
    source: { name: 'IRS Notice 2025-67 (2026 limits)', url: 'https://www.irs.gov/pub/irs-drop/n-25-67.pdf' },
    statute: '26 U.S.C. 402(g), 414(v); SECURE 2.0 ss.109, 603',
    verifiedAgainst: 'IRS Notice 2025-67; TSP bulletin 25-3',
    inputs: ['annualEmployeeDeferralLimit', 'annualCatchUpLimit', 'catchUpAge', 'priorYearWages'],
    caveats: ['Agency contributions do not count toward the elective deferral limit.'],
  }),

  // ------------------------------------------------------------------ FEHB
  rule({
    id: 'fehb.five_year',
    category: 'fehb',
    title: 'FEHB five-year rule',
    formula:
      'Continues if (years enrolled + TRICARE years ≥ 5, or enrolled since first opportunity) and the annuity is immediate. Postponed MRA+10: suspended, reinstated when the annuity starts. Deferred: lost permanently',
    plainEnglish:
      'To keep federal health insurance in retirement you must have been enrolled for the five years before you retire and retire on an immediate annuity. Deferring the annuity ends coverage for good; postponing it does not.',
    source: { name: 'OPM — FEHB plan information (retirement)', url: OPM_FEHB_PLAN_INFO },
    statute: '5 U.S.C. 8905(b)',
    verifiedAgainst: 'OPM FEHB Handbook, continuation of coverage in retirement',
    inputs: ['fehbYearsEnrolled', 'enrolledSinceFirstOpportunity', 'tricareYears', 'retirementPath', 'separationAge'],
    caveats: ['TRICARE counts toward the five years only if FEHB is in force on the retirement date.'],
  }),
  rule({
    id: 'healthcare.fehb_premium',
    category: 'healthcare',
    title: 'FEHB premium in retirement',
    formula:
      'Retiree pays the same enrollee share as an employee; government pays the lesser of 72% of the programme-wide average or 75% of the plan premium. Premium in year n = 2026 share × (1 + growth)^n. 2026 planning defaults: self $3,400, self plus one $7,600, family $8,300 a year',
    plainEnglish:
      'Retirees are not charged more for FEHB than employees. Premiums are grown from the 2026 figure at your healthcare growth assumption.',
    source: { name: 'OPM — FEHB premiums', url: 'https://www.opm.gov/healthcare-insurance/healthcare/plan-information/premiums/' },
    statute: '5 U.S.C. 8906',
    verifiedAgainst: 'OPM 2026 premium announcement (enrollee share up about 12.3% on average)',
    inputs: ['fehbEnrollmentType', 'fehbAnnualEnrolleeShare', 'premiumGrowthPercent'],
    caveats: ['The default shares are approximations of typical nationwide plans, not any specific plan\'s rate; enter your own.', 'Retirees lose the pre-tax premium conversion, which is not modelled.'],
  }),
  rule({
    id: 'healthcare.medicare',
    category: 'healthcare',
    title: 'Medicare Part B',
    formula: 'From 65: Part B premium $202.90/month (2026) × 12 × (1 + growth)^n, if enrolled; FEHB can be kept alongside',
    plainEnglish:
      'At 65 most federal retirees enrol in Medicare Part B and keep FEHB as secondary cover. The Part B premium is grown at the same rate as FEHB premiums.',
    source: { name: 'CMS — 2026 Medicare Parts A and B premiums and deductibles', url: 'https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-and-deductibles' },
    statute: '42 U.S.C. 1395r',
    verifiedAgainst: 'CMS 2026 fact sheet: standard premium $202.90, deductible $283',
    inputs: ['enrollInPartB', 'keepFehbWithMedicare', 'premiumGrowthPercent'],
    caveats: ['Part D and Medigap are not modelled; FEHB usually replaces both.'],
  }),
  rule({
    id: 'healthcare.irmaa',
    category: 'healthcare',
    title: 'Medicare IRMAA surcharge',
    formula:
      'Part B premium is set by MAGI from two years earlier. 2026 tiers (single / joint MAGI above): $109,000 / $218,000 → $284.10; $137,000 / $274,000 → $405.70; $171,000 / $342,000 → $527.20; $205,000 / $410,000 → $648.80; $500,000 / $750,000 → $689.30 per month',
    plainEnglish:
      'Higher-income retirees pay more for Part B, based on the tax return from two years earlier. A large Roth conversion or TSP withdrawal at 63 raises your premium at 65.',
    source: { name: 'CMS — 2026 Medicare Parts A and B premiums and deductibles', url: 'https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-and-deductibles' },
    statute: '42 U.S.C. 1395r(i)',
    verifiedAgainst: 'CMS 2026 IRMAA table',
    inputs: ['includeIrmaa', 'magiTwoYearsPrior', 'filingStatus'],
    caveats: ['Thresholds are not indexed in the projection, so a nominal MAGI far in the future reads against 2026 tiers and overstates the surcharge.', 'Married filing separately has its own schedule and is treated as single here.'],
  }),

  // ------------------------------------------------------------------ COLA
  rule({
    id: 'cola.diet',
    category: 'cola',
    title: 'FERS diet COLA',
    formula: 'CPI up to 2%: full CPI. CPI over 2% to 3%: 2%. CPI above 3%: CPI − 1 point. No COLA before 62 except special provision and disability retirees',
    plainEnglish:
      'FERS annuities get a reduced cost-of-living adjustment, and most retirees get none at all until 62. A 57-year-old retiree watches a fixed annuity for five years before the first increase.',
    source: { name: 'OPM — FERS information (cost-of-living adjustments)', url: OPM_FERS },
    statute: '5 U.S.C. 8462',
    verifiedAgainst: 'OPM COLA page; the 2026 FERS COLA of 2.0% against a 2.8% CSRS COLA',
    inputs: ['inflationRate', 'annuityStartAge', 'employeeType'],
    caveats: ['The COLA is applied to the scenario\'s inflation assumption every year, not to actual CPI.'],
  }),

  // ------------------------------------------------------------------- TAX
  rule({
    id: 'tax.federal',
    category: 'tax',
    title: 'Federal income tax',
    formula:
      'Taxable income = ordinary income + capital gains + taxable Social Security − max(standard deduction + age-65 additions, itemised) − senior bonus. 2026 brackets (single): 10% to $12,400, 12% to $50,400, 22% to $105,700, 24% to $201,775, 32% to $256,225, 35% to $640,600, 37% above. Standard deduction $16,100 single / $32,200 joint; $6,000 senior bonus per person 65+, phased out at 6% of MAGI over $75,000 / $150,000',
    plainEnglish:
      'A narrow Form 1040: ordinary income taxed through the brackets, long-term gains stacked on top at 0/15/20%, the standard deduction with its age-65 additions, and the 2025–2028 senior deduction.',
    source: { name: 'IRS Rev. Proc. 2025-32 (2026 inflation adjustments)', url: IRS_REV_PROC },
    statute: '26 U.S.C. 1(j), 63, 151(d)(5); Pub. L. 119-21 (OBBBA)',
    verifiedAgainst: 'Rev. Proc. 2025-32 ss.2.01, 2.15; OBBBA ss.70102, 70103',
    inputs: ['filingStatus', 'ages', 'wages', 'federalPension', 'traditionalWithdrawals', 'socialSecurity', 'longTermCapitalGains'],
    caveats: ['No credits, AMT, NIIT or QBI.', 'Years after 2026 use the 2026 figures carried forward; brackets are not indexed in the projection.'],
  }),
  rule({
    id: 'tax.capital_gains',
    category: 'tax',
    title: 'Long-term capital gains',
    formula:
      'Gains are the top slice of taxable income: 0% up to $49,450 single / $98,900 joint, 15% up to $545,500 / $613,700, 20% above (2026). Taxable brokerage withdrawals are treated as 50% gain by default',
    plainEnglish:
      'Gains sit on top of ordinary income, so a retiree with low ordinary income can realise gains at 0%. Half of each brokerage withdrawal is assumed to be gain unless the basis says otherwise.',
    source: { name: 'IRS Rev. Proc. 2025-32 (2026 inflation adjustments)', url: IRS_REV_PROC },
    statute: '26 U.S.C. 1(h)',
    verifiedAgainst: 'Rev. Proc. 2025-32 s.2.03',
    inputs: ['taxableBrokerageBalance', 'longTermCapitalGains', 'filingStatus'],
    caveats: ['The 3.8% net investment income tax is not modelled.'],
  }),
  rule({
    id: 'tax.state',
    category: 'tax',
    title: 'State income tax',
    formula:
      'State tax = max(0, ordinary income + capital gains − exempt federal pension portion + Social Security if the state taxes it) × a single effective rate',
    plainEnglish:
      'Each state is reduced to one effective rate plus whether it exempts a FERS annuity, exempts Social Security, or allows a pension exclusion. This is a planning approximation, not a bracket walk.',
    source: { name: 'Tax Foundation — state individual income tax rates', url: 'https://taxfoundation.org/data/all/state/state-income-tax-rates/' },
    verifiedAgainst: 'Tax Foundation 2026 rates; NARFE state tax roundup for federal annuity treatment',
    inputs: ['taxes.state.code', 'taxes.state.rate', 'taxes.state.exemptsFederalPension', 'taxes.state.exemptsSocialSecurity', 'taxes.state.pensionExclusion'],
    caveats: ['Presets must be verified against each state\'s current-year instructions; several states are mid-way through multi-year rate cuts.', 'Local income taxes are not modelled.'],
  }),
  rule({
    id: 'tax.fica',
    category: 'tax',
    title: 'FICA on wages',
    formula: 'FICA = 6.2% × min(wages, $184,500) + 1.45% × wages (2026). Stops at separation',
    plainEnglish:
      'FERS employees pay full Social Security and Medicare tax on wages. It ends the day you retire, which is part of why a retiree needs less than their salary.',
    source: { name: 'SSA — contribution and benefit base', url: 'https://www.ssa.gov/oact/cola/cbb.html' },
    statute: '26 U.S.C. 3101',
    verifiedAgainst: 'SSA 2026 wage base $184,500',
    inputs: ['wages'],
    caveats: ['The 0.9% Additional Medicare Tax above $200,000 / $250,000 is not modelled.'],
  }),

  // -------------------------------------------------------------- TIMELINE
  rule({
    id: 'timeline.sustainable',
    category: 'timeline',
    title: 'Sustainable plan test',
    formula:
      'For each age from today to the plan end age: inflows (salary, annuity, supplement, Social Security, side income, spouse) − outflows (spending, healthcare, taxes, penalties, contributions) = need; fund the need from savings in withdrawal order. Sustainable if no year records a shortfall and the ending balance is ≥ 0',
    plainEnglish:
      'A plan is sustainable when every year through the end age can be paid for from income and savings without running out. It is a projection under stated assumptions, not a guarantee.',
    source: { name: 'FireFed timeline model (src/lib/projection/timeline.js)', url: 'https://github.com/rddaniels89/fed-fire' },
    verifiedAgainst: 'src/lib/projection/__tests__/timeline.test.js',
    inputs: ['every scenario field', 'assumptions.endAge', 'expectedReturn', 'inflationRate'],
    caveats: ['Deterministic: one expected return every year. The Monte Carlo view shows the spread.', 'Taxes are solved by fixed-point iteration each year, because withdrawals change taxes and taxes change the withdrawal.'],
  }),
  rule({
    id: 'timeline.bridge',
    category: 'timeline',
    title: 'The bridge',
    formula:
      'Bridge years = years from separation until guaranteed income ≥ spending + healthcare. Bridge need = withdrawals in those years + any shortfall. Funded % = withdrawals ÷ need',
    plainEnglish:
      'The bridge is the stretch between leaving federal service and the first year that pension, supplement and Social Security cover your spending. It is what savings have to carry.',
    source: { name: 'FireFed timeline model (src/lib/projection/timeline.js)', url: 'https://github.com/rddaniels89/fed-fire' },
    verifiedAgainst: 'src/lib/projection/__tests__/timeline.test.js',
    inputs: ['separationAge', 'annuityStartAge', 'socialSecurityClaimAge', 'monthlyFireIncomeGoal', 'healthcare'],
    caveats: ['The supplement is bridge income by construction: it exists only between retirement and 62.'],
  }),
  rule({
    id: 'timeline.withdrawal_order',
    category: 'timeline',
    title: 'Withdrawal order',
    formula: 'Cash → taxable brokerage → Roth contributions → seasoned Roth conversions → Traditional TSP (+10% penalty before the penalty-free age unless 72(t) is running) → Roth earnings',
    plainEnglish:
      'When income falls short, the model spends the cheapest money first: cash, then brokerage, then Roth basis, and only then Traditional TSP, which is taxed and possibly penalised.',
    source: { name: 'TSP — Tax rules about TSP payments (TSPBK26)', url: TSP_TAX_RULES },
    statute: '26 U.S.C. 72(t)',
    verifiedAgainst: 'TSPBK26; src/lib/calculations/tspAccess.js',
    inputs: ['cashBalance', 'taxableBrokerageBalance', 'rothBalance', 'rothContributionBasis', 'currentBalance', 'strategies'],
    caveats: ['A real withdrawal plan may prefer Traditional first to fill low brackets; the order here minimises penalties, not lifetime tax.'],
  }),
  rule({
    id: 'fire.date',
    category: 'timeline',
    title: 'Projected sustainable separation age',
    formula: 'The earliest whole-year separation age from today to 75 for which the timeline is sustainable, with the annuity start reset to the path default',
    plainEnglish:
      'FireFed tries each separation age in turn and reports the first one at which the plan never runs dry. It is a projection under your assumptions, not a recommendation.',
    source: { name: 'FireFed FIRE date search (src/lib/projection/fireDate.js)', url: 'https://github.com/rddaniels89/fed-fire' },
    verifiedAgainst: 'src/lib/projection/__tests__/fireDateAndDeltas.test.js',
    inputs: ['every scenario field'],
    caveats: ['Whole years only.', 'A chosen annuity start age later than the candidate separation is kept; otherwise the path default applies.'],
  }),
  rule({
    id: 'mc.method',
    category: 'timeline',
    title: 'Monte Carlo method',
    formula:
      'Each simulation runs the full timeline with a yearly return drawn from Normal(expected return, portfolio σ), clamped to ±65%. Portfolio σ = √Σ(weight × fund σ)², fund σ: G 1%, F 5%, C 16%, S 18%, I 17%. Success = share of simulations with no shortfall through the end age',
    plainEnglish:
      'The same year-by-year model is run hundreds of times with different return sequences. The pension, supplement, taxes and penalties behave exactly as in the deterministic view; only the returns vary.',
    source: { name: 'FireFed Monte Carlo (src/lib/analytics/monteCarlo.js)', url: 'https://github.com/rddaniels89/fed-fire' },
    verifiedAgainst: 'src/lib/analytics tests; seeded for reproducibility',
    inputs: ['allocation', 'expectedReturnPercent', 'simulations', 'seed'],
    caveats: ['Fund volatilities are coarse and correlations are ignored, which understates portfolio risk somewhat.', 'Returns are drawn independently each year; no mean reversion or sequence modelling.'],
  }),

  // ---------------------------------------------------------------- CAREER
  rule({
    id: 'career.wgi',
    category: 'career',
    title: 'Within-grade increases',
    formula: 'Advance one step after 52 weeks at steps 1–3, 104 weeks at steps 4–6, 156 weeks at steps 7–9; step 10 is the top',
    plainEnglish:
      'A GS employee moves up a step after a fixed waiting period at acceptable performance, which is what carries a salary up the grade over a career.',
    source: { name: 'OPM — within-grade increases fact sheet', url: 'https://www.opm.gov/policy-data-oversight/pay-leave/pay-administration/fact-sheets/within-grade-increases/' },
    statute: '5 U.S.C. 5335; 5 CFR 531.405',
    verifiedAgainst: 'OPM fact sheet waiting periods',
    inputs: ['career.grade', 'career.step', 'currentAge', 'separationAge'],
    caveats: ['Modelled on an annual grid; quality step increases and denied WGIs are not modelled.'],
  }),
  rule({
    id: 'career.promotion',
    category: 'career',
    title: 'Promotion two-step rule',
    formula: 'On promotion, take the rate two steps above the current step in the old grade; place at the lowest step of the new grade whose rate meets or exceeds it. Salary = min(round(base × (1 + locality %)), Executive Schedule Level IV)',
    plainEnglish:
      'A promotion places you at the first step of the new grade that pays at least two steps more than you make now. Locality pay is then applied and capped at EX-IV.',
    source: { name: '5 CFR 531.214 — setting pay on promotion', url: 'https://www.ecfr.gov/current/title-5/chapter-I/subchapter-B/part-531/subpart-B/section-531.214' },
    statute: '5 U.S.C. 5334(b); 5 CFR 531.214',
    verifiedAgainst: 'eCFR 531.214; OPM 2026 salary tables (all 8,700 locality cells reproduced)',
    inputs: ['career.promotions', 'career.localityCode', 'career.annualRaisePercent'],
    caveats: ['The steps 9–10 refinement (adding two within-grade amounts beyond step 10) is not modelled.', 'Locality percentages are held fixed; the January raise applies to base pay only.'],
  }),
];

export const RULES = Object.freeze(Object.fromEntries(RULE_LIST.map((r) => [r.id, r])));

export function getRule(id) {
  return RULES[id] ?? null;
}

export function listRules() {
  return RULE_LIST.slice();
}

/** Rules grouped by category, in RULE_CATEGORIES order. */
export function listRulesByCategory() {
  return Object.keys(RULE_CATEGORIES).map((category) => ({
    category,
    label: RULE_CATEGORIES[category],
    rules: RULE_LIST.filter((r) => r.category === category),
  }));
}
