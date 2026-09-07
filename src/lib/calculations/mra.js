/**
 * The FERS minimum retirement age, by year of birth.
 *
 * The MRA is not 57 for everyone. It rises on a published schedule from 55 for
 * those born before 1948 to 57 for anyone born in 1970 or later, stepping two
 * months a year through two transition bands. FireFed previously hard-coded 57
 * on the reasoning that the early-retirement audience is young enough for that
 * to hold. That is wrong for anyone born between 1948 and 1969 — in 2026 the
 * 1965 to 1969 cohort is aged 57 to 61, which is precisely the group closest to
 * retiring and most likely to be checking whether they are eligible today.
 *
 * Getting this wrong is not cosmetic. The MRA gates MRA+30 and MRA+10
 * eligibility, the age a postponed annuity can begin, and the age an early-out
 * or discontinued-service retiree starts receiving the supplement. Overstating
 * it tells a user they must work longer than the law requires.
 *
 * Source: https://www.opm.gov/retirement-center/fers-information/eligibility/
 * Corroborated by CSRS/FERS Handbook Chapter 51, Example 3, in which a retiree
 * born 1965 has an MRA of "56 and 2 months".
 */

/** Whole months of MRA by birth year, for the years that are not flat. */
const TRANSITION_MONTHS = Object.freeze({
  1948: 55 * 12 + 2,
  1949: 55 * 12 + 4,
  1950: 55 * 12 + 6,
  1951: 55 * 12 + 8,
  1952: 55 * 12 + 10,
  1965: 56 * 12 + 2,
  1966: 56 * 12 + 4,
  1967: 56 * 12 + 6,
  1968: 56 * 12 + 8,
  1969: 56 * 12 + 10,
});

export const MRA_BEFORE_1948 = 55;
export const MRA_1953_TO_1964 = 56;
export const MRA_1970_ONWARD = 57;

/** The MRA in whole months for a birth year. */
export function minimumRetirementAgeMonths(birthYear) {
  const year = Number(birthYear);
  if (!Number.isFinite(year)) return MRA_1970_ONWARD * 12;
  if (year < 1948) return MRA_BEFORE_1948 * 12;
  if (year <= 1952) return TRANSITION_MONTHS[year];
  if (year <= 1964) return MRA_1953_TO_1964 * 12;
  if (year <= 1969) return TRANSITION_MONTHS[year];
  return MRA_1970_ONWARD * 12;
}

/** The MRA in years, as a decimal. */
export function minimumRetirementAge(birthYear) {
  return minimumRetirementAgeMonths(birthYear) / 12;
}

/** "56 years 2 months", for display. */
export function formatMinimumRetirementAge(birthYear) {
  const months = minimumRetirementAgeMonths(birthYear);
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${years}`;
  return `${years} years ${rem} months`;
}

/**
 * FireFed stores an age rather than a date of birth, so the birth year is
 * derived. This is accurate to within a year, which is enough to place someone
 * in the right band except in the transition years, where the app should let
 * the user confirm.
 */
export function minimumRetirementAgeForCurrentAge({ currentAge, asOfYear = new Date().getFullYear() } = {}) {
  const age = Number(currentAge);
  if (!Number.isFinite(age)) return MRA_1970_ONWARD;
  return minimumRetirementAge(Math.round(asOfYear - Math.floor(age)));
}

/** Whether a birth year sits in a band where the derived year could be off by one. */
export function isMraTransitionYear(birthYear) {
  const year = Number(birthYear);
  return (year >= 1948 && year <= 1952) || (year >= 1965 && year <= 1969);
}
