# Military module release gates

The definition of done from the build spec (§16, §20.21, §20.22), with the
state of each gate on 2026-09-20 at the end of pass 10. A gate is **green**
when a test or artefact in this repository proves it, **human** when it needs
a named reviewer, and **infra** when it lives outside this codebase.

## Code gates

| Gate | State | Evidence |
|---|---|---|
| Public calculator and saved plan call the same versioned calculation | green | `calculateMilitaryRetiredPay` is the only engine; `connect.js` stores `engineVersion`, `rulesVersion`, `inputHash`; `reserve.test.js` "connecting a calculation" |
| Final Pay, High-36, REDUX/CSB, BRS, non-regular Reserve golden cases pass for every supported status | green (internal goldens) / human (official goldens) | `retirement.test.js`, `reserve.test.js`; official MyArmyBenefits and DFAS reconciliations are listed in `docs/MILITARY-VERIFICATION.md` |
| Every result exposes pay base, service basis, multiplier, reductions, rounding, first-payment date, COLA policy, source/rule version | green | result cards and formula audit in `PublicMilitaryRetirementCalculator.jsx`; `militaryReport.test.js` |
| Anonymous results usable without an account and not persisted, logged, or placed in URLs | green | the calculator has no `useSearchParams`; e2e "does not put values in the URL"; `telemetryRedaction.test.js` |
| Every supported persona has an end-to-end acceptance test | green | `tests/e2e/military.spec.js` (federal veteran), `military-calculator.spec.js` (active and Reserve) |
| Every unsupported condition produces a visible block or manual-entry path | green | `MILITARY_RESULT_STATUS.NOT_SUPPORTED` and `OFFICIAL_DETERMINATION_REQUIRED` render through `MilitaryIssues`; `status.test.js` |
| No military year enters the FERS supplement numerator | green | `militaryBuckets.test.js` case 22 |
| Military credit cannot satisfy the five civilian years or the special-provision minimum | green | `militaryBuckets.test.js` cases 18, 23; `militaryCredit.test.js` |
| Official deposit amount overrides the estimate without data loss | green | `deposit.test.js` case 4; `depositComparison.test.js` |
| Regular retired-pay cases cannot receive military credit silently | green | `retiredPayWaiver.test.js` case 24; `fersCredit.test.js` |
| Chapter 61 / CRDP / CRSC cases cannot enter unsupported automatic logic | green | `retiredPayWaiver.test.js` case 27; `special.test.js`; `incomeStreams.test.js` official-only |
| TSP shared limits and tax-exempt basis pass golden tests | green | `tspCoordination.test.js` cases 33–40; `militaryTspCoverage.test.js` |
| TRS/TRR/FEHB, TFL/Part B, CHAMPVA/TRICARE conflicts enforced with effective-dated rules | green | `coverage.test.js` cases 41–46 |
| All income streams have explicit federal and state tax status | green | `STREAM_TYPE_RULES`; `incomeStreams.test.js` cases 28–32 |
| All new tables pass RLS/IDOR tests | n/a → infra | no new tables: the military block lives in the scenario JSONB under the existing scenario RLS. Re-run the existing scenario RLS tests at release |
| No sensitive military/VA/health data in analytics, URLs, logs, session replay | green (client) / infra (Sentry, replay) | `sanitizeTelemetryProperties` allow list; `telemetryRedaction.test.js`; session replay is not enabled in `telemetry.js` |
| Account export and deletion include all new data | green (scenario) / infra (account) | the military block is part of the scenario JSON that scenario import/export and delete already handle (`schema.test.js` round trip); "Delete all military data" in the section. Account-level export/deletion is the Supabase account flow, unchanged |
| PDF and UI show the same inputs, outputs, status labels, sources, rules version | green | `militaryReport.test.js`; household report military section reads `plan.military` like the page |
| WCAG 2.2 AA review passes | human | keyboard e2e in `military.spec.js`; full audit is a human gate |
| Official-source freshness checks pass | human | `docs/ANNUAL-UPDATE.md` calendar; `MILITARY-VERIFICATION.md` pending table |
| Rollback and rules-version recovery tested | green (logic) / infra (deploy) | `sbp.test.js` case 50: prior snapshots survive a rules bump; deploy rollback is the platform's |
| Saved calculator result cannot be edited independently from the stream that references it | green | `connect.js`: the stream carries no amount, `resolveMilitaryIncomeStreams` reads the calculation; `MRT_DUPLICATE_PLAN_INCOME` |
| Official reconciliation differences outside tolerance show a blocking diagnostic, not a hidden adjustment | green | `MRT_OFFICIAL_RECONCILIATION_MISMATCH`; `retirement.test.js` "reconciles against an official estimate" |
| Medical, TERA, SBP hard-stop tests | green | `special.test.js`, `sbp.test.js` |

## Human gates (§16, §20.21) and what each reviewer receives

| Gate | Reviewer | Packet |
|---|---|---|
| Federal-retirement SME sign-off | a FERS benefits specialist | `docs/MILITARY-VERIFICATION.md` (deposit, credit buckets, waiver paths), `MILITARY-ROADMAP.md` passes 1–3 and 5, the Methodology page military and FERS rules, `deposit.test.js` and `militaryBuckets.test.js` as the case list |
| Military-benefits SME sign-off | a retired-pay / RSO specialist (active and Reserve) | the calculator at `/calculators/military-retirement`, `retirement.test.js`, `reserve.test.js`, `special.test.js`, `sbp.test.js`, the pending rows in `MILITARY-VERIFICATION.md` (first-COLA proration, YOS band anniversary, former-member pay base, lump-sum algorithm, SBP premium formula) |
| Counsel review of the VA-claims boundary and non-affiliation copy | counsel | the copy in `status.js` (every message and remediation), `PublicMilitaryRetirementCalculator.jsx` constants, `MilitaryNotice`, spec §11.5–11.6 and §12, the FTC Health Breach Notification question (§11.4) |
| WCAG 2.2 AA review | accessibility reviewer | the inputs section, the plan page, the calculator, the PDF; the keyboard e2e as a starting point |
| De-identified DFAS statements and MyArmyBenefits runs for golden reconciliation | SME with permission-holding retirees | the golden-case table in `MILITARY-VERIFICATION.md`; add each case as a fixture with tolerance and rounding convention recorded |
| Private beta across personas | product | veteran fed with deposit; Guard member who is a fed (TRS/FEHB, dual TSP); active retiree with CRDP; surviving spouse with SBP and DIC; BRS member; Chapter 61 retiree |

## Data still marked `[-]`

See "Data that needs a human eye before release" in `MILITARY-ROADMAP.md` and the
pending table in `docs/MILITARY-VERIFICATION.md`. None of it is used silently:
each item carries an issue code on the result it affects.

## Feature flags

Material rules can be turned off without disabling manual official-income entry:
set the affected path's result to `NOT_SUPPORTED` in `calculateMilitaryRetiredPay`
(the `MRT_PATH_UNSUPPORTED` branch) and the stream types keep working from
official amounts. Pro gating (`MILITARY_SCENARIOS`, `MILITARY_ANALYSIS`) never
hides a warning.
