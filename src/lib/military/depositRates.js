/**
 * The two rate tables the FERS military service deposit turns on.
 *
 * Deposit rate. The deposit is a percentage of the military basic pay earned
 * during the service, at the rate for the calendar year the pay was earned:
 * 3% for every year except 1999 (3.25%) and 2000 (3.40%), when the Balanced
 * Budget Act of 1997 temporarily raised civilian and military deposit rates
 * alike. 5 U.S.C. 8422(e)(1); CSRS/FERS Handbook chapter 23, section 23A2.1-1.
 *
 * Interest rate. Interest on an unpaid deposit accrues at the variable rate
 * Treasury sets for each calendar year under 5 U.S.C. 8334(e), the same rate
 * that applies to FERS refunds and civilian deposits. OPM announces it each
 * winter in a Benefits Administration Letter (BAL). Every year below has been
 * checked against a primary source on 2026-09-20:
 *
 *   1985–2017  OPM Benefits Officers Center, Reference Materials, "Interest
 *              Rates" table (3% for 1948–1984, 4% before 1948)
 *   2018       BAL 17-306   2.125%
 *   2019       BAL 18-306   2.750%   (also the 1 January value in the 2020 composite table)
 *   2020       BAL 19-308   2.250%   (also derivable from the 2020 composite table)
 *   2021       BAL 20-307   1.375%   (also the 1 January value in the 2022 composite table)
 *   2022       2022 composite table is 1.375% for every accrual date, so 2022 = 2021
 *   2023       BAL 23-301   1.875%
 *   2024       BAL 24-301   3.750%
 *   2025       BAL 25-301   4.375%
 *   2026       BAL 26-301   4.250%
 *
 * The composite tables OPM attaches to each BAL are the rate for a whole
 * accrual year ending on a given interest-accrual date: the prior year's rate
 * for the months before 1 January and the new year's rate after, on a 30-day
 * month, 360-day year count. deposit.js reproduces them from this table.
 *
 * Sources:
 *   https://www.opm.gov/retirement-center/benefits-officers-center/reference-materials/
 *   https://www.opm.gov/retirement-center/publications-forms/benefits-administration-letters/
 *   https://www.opm.gov/retirement-center/publications-forms/csrsfers-handbook/c023.pdf
 */

import { getAnnualParameters } from '../calculations/annualParameters';

/** Deposit rate by the calendar year the basic pay was earned. */
export const FERS_MILITARY_DEPOSIT_RATES = Object.freeze({
  default: 0.03,
  1999: 0.0325,
  2000: 0.034,
});

export function fersMilitaryDepositRate(year) {
  const y = Number(year);
  return FERS_MILITARY_DEPOSIT_RATES[y] ?? FERS_MILITARY_DEPOSIT_RATES.default;
}

/** Interest accrues from two years after the first FERS-covered appointment (or USERRA reemployment). */
export const DEPOSIT_INTEREST_FREE_YEARS = 2;

/**
 * Variable interest rate by calendar year. Values are decimals. `verified`
 * names the primary source the figure was checked against; a year added
 * before its source has been read carries `verified: null`.
 */
const REFERENCE_TABLE = 'OPM Benefits Officers Center reference materials, Interest Rates table';
const RATE_ROWS = [
  [1985, 0.13, REFERENCE_TABLE],
  [1986, 0.11125, REFERENCE_TABLE],
  [1987, 0.09, REFERENCE_TABLE],
  [1988, 0.08375, REFERENCE_TABLE],
  [1989, 0.09125, REFERENCE_TABLE],
  [1990, 0.0875, REFERENCE_TABLE],
  [1991, 0.08625, REFERENCE_TABLE],
  [1992, 0.08125, REFERENCE_TABLE],
  [1993, 0.07125, REFERENCE_TABLE],
  [1994, 0.0625, REFERENCE_TABLE],
  [1995, 0.07, REFERENCE_TABLE],
  [1996, 0.06875, REFERENCE_TABLE],
  [1997, 0.06875, REFERENCE_TABLE],
  [1998, 0.0675, REFERENCE_TABLE],
  [1999, 0.0575, REFERENCE_TABLE],
  [2000, 0.05875, REFERENCE_TABLE],
  [2001, 0.06375, REFERENCE_TABLE],
  [2002, 0.055, REFERENCE_TABLE],
  [2003, 0.05, REFERENCE_TABLE],
  [2004, 0.03875, REFERENCE_TABLE],
  [2005, 0.04375, REFERENCE_TABLE],
  [2006, 0.04125, REFERENCE_TABLE],
  [2007, 0.04875, REFERENCE_TABLE],
  [2008, 0.0475, REFERENCE_TABLE],
  [2009, 0.03875, REFERENCE_TABLE],
  [2010, 0.03125, REFERENCE_TABLE],
  [2011, 0.0275, REFERENCE_TABLE],
  [2012, 0.0225, REFERENCE_TABLE],
  [2013, 0.01625, REFERENCE_TABLE],
  [2014, 0.01625, REFERENCE_TABLE],
  [2015, 0.02, REFERENCE_TABLE],
  [2016, 0.02, REFERENCE_TABLE],
  [2017, 0.01875, REFERENCE_TABLE],
  [2018, 0.02125, 'BAL 17-306'],
  [2019, 0.0275, 'BAL 18-306; 2020 composite table'],
  [2020, 0.0225, 'BAL 19-308; 2020 composite table'],
  [2021, 0.01375, 'BAL 20-307; 2022 composite table'],
  [2022, 0.01375, '2022 composite table (constant across all accrual dates)'],
  [2023, 0.01875, 'BAL 23-301'],
  [2024, 0.0375, 'BAL 24-301'],
  [2025, 0.04375, 'BAL 25-301'],
  [2026, 0.0425, 'BAL 26-301'],
];

export const FERS_DEPOSIT_INTEREST_RATES = Object.freeze(
  Object.fromEntries(
    RATE_ROWS.map(([year, rate, source]) => [year, Object.freeze({ year, rate, verified: Boolean(source), source: source ?? null })])
  )
);

export const FIRST_DEPOSIT_INTEREST_RATE_YEAR = RATE_ROWS[0][0];
export const LAST_DEPOSIT_INTEREST_RATE_YEAR = RATE_ROWS[RATE_ROWS.length - 1][0];

/**
 * The rate for a year: `{ year, rate, verified, source }`. Years past the table
 * carry the latest published rate forward as an assumption and say so; years
 * before it return null, which callers must treat as "cannot compute".
 */
export function fersDepositInterestRate(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return null;
  if (FERS_DEPOSIT_INTEREST_RATES[y]) return FERS_DEPOSIT_INTEREST_RATES[y];
  if (y > LAST_DEPOSIT_INTEREST_RATE_YEAR) {
    return Object.freeze({
      year: y,
      rate: FERS_DEPOSIT_INTEREST_RATES[LAST_DEPOSIT_INTEREST_RATE_YEAR].rate,
      verified: false,
      assumed: true,
      source: null,
    });
  }
  return null;
}

/** The current-year figure the rest of the app already uses; the tables must agree. */
export function currentDepositInterestRateFromParameters() {
  return getAnnualParameters().fers.refundInterestRate;
}
