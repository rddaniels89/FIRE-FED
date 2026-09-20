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
 * that applies to FERS refunds and civilian deposits. OPM publishes it each
 * January in a Benefits Administration Letter. The table below is the series
 * FireFed applies; the two most recent years are verified against their BALs
 * and the earlier years are transcribed from OPM's published series and
 * flagged for verification before any figure that depends on them is shown as
 * more than an estimate.
 *
 * Sources:
 *   https://www.opm.gov/retirement-center/fers-information/creditable-service/
 *   https://www.opm.gov/retirement-center/publications-forms/csrsfers-handbook/c023.pdf
 *   https://www.opm.gov/retirement-center/publications-forms/benefits-administration-letters/2026/26-301.pdf
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
 * Variable interest rate by calendar year. Values are decimals.
 * `verified` marks years checked against the OPM BAL for that year.
 */
const RATE_ROWS = [
  [1985, 0.13, false],
  [1986, 0.11125, false],
  [1987, 0.09, false],
  [1988, 0.08375, false],
  [1989, 0.09125, false],
  [1990, 0.0875, false],
  [1991, 0.08625, false],
  [1992, 0.08125, false],
  [1993, 0.07125, false],
  [1994, 0.0625, false],
  [1995, 0.07, false],
  [1996, 0.06875, false],
  [1997, 0.06875, false],
  [1998, 0.0675, false],
  [1999, 0.0575, false],
  [2000, 0.05875, false],
  [2001, 0.06375, false],
  [2002, 0.055, false],
  [2003, 0.05, false],
  [2004, 0.03875, false],
  [2005, 0.04375, false],
  [2006, 0.04125, false],
  [2007, 0.04875, false],
  [2008, 0.0475, false],
  [2009, 0.03875, false],
  [2010, 0.03125, false],
  [2011, 0.0275, false],
  [2012, 0.0225, false],
  [2013, 0.01625, false],
  [2014, 0.01625, false],
  [2015, 0.02, false],
  [2016, 0.02, false],
  [2017, 0.01875, false],
  [2018, 0.0275, false],
  [2019, 0.0275, false],
  [2020, 0.0225, false],
  [2021, 0.01375, false],
  [2022, 0.01375, false],
  [2023, 0.035, false],
  [2024, 0.0475, false],
  [2025, 0.04375, true],
  [2026, 0.0425, true],
];

export const FERS_DEPOSIT_INTEREST_RATES = Object.freeze(
  Object.fromEntries(RATE_ROWS.map(([year, rate, verified]) => [year, Object.freeze({ year, rate, verified })]))
);

export const FIRST_DEPOSIT_INTEREST_RATE_YEAR = RATE_ROWS[0][0];
export const LAST_DEPOSIT_INTEREST_RATE_YEAR = RATE_ROWS[RATE_ROWS.length - 1][0];

/**
 * The rate for a year: `{ year, rate, verified }`. Years past the table carry
 * the latest published rate forward as an assumption and say so; years before
 * it return null, which callers must treat as "cannot compute".
 */
export function fersDepositInterestRate(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return null;
  if (FERS_DEPOSIT_INTEREST_RATES[y]) return FERS_DEPOSIT_INTEREST_RATES[y];
  if (y > LAST_DEPOSIT_INTEREST_RATE_YEAR) {
    return Object.freeze({ year: y, rate: FERS_DEPOSIT_INTEREST_RATES[LAST_DEPOSIT_INTEREST_RATE_YEAR].rate, verified: false, assumed: true });
  }
  return null;
}

/** The current-year figure the rest of the app already uses; the tables must agree. */
export function currentDepositInterestRateFromParameters() {
  return getAnnualParameters().fers.refundInterestRate;
}
