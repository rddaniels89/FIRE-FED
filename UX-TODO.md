# UX polish to-do

From a review on 2026-09-07: a live walkthrough of every page at phone and
desktop widths in both themes, plus three code audits covering accessibility,
responsive layout and dark mode, and copy and consistency.

Roughly 70 findings, consolidated into 34 tasks and ordered by what a real user
would hit first. Each task names the file, the fix, and a rough size. `S` is
under an hour, `M` is a few hours, `L` is a day or more.

**Status: all 34 done, 2026-09-07.** 575 unit tests and 12 end-to-end tests
pass, lint and build are clean, and every page was re-checked in the browser at
375px and desktop in both themes. Verification notes are at the end.

**Headline:** the engine and the new plan pages are in good shape. Almost every
serious finding is in the *older* screens, which still speak in a different
voice, still use the pre-rebuild vocabulary, and in three places show a
different answer to "when can I leave" than the plan page does. The single most
valuable thing on this list is settling which screen owns that number.

---

## P0 — Actual bugs

- [x] **1. Full-retirement-age renders as an em dash.** `plan/IncomeSection.jsx:142`
      calls `fmtAge(plan.socialSecurity.fra)`, but `fra` is an object
      (`{years, months, totalMonths, decimal}`), so `Number()` gives `NaN` and
      the note reads "Claimed at 67; FRA —." Pass `fra.decimal`, or reuse the
      formatting in `AssumptionsPage.jsx:214`. **S**

- [x] **2. Headline currency shows a stray decimal.** `SummaryDashboard.jsx:703`
      renders `(annualPension + balance * 0.04).toLocaleString()` with no
      rounding, so "Annual Retirement Income" can read `$32,493.8`. Every
      neighbouring tile rounds. Use `fmtMoney` from `plan/planFormat.js`. **S**

- [x] **3. The plan page can white-screen the whole app.** `plan/PlanDashboard.jsx:82`
      calls `buildTimeline` bare inside `useMemo`. A throw escapes to
      `AppErrorBoundary` and blanks the app. Every sibling already guards this
      (`AssumptionsPage.jsx:310`, `ScenarioCompare.jsx:80`). Wrap it and render
      an in-page error linking to `/plan/inputs`. **S**

- [x] **4. A permanent false "Loading your plan…".** `plan/PlanInputs.jsx:51`
      shows the loading state whenever there is no scenario, without consulting
      `isLoadingScenarios`, so a user with zero scenarios waits forever. Mirror
      `PlanDashboard.jsx:117`, which does this correctly. **S**

- [x] **5. The career simulator invents a person.** `plan/CareerSimulator.jsx:131`
      falls back to age 42 separating at 55 when there is no scenario, then
      renders a confident salary path and annuity for someone who does not
      exist. Add the empty state before computing. **S**

- [x] **6. "No saved scenarios yet" shows during loading.** `ScenarioCompare.jsx:241`
      never reads `isLoadingScenarios`. **S**

---

## P1 — Broken for some users

### Mobile layout

- [x] **7. The milestone strip is unreadable on a phone.** Measured at 375px:
      eight pairs of overlapping labels, and the first and last markers paint
      past both edges causing page-level horizontal scroll.
      `plan/IncomeSection.jsx:54-89`. Wrap in `overflow-x-auto`, give the track
      `min-w-[36rem]`, narrow labels to `max-w-[5.5rem]`, and clamp the end
      markers' translate. **M**

- [x] **8. Two more horizontal overflows at 375px.** The compare page header
      (`ScenarioCompare.jsx:222`, a non-wrapping flex row with an `h1` and two
      buttons; measured 417px against a 375px viewport) and the slider legend
      (`SeparationAgeSlider.jsx:94`, three items with no `flex-wrap`). Both are
      one-line fixes. **S**

- [x] **9. A tooltip wider than the phone.** `SummaryDashboard.jsx:590` uses
      `whitespace-nowrap` on a 64-character string, centred, so it overflows
      both edges. **S**

- [x] **10. The PDF modal is unreachable on a short viewport.**
      `SummaryDashboard.jsx:599` has no scroll on the overlay or the panel, so
      the Generate button falls off screen in landscape. Add
      `overflow-y-auto` and `max-h-[90vh]`. **S**

- [x] **11. Two tables collapse instead of scrolling.** `plan/IncomeSection.jsx:121`
      and `AssumptionsPage.jsx:389` are `w-full` inside an `overflow-x-auto`
      wrapper, so they squeeze to 295px and every cell becomes a six-line stack
      while the wrapper never scrolls. Add `min-w-[36rem]`. **S**

