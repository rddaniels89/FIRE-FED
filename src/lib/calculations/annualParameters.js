/**
 * Annually adjusted figures, versioned by year.
 *
 * FireFed's inputs divide into two kinds, and conflating them is how a model
 * goes quietly stale:
 *
 *   Stable rule logic  - "$1 withheld for every $2 above the limit", the age at
 *                        which catch-up contributions begin, the 1.1% multiplier
 *                        threshold. These live with the rules that use them.
 *
 *   Annual parameters  - the dollar amounts those rules are applied to. Indexed
 *                        or legislated each year, and collected HERE so a new
 *                        year is one edit rather than a search across modules.
 *
 * To add a year: copy the most recent entry, update every figure from the
 * sources below, and bump CURRENT_PARAMETER_YEAR. Leave prior years in place —
 * they are what lets a saved scenario be read back against the rules that
 * applied when it was made.
 *
 * Sources:
 *   TSP/IRS limits            https://www.tsp.gov/bulletins/ and IRS Notice
 *   SSA earnings test         https://www.ssa.gov/oact/cola/rtea.html
 */

export const CURRENT_PARAMETER_YEAR = 2026;

export const ANNUAL_PARAMETERS = Object.freeze({
  2026: Object.freeze({
    year: 2026,

    tsp: Object.freeze({
      /** IRC 402(g) elective deferral limit. */
      electiveDeferralLimit: 24500,
      /** IRC 414(v) catch-up for age 50+. */
      catchUpLimit: 8000,
      /** SECURE 2.0 s.109 catch-up for ages 60-63; replaces rather than stacks. */
      superCatchUpLimit: 11250,
      /** SECURE 2.0 s.603 prior-year FICA wage threshold forcing Roth catch-up. */
      rothCatchUpWageThreshold: 150000,
    }),

    ssaEarningsTest: Object.freeze({
      /**
       * Under full retirement age for the entire year: $24,480/yr ($2,040/mo).
       * $1 withheld per $2 above this.
       */
      underFraExemptAmount: 24480,
      /**
       * In the year full retirement age is reached: $65,160/yr ($5,430/mo),
       * counting only earnings before the FRA month. $1 withheld per $3 above
       * this. No limit applies from the FRA month onward.
       */
      fraYearExemptAmount: 65160,
    }),
  }),
});

/**
 * Parameters for a year, falling back to the most recent year defined.
 *
 * The fallback is deliberate: a scenario projected into 2031 should use the
 * latest known figures rather than zero. `isExact` reports whether the year was
 * actually defined, so callers can label a projection as using carried-forward
 * assumptions.
 */
export function getAnnualParameters(year = CURRENT_PARAMETER_YEAR) {
  const requested = Number(year);
  const exact = Number.isFinite(requested) ? ANNUAL_PARAMETERS[requested] : undefined;
  if (exact) return { ...exact, isExact: true, requestedYear: requested };

  const latest = ANNUAL_PARAMETERS[CURRENT_PARAMETER_YEAR];
  return {
    ...latest,
    isExact: false,
    requestedYear: Number.isFinite(requested) ? requested : CURRENT_PARAMETER_YEAR,
  };
}

/** Years with defined parameters, ascending. */
export function getDefinedParameterYears() {
  return Object.keys(ANNUAL_PARAMETERS).map(Number).sort((a, b) => a - b);
}
