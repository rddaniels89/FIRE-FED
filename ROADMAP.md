# FireFed roadmap: one federal-retirement model

Sixty changes that turn several calculators into one model of a federal employee's
path from today through separation and retirement. Ordered by build sequence.
Items 1 through 7 are the spine; almost everything below depends on them.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` prepared, needs a human

Free vs Pro decisions are recorded per item. The rule: anything a single federal
employee needs to answer "when could I leave and will it hold" is free; anything
that models a second person, a probabilistic outcome, a strategy, or a deliverable
is Pro.

## A. One profile, one model

- [x] 1. Merge the duplicate age, retirement-age, and salary fields under TSP and FERS into a single profile. — Free
- [x] 2. Add a hire-date cohort so the FERS contribution rate (0.8%, 3.1%, 4.4%) drives take-home pay and savings rate. — Free
- [x] 3. Make separation age, annuity commencement age, and Social Security claiming age three separate profile fields. — Free
- [x] 4. Build a year-by-year cash-flow engine: one row per age with salary, pension, SRS, Social Security, TSP withdrawals, other income, healthcare, taxes, spending, ending balance. — Free (deterministic)
- [x] 5. Replace the level-dollar, no-growth bridge estimate with the timeline-driven version that sequences each income start. — Free
- [x] 6. Make Monte Carlo consume the same timeline rows. — Pro
- [~] 7. Point the optimizer, the PDF, and the dashboard at the timeline. — Free/Pro as before

## B. FERS rules that decide a FIRE outcome

- [x] 8. Show the deferred annuity's nominal freeze on the timeline: High-3 locked at separation, no COLA until commencement, real value at commencement. — Free
- [x] 9. Add the FERS refund option for early leavers: contributions plus interest versus keeping the deferred annuity. — Free
- [x] 10. Add the annual leave lump sum at separation as bridge cash. — Free
- [x] 11. Add TSP access rules: penalty-free after separating in the year you turn 55 (50 for special provisions), age 59½, 10% penalty otherwise. — Free
- [x] 12. Add 72(t) payments and Roth conversion ladders as bridge strategies, with the five-year seasoning rule. — Pro
- [x] 13. Track Roth TSP contribution basis separately from earnings so bridge withdrawals from Roth are modeled correctly. — Free
- [x] 14. Treat VERA and discontinued service retirement as a "what if offered" toggle, not a path the user picks. — Free
- [x] 15. Build the "one more year" delta: pension, High-3, the 1.1% threshold at 62 with 20 years, sick leave, SRS eligibility, FEHB five-year status. — Free
- [x] 16. Carry months of service through eligibility, not just the multiplier. — Free

## C. Taxes

- [x] 17. Add federal brackets, standard deduction, and filing status to the yearly parameter sets. — Free
- [x] 18. Characterize each income line: pension and SRS taxable, Traditional TSP taxable, Roth tax-free, brokerage at capital-gains rates, Social Security under provisional income. — Free
- [x] 19. Add a state rate plus a "state exempts federal pensions" flag. — Free
- [x] 20. Replace the flat tax-now and tax-later percentages in the TSP projection with the bracket engine. — Free
- [x] 21. Add Roth conversion planning in low-bracket bridge years. — Pro

## D. Social Security

- [x] 22. Accept the SSA estimate as a benefit at full retirement age and derive full retirement age from birth year. — Free
- [x] 23. Apply reduction and delayed-credit factors for claiming ages 62 through 70. — Free
- [x] 24. Feed Social Security into the timeline. — Free
- [x] 25. Derive the age-62 figure SRS needs from the same estimate. — Free
- [x] 26. Add a trust-fund haircut stress scenario. — Pro (stress test), parameter visible free

## E. Healthcare

- [x] 27. Project FEHB premiums in retirement with a premium growth assumption. — Free
- [x] 28. Add the Medicare transition at 65: Part B premium and the FEHB-plus-Medicare choice. — Free
- [x] 29. Add IRMAA brackets. — Pro
- [x] 30. Add a marketplace cost estimate for the deferred path, where FEHB is lost. — Free
- [x] 31. Add a VA, TRICARE, or CHAMPVA flag that reduces or zeroes the healthcare line. — Free

## F. Federal FIRE Date

- [x] 32. Compute the earliest separation age at which the timeline never goes negative. — Free
- [x] 33. Add a separation-age slider that recomputes the whole timeline. — Free
- [x] 34. Add "leave one year earlier" and "one year later" cards. — Free
- [x] 35. Use "projected sustainable separation age" wording throughout. — Free
- [x] 36. Mark what changes at each milestone: separation, 55, MRA, 59½, 62, 65, full retirement age, 70. — Free

## G. Household

- [x] 37. Replace the flat spouse-income number with a structured spouse: age, income, income end age, Social Security estimate and claiming age, own pension. — Pro
- [x] 38. Reuse the FERS profile for a dual-fed spouse. — Pro
- [x] 39. Feed filing status into the tax engine. — Free

## H. Comparison

- [~] 40. Add a delta view that highlights only the fields that differ between scenarios. — Pro
- [~] 41. Compare three to five scenarios on one screen. — Pro
- [~] 42. Compare Monte Carlo results across separation ages. — Pro

## I. Monte Carlo and stress

- [x] 43. Report 10th, 50th, and 90th percentile paths, the minimum balance, and the age it occurs. — Pro
- [x] 44. Add named stress tests: bad first decade, high inflation, living to 100, health-cost growth, Social Security cut, crash at separation. — Pro

## J. Transparency

- [x] 45. Add "How was this calculated" to every dashboard number. — Free
- [x] 46. Surface rule provenance in the UI: source, rule year, last-verified date. — Free
- [x] 47. Add an assumptions page that labels each input as user-entered, calculated, or assumed. — Free
- [-] 48. Get the methodology reviewed by a federal benefits practitioner and publish the findings. — needs a human; review packet prepared

## K. Rules architecture

- [x] 49. Move the remaining FERS, Social Security, tax, and Medicare constants into per-year parameter sets. — n/a
- [x] 50. Version the GS and locality tables by year. — n/a
- [x] 51. Write an annual-update checklist. — n/a

## L. Tests

- [x] 52. Build a golden-case library from OPM's published examples, one per path. — n/a
- [x] 53. Snapshot full timeline projections as regression fixtures. — n/a
- [x] 54. Test the tax engine against IRS worksheets. — n/a
- [x] 55. Add household and claiming-age cases. — n/a
- [x] 56. Add an end-to-end test for the onboarding flow. — n/a

## M. Onboarding, dashboard, report

- [x] 57. Goal-first onboarding that asks only the inputs the chosen question needs. — Free
- [x] 58. Rebuild the dashboard around four questions with the timeline as the central view. — Free (Monte Carlo card Pro)
- [~] 59. Rebuild the PDF from the timeline: bridge, Social Security, healthcare, taxes, stress results, assumptions, sources. — Pro
- [x] 60. Wire the GS pay module into a career projection: step increases, raises, promotions, and the resulting High-3. — Pro
