/**
 * Social Security retirement benefit: full retirement age, early/late claiming
 * adjustments, and the trust-fund shortfall.
 *
 * The benefit SSA quotes on a statement is the Primary Insurance Amount (PIA):
 * what is payable at full retirement age (FRA). Claiming earlier permanently
 * reduces it and claiming later permanently increases it, both by fixed
 * per-month amounts set in statute. For someone with FRA 67 the spread is
 * 70% of PIA at 62 versus 124% at 70 — a 77% difference in the monthly cheque
 * for the rest of their life, which is why claiming age is the single largest
 * lever in a federal retiree's post-62 income.
 *
 * Reduction for early claiming (42 U.S.C. 402(q)):
 *   5/9 of 1% per month for the first 36 months before FRA
 *   5/12 of 1% per month for each month beyond 36
 * Delayed retirement credit (42 U.S.C. 402(w)), for those born 1943 or later:
 *   2/3 of 1% per month (8% a year) for each month past FRA, stopping at 70.
 *
 * Simplifications, deliberate and documented:
 *   - SSA works in whole months and rounds each step down to the dime. This
 *     module works in whole months but does not round to the dime.
 *   - Delayed credits earned in a year are not paid until the following
 *     January (except at 70). Ignored; the permanent factor is what matters
 *     for planning.
 *   - Someone born on 1 January is treated by SSA as born the prior year.
 *     FireFed stores ages rather than birth dates, so this cannot be modelled.
 *
 * Sources:
 *   https://www.ssa.gov/benefits/retirement/planner/agereduction.html
 *   https://www.ssa.gov/benefits/retirement/planner/delayret.html
 *   https://www.ssa.gov/oact/quickcalc/early_late.html
 *   https://www.ssa.gov/oact/trsum/
 */

/** Benefits cannot be claimed before 62. */
export const SS_EARLIEST_CLAIM_AGE = 62;

/** Delayed retirement credits stop accruing at 70; there is no reason to wait longer. */
export const SS_LATEST_CLAIM_AGE = 70;

/** The FRA everyone born 1960 or later has. */
export const SS_DEFAULT_FRA = 67;

const MONTHS_PER_YEAR = 12;

/** 5/9 of 1% per month, as a decimal, for the first 36 months before FRA. */
export const EARLY_REDUCTION_RATE_FIRST_36 = 5 / 9 / 100;

/** 5/12 of 1% per month, as a decimal, for months beyond the first 36. */
export const EARLY_REDUCTION_RATE_BEYOND_36 = 5 / 12 / 100;

/** Months reduced at the higher rate before the lower rate takes over. */
export const EARLY_REDUCTION_FIRST_TIER_MONTHS = 36;

/** 2/3 of 1% per month (8% a year) for those born 1943 or later. */
export const DELAYED_CREDIT_RATE_PER_MONTH = 2 / 3 / 100;

/**
 * The delayed retirement credit is not 8% for everyone. It rises with year of
 * birth from 3% to 8%, reaching 8% only for those born in 1943 or later.
 * https://www.ssa.gov/oact/quickcalc/early_late.html
 *
 * Everyone planning a federal retirement today is in the 8% band, so this table
 * changes nothing in practice. It is here because a rate that is wrong for some
 * inputs is a rate that has to be reasoned about, and a small table costs less
 * than the caveat would.
 */
const DELAYED_CREDIT_ANNUAL_RATE_BY_BIRTH_YEAR = Object.freeze([
  [1924, 0.03],
  [1926, 0.035],
  [1928, 0.04],
  [1930, 0.045],
  [1932, 0.05],
  [1934, 0.055],
  [1936, 0.06],
  [1938, 0.065],
  [1940, 0.07],
  [1942, 0.075],
]);

/** Annual delayed retirement credit rate for a year of birth. */
export function delayedCreditAnnualRate(birthYear) {
  const year = Number(birthYear);
  if (!Number.isFinite(year)) return DELAYED_CREDIT_RATE_PER_MONTH * 12;
  for (const [through, rate] of DELAYED_CREDIT_ANNUAL_RATE_BY_BIRTH_YEAR) {
    if (year <= through) return rate;
  }
  return DELAYED_CREDIT_RATE_PER_MONTH * 12;
}