### Touch targets

- [x] **12. The most-used control on the plan pages is 20px.** The ⓘ button in
      `HowCalculated.jsx:65` is `h-5 w-5`, less than half the 44px minimum, and
      there are 15 of them on `/plan` alone. Keep the visual size and expand the
      hit area with `after:absolute after:-inset-2.5`. **S**

- [x] **13. Four more undersized targets.** The onboarding dismiss ✕
      (`OnboardingCard.jsx:233`, roughly 12×19px, and the only way to dismiss
      the card), the PDF modal close ✕ (`SummaryDashboard.jsx:613`), the number
      steppers (`NumberStepper.jsx:20`, 24px tall, on about 20 fields), and
      eight `btn-primary py-2 px-4` overrides that shrink buttons to 36px.
      Consider adding a `.btn-sm` component class rather than repeating the
      override. **M**

### Accessibility blockers

- [x] **14. No skip link, and route changes drop focus.** `App.jsx:208`: `<main>`
      has no `id`, there is no skip link, and `PageViewTracker` only fires
      telemetry. Every navigation leaves focus on the old link with seven nav
      items to re-tab, and the new page is never announced. Add
      `<main id="main-content" tabIndex={-1}>`, a skip link, and focus the main
      region on pathname change. **M**

- [x] **15. Charts are invisible to screen readers.** Eleven `<canvas>` elements
      across the app have no text alternative and no keyboard access to the
      tooltip data. Add `role="img"` with a computed `aria-label` summarising
      the series, and point the plan chart at the year-by-year table with
      `aria-describedby`. **M**

- [x] **16. Theme and menu toggles announce wrongly.** `App.jsx:117` and `:135`:
      the theme button's only content is an emoji with no `aria-label`
      (confirmed live: `textContent` is `"🌙"`, `aria-label` is `null`), and the
      mobile menu button has no `aria-expanded` or `aria-controls` and keeps
      saying "Open" while open (also confirmed live). **S**

