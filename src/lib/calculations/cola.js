/**
 * FERS cost-of-living adjustments.
 *
 * Two rules make FERS COLAs different from CSRS, and both matter to anyone
 * planning an early retirement.
 *
 * The adjustment is reduced — the "diet COLA". When inflation runs above 2% a
 * FERS annuity loses ground every single year, by design.
 *
 * And most FERS retirees receive no COLA at all until age 62, however early they
 * retired. Someone leaving at 57 spends five years watching a fixed annuity
 * erode before the first adjustment ever arrives.
 *
 * Modelling a FERS pension as a level nominal figure alongside a TSP balance
 * that is deflated to today's dollars makes the two incomparable, which is the
 * error this module exists to remove.
 *
 * https://www.opm.gov/retirement-center/fers-information/
 */

/** Most FERS retirees receive no adjustment before this age. */
export const FERS_COLA_START_AGE = 62;

/**
 * The diet COLA, as a rate, from a CPI increase expressed as a decimal.
 *
 *   CPI up to 2%      -> the full CPI increase
 *   CPI over 2 to 3%  -> flat 2%
 *   CPI above 3%      -> CPI minus 1 percentage point
 */
export function calculateFersColaRate(cpiIncrease) {
  const cpi = Number(cpiIncrease);
  if (!Number.isFinite(cpi) || cpi <= 0) return 0;
  if (cpi <= 0.02) return cpi;
  if (cpi <= 0.03) return 0.02;
  return cpi - 0.01;
}

/**
 * Whether an adjustment is payable at a given age.
 *
 * Special provision retirees — law enforcement, firefighters, air traffic
 * controllers — and disability retirees are the exceptions: they receive COLAs
 * from the start rather than waiting for 62.
 */
export function isFersColaPayableAtAge({
  age,
  isSpecialProvision = false,
  isDisabilityRetirement = false,
} = {}) {
  if (isSpecialProvision || isDisabilityRetirement) return true;
  return Number(age) >= FERS_COLA_START_AGE;
}

/**
 * Projects an annuity year by year, applying the diet COLA once it becomes
 * payable and deflating to today's dollars alongside it.
 *
 * `nominal` is what the payment says; `real` is what it buys. The gap between
 * them over a long retirement is the point — a 57-year-old retiree's annuity can
 * lose a fifth of its purchasing power before the first COLA is ever applied.
 */
export function projectAnnuityWithCola({
  annualPension,
  startAge,
  endAge,
  cpiIncrease = 0,
  isSpecialProvision = false,
  isDisabilityRetirement = false,
} = {}) {
  const base = Math.max(0, Number(annualPension) || 0);
  const from = Number(startAge) || 0;
  const to = Number(endAge) || 0;
  const cpi = Math.max(0, Number(cpiIncrease) || 0);
  const colaRate = calculateFersColaRate(cpi);

  const years = [];
  let nominal = base;
  let lifetimeNominal = 0;
  let lifetimeReal = 0;

  for (let i = 0; from + i < to; i += 1) {
    const age = from + i;

    // The first year is paid at the starting rate; adjustments apply from the
    // year after the annuity begins, and only once the retiree is eligible.
    if (i > 0 && isFersColaPayableAtAge({ age, isSpecialProvision, isDisabilityRetirement })) {
      nominal *= 1 + colaRate;
    }

    const real = cpi > 0 ? nominal / Math.pow(1 + cpi, i) : nominal;

    years.push({ age, nominal, real, colaApplied: i > 0 && colaRate > 0 && isFersColaPayableAtAge({ age, isSpecialProvision, isDisabilityRetirement }) });
    lifetimeNominal += nominal;
    lifetimeReal += real;
  }

  const finalYear = years[years.length - 1] ?? null;

  return {
    years,
    lifetimeNominal,
    lifetimeReal,
    colaRate,
    firstYearNominal: base,
    finalYearNominal: finalYear?.nominal ?? 0,
    finalYearReal: finalYear?.real ?? 0,
    /** Share of purchasing power left in the final payment. */
    purchasingPowerRetained: base > 0 && finalYear ? finalYear.real / base : 1,
  };
}
