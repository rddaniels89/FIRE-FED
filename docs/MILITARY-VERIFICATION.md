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

## Corrections made during verification

| Item | Was | Is | Found by |
|---|---|---|---|
| 2018 deposit interest rate | 2.75% | 2.125% | BAL 17-306 |
| 2023 deposit interest rate | 3.50% | 1.875% | BAL 23-301 |
| 2024 deposit interest rate | 4.75% | 3.750% | BAL 24-301 |
| Day count within an accrual year | actual days ÷ days in year | 30-day months ÷ 360 | BAL composite tables |