/**
 * The 2025 Trustees Report projects the OASI trust fund reserves deplete in
 * 2033, after which continuing payroll-tax income covers about 77% of
 * scheduled benefits — a 23% across-the-board cut unless Congress acts. The
 * cut would apply to everyone on the rolls that year, not only new claimants.
 */
export const DEFAULT_TRUST_FUND_HAIRCUT = Object.freeze({ startYear: 2033, percent: 23 });

export const TRUST_FUND_HAIRCUT_CITATION =
  '2025 OASDI Trustees Report summary: OASI reserves projected depleted in 2033, ' +
  'with 77% of scheduled benefits payable thereafter. https://www.ssa.gov/oact/trsum/';

/** The crude estimate mode the app has always offered: a share of final salary. */
export const DEFAULT_PIA_REPLACEMENT_PERCENT = 30;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, num(value, fallback));
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function isSet(value) {
  return value !== undefined && value !== null;
}

function fraFromMonths(totalMonths) {
  const total = Math.round(nonNegative(totalMonths));
  return {
    years: Math.floor(total / MONTHS_PER_YEAR),
    months: total % MONTHS_PER_YEAR,
    totalMonths: total,
    decimal: total / MONTHS_PER_YEAR,
  };
}

/**
 * Full retirement age by year of birth. SSA's published table.
 *
 *   1937 and earlier  65
 *   1938 to 1942      65 plus 2 months per year
 *   1943 to 1954      66
 *   1955 to 1959      66 plus 2 months per year
 *   1960 and later    67
 *
 * https://www.ssa.gov/benefits/retirement/planner/agereduction.html
 */
export function fullRetirementAge({ birthYear } = {}) {
  const year = Math.floor(num(birthYear, 1960));

  let years;
  let months;
  if (year <= 1937) {
    years = 65;
    months = 0;
  } else if (year <= 1942) {
    years = 65;
    months = (year - 1937) * 2;
  } else if (year <= 1954) {
    years = 66;
    months = 0;
  } else if (year <= 1959) {
    years = 66;
    months = (year - 1954) * 2;
  } else {
    years = 67;
    months = 0;
  }

  return fraFromMonths(years * MONTHS_PER_YEAR + months);
}

/**
 * FireFed stores a current age rather than a birth date, so the birth year can
 * only be recovered to within a year: someone who is 40 today was born either
 * this year minus 40 or the year before, depending on whether their birthday
 * has passed. `asOfYear - floor(currentAge)` is the later of the two. The only
 * place this matters is the FRA table's 1955-1959 band, where being off by one
 * year shifts FRA by two months.
 */
export function birthYearFromAge({ currentAge, asOfYear = new Date().getFullYear() } = {}) {
  return Math.floor(num(asOfYear)) - Math.floor(nonNegative(currentAge));
}

/** Months win over decimal years, which win over a birth year; default FRA 67. */
function resolveFraMonths({ fraMonths, fra, birthYear }) {
  if (isSet(fraMonths)) return Math.round(num(fraMonths));
  if (isSet(fra)) return Math.round(num(fra) * MONTHS_PER_YEAR);
  if (isSet(birthYear)) return fullRetirementAge({ birthYear }).totalMonths;
  return SS_DEFAULT_FRA * MONTHS_PER_YEAR;
}

function resolveClaimMonths({ claimAgeMonths, claimAge }) {
  const raw = isSet(claimAgeMonths)
    ? Math.round(num(claimAgeMonths))
    : Math.round(num(claimAge, SS_DEFAULT_FRA) * MONTHS_PER_YEAR);
  return clamp(raw, SS_EARLIEST_CLAIM_AGE * MONTHS_PER_YEAR, SS_LATEST_CLAIM_AGE * MONTHS_PER_YEAR);
}

/**
 * The claiming adjustment in full: the factor plus the months that produced it.
 *
 * Accepts the claim age and FRA either as whole months or as decimal years;
 * months win when both are given. The claim age is clamped to [62, 70] since
 * nothing is payable before 62 and nothing accrues after 70.
 */
