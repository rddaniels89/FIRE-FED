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
 * The year of birth implied by an age given in years and months.
 *
 * An age in whole years cannot settle the year: someone aged 60 in September
 * 2026 was born in 1965 if their birthday has not yet come round, and in 1966 if
 * it has. Adding the months pins the birth month, and with it the year — 60
 * years 4 months resolves to May 1966, and 60 years 11 months to October 1965.
 *
 * FireFed still stores an age rather than a date of birth. The day is never
 * asked for and never derived.
 */
export function birthYearFromAgeAndMonths({ currentAge, currentAgeMonths = 0, asOfDate = new Date() } = {}) {
  const years = Number(currentAge);
  if (!Number.isFinite(years)) return null;
  const months = Math.min(11, Math.max(0, Math.floor(Number(currentAgeMonths) || 0)));

  const d = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
  // Months since year zero, so the subtraction cannot straddle a year boundary
  // incorrectly.
  const nowMonths = d.getFullYear() * 12 + d.getMonth();
  const birthMonths = nowMonths - Math.floor(years) * 12 - months;
  return Math.floor(birthMonths / 12);
}

/**
 * The MRA implied by an age in years and months.
 *
 * `bornOnJanuaryFirst` exists because both SSA and OPM say to use the previous
 * year for a birthday of 1 January. That is a day-level rule, and the day is
 * not collected, so a caller who knows it can say so.
 */
export function minimumRetirementAgeForCurrentAge({
  currentAge,
  currentAgeMonths = 0,
  asOfDate = new Date(),
  bornOnJanuaryFirst = false,
} = {}) {
  const birthYear = birthYearFromAgeAndMonths({ currentAge, currentAgeMonths, asOfDate });
  if (birthYear === null) return MRA_1970_ONWARD;
  return minimumRetirementAge(bornOnJanuaryFirst ? birthYear - 1 : birthYear);
}

/** Whether a birth year sits in a band where the MRA is not a whole number of years. */
export function isMraTransitionYear(birthYear) {
  const year = Number(birthYear);
  return (year >= 1948 && year <= 1952) || (year >= 1965 && year <= 1969);
}
