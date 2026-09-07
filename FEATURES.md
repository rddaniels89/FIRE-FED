# FireFed features

A complete reference to what FireFed models and what it shows. Last updated
2026-09-07, current as of the merge of the one-model rebuild.

FireFed is an educational planning tool for employees under the Federal
Employees Retirement System. It models one person's path from today through
separation and retirement as a single year-by-year projection. It does not give
individualized financial advice.

---

## 1. The model

### One profile

A scenario holds the person once. Every calculator, chart and report reads the
same fields:

| Field | Meaning |
|---|---|
| Current age | Stored as an age in years, never a date of birth |
| Separation age | The day federal employment ends |
| Annuity start age | When the FERS annuity begins; blank means the path's own default |
| Social Security claim age | 62 to 70, independent of the two above |
| Retirement path | Automatic (best door open) or a path you pick |
| Employee type | Regular, or one of six special provision categories |
| Hire cohort | FERS, FERS-RAE, or FERS-FRAE, which sets the contribution rate |
| Minimum retirement age | 57 for anyone born 1970 or later |

Separating, starting the pension, and claiming Social Security are three
separate decisions, and the model treats them that way.

### One lifetime timeline

The engine builds one row per age from today to the end of the plan. Each row
carries:

- Salary, FERS contributions, TSP employee and agency contributions
- FERS annuity, with the reduced COLA and the deferred-annuity freeze
- Special Retirement Supplement, with the earnings test applied
- Social Security at the claiming factor for the age you chose
- Spouse income, spouse Social Security, spouse pension
- Side income, lump sums at separation
- Withdrawals, in order, with penalties where the rules impose them
- Federal tax, state tax, FICA, early-withdrawal penalties
- Healthcare cost for whatever coverage applies at that age
- Spending, the surplus or shortfall, and the ending balance
- The same figures deflated to today's dollars

Everything else in the app is a reading from this table: the projected
separation age, the bridge, the deltas, the Monte Carlo, the stress tests, the
comparison view, and the report. They cannot disagree with each other because
there is only one calculation.

---

## 2. FERS retirement

### Every path

| Path | Rule | Reduction | Sick leave | FEHB | Supplement |
|---|---|---|---|---|---|
| Immediate unreduced | MRA+30, 60+20, or 62+5 | None | Credited | Continues | Yes, before 62 |
| MRA+10 immediate | MRA with 10 years | 5% per year under 62, permanent | Credited | Continues | No |
| MRA+10 postponed | Same, annuity deferred to a chosen age | Shrinks or disappears | Credited | Suspended, then reinstated | No |
| Deferred | Separated with 5+ years | Depends on claim age | Lost | Lost permanently | No |
| Early out (VERA) | Age 50 with 20, or any age with 25, when offered | None under FERS | Credited | Continues | Yes, from MRA |
| Special provisions | Age 50 with 20 covered years, or any age with 25 | None | Credited | Continues | Yes, immediately |

The early out is modeled as a "what if my agency offers this" toggle rather
than something you can simply choose, because it is not the employee's
decision.

### Computation

- **Multiplier** of 1.0%, or 1.1% when you are 62 or older with 20 years **at
  separation**. A deferred annuity that merely begins at 62 does not earn it.
- **Special provisions** use 1.7% for the first 20 years and 1.0% beyond.
- **High-3** at separation, projected from today's salary and growth rate, or
  from a modeled General Schedule career path.
- **Unused sick leave** converted at 2,087 hours per year, credited to the
  computation only. It never establishes eligibility.
- **Months of service** carried throughout, so 29 years and 6 months at 57 is
  correctly not MRA+30.
- **Survivor election** of none, 25%, or 50%, with the retiree's reduction and
  the survivor's benefit computed in the right order.
- **Cost-of-living adjustments** using the reduced FERS formula, starting at 62
  for most retirees and immediately for special provisions.
- **Mandatory retirement age** enforced for special provision employees: 57, or
  56 for air traffic controllers.

### Leaving before eligibility

- **Deferred annuity** shown frozen: computed on the High-3 of the day you
  left, with no adjustment until it starts, and the purchasing power lost in
  between made explicit.
- **Refund of contributions** with Treasury interest, modeled when no annuity
  is available, along with what taking it forfeits.
- **Annual leave lump sum** paid at the separation hourly rate, available as
  bridge cash on day one.

### The supplement

The Special Retirement Supplement is the age-62 Social Security estimate
multiplied by civilian FERS years over 40. FireFed shows it when payable and
explains why when it is not. It applies the Social Security earnings test, stops
at 62, and handles the two exceptions: an early-out retiree waits until their
minimum retirement age, and a special provision retiree receives it immediately
and is exempt from the earnings test until that age.

---

## 3. The Thrift Savings Plan

### Projection

- Traditional against Roth with agency contributions: 1% automatic plus a match
  of up to 4%
- 2026 contribution limits, the catch-up at 50, the higher band at 60 to 63, and
  the rule forcing catch-up to Roth above the wage threshold
