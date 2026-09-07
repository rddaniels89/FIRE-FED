# Practitioner review worksheet

Reviewer: ____________________  Date: ____________  Hours: ______

For each rule, mark one verdict and add a note where the verdict is not
"Agree". Rule ids match `src/lib/rules/registry.js` and the "How was this
calculated" control in the app.

Verdicts: **A** agree · **Q** agree with a qualification · **D** disagree
(state the correct rule and source) · **?** outside my expertise

| # | Rule id | Rule as implemented | Verdict | Note |
|---|---|---|---|---|
| 1 | fers.eligibility | MRA+30, 60+20, 62+5 unreduced; MRA+10 reduced; deferred with 5+ years; VERA 50/20 or any/25 when offered; special provisions 50/20 or any/25 | | |
| 2 | fers.mra10_reduction | 5/12 of 1% per full month under 62, on the annuity's commencement age; removed by postponing to 62 | | |
| 3 | fers.multiplier | 1.0%; 1.1% only when age 62 or older with 20+ years at separation; not earned by a deferred or postponed annuity beginning at 62 | | |
| 4 | fers.sick_leave | 2,087 hours = one year, computation only, immediate annuities only | | |
| 5 | fers.survivor | 10% reduction for a 50% survivor annuity, 5% for 25%, survivor share from the annuity before reduction | | |
| 6 | fers.deferred_freeze | Deferred and postponed annuities computed on the separation-day High-3 with no COLA until commencement | | |
| 7 | cola.diet | CPI ≤2 → CPI; 2 to 3 → 2; above 3 → CPI−1; none before 62 except special provisions and disability | | |
| 8 | fers.contribution_rate | 0.8% before 2013, 3.1% in 2013, 4.4% from 2014 | | |
| 9 | fers.refund | Contributions plus Treasury interest (4.25% for 2026) when no annuity is taken; forfeits the annuity for that service | | |
| 10 | leave.lump_sum | Unused annual leave paid at the separation hourly rate, 2,087 hours per year | | |
| 11 | srs.amount | Age-62 Social Security estimate × civilian FERS years ÷ 40 | | |
| 12 | srs.earnings_test | Under-FRA exempt amount ($24,480 for 2026), $1 withheld per $2 above; special provisions exempt until MRA | | |
| 13 | srs eligibility | Immediate unreduced only; VERA payable from MRA; special provisions immediately; never MRA+10, deferred, postponed; ends at 62 | | |
| 14 | fehb.five_year | Five years or since first opportunity; continues on immediate; suspended and reinstated on postponed; lost permanently on deferred | | |
| 15 | healthcare.medicare | Part B at 65 ($202.90 in 2026), FEHB kept or dropped alongside; IRMAA on MAGI two years prior | | |
| 16 | tsp.access | Penalty-free from separation in or after the year of turning 55 (50 public safety), else 59½; 10% otherwise | | |
| 17 | tsp.sepp | 72(t) amortization over single life expectancy; longer of five years or to 59½ | | |
| 18 | tsp.roth_ladder | Roth contributions accessible after rollover to an IRA; conversions seasoned five years; earnings qualified at 59½ with five years | | |
| 19 | ss.claiming_factor | 5/9% per month for 36 months, 5/12% beyond; 2/3% per month delayed credit to 70 | | |
| 20 | ss.fra | FRA by birth year; birth year approximated as current year minus age | | |
| 21 | ss.taxation | Provisional-income worksheet, 50% and 85% tiers | | |
| 22 | tax.federal | 2026 brackets and deductions by filing status, senior deductions, LTCG stacking | | |
| 23 | tax.state | Flat effective rate with federal-pension and Social Security exemption flags | | |
| 24 | timeline.withdrawal_order | Cash → taxable → Roth basis → seasoned conversions → Traditional → Roth earnings | | |
| 25 | timeline.sustainable | Sustainable when no year records a shortfall through the end age | | |
| 26 | fire.date | Earliest whole-year separation age at which the plan is sustainable | | |

## Simplifications (say whether each is acceptable for a planning tool)

| # | Simplification | Acceptable? | Note |
|---|---|---|---|
| S1 | Ages in whole years, not dates | | |
| S2 | Future High-3 projected from salary growth or the GS career path | | |
| S3 | Roth TSP treated as rolled to a Roth IRA at separation | | |
| S4 | Military deposits not folded into timeline service | | |
| S5 | FEHB default premiums and an assumed growth rate | | |
| S6 | State tax as a flat rate | | |
| S7 | Social Security PIA from the statement, grown at inflation | | |
| S8 | No required minimum distributions | | |
| S9 | No spousal or survivor Social Security | | |
| S10 | Working-year surplus saved as cash by default | | |

## Anything missing

Rules or situations common enough that a planning tool must handle them:

1.
2.
3.

## Overall

Would you be comfortable with a federal employee using this tool to form a
first estimate, provided they confirm with their agency and OPM before acting?
Yes / Yes with the changes above / No. Why:
