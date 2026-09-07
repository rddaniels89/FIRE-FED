# Differential testing against OPM, the IRS and SSA

Run 2026-09-07. This is how FireFed's methodology is validated in place of an
independent practitioner review: every rule is asserted against the figures the
authority itself publishes, so a disagreement is a fact rather than an opinion.

Two suites, both running with the rest of the tests so a future change that
breaks agreement with an authority fails the build:

- `src/lib/calculations/__tests__/opmDifferential.test.js` — the FERS rules
- `src/lib/taxes/__tests__/irsSsaDifferential.test.js` — tax and Social Security

48 assertions in total. Three defects found across the two runs, all fixed.

## Sources

| Source | Used for |
|---|---|
| CSRS/FERS Handbook Chapter 50, *Computation of Annuity Under the General Formula*, 173pp | the general formula, the 1.1% accrual factor and its exclusions, Chart 7 factors, unused sick leave conversion, the 5% age reduction |
| CSRS/FERS Handbook Chapter 51, *Retiree Annuity Supplement*, 40pp | supplement eligibility, duration, the early-out and involuntary-separation rules, the special provision earnings-test exemption |
| OPM FERS eligibility page | the minimum retirement age table by year of birth |

Both handbook chapters were downloaded and their text extracted rather than
read second-hand, because the published summaries of these rules are where the
errors usually creep in.

## FERSGUIDE

FERSGUIDE was the other intended comparator and was **not** used. Its guide and
calculator sit behind a paid membership, so the calculator cannot be driven
programmatically and its figures cannot be quoted here. This is not much of a
loss: FERSGUIDE is itself working from the handbook chapters above, so testing
against the handbook tests against the same authority one step closer to the
source.

## Result

23 assertions, 21 in agreement on the first run, 2 disagreements. Both were real
defects in FireFed and both are now fixed.

### Finding 1: the minimum retirement age was hardcoded at 57

**Severity: high.** FireFed set `DEFAULT_MRA = 57` for every user, with a
comment reasoning that anyone born in 1970 or later has an MRA of 57 and that
this covers the early-retirement audience.

OPM's table runs from 55 to 57 by year of birth, stepping two months a year
through two transition bands:

| Born | MRA |
|---|---|
| before 1948 | 55 |
| 1948–1952 | 55 years 2 months, rising to 55 years 10 months |
| 1953–1964 | 56 |
| 1965 | 56 years 2 months |
| 1966 | 56 years 4 months |
| 1967 | 56 years 6 months |
| 1968 | 56 years 8 months |
| 1969 | 56 years 10 months |
| 1970 onward | 57 |

Corroborated inside Chapter 51 itself: Example 3 concerns a retiree born in
1965 whose MRA the handbook states as "56 and 2 months".

The reasoning behind the shortcut was backwards. In 2026 the 1965 to 1969
cohort is aged 57 to 61 — not a fringe group, but precisely the people closest
to retiring and most likely to be checking whether they are eligible *today*.
For them FireFed overstated the MRA by up to ten months, which delays MRA+30
and MRA+10 eligibility, delays the earliest age a postponed annuity can begin,
and delays the age an early-out retiree starts receiving the supplement. The
error always ran one way: telling a user they must work longer than the law
requires.

**Fixed.** `src/lib/calculations/mra.js` implements the table. The plan resolver
derives the MRA from the birth year, which is itself derived from the stored
age, unless the user sets an explicit override. Because the app stores an age
rather than a date of birth, the derived birth year can be off by one; the plan
now reports `mraNeedsConfirming` for the transition bands so the interface can
ask.

### Finding 2: discontinued service retirement was not modeled

**Severity: medium.** Chapter 51, Example 3: a retiree involuntarily separated
at 55 years 4 months "is not eligible to receive the retiree annuity supplement
until he attains his minimum retirement age (56 and 2 months)."

FireFed modeled the voluntary early out, which defers the supplement to MRA in
exactly the same way, but had no concept of an involuntary separation at all.
An affected user would have been told they get the supplement immediately.

**Fixed.** The supplement now accepts `isDiscontinuedService` and treats it as
its own qualifying route paid from MRA, alongside the early out. The profile
carries the flag.

## What agreed

Recorded because agreement is the useful half of the result:

- The general formula, and the 1.1% accrual factor at 62 with 20 years
- Chart 7 factors: 20 years is 0.22 of high-3, 25 years is 0.275
- The 1.1% factor is **not** applied to a special provision computation, per
  Chapter 50 Note 1, which excludes law enforcement, firefighters and air
  traffic controllers