export function claimingAdjustment({ claimAgeMonths, claimAge, fraMonths, fra, birthYear } = {}) {
  const claim = resolveClaimMonths({ claimAgeMonths, claimAge });
  const fraTotal = resolveFraMonths({ fraMonths, fra, birthYear });

  const reductionMonths = Math.max(0, fraTotal - claim);
  const creditMonths = Math.max(0, claim - fraTotal);

  const firstTier = Math.min(reductionMonths, EARLY_REDUCTION_FIRST_TIER_MONTHS);
  const secondTier = Math.max(0, reductionMonths - EARLY_REDUCTION_FIRST_TIER_MONTHS);
  const reduction = firstTier * EARLY_REDUCTION_RATE_FIRST_36 + secondTier * EARLY_REDUCTION_RATE_BEYOND_36;
  const credit = creditMonths * (delayedCreditAnnualRate(birthYear) / 12);

  return {
    factor: 1 - reduction + credit,
    claimAgeMonths: claim,
    fraMonths: fraTotal,
    reductionMonths,
    creditMonths,
    reductionPercent: reduction * 100,
    creditPercent: credit * 100,
  };
}

/**
 * Share of PIA payable for a given claim age, as a decimal.
 *
 *   claim 62, FRA 67 -> 0.70   (36 x 5/9% + 24 x 5/12% = 30% reduction)
 *   claim 65, FRA 67 -> 0.8667 (24 x 5/9% = 13.33% reduction)
 *   claim 70, FRA 67 -> 1.24   (36 x 2/3% = 24% credit)
 */
export function claimingAdjustmentFactor(options = {}) {
  return claimingAdjustment(options).factor;
}

/** True once the trust-fund cut is in effect for the given calendar year. */
export function trustFundHaircutApplies({ year, trustFundHaircut = null } = {}) {
  if (!trustFundHaircut || !isSet(year)) return false;
  const start = num(trustFundHaircut.startYear, Infinity);
  const percent = nonNegative(trustFundHaircut.percent);
  return percent > 0 && num(year, -Infinity) >= start;
}

/**
 * A benefit for one calendar year after the trust-fund cut, if it is in force.
 *
 * The cut is to scheduled benefits for everyone, including people who claimed
 * years earlier, so a timeline should call this for every year rather than
 * only at claim. Returns the monthly figure unchanged when no cut applies.
 */
export function applyTrustFundHaircut({ monthly, year, trustFundHaircut = null } = {}) {
  const base = nonNegative(monthly);
  if (!trustFundHaircutApplies({ year, trustFundHaircut })) return base;
  return base * (1 - nonNegative(trustFundHaircut.percent) / 100);
}

/**
 * The benefit actually payable at claim from a statement PIA.
 *
 * `piaMonthlyAtFra` is the age-FRA figure from ssa.gov, in today's dollars.
 * SSA applies COLAs to the PIA from the year the worker turns 62 whether or
 * not they have claimed, so `colaRate` over `yearsOfColaBeforeClaim` grows
 * the PIA before the claiming factor is applied. Both default to zero, which
 * keeps the result in today's dollars.
 *
 * The trust-fund haircut is applied when `claimYear` is at or past its start
 * year; without a `claimYear` it is never applied here.
 */