- [x] **17. Colour is the only signal in four places.** Better/worse cells in the
      compare table (`ScenarioCompare.jsx:21`, whose own caption says "Green is
      better… red is worse"), the sustainability strip
      (`SeparationAgeSlider.jsx:77`), shortfall rows
      (`YearByYearTable.jsx:60`), and the active nav item (`App.jsx:87`). Add
      `sr-only` text or a glyph to each, and `aria-current="page"` to the nav. **M**

- [x] **18. Long-running results are never announced, and focus is dropped.**
      `plan/DurabilitySection.jsx:224`: clicking Run sets `disabled`, which
      removes the button from the accessibility tree and dumps focus to
      `<body>`; the result then appears in a plain `<div>`. Confirmed live:
      the page has exactly one live region, and it is the milestone strip. Use
      `aria-disabled` with a guard, and wrap results in
      `role="status" aria-live="polite"`. Do the same for the slider preview on
      `PlanDashboard.jsx:210`. **M**

- [x] **19. Focus ring removed with nothing in its place.**
      `plan/IncomeSection.jsx:66` sets `focus:outline-none` on the milestone
      buttons. The project already has a `focus-ring` class in `index.css:18`.
      Also `ResetPassword.jsx:113` sets a ring colour with no ring width, so no
      ring is drawn. **S**

- [x] **20. Four data tables lack header semantics.** No caption, no
      `scope="col"`, and the row-header cell is a `<td>`, in
      `YearByYearTable.jsx:44`, `IncomeSection.jsx:121`,
      `ScenarioCompare.jsx:367`, and `CareerSimulator.jsx:634`.
      `AssumptionsPage.jsx:278` already does this correctly; copy that
      component. **M**

- [x] **21. 45 field hints are not linked to their fields.**
      `plan/inputs/fields.jsx:84` renders `hint` as a loose `<p>` that no input
      references. Give it an id and add `aria-describedby`. Same in
      `OnboardingCard.jsx:298`. **S**

- [x] **22. Six smaller ARIA fixes.** A progress bar with no name
      (`BridgeSection.jsx:84`); three buttons all called "Run"
      (`DurabilitySection.jsx:224, 276, 338`); two both called "Use this age"
      (`DeltaCards.jsx:83`); an `aria-label` on a checkbox suppressing its
      description (`BridgeSection.jsx:21`); a button nested inside a `<label>`
      (`ScenarioCompare.jsx:278`); and the slider's redundant `aria-value*`
      attributes where `aria-valuetext="age 55"` is what is actually needed
      (`SeparationAgeSlider.jsx:53`). **M**

---

## P2 — Credibility

These are the ones that make the app look like it does not trust its own model.

- [x] **23. Three screens answer "when can I leave" three different ways, and
      two of them are on the same scroll.** `/plan` uses `findFireDate` over the
      full timeline. `/summary` computes its own at `SummaryDashboard.jsx:196`
      with a flat withdrawal rate, ignoring taxes, penalties, healthcare and the
      supplement. The FIRE Gap card uses `calculateFireGap`, a third method.
      Decide that `/plan` owns the number, then have the other two either read
      it or stop showing it. **L**

- [x] **24. Two pages claim to be the main dashboard.** `SummaryDashboard.jsx:552`
      is still "Retirement Summary Dashboard — combined analysis…" while
      `/plan` is "My Plan — one lifetime timeline". Retitle Summary to
      "Summary", and have its lede defer to My Plan. **S**

- [x] **25. Delete the advice.** `FIREGapCalculator.jsx:112-150` tells users to
      consider "geographic arbitrage", to "mentor others or pursue passion
      projects", and to delay retirement. `SummaryDashboard.jsx:732` ("Smart
      Analysis") and `:944` ("Recommendations") do the same with static bullets
      that never read the scenario. None of it comes from the model, and it
      contradicts the educational-only positioning everywhere else. Delete both
      cards and link to the plan page, where the delta cards show what one year
      either way actually moves. **M**

- [x] **26. The Pro page undersells Pro.** `ProFeatures.jsx:198` omits five
      shipped Pro features (stress tests, bridge strategies, household, the
      career simulator, IRMAA) and `:228` still lists stress tests under
      "Coming next" although they ship. The public pricing page has it right.
      Sync from `entitlements.js`. **S**

- [x] **27. Three smaller accuracy slips in copy.** Pricing says "three to five
      scenarios" where the code allows two (`PricingPage.jsx:21`). The home page
      lists PDF export and comparison as free features when both are Pro
      (`HomePage.jsx:144, 158`). The optimizer sends users to `/summary` to see
      a change it describes in plan terms (`OptimizationPanel.jsx:211`). **S**

- [x] **28. The Monte Carlo runs at three different sample counts** across the
      plan page (750), the analytics panel (adjustable), and the compare view
      (300), with no count shown next to two of the three results. State the
      count everywhere, and consider retiring `AdvancedAnalyticsPanel` now that
      `DurabilitySection` supersedes it. **M**

---

## P3 — Consistency and polish

- [x] **29. Vocabulary still says "retirement age" and "FIRE age".** The rebuild
      split these into separation age and annuity start age, but seven screens
      have not caught up: "Desired FIRE Age" and "Projected FIRE Age" side by
      side (`SummaryDashboard.jsx:713, 719`), "FIRE Age" on every scenario card
      (`ScenariosPage.jsx:254`), "Target Retirement Age"
      (`TSPForecast.jsx:738`), "Planned Retirement Age"
      (`FERSPensionCalc.jsx:720`), and the whole of `FIREGapCalculator`. Also
      settle "pension" versus "annuity" on `/plan`, where both appear, and fix
      three lowercase "high-3". **M**

- [x] **30. Chart colours are hard-coded for light mode in five files.**
      `#64748b` axes and `#e2e8f0` gridlines, which measure 2.6:1 on a dark
      card, and `CareerSimulator.jsx:207` sets no colours at all so Chart.js
      defaults to near-invisible on dark. Compounded by a global
      `.dark canvas { filter: brightness(0.9) }` at `index.css:100`. Derive the
      colours from `useTheme()` and drop the global filter. **M**

- [x] **31. `text-slate-400` with no light-mode pairing** in six places measures
      2.58:1 on white and fails contrast. Use `text-slate-500 dark:text-slate-400`,
      which the rest of the app already does. **S**

- [x] **32. Two sticky bars eat a quarter of a phone screen.**
      `plan/PlanInputs.jsx:61` and `:101` together take about 176px of a 667px
      viewport, over 45% in landscape. The header already carries the same link,
      so hide the bottom bar below `sm`. **S**

- [x] **33. Strip decorative emoji from the older screens.** The plan pages,
      assumptions page and compare view contain none; every older screen is
      saturated. The worst seam is a single scroll of `/summary`, which moves
      through three tones. `ScenariosPage.jsx:292` also has emoji-only icon
      buttons whose only other label is a `title`. The plan pages already import
      `lucide-react`, so there is a house pattern to follow. **M**

- [x] **34. Disclaimers are missing on four projection screens and worded five
      different ways.** Missing entirely from `ScenarioCompare`,
      `AssumptionsPage`, `TSPForecast` and `FERSPensionCalc`. Extract the
      `PlanDashboard.jsx:285` version, which is the best of the five, into a
      shared `<ProjectionDisclaimer />`. **S**

---

## Also worth doing, not yet tasks

- [x] **Dark mode ignores the system preference.** Fixed: `ThemeContext.jsx`
  now follows `prefers-color-scheme` when nothing is saved, keeps tracking the
  system as it changes, and only writes to storage on an explicit choice.
- **Two dark-mode systems coexist.** `index.css:71-97` blanket-remaps
  `text-slate-600/700/800` and friends under `.dark`, while components also
  write their own `dark:` variants. Two mechanisms doing one job is a
  maintenance hazard; pick one.
- [x] **Reduced motion covers only the logo.** Fixed: the guard now also stops
  `animate-fade-in`, slows `animate-spin` rather than removing the "working"
  signal, and collapses transition durations globally.
- **A print stylesheet exists only as two `print:` utilities.** The assumptions
  page has a Print button but no `@media print` rules.
- **Collapsed section summaries truncate with no `title`**
  (`plan/inputs/fields.jsx:38`), and that line is the only way to read a
  section's values while it is closed.

---

## Verified as fine

Worth recording so this ground is not re-covered.

- **Performance is not a problem.** Measured 22ms median per slider step, so the
  whole projection redraws within a frame. First contentful paint 72ms in dev.
- **The explanation popover is correctly built.** Confirmed live: `role="dialog"`,
  focus moves inside on open, Escape closes it, focus returns to the trigger,
  and it is capped at `90vw` so it does not overflow a phone. Its one gap is
  that closing by outside click drops focus (`HowCalculated.jsx:42`).
- **No horizontal overflow at 375px** on `/plan`, `/plan/inputs`, `/assumptions`
  or `/plan/career`.
- **No console errors** on any page, and no dev-server errors.
- **The inputs grids all collapse correctly** to one column; there are no
  fixed-column grids anywhere in the inputs tree.
- **`AssumptionsPage` is the model to copy** for tables and heading structure;
  `plan/DurabilitySection` is the model for idle, running and error states;
  `plan/inputs/fields.jsx` is the model for disclosures.


---

## Verification after the fixes

Measured in the browser rather than assumed.

| Check | Before | After |
|---|---|---|
| Pages with horizontal overflow at 375px | 4 | 0 |
| Overlapping milestone labels at 375px | 8 pairs | 0 |
| Explanation button hit area | 20×20px | 40×40px |
| Live regions on the plan page | 1 | 5 |
| Charts with a text alternative | 0 of 11 | 11 of 11 |
| Screens with a disclaimer | 6 of 10, five wordings | 10 of 10, one wording |
| Unit tests | 568 | 575 |

Three findings surfaced only after the fixes, during re-verification, and were
also fixed:

- **The two-column grids on the three oldest pages could not shrink.** Grid
  items default to `min-width: auto` and refuse to go below their content's
  minimum, so `/tsp-forecast` overflowed by 216px at 375px. Fixed with
  `min-w-0` on the containers and their children.
- **Hidden hover tooltips pushed the page wider than the viewport.** They stay
  laid out while `visibility: hidden`, so near the right edge they extended
  past it. Fixed with `overflow-x-clip` on the layout root, which contains them
  without creating a scroll container, so the sticky bars on the inputs page
  still work. Verified both.
- **Three end-to-end tests referenced a label that was deliberately renamed**
  ("Target Retirement Age" is now "Separation age"). Updated.

Two accessibility decisions were changed from what the to-do proposed, because
the proposal would have broken the WCAG label-in-name rule: the delta buttons
and the durability Run buttons append their distinguishing word in `sr-only`
text rather than replacing the visible label with an `aria-label`. Voice-control
users say what they see, so the visible words have to survive in the accessible
name.

One behaviour change worth knowing about: the FERS pension calculator's age
control now writes both legacy mirrors. Every figure on that page is computed
from separating at that age, but it was writing only the mirror that means
"when the annuity starts", so the plan recorded a separation age the page had
never assumed. A regression test in `src/lib/scenarios/__tests__/schema.test.js`
pins the new behaviour.