- Fund allocation across G, F, C, S, and I with editable return assumptions
- Nominal and inflation-adjusted views
- Tax rates for the Traditional-versus-Roth comparison can be filled from the
  bracket engine rather than typed in

### When the money is available

This is the heart of an early exit, and FireFed models it precisely:

- Separate **in or after the year you turn 55** and Traditional withdrawals are
  penalty-free immediately. For special provisions the age is 50.
- Separate earlier and the money is locked behind a 10% penalty until 59½. The
  app names the exact gap in years.
- **72(t) substantially equal payments** amortized over single life expectancy,
  committed for the longer of five years or until 59½.
- **Roth conversion ladders**, with each conversion becoming accessible five tax
  years later.
- **Roth contribution basis** tracked separately from earnings, so a bridge
  withdrawal from Roth is charged correctly.

### Withdrawal order

When income falls short, the timeline draws in this order and charges whatever
tax and penalty each source carries: cash, then taxable brokerage, then Roth
contributions, then seasoned conversions, then Traditional, then Roth earnings.

---

## 4. Social Security

- Takes the benefit at full retirement age from your own Social Security
  statement, or estimates it from salary
- Derives full retirement age from birth year
- Applies the correct claiming factors from 62 to 70: a reduction of five-ninths
  of 1% per month for the first three years and five-twelfths beyond, and
  delayed credits of two-thirds of 1% per month
- Shows the monthly benefit at every claiming age so the choice is visible
- Derives the age-62 figure the supplement needs from the same input
- Taxes benefits under the provisional income worksheet
- Optional modeling of the Trustees' projected shortfall, a 23% reduction from
  2033

---

## 5. Healthcare

- **FEHB five-year rule**, and what each retirement path does to coverage
- **Premiums projected** into retirement with a growth assumption, using your
  own figure or a nationwide default by enrollment type
- **Marketplace cover** costed for the years a deferred retiree has no FEHB
- **Medicare at 65**: Part B premium, and the choice to keep FEHB alongside it
- **IRMAA surcharges** on income from two years prior
- **VA, TRICARE, or CHAMPVA** as an alternative that replaces the premium line
- Out-of-pocket costs grown alongside premiums

Healthcare is a line in the timeline, not a footnote, so it is inside the bridge
calculation and the sustainability test.

---

## 6. Taxes

- 2026 federal brackets, standard deduction, the additional deduction at 65, and
  the senior bonus deduction with its phase-out
- Filing status: single, married filing jointly, married filing separately, head
  of household
- Each income line characterized correctly: pension and supplement taxable,
  Traditional withdrawals taxable, Roth tax-free, brokerage gains at capital
  gains rates, Social Security under provisional income
- Long-term capital gains stacked on ordinary income at 0, 15, and 20 percent
- State income tax for all 50 states and the District of Columbia, with flags
  for states that exempt federal pensions or Social Security, and dollar
  exclusions where they apply
- FICA on wages up to the 2026 wage base
- Roth conversions sized to fill a target bracket in low-income bridge years

---

## 7. The Federal FIRE Date

- **Projected sustainable separation age**: the earliest age at which the
  timeline never runs short, given your assumptions. Phrased as a projection,
  never as a recommendation.
- **Separation-age slider** that recomputes the entire projection as you drag
  it, with a colored strip showing which ages work and which do not.
- **One year earlier and one year later** cards showing the change in pension,
  High-3, balance at separation, lifetime salary, and lowest balance, plus every
  threshold gained or lost: the 1.1% multiplier, the supplement, FEHB, sick
  leave credit, penalty-free TSP access, and the MRA+10 reduction.
- **Milestone strip** marking what changes at separation, 55, your minimum
  retirement age, 59½, 62, 65, full retirement age, and 70.

---

## 8. The bridge

The years between leaving and the first guaranteed income, costed properly:

- How many years, and which income source ends the bridge
- Withdrawals needed, assets available, and the percentage funded
- Early-withdrawal penalties incurred inside the bridge
- Each income source with the age it starts and, for the supplement, the age it
  stops
- Available strategies for closing a gap, with the effect of each

---

## 9. Durability

- **Monte Carlo** running the full timeline hundreds of times with varying
  returns. Reports the probability the money lasts, percentile bands by age, the
  lowest balance and when it happens, and the most financially vulnerable age.
- **Seven named stress tests**: a poor first decade, a crash in the year of
  separation, sustained high inflation, living to 100, healthcare growing at 9%,
  a Social Security cut, and spending 10% above plan. Each reports whether the
  plan survives and by how much the ending balance moves.
- **Separation-age comparison**: success probability at each possible leaving
  age.

---

## 10. Household

- A second person with their own age, income and income end age, Social Security
  estimate and claiming age, and pension
- Dual-federal couples, with the second person's own FERS service, High-3,
  separation age, and annuity start
