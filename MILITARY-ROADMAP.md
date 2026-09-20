# FireFed military roadmap: ten passes

Builds the Military Retirement Calculator and Military + Federal Plan described in
`FireFed_Military_Module_Build_Spec_2026-09-20.md` (the spec) as ten reviewable
pull requests. Each pass ends green on its own tests and leaves `main` shippable.
Spec section numbers are cited as §n.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` prepared, needs a human

## Architecture decisions (differ from the spec, applied throughout)

1. **Annual timeline stays.** Military, deposit, benefit, and coverage events carry
   exact dates inside their own pure functions and emit annual figures into the
   existing one-row-per-age timeline. No monthly ledger refactor (§2.1, Phase 0).
2. **Client-side engine stays.** No calculation API. Every saved scenario records
   `rulesVersion`; recalculating on load is the integrity check. Anonymous
   previews are trivially unpersisted (§20.16, §20.19).
3. **Schema v4 `military` extension block**, persisted in
   `summary_data.extensions` like every other block. No new Supabase tables, so
   existing row-level security covers it (§7, §20.15).
4. **Public calculator route follows the existing convention**:
   `/calculators/military-retirement`, with `/military-retirement-calculator`
   redirecting to it (§20.1).

Everything else in the spec (statuses, precedence, never-infer list, prohibited
fields, tax character, validation codes, copy, Free/Pro split) is adopted as
written.

## Free vs Pro

Correctness, warnings, one comparison, official-amount entry, and the anonymous
Quick estimate are free. Unlimited scenarios, sensitivity/NPV/Monte Carlo
impact, dual-TSP pay-period coordination, multi-person coverage comparison,
BRS suite, detailed pay-base editor, and PDF are Pro (§13, §20.20). New
entitlement keys are added in Pass 6.

---

## Pass 1 — Foundation: schema block, vocabulary, service periods

Goal: a scenario can carry military facts, and the engine can classify each
service period without touching any dollar figure yet.

- [x] Schema v4: `military` extension block with `connection`, `servicePeriods[]`,
      `deposit`, `incomeStreams[]`, `tsp`, `coverage[]`, `retirementScenarios[]`;
      migration turns `fers.militaryServiceYears` / `militaryDepositPaid` into one
      period with `provenance: 'user_estimate'`, legacy fields kept as mirrors.
      `src/lib/scenarios/schema.js`, `storage.js`.
- [x] `src/lib/military/status.js`: result statuses (§2.2), provenance values
      (§7.11), issue shape `{ code, severity, entity, message, source, remediation }`.
- [x] `src/lib/military/servicePeriods.js`: normalise to half-open intervals, split
      at calendar-year and civilian-employment boundaries, detect overlaps,
      parent/sub-period tagging, classify modelling status (§6.1, §6.2).
- [x] Codes: `MIL_DATES_MISSING`, `MIL_PERIOD_OVERLAP`, `MIL_DUTY_STATUS_UNKNOWN`,
      `MIL_TITLE32_UNKNOWN`, `MIL_CHARACTER_UNKNOWN` (§10).
- [x] Rules registry entries: `military.creditability`, `military.service_duration`,
      `military.deposit_required` with OPM Handbook chapters 22 and 50 as sources (§8, §21).
- [x] Tests: §14.1 cases 11–15; property "unsupported service never increases FERS
      service"; schema round-trip through storage.

Exit: a scenario with three service periods (one drill, one Title 32 unknown, one
active duty) round-trips through storage and classifies deterministically.

## Pass 2 — FERS engine: military credit in the right buckets

Goal: the saved plan stops ignoring military service. Today `militaryServiceYears`
is read only by `AssumptionsPage`.

- [x] `calculateFersResults` accepts `militaryCreditYears/Months`: counts toward
      eligibility and computation; never toward the five civilian years, High-3,
      the SRS numerator, or the special-provision minimum (§4.1).
      `src/lib/calculations/fers.js`, `srs.js`, `specialProvisions.js`,
      `retirementPaths.js`.
- [x] `plan.js` resolves credited years from paid-in-full supported periods only;
      `timeline.js` consumes them; 1.1% at 62/20 evaluated with credit included.
- [x] Codes: `MIL_FIVE_CIVILIAN_YEARS`, `MIL_SRS_EXCLUSION`,
      `MIL_SPECIAL_SERVICE_EXCLUSION`.
- [x] Explanations and `AssumptionsPage` show military years as a separate bucket
      beside sick leave (§5.9).
- [x] Tests: §14.1 cases 18–23; properties "military credit never increases High-3"
      and "never enters the SRS numerator"; OPM differential and conformance tests
      unchanged.

Exit: adding four paid years to a saved plan moves the eligibility date and the
annuity on the timeline, and the FIRE date recomputes.

## Pass 3 — Deposit engine and whole-plan comparison

Goal: replace the `high-3 × years × 1%` shortcut and the recommendation flag.

- [x] `src/lib/military/deposit.js` replaces `calculations/militaryDeposit.js`:
      principal by calendar-year segment with rate by year (3%, 3.25% for 1999,
      3.40% for 2000); interest-free period from first FERS coverage or
      reemployment; annual compounding at OPM rates by year; payments applied by
      date; USERRA lower-of strategy; official-balance mode overrides estimate
      without data loss (§6.3, §6.4, §4.2).
- [x] `src/lib/military/depositRates.js`: deposit rate by year and the variable
      interest rate back to 1985 (kept beside the engine rather than in the
      per-year `annualParameters` blocks; a test pins the current year to
      `fers.refundInterestRate`). `[-]` rates before 2025 are transcribed and need
      human verification against OPM; see `docs/MILITARY-VERIFICATION.md`.
- [x] Whole-plan comparison: run the plan twice (baseline vs credit with deposit
      cash flows) and return the delta: eligibility date, gross and after-tax
      annuity, simple and discounted break-even, NPV, survivor difference (§6.5,
      §6.6). Free: one comparison. Pro: sensitivity and Monte Carlo impact.
- [x] Remove `isWorthPaying`; `FERSPensionCalc` and `PublicFersCalculator` use the
      delta with §12 copy.
- [x] Codes: `MIL_DEPOSIT_AFTER_SEPARATION`, `MIL_DEPOSIT_PARTIAL`,
      `MIL_DEPOSIT_INTEREST_UNVERIFIED`.
- [x] Tests: §14.1 cases 1–10, 16–17; property "partial payment never creates
      more credit than paid in full"; timeline one-off outflow; comparison deltas.
- [-] Golden: reproduce the OPM Handbook chapter 22/23 worked examples to the
      cent (needs the Handbook text in hand; the current goldens are hand-computed
      from the stated rules).

Exit: the deposit engine computes principal by year, interest from dates, and
credit per period; the comparison runs the whole plan twice; no recommendation
language remains. Chapter 22/23 reconciliation is a listed human step.

## Pass 4 — Military and VA income streams with tax character

Goal: VA compensation, retired pay, CRDP, CRSC, DIC, SBP, drill pay, allowances,
and reservist differential enter the timeline as typed streams.

- [ ] `src/lib/military/incomeStreams.js`: stream types (§7.6), federal tax class
      per type (§4.10), COLA policies (military retired-pay, VA/SSA, none, user
      rate, manual schedule), projection from official amount and date (§6.8),
      owner, start/end, amount status, staleness check.
- [ ] Timeline: one income line per stream feeding the existing characterisation
      (ROADMAP #18); state layer gains a versioned military-retired-pay treatment
      per state, reusing the notes already in `stateIncomeTax.js`; unreviewed
      states flag the projection incomplete.
- [ ] VA table-assisted estimate: 2026 compensation table by rating and dependent
      category in `annualParameters.js`, labelled estimate. `[-]` table needs human
      verification against va.gov.
- [ ] Death handling: a stream stops on the owner's death; SBP and DIC start as
      survivor streams with no offset between them (§4.9).
- [ ] Codes: `MIL_CRDP_CRSC_MANUAL`, `MIL_STATE_TAX_UNVERIFIED`,
      `MIL_OFFICIAL_AMOUNT_STALE`.
- [ ] Tests: §14.1 cases 28–32, 48–49; property "tax-exempt income never enters
      federal taxable income"; integration "VA compensation reduces withdrawals but
      not taxable income".

Exit: CRDP and CRSC of equal gross produce different tax results; a VA stream
lowers the FIRE date without changing taxable income.

## Pass 5 — Retired pay and FERS credit: the three paths

Goal: a military retiree with FERS service is handled correctly and never
credited silently.

- [ ] `src/lib/military/retiredPayWaiver.js`: no-retired-pay, waiver-required, and
      regulatory-exception paths (§4.3). Waiver scenario stops the retired-pay
      stream at the FERS annuity start, credits paid periods, recomputes
      eligibility, annuity, taxes, COLA on both streams, survivor inputs (§6.7).
- [ ] Chapter 1223 Reserve retiree path: credit permitted with confirmation.
- [ ] Chapter 61 and unknown-type cases: hard stop, official amount only.
- [ ] §6.7 warning text rendered immediately above every waiver comparison.
- [ ] Codes: `MIL_RETIRED_PAY_TYPE_UNKNOWN`, `MIL_WAIVER_CONFIRMATION_REQUIRED`,
      `MIL_CH61_OFFICIAL_INPUT_REQUIRED`.
- [ ] Tests: §14.1 cases 24–27; integration "waiver scenario flows through survivor
      and tax projections".

Exit: a regular retiree's plan shows no credit until confirmed, and the waiver
scenario is labelled hypothetical everywhere including the PDF.

## Pass 6 — Federal-side UI, onboarding, results, entitlements

Goal: passes 1–5 become usable from the plan without reading code.

- [ ] Household setup question and branching intake (§5.1, §5.2); final screen
      carries the non-affiliation notice.
- [ ] Service-period editor with overlap resolution and USERRA prompt (§5.3).
- [ ] Deposit workflow, official-balance and estimate modes, SF 3108 next steps
      (§5.4).
- [ ] Income cards, one per stream type, never a combined field (§5.5).
- [ ] Result views: military snapshot, service-credit comparison, military income
      timeline, assumptions and sources (§5.8); result labels (§5.9); copy blocks
      (§12).
- [ ] Entitlements: `MILITARY_SCENARIOS`, `MILITARY_ANALYSIS` keys and labels per
      §13; warnings never gated.
- [ ] PDF sections for military inputs, comparison, streams, and sources.
- [ ] Telemetry: coarse events only (`military_module_started`,
      `service_period_saved`, `official_amount_used`, `unsupported_case_shown`);
      confirm Sentry scrubbing and no session replay on these routes (§11.3).
- [ ] Browser tests: keyboard-only onboarding, period add/edit/split/delete,
      overlap resolution, estimate-to-official switch, VA entry with no medical
      field present, delete all military data (§14.4).

Exit: a veteran FERS employee completes the module end to end and the PDF matches
the screen.

## Pass 7 — Military Retirement Calculator engine: regular longevity

Goal: a real gross retired-pay calculation for Final Pay, High-36, REDUX/CSB,
and BRS with an auditable trace (§20.5–§20.9).

- [ ] `src/lib/military/retirement/`: `suggestSystem` from DIEMS with mandatory
      confirmation (§20.3); `validatePath`; `buildBasicPayHistory` from grade
      periods and pay tables; `selectHigh36PayBase` (highest 36, partial months,
      never current × 36); `computeLongevityMultiplier` (2.5% / 2.0%, REDUX
      reduction, effective-dated caps); COLA engine (full, REDUX CPI−1 with
      age-62 recomputation, first partial COLA); rounding rule; ordered trace
      steps with rule ids; input hash and `rulesVersion`.
- [ ] Basic pay tables 2024–2026 in `annualParameters.js` or a sibling data file;
      earlier months by user entry or official pay-base override; future months by
      explicit growth assumption labelled as such (§20.6). `[-]` tables need human
      verification against DFAS.
- [ ] Codes: `MRT_PATH_UNKNOWN`, `MRT_SYSTEM_UNCONFIRMED`, `MRT_SYSTEM_CONFLICT`,
      `MRT_1405_SERVICE_UNKNOWN`, `MRT_ACTIVE_SERVICE_BELOW_THRESHOLD`,
      `MRT_PAY_ENTRY_DATE_UNKNOWN`, `MRT_PAY_HISTORY_INCOMPLETE`,
      `MRT_PAY_TABLE_MISSING`, `MRT_FUTURE_PAY_TABLE_ASSUMED`,
      `MRT_ROUNDING_RULE_MISSING`.
- [ ] Tests: §20.18 longevity cases; properties "more service never reduces gross
      without a cap", "High-36 bounded by selected months", "BRS never uses 2.5%",
      "REDUX never runs unconfirmed", "same inputs and rules give same hash".
- [ ] Golden: fixtures reconciled against the MyArmyBenefits calculator for
      High-36, BRS, REDUX, and Final Pay, driven from the browser and recorded in
      `docs/MILITARY-VERIFICATION.md`.

Exit: all four systems match the Army calculator fixtures; every result exposes
pay base, service, multiplier, reductions, rounding, and rule version.

## Pass 8 — Guard/Reserve engine, public calculator, connection to the plan

Goal: nonregular retirement from points, the public surface, and the
calculation-id link into the household timeline.

- [ ] Reserve engine: retirement-year audit (qualifying-year threshold, membership
      points, inactive caps 60/75/90/130 by retirement-year end date, 365/366
      ceiling, active points never capped), points ÷ 360, retired-pay date from
      age 60, official date, or verified reduced-age periods in three-month units
      with the age-50 floor; Retired Reserve vs former-member pay base at pay
      start (§20.7, §4.4).
- [ ] Public route `/calculators/military-retirement` with entry choice, Quick /
      Detailed / Reconcile modes, data-quality panel, formula audit, first-result
      cards (§20.13, §20.14); anonymous and client-side; sign-in to save.
- [ ] Saved scenarios in `military.retirementScenarios[]` with immutable
      calculations, `supersedes`, `currentCalculationId`.
- [ ] Connection: an income stream references `sourceCalculationId`; no copied
      amount; stale flag when the source changes; duplicate-source block (§20.16).
- [ ] Reconciliation against an official estimate or RAS at gross, deductions,
      withholding, and net with diagnostics (§20.12).
- [ ] Codes: `MRT_RESERVE_*`, `MRT_QUALIFYING_YEARS_INSUFFICIENT`,
      `MRT_INACTIVE_POINT_CAP_APPLIED`, `MRT_RETIRED_RESERVE_STATUS_UNKNOWN`,
      `MRT_REDUCED_AGE_UNVERIFIED`, `MRT_HEALTH_AGE_DIFFERS`,
      `MRT_OFFICIAL_RECONCILIATION_MISMATCH`, `MRT_DUPLICATE_PLAN_INCOME`.
- [ ] Tests: §20.18 Reserve cases (49/50/51 points, leap year, each cap boundary,
      reduced-age aggregation); property "linking creates exactly one pension
      stream"; browser tests for the public flow and the connect step.

Exit: a Guard member's points produce an audited pension that enters the plan
without retyping; Reserve golden cases pass.

## Pass 9 — Dual TSP, health coverage periods, BRS extras

Goal: the savings and healthcare halves of the household reconcile (§4.7, §4.8,
§6.9, §6.10, §20.8).

- [ ] TSP account context (civilian / uniformed) with tax-exempt basis bucket,
      shared elective-deferral limit, age-50 and 60–63 catch-up from the existing
      registry, annual-additions limit, independent FERS and BRS match and
      vesting, pay-period front-loading warning, USERRA make-up transactions.
- [ ] BRS: `projectBrsTsp`, continuation-pay scenario from an official offer only,
      25%/50% lump sum with the annual official discount rate (blocked when
      missing or stale), value stack shown as four components.
      `[-]` discount rate and continuation-pay policy need annual human load.
- [ ] Coverage periods per person: FEHB/PSHB, TRICARE Prime/Select, TRS, TRR, TFL,
      TAMP, CHCBP, CHAMPVA, VA, Medicare; effective-dated conflict rules (TRS and
      TRR versus FEHB eligibility until the scheduled statutory change, TFL
      requires Part B, CHAMPVA versus TRICARE); extend `healthcareCosts.js`.
      `[-]` 2026 TRICARE costs need human verification.
- [ ] Codes: `MIL_TSP_SHARED_LIMIT_EXCEEDED`, `MIL_TSP_MATCH_AT_RISK`,
      `MIL_TSP_TAX_EXEMPT_BASIS_MISSING`, `MIL_TRS_FEHB_CONFLICT`,
      `MIL_CHAMPVA_TRICARE_CONFLICT`, `MIL_TFL_PARTB_MISSING`, `MRT_BRS_*`.
- [ ] Tests: §14.1 cases 33–47; integration "dual TSP contributions flow into
      separate accounts and one limit validator".

Exit: shared-limit and coverage-conflict tests pass; a mixed FEHB/TRICARE/Medicare
household projects each person separately.

## Pass 10 — Special retirements, survivor, reports, verification, release gates

Goal: bounded Chapter 61, TERA, and SBP; reports; the verification record; and
the release checklist with human items marked.

- [ ] Chapter 61 bounded calculation from official disposition and DoD percentage,
      both authorised methods where permitted, TDRL/PDRL floors and caps; medical
      separation as its own path; TERA only with official authority (§20.10).
- [ ] Supported SBP spouse category: elected base, versioned premium, 55%
      annuity, paid-up rule; RCSBP official amounts only; gross-to-net ledger
      (§20.11); post-2023 SBP and DIC concurrency in the death scenario.
- [ ] Reports: military retirement report and Military + Federal PDF sections,
      assumptions and sources pages, methodology page section, staleness banner
      when `rulesVersion` is behind (§17).
- [ ] `docs/ANNUAL-UPDATE.md` gains the §17 calendar; `docs/MILITARY-VERIFICATION.md`
      records every golden case and approved variance.
- [ ] Security and privacy checks: export and delete include the military block;
      telemetry redaction tests; no values in URLs (§11, §20.19).
- [ ] Codes: `MRT_AUTHORITY_UNCONFIRMED`, `MRT_MEDICAL_*`, `MRT_TERA_AUTHORITY_REQUIRED`,
      `MRT_SBP_ELECTION_INCOMPLETE`, `MRT_RCSBP_OFFICIAL_AMOUNT_REQUIRED`,
      `MRT_CONCURRENT_RECEIPT_MANUAL`, `MRT_RULES_STALE`.
- [ ] Tests: §20.18 medical, TERA, SBP cases; §14.1 case 50 "rule update preserves
      prior snapshot".
- [-] Human release gates (§16, §20.21): federal-retirement SME sign-off,
      military-benefits SME sign-off, counsel review of VA-claims boundary and
      non-affiliation copy, WCAG 2.2 AA review, de-identified DFAS statements for
      golden reconciliation, private beta across personas.

Exit: every code gate in §16 and §20.21 is green; the human gates are listed with
what each reviewer receives.

---

## Data that needs a human eye before release

Each is transcribed by the build and marked `[-]` until verified against its
primary source (§21):

| Data | Pass | Source |
|---|---|---|
| FERS deposit interest rates by year, 1985 onward | 3 | OPM service-credit page and BALs |
| VA compensation and DIC tables, 2026 | 4 | va.gov rates pages |
| State military-retired-pay tax treatment, all states | 4 | each state revenue department |
| Military basic pay tables, 2024–2026 | 7 | DFAS pay tables |
| Military retired-pay COLA history | 7 | DFAS |
| BRS lump-sum discount rate and continuation-pay policies | 9 | DoD memoranda |
| TRICARE premiums and cost shares, 2026 | 9 | tricare.mil |
| SBP premium and paid-up rules | 10 | DFAS |
