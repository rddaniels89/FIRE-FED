# FireFed methodology review packet

Prepared for an independent review by a practitioner experienced in federal
retirement benefits (a retired OPM or agency benefits specialist, a ChFEBC, or a
federal-benefits-focused CFP). This packet is ROADMAP item 48. The review has
not yet happened; when it has, the findings and the changes they prompted will
be published on the assumptions page and linked from here.

## What FireFed claims

FireFed is an educational projection tool. It models one federal employee's
path from today through separation and retirement as a single year-by-year
cash flow, and reports the earliest separation age at which that cash flow
never runs dry under stated assumptions. It does not give individualized
financial advice, and its wording is kept to "projected" and "under these
assumptions" throughout.

No practitioner review has been commissioned, and none is planned. In its
place the model is checked by differential testing against OPM's own published
figures: see `src/lib/calculations/__tests__/opmDifferential.test.js`, which
asserts against the CSRS/FERS Handbook Chapters 50 and 51 and OPM's eligibility
table. The findings from the first run are in `docs/DIFFERENTIAL-TESTING.md`.

## What we would like reviewed

For each rule below: is the rule stated correctly, is the source the right
one, and are the simplifications acceptable for a planning tool? Every rule
has a test that pins the computation; the reviewer can read the test as a
worked example.

| Area | Rule as implemented | Code | Tests |
|---|---|---|---|
| Eligibility | MRA+30, 60+20, 62+5 unreduced; MRA+10 reduced 5/12% per month under 62; deferred with 5+ years; VERA 50/20 or any/25 when offered; special provisions 50/20 or any/25 | `src/lib/calculations/retirementPaths.js`, `fers.js`, `specialProvisions.js` | `__tests__/retirementPaths.test.js`, `goldenCases.test.js`, `opmConformance.test.js` |
| Service | Years and months carried; sick leave credited only on immediate annuities and only for computation; High-3 at separation grown from today's salary or from a GS career path | `fers.js`, `projection/plan.js`, `careerProjection.js` | `fers.test.js`, `careerProjection.test.js` |
| Multiplier | 1.0%; 1.1% at 62 with 20 years at separation; not earned by a deferred or postponed annuity that merely begins at 62, nor by a special provision computation | `fers.js` | `goldenCases.test.js`, `opmDifferential.test.js` |
| Minimum retirement age | 55 to 57 by year of birth on OPM's table, derived from the stored age unless overridden | `mra.js` | `opmDifferential.test.js` |
| Survivor | 10% reduction for 50%, 5% for 25%, survivor share computed before the reduction | `fers.js` | `fers.test.js` |
| COLA | Diet COLA (CPI ≤2 → CPI; 2–3 → 2; >3 → CPI−1); none before 62 except special provisions | `cola.js` | `cola.test.js` |
| Deferred freeze | Deferred and postponed annuities computed on the separation-day High-3, no COLA until commencement | `projection/plan.js` | `timeline.test.js` |
| SRS | SS-at-62 × civilian years / 40; immediate unreduced only; VERA payable from MRA; special provisions paid immediately and exempt from the earnings test until MRA; ends at 62; earnings test with the under-FRA exempt amount | `srs.js`, `ssaEarningsTest.js` | `srs.test.js` |
| FEHB | Five-year rule; continues on immediate; suspended/reinstated on postponed; lost on deferred; premiums grown at an assumed rate; Medicare Part B at 65 with FEHB kept or dropped; IRMAA two-year lookback | `fehb.js`, `healthcareCosts.js` | `specialProvisionsAndFehb.test.js`, `healthcareCosts.test.js` |
| TSP access | Penalty-free from separation in or after the year of turning 55 (50 public safety), else 59½; 72(t) amortization over single life expectancy; Roth contributions accessible once rolled to an IRA; conversions seasoned five years; Roth earnings qualified at 59½ with five years | `tspAccess.js` | `tspAccess.test.js` |
| Contributions | FERS 0.8/3.1/4.4% by hire cohort; TSP elective and catch-up limits; 1% automatic plus 4% match | `fers.js`, `contributionLimits.js`, `tsp.js` | `tsp.test.js`, `contributionLimits.test.js` |
| Refund and leave | Refund of contributions with interest when no annuity is taken; annual leave lump sum at the separation hourly rate | `fers.js` | `goldenCases.test.js` |
| Social Security | FRA by birth year; reduction 5/9% per month for 36 months then 5/12%; delayed credits 2/3% per month to 70; optional Trustees haircut | `socialSecurity.js` | `socialSecurity.test.js` |
| Taxes | 2026 brackets and deductions by filing status; senior deductions; LTCG stacking; provisional-income taxation of Social Security; state flat rate with pension and SS exemptions; FICA on wages | `src/lib/taxes/*` | `src/lib/taxes/__tests__/*` |
| Timeline | Funding order cash → taxable → Roth basis → seasoned conversions → Traditional → Roth earnings; penalties; fixed-point tax iteration; surplus kept as cash | `projection/timeline.js` | `timeline.test.js`, `timelineFixtures.test.js` |

## Known simplifications the reviewer should weigh

1. Ages, not dates. FireFed stores ages in whole years and derives birth year
   as current year minus age. The year-of-turning-55 TSP rule and the
   month-based MRA+10 reduction are therefore approximated to the year.
2. The High-3 at a future separation is projected from today's salary at the
   assumed growth rate, or from the GS career path when enabled. It is not a
   36-month average of actual pay.
3. The 1.1% multiplier is keyed on age at separation: a deferred or postponed
   annuity that begins at 62 with 20 years is computed at 1.0%. This is the
   conservative reading of 5 U.S.C. 8415(h) ("at the time of retirement");
   please confirm.
4. Roth TSP withdrawals are modeled as if rolled to a Roth IRA at separation,
   making contributions accessible first. The TSP itself pays pro rata.
5. Military service deposits are modeled separately (`militaryDeposit.js`) and
   not yet folded into the timeline's service years.
6. FEHB premiums use a nationwide default enrollee share unless the user
   enters their own; growth is an assumption.
7. State taxes are a flat effective rate with exemption flags, not full state
   returns.
8. Social Security's PIA is taken from the user's statement (or a crude
   percent-of-salary estimate) and grown at inflation; no wage indexing or
   bend-point computation.
9. Required minimum distributions are not modeled.
10. Spousal and survivor Social Security benefits are not modeled.
11. The supplement uses OPM's published shorthand (the age-62 benefit prorated
    by service over 40) rather than OPM's full internal method, which rebuilds
    an indexed earnings history and applies the Social Security bend-point
    formula. OPM itself gives the shorthand to employees for estimating.

## Questions for the reviewer

- Are there eligibility or computation edge cases common enough that a
  planning tool must model them (e.g. part-time service proration, CSRS
  Offset, FERS transferees)?
- Is our reading of the SRS earnings test (always the under-FRA case) right?
- Is the deferred-annuity 1.1% treatment right?
- Any objection to the default assumptions on the assumptions page?

## How to reproduce a number

Every headline number has a "How was this calculated" control in the app that
shows the formula, the inputs used, and the source. The assumptions page
lists every rule with its source URL, rule year and last-verified date.