- Filing status feeding the tax engine
- Labels rather than names, so no personal identification is required

---

## 11. Career and pay

- General Schedule pay for 2026: every grade and step, all 58 locality areas,
  and the Executive Schedule cap
- Within-grade step increases on the correct waiting periods
- Promotions at ages you choose, placed by the two-step rule
- An assumed annual raise
- The resulting salary path, High-3, and pension, with the effect of one more
  year

---

## 12. Scenarios and reporting

- Save, name, duplicate, import, and export scenarios
- Templates by career stage
- **Delta comparison** of two to five scenarios across twenty measures, with an
  option to show only what differs and color-coding against a baseline
- Balances-by-age chart across scenarios
- **Federal Retirement Projection Report** as a PDF: summary, FIRE date, FERS
  annuity, TSP, supplement, bridge, Social Security, healthcare, taxes, the
  household timeline, scenario comparison, Monte Carlo, stress tests,
  assumptions, and sources
- Optimization suggestions derived from the model, each showing its effect on
  the projected separation age

---

## 13. Transparency

- **"How was this calculated"** on every headline figure, showing the plain
  English rule, the formula, the inputs used, a link to the primary source, the
  statute where one applies, the rule year, and when it was last verified
- **A registry of 36 rules** with provenance, covering FERS, the supplement,
  TSP, Social Security, tax, healthcare, and the timeline itself
- **An assumptions page** separating what you entered, what FireFed calculated,
  and what it assumed, with every rule applied and its source
- **A verification log** recording each annual figure checked against its
  source and the date
- **An annual update checklist** so the figures do not go quietly stale

---

## 14. Privacy by design

FireFed stores ages, not birth dates. It never asks for:

- A Social Security number
- A home address
- An employee identification number or agency email
- A TSP account number
- A leave and earnings statement or an SF-50

Names are optional and household members are labeled rather than named. A saved
scenario contains only the planning inputs. For signed-in users it is stored in
your own row; otherwise it stays in your browser.

---

## 15. Where to find things

| Page | Path |
|---|---|
| My Plan | `/plan` |
| Plan inputs | `/plan/inputs` |
| Career simulator | `/plan/career` |
| Assumptions | `/assumptions` |
| TSP Forecast | `/tsp-forecast` |
| FERS Pension | `/fers-pension` |
| Summary | `/summary` |
| Scenarios | `/scenarios` |
| Compare | `/scenarios/compare` |
| Pro | `/pro-features` |
| Public FERS calculator, no account | `/calculators/fers-pension` |
| Public supplement calculator, no account | `/calculators/special-retirement-supplement` |

---

## 16. Free and Pro

The dividing line: everything a single federal employee needs to answer "when
could I leave, and will it hold" is free. A second person, a probabilistic
answer, a strategy, or a deliverable is Pro.

### Free

- Every FERS retirement path, with eligibility, reductions and the reasons
- The full annuity: multiplier, sick leave, survivor, COLA, deferred freeze
- The Special Retirement Supplement and its earnings test
- The complete lifetime timeline
- The projected sustainable separation age, the slider, and the year-either-way
  cards
- The bridge, with income starts and funding
- TSP projection and the access rules, including the penalty gap
- Social Security claiming from 62 to 70
- Federal and state income tax, Social Security taxation, FICA
- FEHB, the five-year rule, marketplace cover, Medicare at 65
- "How was this calculated" on every number, plus the assumptions page
- Three saved scenarios
- Two calculators with no account at all

### Pro

- Household and dual-federal modeling
- Monte Carlo durability
- The seven named stress tests
- 72(t) schedules and Roth conversion ladders
- Medicare IRMAA estimates
- The General Schedule career and High-3 simulator
- Delta comparison of up to five scenarios
- Comparing Monte Carlo results across separation ages
- The Federal Retirement Projection Report
- Optimization suggestions
- Unlimited scenarios, with import and export

---

## 17. What is not modeled

Stated plainly, because a planning tool that hides its limits is worse than one
that names them:

- Required minimum distributions
- Spousal and survivor Social Security benefits
- Part-time service proration, CSRS Offset, and CSRS transferees
- Military service deposits inside the timeline, though they are calculated
  separately
- Ages are whole years, so rules that turn on a month are approximated
- State taxes are an effective rate with exemption flags, not full state returns
- The Social Security benefit comes from your statement; there is no wage
  indexing or bend-point computation
- The methodology has not yet been reviewed by an independent federal benefits
  practitioner. The packet for that review is prepared and waiting to be sent.

---

## 18. Verification

- 568 automated tests across the calculation modules, the timeline, taxes,
  Social Security, healthcare, career pay, and the scenario schema
- A library of hand-computed cases traced through both the individual
  calculators and the full model
- Whole-projection snapshots that catch any unintended change to the model
- 12 browser tests covering the main journeys
- Every 2026 figure checked against IRS, Social Security Administration, CMS,
  OPM, TSP, and Tax Foundation sources on 2026-09-07