export function calculateSocialSecurityBenefit({
  piaMonthlyAtFra,
  claimAge,
  claimAgeMonths,
  birthYear,
  fra,
  fraMonths,
  colaRate = 0,
  yearsOfColaBeforeClaim = 0,
  trustFundHaircut = null,
  claimYear,
} = {}) {
  const pia = nonNegative(piaMonthlyAtFra);
  const fraResolved = fraFromMonths(resolveFraMonths({ fraMonths, fra, birthYear }));

  const adjustment = claimingAdjustment({
    claimAgeMonths,
    claimAge,
    fraMonths: fraResolved.totalMonths,
  });

  const colaGrowth = Math.pow(1 + nonNegative(colaRate), nonNegative(yearsOfColaBeforeClaim));
  const monthlyAtClaim = pia * colaGrowth * adjustment.factor;

  const haircutApplies = trustFundHaircutApplies({ year: claimYear, trustFundHaircut });
  const monthlyAfterHaircut = applyTrustFundHaircut({ monthly: monthlyAtClaim, year: claimYear, trustFundHaircut });

  return {
    fra: fraResolved,
    factor: adjustment.factor,
    claimAgeMonths: adjustment.claimAgeMonths,
    monthlyAtClaim,
    annualAtClaim: monthlyAtClaim * MONTHS_PER_YEAR,
    monthlyAfterHaircut,
    annualAfterHaircut: monthlyAfterHaircut * MONTHS_PER_YEAR,
    haircutApplies,
    reductionMonths: adjustment.reductionMonths,
    creditMonths: adjustment.creditMonths,
  };
}

/**
 * Age at which the cumulative total from claiming at `laterAge` overtakes the
 * cumulative total from claiming at `earlierAge`, ignoring COLAs and discounting.
 *
 *   earlier * (X - earlierAge) = later * (X - laterAge)
 *   X = laterAge + earlier / (later - earlier)
 */
function breakEvenAge({ earlierMonthly, laterAge, laterMonthly }) {
  const gain = laterMonthly - earlierMonthly;
  if (gain <= 0 || earlierMonthly <= 0) return null;
  return laterAge + earlierMonthly / gain;
}

/**
 * The benefit at every whole claim age from 62 to 70, for a claiming-age table.
 *
 * `cumulativeBreakEvenAgeVsPrior` is the age at which waiting one more year
 * pays for itself against the row before it; null for the 62 row. The 62 to 63
 * step with FRA 67 breaks even at 77, which is the figure SSA's own planners
 * quote.
 */
export function socialSecurityByClaimAge({ piaMonthlyAtFra, fra, fraMonths, birthYear } = {}) {
  const pia = nonNegative(piaMonthlyAtFra);
  const fraTotal = resolveFraMonths({ fraMonths, fra, birthYear });

  const rows = [];
  for (let claimAge = SS_EARLIEST_CLAIM_AGE; claimAge <= SS_LATEST_CLAIM_AGE; claimAge += 1) {
    const factor = claimingAdjustmentFactor({ claimAge, fraMonths: fraTotal });
    const monthly = pia * factor;
    const prior = rows[rows.length - 1] ?? null;

    rows.push({
      claimAge,
      factor,
      monthly,
      annual: monthly * MONTHS_PER_YEAR,
      cumulativeBreakEvenAgeVsPrior: prior
        ? breakEvenAge({
          earlierMonthly: prior.monthly,
          laterAge: claimAge,
          laterMonthly: monthly,
        })
        : null,
    });
  }
  return rows;
}

/**
 * The age-62 monthly benefit. OPM's Special Retirement Supplement formula is
 * built on this figure, not the FRA one, so srs.js needs it directly.
 */
export function estimateSocialSecurityAt62({ piaMonthlyAtFra, fra, fraMonths, birthYear } = {}) {
  const fraTotal = resolveFraMonths({ fraMonths, fra, birthYear });
  return nonNegative(piaMonthlyAtFra) * claimingAdjustmentFactor({ claimAge: SS_EARLIEST_CLAIM_AGE, fraMonths: fraTotal });
}

/**
 * Fallback when no statement figure is available: a flat share of salary,
 * returned as a monthly PIA. This is the app's long-standing "estimate" mode.
 *
 * It is crude. SSA's formula is progressive — replacement runs around 40% for
 * a median earner and drops toward 25% at the wage base — and depends on 35
 * years of indexed earnings, not the final salary. Treat the result as a
 * placeholder until the user pastes their statement figure.
 */
export function estimatePiaFromSalary({ annualSalary, replacementPercent = DEFAULT_PIA_REPLACEMENT_PERCENT } = {}) {
  const salary = nonNegative(annualSalary);
  const pct = nonNegative(replacementPercent, DEFAULT_PIA_REPLACEMENT_PERCENT);
  return (salary * (pct / 100)) / MONTHS_PER_YEAR;
}