- Unused sick leave at 2,087 hours to the year, matching the handbook's own
  example that 2,000 hours is 11 months and 15 days
- The MRA+10 reduction at 5/12 of one percent per full month under 62
- The supplement as the age-62 benefit prorated by service over 40, matching
  OPM's published illustrations
- The supplement is never payable at or after 62, nor on a reduced, deferred or
  postponed annuity
- An early-out retiree qualifies but waits until MRA
- A special provision retiree is paid immediately and is exempt from the
  earnings test until MRA

## Known divergence, accepted

FireFed computes the supplement with OPM's published shorthand. OPM's internal
method rebuilds an indexed earnings history from actual and deemed pay, computes
an average indexed monthly figure, applies the Social Security bend-point
formula for the year the supplement commences, applies the age-62 reduction, and
only then prorates by service over 40.

The shorthand is what OPM gives employees for estimating, and reproducing the
full method would require an earnings history the app deliberately does not
collect. The divergence is recorded on the assumptions page rather than hidden.

## Re-running

`npx vitest run src/lib/calculations/__tests__/opmDifferential.test.js`

Re-read the sources when OPM revises a handbook chapter, and update the
`lastVerified` dates in `src/lib/rules/registry.js` at the same time.


---

# Part 2: the IRS and SSA

Run 2026-09-07, after the OPM pass. The FERS rules had never been checked
against a primary source and yielded two defects, so the same treatment was
applied to the tax and Social Security rules, which had also never been checked.

## Sources

| Source | Used for |
|---|---|
| IRS Publication 915 (2025), *Social Security and Equivalent Railroad Retirement Benefits* | Worksheet 1 line by line, its two filled-in examples, the statutory base amounts and second-tier widths |
| SSA, *Starting Your Retirement Benefits Early* | the full retirement age table and the reduction at 62 for all seven cohorts |
| SSA Office of the Chief Actuary, *Early or Late Retirement?* | the 5/9 and 5/12 of one percent rules, and the delayed retirement credit table by birth year |
| IRS Notice 2022-6 | the 5% floor on the interest rate for substantially equal periodic payments |

Publication 915 was downloaded and its text extracted rather than read through
a summary. The two SSA pages block automated fetching, so they were read in a
browser.

## Result

25 assertions, 24 in agreement on the first run.

A clean first run is a reason for suspicion rather than satisfaction, so the
edge cases most likely to be wrong were then probed directly: the
married-filing-separately case with no base amount, the exact tier boundary at
$34,000 and one dollar above it, and the pre-1943 birth cohorts. That probe
found the one divergence below.

### Finding: the delayed retirement credit was hardcoded at 8%

**Severity: low, and academic in practice.** The code applied 2/3 of one percent
a month, 8% a year, to every birth year. SSA's table runs from 3.0% for those
born 1917–24 up to 8.0% only for 1943 and later.

Someone born in 1930 claiming at 70 was credited 40% rather than the correct
22.5%. Nobody planning a federal retirement today is outside the 8% band, so no
plausible user was affected. It is fixed anyway: a rate that is wrong for some
inputs has to be reasoned about every time it is read, and the table is smaller
than the caveat would have been.

## What agreed

- Publication 915 Worksheet 1, Example 1 to the dollar: a single filer with
  $5,980 of benefits and $28,990 of other income has $2,990 taxable
- Worksheet 1, Example 2: a couple with $28,750 of other income after an IRA
  deduction and $5,600 of benefits has none taxable, as the publication states
  in words
- The statutory base amounts, $25,000 and $32,000, and the second-tier widths,
  $9,000 and $12,000
- The 85% ceiling on the taxable portion
- A married-separate filer who lived with their spouse gets no base amount and
  is taxed on 85%
- The tier boundary behaves correctly at exactly $34,000 and at one dollar above
- The full retirement age table for all seven cohorts, and the reduction at 62
  for each: a $1,000 benefit becomes $750, $741, $733, $725, $716, $708 and
  $700, matching SSA's published figures after its round-down
- 5/9 of one percent for the first 36 months and 5/12 beyond, reproducing SSA's
  own arithmetic that 36 months plus 24 months is a 30% reduction
- The credit stops accruing at 70
- The 5% floor on the SEPP interest rate under Notice 2022-6

## Combined result across both parts

| Authority | Assertions | Defects found |
|---|---|---|
| OPM | 23 | 2 |
| IRS and SSA | 25 | 1 |

The three defects were: the minimum retirement age hardcoded at 57, discontinued
service retirement not modeled, and the delayed retirement credit hardcoded at
8%. The first was user-affecting and shipping.
