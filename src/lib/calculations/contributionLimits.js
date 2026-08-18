/**
 * IRS/TSP contribution limits.
 *
 * These are statutory figures that change every year — update them each January
 * from the TSP bulletin and the IRS notice, and bump LIMITS_TAX_YEAR with them.
 *
 * Sources (2026):
 *   https://www.tsp.gov/bulletins/25-3/
 *   https://www.irs.gov/pub/irs-drop/n-25-67.pdf
 */
export const LIMITS_TAX_YEAR = 2026;

/** IRC 402(g) elective deferral limit (traditional + Roth employee contributions). */
export const ANNUAL_ELECTIVE_DEFERRAL_LIMIT = 24500;

/** IRC 414(v) catch-up limit for participants age 50+. */
export const ANNUAL_CATCH_UP_LIMIT = 8000;

/** Age at which the regular catch-up becomes available. */
export const CATCH_UP_AGE = 50;

/**
 * SECURE 2.0 section 109 raises the catch-up limit for participants who turn
 * 60, 61, 62, or 63 during the year. It replaces the regular catch-up for those
 * ages rather than stacking with it, and drops back at 64.
 */
export const SUPER_CATCH_UP_LIMIT = 11250;
export const SUPER_CATCH_UP_MIN_AGE = 60;
export const SUPER_CATCH_UP_MAX_AGE = 63;

/**
 * Catch-up amount available at a given age, in addition to the elective
 * deferral limit. Returns 0 below the catch-up age.
 */
export function getCatchUpLimitForAge({
  age,
  catchUpAge = CATCH_UP_AGE,
  catchUpLimit = ANNUAL_CATCH_UP_LIMIT,
  superCatchUpLimit = SUPER_CATCH_UP_LIMIT,
  superCatchUpMinAge = SUPER_CATCH_UP_MIN_AGE,
  superCatchUpMaxAge = SUPER_CATCH_UP_MAX_AGE,
} = {}) {
  const a = Number(age);
  if (!Number.isFinite(a) || a < Number(catchUpAge)) return 0;

  const inSuperBand = a >= Number(superCatchUpMinAge) && a <= Number(superCatchUpMaxAge);
  const limit = inSuperBand ? Number(superCatchUpLimit) : Number(catchUpLimit);
  return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

/**
 * SECURE 2.0 section 603: from 2026, catch-up contributions must be Roth for
 * participants whose PRIOR-year FICA wages with the same employer exceeded this
 * threshold. The threshold started at $145,000 for 2023 wages and is indexed.
 *
 * https://www.tsp.gov/bulletins/23-5/
 */
export const ROTH_CATCH_UP_WAGE_THRESHOLD = 150000;

/**
 * Whether catch-up contributions must be made as Roth in a given year.
 * `priorYearWages` is the participant's wages in the year BEFORE the
 * contribution year, not their current salary.
 */
export function requiresRothCatchUp({
  priorYearWages,
  threshold = ROTH_CATCH_UP_WAGE_THRESHOLD,
} = {}) {
  const wages = Number(priorYearWages);
  const limit = Number(threshold);
  if (!Number.isFinite(wages) || !Number.isFinite(limit)) return false;
  return wages > limit;
}
