# Military module: verification record

What each military calculation rests on, what has been checked against a
primary source, and what is still waiting for a human with the source in
hand. A row moves out of "pending" only with the reviewer's name, the date,
and the document checked. Nothing that depends on a pending row is shown as
more than an estimate.

## Pending human verification

| Item | Where it lives | What to check | Source |
|---|---|---|---|
| Payment order across periods | `src/lib/military/deposit.js` `projectMilitaryDepositBalance` | payments are applied to the oldest unpaid period first unless the agency records a different allocation | Handbook ch. 23; agency practice |
| Title 32 creditability without a USERRA interruption | `src/lib/military/servicePeriods.js` | held for determination; confirm no other creditable case exists | Handbook ch. 22 §22A4 |
| Chapter 22 and 23 worked examples | `src/lib/military/__tests__/deposit.test.js` | reproduce the Handbook's deposit examples to the cent and add them as golden cases; the current goldens reproduce OPM's composite-rate tables, not the Handbook examples | CSRS/FERS Handbook ch. 22 and 23 |
| State treatment of military retired pay, all 42 taxing jurisdictions | `src/lib/taxes/stateMilitaryRetiredPay.js` | each state's treatment, exclusion amount, age condition and effective window against the state's current-year instructions; set `verified` to the source and `reviewedOn` to the date. Until then the plan taxes the pay in full and flags it | each state department of revenue |
| SBP/RCSBP annuity state treatment | same | whether each state's military exclusion extends to survivor annuities | each state department of revenue |
| Basic pay tables 2024 and 2025 | `src/lib/military/retirement/payTables.js` | replace the derived tables (2026 rates with the across-the-board raise removed; E-1 to E-4 excluded) with the published tables, including the April 2025 junior-enlisted rates; then set `derived: false, verified: true` | DFAS / DoD pay tables for 2024 and 2025 |
| First retired-pay COLA proration by quarter of retirement | `src/lib/military/retirement/cola.js` `FIRST_COLA_SHARE_BY_QUARTER` | Q1 half, Q2 quarter, Q3 none then full, Q4 three quarters next December | DoD FMR Vol. 7B ch. 8 |
| Years-of-service band boundary | `src/lib/military/retirement/payTables.js` `yosBandIndex` | the "over N" rate starts on the anniversary of the pay entry base date (exactly N years is "over N") | DoD FMR Vol. 7A ch. 1 |
| Regular retirement goldens | `src/lib/military/retirement/__tests__/retirement.test.js` | reconcile Final Pay, High-36, REDUX, and BRS fixtures against the MyArmyBenefits calculator and a de-identified DFAS estimate | MyArmyBenefits; DFAS |
| Reserve former-member pay base | `src/lib/military/retirement/calculate.js` (`yosFreezeDate`) | a member discharged rather than transferred to the Retired Reserve is paid at the years of service held at discharge, priced from the table in force when pay begins; a Retired Reserve member's years keep accruing until pay begins | 10 U.S.C. 1407(f); DoD FMR Vol. 7B ch. 1 |
| Reduced-age aggregation dates | `src/lib/military/retirement/reserve.js` | qualifying days aggregate within one fiscal year for duty before 1 October 2014 and across fiscal years since; the authority list for qualifying orders | 10 U.S.C. 12731(f)(2); Pub. L. 113-291 §512 |
| Inactive-duty point ceilings by date | `src/lib/military/retirement/reserve.js` `INACTIVE_POINT_CAPS` | 60 before 1996-09-23, 75 through 2000-10-29, 90 through 2007-10-29, 130 since; membership points count toward the ceiling | 10 U.S.C. 12733(3) |
| Reserve retired-pay goldens | `src/lib/military/retirement/__tests__/reserve.test.js` | reconcile the points-based fixtures against a de-identified Reserve retirement estimate | service retirement estimate (ARPC/HRC/NPC) |
| TRICARE costs 2026 | `src/lib/military/tricareCosts.js` | replace the 2025 TRS, TRR, CHCBP premiums and the Prime/Select Group A retiree fees with the 2026 published amounts (add Group B if needed); set `TRICARE_COSTS_YEAR = 2026`, `TRICARE_COSTS_VERIFIED = true` | tricare.mil/Costs and the TRS, TRR, CHCBP plan pages |
| BRS lump-sum discount rate | `src/lib/military/brs.js` `BRS_LUMP_SUM_DISCOUNT_RATES` | load the current calendar year's rate and memorandum; the scenario is blocked until then | OUSD (P&R) annual memorandum on the BRS lump-sum discount rate |
| BRS lump-sum algorithm | `src/lib/military/brs.js` `lumpSumScenario` | the COLA assumption inside the discounting, month-of-payment timing, installment rules, and rounding against the DoD technical reference; the code discounts the elected share month by month at the annual rate with the user's COLA assumption | DoD FMR Vol. 7B; 10 U.S.C. 1415 implementing guidance |
| TRR versus FEHB restriction | `src/lib/military/coverage.js` `COVERAGE_RULES.trrFehbConflict` | whether the 2030 TRS change (Pub. L. 116-92 §701) also reaches TRICARE Retired Reserve; the code keeps the TRR restriction open-ended | 10 U.S.C. 1076e; tricare.mil TRR page |
| BRS opt-in matching start | `src/lib/military/tspCoordination.js` `serviceContributionPercents` | 2018 opt-ins with two or more years of service received matching from the first pay period after opting in; those with less waited for the 25th month | DoD BRS implementation guidance; TSP bulletin for uniformed services |
| FERS TSP vesting for two-year positions | `src/lib/military/tspCoordination.js` `TSP_CONTRIBUTION_RULES.fers.vestingYearsAutomatic` | the default is three years; the two-year positions (congressional, certain noncareer) use the per-account override | 5 U.S.C. 8432(g) |

