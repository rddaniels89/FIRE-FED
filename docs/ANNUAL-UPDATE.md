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

## Verification log

### 2026-09-07

Every figure flagged as unverified when the 2026 parameters were first entered
was checked against its source. Three corrections were made.

| Figure | Value in code | Source | Result |
|---|---|---|---|
| Standard deduction (single / joint / HoH) | 16,100 / 32,200 / 24,150 | IRS Rev. Proc. 2025-32 via https://taxfoundation.org/data/all/federal/2026-tax-brackets/ | matches |
| Additional deduction age 65+ (unmarried / married) | 2,050 / 1,650 | same | matches |
| Senior bonus deduction | 6,000, 6% phase-out above 75,000 / 150,000 | same | matches |
| Ordinary brackets, all statuses | as coded | same | matches, including the HoH 32% ceiling of 256,200 |
| Long-term gains 0% / 15% ceilings | 49,450 / 98,900 / 66,200; 545,500 / 613,700 / 579,600 | same | matches |
| FICA wage base | 184,500 | https://etf.wi.gov/news/social-security-wage-base-set-increase-2026 | matches |
| Earnings test exempt amounts | 24,480 / 65,160 | https://www.nasdaq.com/articles/here-are-2026-social-security-earnings-test-limits | matches |
| Part B premium and deductible | 202.90 / 283 | https://www.federalregister.gov/documents/2025/11/19/2025-20251/ | matches |
| IRMAA thresholds | 109,000 / 218,000 first tier; 500,000 / 750,000 top | https://www.kiplinger.com/retirement/medicare/medicare-premiums-2026-irmaa-brackets-and-surcharges-for-parts-b-and-d | matches |
| IRMAA top-tier premium | was 689.30 | same | **corrected to 689.90** |
| FEHB enrollee-share increase | 12.3% (total 10.2%) | https://www.fedsmith.com/2025/10/09/federal-employees-face-12-percent-jump-in-2026-fehb-premiums/ | matches |
| TSP limits | 24,500 / 8,000 / 11,250 / 150,000 | https://www.tsp.gov/bulletins/25-3/ | matches |
| FERS refund and deposit interest | was 4.5% | OPM BAL 26-301 https://www.opm.gov/retirement-center/publications-forms/benefits-administration-letters/2026/26-301.pdf | **corrected to 4.25%** |
| State rates: IN 2.95, KY 3.5, OH 2.75, ID 5.3, GA 5.19, NE 4.55, LA 3.0, IA 3.8, NC 3.99, AZ 2.5, UT 4.5, CO 4.4, MI 4.25, PA 3.07, IL 4.95 | as coded | https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/ | matches |
| Mississippi flat rate | was 4.4% | same | **corrected to 4.0%** (final step of the phase-down) |
| Progressive states coded as effective rates (WV top 4.82, MT top 5.65, AR top 3.9, NM top 5.9, SC top 6.0, MO top 4.7) | effective approximations below the top rate | same | left as approximations; the file says so |

Not verified: the married-filing-separately IRMAA schedule (not modeled) and
the state pension-exclusion dollar amounts (indexed annually in ME, MD, MO).
