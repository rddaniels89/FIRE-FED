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

## Corrections made during verification

| Item | Was | Is | Found by |
|---|---|---|---|
| 2018 deposit interest rate | 2.75% | 2.125% | BAL 17-306 |
| 2023 deposit interest rate | 3.50% | 1.875% | BAL 23-301 |
| 2024 deposit interest rate | 4.75% | 3.750% | BAL 24-301 |
| Day count within an accrual year | actual days ÷ days in year | 30-day months ÷ 360 | BAL composite tables |
