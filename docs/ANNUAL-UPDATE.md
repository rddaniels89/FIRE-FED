# Annual update checklist

FireFed separates rule logic (stable) from the figures those rules are applied
to (indexed or legislated every year). This is the list of what changes each
year and where it lives. Do the whole list in one pass in December or January,
bump the year, and leave prior years in place so saved scenarios can be read
back against the rules that applied when they were made.

## 1. `src/lib/calculations/annualParameters.js`

Copy the most recent year's entry, rename it, update every figure, and set
`CURRENT_PARAMETER_YEAR`.

| Block | Figures | Source | Published |
|---|---|---|---|
| `tsp` | elective deferral, catch-up, super catch-up (60–63), Roth catch-up wage threshold | IRS notice on 402(g)/414(v); tsp.gov bulletins | November |
| `ssaEarningsTest` | under-FRA and FRA-year exempt amounts | ssa.gov/oact/cola/rtea.html | October |
| `fers` | refund and deposit interest rate | OPM service credit page | January |
| `federalTax` | standard deduction, age-65 addition, senior bonus, brackets by status, provisional-income thresholds (statutory, rarely change), FICA wage base | IRS Rev. Proc. for the year; SSA wage base | October–November |
| `capitalGains` | 0% and 15% ceilings by status | same Rev. Proc. | October–November |
| `medicare` | Part B premium and deductible, IRMAA tiers | CMS fact sheet | November |
| `fehb` | average enrollee-share increase, default premiums | OPM FEHB premiums page | October |

## 2. `src/lib/calculations/gsPay.js`

Add a new year to `GS_PAY_TABLES` from OPM's XML salary tables: base table,
every locality percentage, and the Executive Schedule Level IV cap. Regenerate
rather than hand-edit; the header comment has the URL. `GS_PAY_TABLE_YEAR`
derives from the latest key.

## 3. `src/lib/calculations/socialSecurity.js`

Check the Trustees Report summary for the depletion year and payable
percentage behind `DEFAULT_TRUST_FUND_HAIRCUT`.

## 4. `src/lib/taxes/stateIncomeTax.js`

State presets are planning approximations. Re-check the states mid-phase-down
and the pension-exclusion dollar amounts flagged in the file.

## 5. `src/lib/rules/registry.js`

Every rule carries `ruleYear` and `lastVerified`. After updating the figures
above, re-verify each rule against its source and update the dates. Unverified
rules show their age in the UI.

## 6. Tests

- `src/lib/calculations/__tests__/opmConformance.test.js` pins OPM wording.
- `src/lib/calculations/__tests__/goldenCases.test.js` pins hand-computed cases.
- `src/lib/projection/__tests__/timelineFixtures.test.js` snapshots whole
  projections. A figure change is expected to move them; review the diff and
  update with `npx vitest run -u` only when every change is explained.

## 7. Documentation

Update the assumptions page copy and `ROADMAP.md` if any rule was added or
retired.
