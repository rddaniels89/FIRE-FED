# Military module: verification record

What each military calculation rests on, what has been checked against a
primary source, and what is still waiting for a human with the source in
hand. A row moves out of "pending" only with the reviewer's name, the date,
and the document checked. Nothing that depends on a pending row is shown as
more than an estimate.

## Pending human verification

| Item | Where it lives | What to check | Source |
|---|---|---|---|
| Deposit interest rates 1985–2024 | `src/lib/military/depositRates.js` | every rate against OPM's published variable-rate table; set `verified: true` per year | OPM creditable-service page; Benefits Administration Letters by year |
| Interest posting convention | `src/lib/military/deposit.js` `projectMilitaryDepositBalance` | interest is posted on each IAD anniversary, compounded; a payoff before the first posting carries none; interest accrued since the last posting is forgiven when the balance is cleared mid-year | CSRS/FERS Handbook ch. 23; one de-identified agency deposit computation |
| Interest proration across calendar years | same | an accrual year spanning two calendar years uses each year's rate for its own days; an agency worksheet may apply one rate | same |
| Payment order across periods | same | payments are applied to the oldest unpaid period first unless the agency records a different allocation | Handbook ch. 23; agency practice |
| Title 32 creditability without a USERRA interruption | `src/lib/military/servicePeriods.js` | held for determination; confirm no other creditable case exists | Handbook ch. 22 §22A4 |
| Chapter 22 and 23 worked examples | `src/lib/military/__tests__/deposit.test.js` | reproduce the Handbook's deposit examples to the cent and add them as golden cases; the current goldens are hand-computed from the stated rules | CSRS/FERS Handbook ch. 22 and 23 |

## Verified

| Item | Checked against | By | Date |
|---|---|---|---|
| 2026 deposit interest rate 4.25% | OPM BAL 26-301 | build (matches `annualParameters.fers.refundInterestRate`, verified 2026-09-07) | 2026-09-19 |
| 2025 deposit interest rate 4.375% | OPM BAL 25-301 | build | 2026-09-19 |
| Deposit rates 3% / 3.25% (1999) / 3.40% (2000) | Handbook ch. 23 §23A2.1-1 | build | 2026-09-19 |
| Two-year interest-free period | 5 U.S.C. 8422(e)(3) | build | 2026-09-19 |
| Service buckets: military counts toward eligibility and computation, never the five civilian years, High-3, supplement numerator, or covered special-provision service | OPM types-of-retirement page; Handbook ch. 51 | build; pinned by `militaryBuckets.test.js` and `militaryCredit.test.js` | 2026-09-19 |