## Verified

| Item | Checked against | By | Date |
|---|---|---|---|
| Deposit interest rates 1985–2017 | OPM Benefits Officers Center, Reference Materials, "Interest Rates" table | build (web lookup) | 2026-09-20 |
| 2018 rate 2.125% | BAL 17-306 | build | 2026-09-20 |
| 2019 rate 2.750% | BAL 18-306; 1 January value of the 2020 composite table | build | 2026-09-20 |
| 2020 rate 2.250% | BAL 19-308; derived from the 1 December value of the 2020 composite table | build | 2026-09-20 |
| 2021 rate 1.375% | BAL 20-307; 1 January value of the 2022 composite table | build | 2026-09-20 |
| 2022 rate 1.375% | 2022 composite table is 1.375% for every accrual date | build | 2026-09-20 |
| 2023 rate 1.875% | BAL 23-301 | build | 2026-09-20 |
| 2024 rate 3.750% | BAL 24-301 | build | 2026-09-20 |
| 2025 rate 4.375% | BAL 25-301 | build | 2026-09-20 |
| 2026 rate 4.250% | BAL 26-301 (matches `annualParameters.fers.refundInterestRate`) | build | 2026-09-19 |
| Composite rate construction: prior-year rate before 1 January, new-year rate after, 30-day months | BAL 24-301 attachment (e.g. 1 Feb 2024 IAD = 0.02031; 1 Dec 2024 = 0.03594; day-of-month step = rate difference ÷ 360); 2020 attachment (1 Jan = 0.02750, 1 Dec = 0.02292) | build; reproduced by `deposit.test.js` "reproduces OPM's composite tables" | 2026-09-20 |
| Interest assessed on the IAD anniversary on the then-unpaid balance, compounded annually; a remittance received before the anniversary reduces the balance charged | BAL 24-301 and 23-301 text | build | 2026-09-20 |
| Two-year interest-free period; first interest at the third anniversary of coverage | 5 U.S.C. 8422(e)(3); USGS military-deposit page restating OPM | build | 2026-09-20 |
| Deposit rates 3% / 3.25% (1999) / 3.40% (2000) | Handbook ch. 23 §23A2.1-1; OPM military-deposits webcast | build | 2026-09-20 |
| Service buckets: military counts toward eligibility and computation, never the five civilian years, High-3, supplement numerator, or covered special-provision service | OPM types-of-retirement page; Handbook ch. 51 | build; pinned by `militaryBuckets.test.js` and `militaryCredit.test.js` | 2026-09-19 |
| VA disability compensation rates, 10%–100%, all dependent columns and add-ons, effective 2025-12-01 | va.gov veteran rates page, retrieved 2026-09-20 | build; pinned by `incomeStreams.test.js` | 2026-09-20 |
| DIC surviving-spouse basic rate and add-ons, effective 2025-12-01 | va.gov DIC survivor rates page, retrieved 2026-09-20 | build | 2026-09-20 |
| Federal tax character by stream: retired pay and CRDP taxable; VA compensation, DIC, CRSC, BAH/BAS not taxable; SBP taxable; disability retired pay per official classification | IRS Publications 525 and 3; IRC 104(a)(4), 122; 38 U.S.C. 5301 | build; pinned by `incomeStreams.test.js` | 2026-09-20 |
| SBP not offset by DIC since 1 January 2023 | Pub. L. 116-92 §622 (FY2020 NDAA), phase-in complete 2023 | build; pinned by `incomeStreams.test.js` case 32 | 2026-09-20 |
| Retired pay and FERS credit: not creditable while receiving military retired pay except (a) retired pay for a disability incurred in combat or caused by an instrumentality of war, (b) chapter 1223 Reserve retired pay; otherwise the retiree may waive retired pay effective the day before the FERS annuity begins, and the post-1956 deposit is still required before separation | OPM military retired pay page, retrieved 2026-09-20; 5 U.S.C. 8411(c)(2) | build; pinned by `retiredPayWaiver.test.js` | 2026-09-20 |
| 2026 basic pay table, every grade and band, incl. E-1 under 4 months and the senior enlisted rate | DFAS basic pay pages (EM, WO, CO, CO_FE), read 2026-09-20; pages updated 2026-01-12 (titles still say 2025; every cell equals the 2025 rate raised 3.8%) | build; pinned by `retirement.test.js` | 2026-09-20 |
| Retired-pay multipliers: 2.5% legacy, REDUX reduced one point per year short of 30, Final Pay and High-36 bases | DoD Active Duty Retirement page, retrieved 2026-09-20 | build | 2026-09-20 |
| Gross retired pay rounded down to the next lower dollar | 10 U.S.C. 1412 | build | 2026-09-20 |
| Multiplier service in whole years and full months, days disregarded | 10 U.S.C. 1405(b) | build | 2026-09-20 |
| 75% cap only for retirements before 1 January 2007 | 10 U.S.C. 1409(b)(3) as amended by Pub. L. 109-364 §642 | build | 2026-09-20 |
| High-36 is the highest 36 months whether or not consecutive | 10 U.S.C. 1407; DoD FMR Vol. 7B ch. 3 | build; pinned by `retirement.test.js` | 2026-09-20 |
| Qualifying year = 50 or more points; 20 qualifying years required | 10 U.S.C. 12731(a), 12732(a) | build; pinned by `reserve.test.js` | 2026-09-20 |
| Equivalent service for the multiplier = points ÷ 360 | 10 U.S.C. 12733 | build; pinned by `reserve.test.js` | 2026-09-20 |
| Reduced retired-pay age: three months per aggregate 90 days of qualifying duty since 28 January 2008, floor age 50; retiree health coverage unchanged at 60 | 10 U.S.C. 12731(f); Pub. L. 110-181 §647 | build; pinned by `reserve.test.js` | 2026-09-20 |
| 2026 elective deferral $24,500, catch-up $8,000, ages 60–63 $11,250, annual additions $72,000 | IRS Notice 2025-67 | build; pinned by `tspCoordination.test.js` | 2026-09-20 |
| Elective-deferral limit shared across civilian and uniformed-services TSP; tax-exempt combat-zone traditional contributions outside 402(g) and inside 415(c); agency/service contributions outside 402(g) | TSP fact sheet 07; IRS Pub. 3 | build; pinned by `tspCoordination.test.js` cases 33 and 36 | 2026-09-20 |
| BRS: 1% automatic after 60 days, matching from the 25th month, both through 26 years; automatic vests at two years; FERS automatic vests at three | 37 U.S.C. 8440e; 5 U.S.C. 8432b; DoD BRS page; tsp.gov contribution types | build; pinned by cases 38–39 | 2026-09-20 |
| TRS unavailable to FEHB-eligible members until 1 January 2030 | 10 U.S.C. 1076d(a)(1) as amended by Pub. L. 116-92 §701 | build; pinned by `coverage.test.js` case 41 | 2026-09-20 |
| TFL requires Medicare Parts A and B; CHAMPVA excluded for TRICARE-eligible persons; TAMP 180 days; CHCBP 18 months (members) / 36 months (others) | 10 U.S.C. 1086(d), 1145, 1078a; 38 U.S.C. 1781; TRICARE plan pages | build; pinned by cases 43–46 | 2026-09-20 |

## Corrections made during verification

| Item | Was | Is | Found by |
|---|---|---|---|
| 2018 deposit interest rate | 2.75% | 2.125% | BAL 17-306 |
| 2023 deposit interest rate | 3.50% | 1.875% | BAL 23-301 |
| 2024 deposit interest rate | 4.75% | 3.750% | BAL 24-301 |
| Day count within an accrual year | actual days ÷ days in year | 30-day months ÷ 360 | BAL composite tables |
