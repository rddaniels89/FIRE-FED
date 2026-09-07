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
 *   Federal income tax        Rev. Proc. 2025-32 (2026 inflation adjustments),
 *                             as amended by the One Big Beautiful Bill Act,
 *                             Pub. L. 119-21 (OBBBA) — https://www.irs.gov/pub/irs-drop/rp-25-32.pdf
 *   Social Security taxation  IRC 86 (statutory, never indexed) —
 *                             https://www.irs.gov/publications/p915
 *   FICA wage base            https://www.ssa.gov/oact/cola/cbb.html
 */

/** Filing statuses used as keys throughout the federalTax and capitalGains blocks. */
export const FILING_STATUSES = Object.freeze({
  SINGLE: 'single',
  MARRIED_JOINT: 'married_joint',
  HEAD_OF_HOUSEHOLD: 'head_of_household',
  MARRIED_SEPARATE: 'married_separate',
});

/** A bracket list: ascending, each `upTo` a taxable-income ceiling; `null` means unbounded. */
function brackets(rows) {
  return Object.freeze(rows.map(([rate, upTo]) => Object.freeze({ rate, upTo })));
}

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

    fers: Object.freeze({
      /**
       * Interest on a refund of FERS contributions, and on service-credit
       * deposits, is set annually by Treasury. 2024: 4.375%; 2025: 4.5%; the
       * 2026 rate is carried as an estimate until OPM publishes it.
       * https://www.opm.gov/retirement-center/csrs-information/service-credit/
       */
      refundInterestRate: 0.045,
      /** Employee contribution rates by hire cohort. 5 U.S.C. 8422(a). */
      contributionRates: Object.freeze({ fers: 0.008, fers_rae: 0.031, fers_frae: 0.044 }),
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

    /**
     * Federal income tax, tax year 2026.
     *
     * Source: Rev. Proc. 2025-32 sections 2.01 (rate tables) and 2.15 (standard
     * deduction), reflecting the OBBBA's permanent extension of the TCJA rate
     * schedule and its increased standard deduction. Verify against the IRS
     * Form 1040 instructions for 2026 when published.
     */
    federalTax: Object.freeze({
      /** IRC 63(c), as amended by OBBBA s.70102. */
      standardDeduction: Object.freeze({
        single: 16100,
        married_joint: 32200,
        head_of_household: 24150,
        married_separate: 16100,
      }),

      /**
       * IRC 63(f) additional standard deduction for a taxpayer aged 65 or over
       * (or blind — not modelled). Per qualifying individual: unmarried filers
       * receive the larger figure, married filers the smaller one per spouse.
       */
      additionalStandardDeductionAge65: Object.freeze({
        single: 2050,
        married_joint: 1650,
        head_of_household: 2050,
        married_separate: 1650,
      }),

      /**
       * OBBBA s.70103 "senior bonus" deduction, IRC 151(d)(5), tax years
       * 2025-2028 only. $6,000 per individual aged 65+, allowed whether or not
       * the taxpayer itemizes, reduced by 6% of MAGI above the threshold. A
       * married individual must file jointly to claim it, so married_separate
       * is ineligible (`eligible: false`).
       */
      seniorBonusDeduction: Object.freeze({
        amountPerPerson: 6000,
        phaseOutRate: 0.06,
        firstTaxYear: 2025,
        lastTaxYear: 2028,
        phaseOutThreshold: Object.freeze({
          single: 75000,
          married_joint: 150000,
          head_of_household: 75000,
          married_separate: 75000,
        }),
        eligible: Object.freeze({
          single: true,
          married_joint: true,
          head_of_household: true,
          married_separate: false,
        }),
      }),

      /**
       * IRC 1(j) ordinary-income rate schedule, Rev. Proc. 2025-32 s.2.01.
       * Each `upTo` is the top of that bracket in taxable income; the final
       * bracket is unbounded.
       */
      brackets: Object.freeze({
        single: brackets([
          [0.10, 12400],
          [0.12, 50400],
          [0.22, 105700],
          [0.24, 201775],
          [0.32, 256225],
          [0.35, 640600],
          [0.37, null],
        ]),
        married_joint: brackets([
          [0.10, 24800],
          [0.12, 100800],
          [0.22, 211400],
          [0.24, 403550],
          [0.32, 512450],
          [0.35, 768700],
          [0.37, null],
        ]),
        head_of_household: brackets([
          [0.10, 17700],
          [0.12, 67450],
          [0.22, 105700],
          [0.24, 201775],
          [0.32, 256200],
          [0.35, 640600],
          [0.37, null],
        ]),
        // Half the joint schedule: identical to single except the 35% ceiling.
        married_separate: brackets([
          [0.10, 12400],
          [0.12, 50400],
          [0.22, 105700],
          [0.24, 201775],
          [0.32, 256225],
          [0.35, 384350],
          [0.37, null],
        ]),
      }),

      /**
       * IRC 86 provisional-income thresholds for taxing Social Security.
       * Statutory since 1984/1994 and never indexed. `base` starts the 50%
       * tier, `adjusted` the 85% tier. Married filing separately and living
       * with the spouse at any time in the year: both thresholds are zero.
       * https://www.irs.gov/publications/p915
       */
      socialSecurityProvisionalIncome: Object.freeze({
        single: Object.freeze({ base: 25000, adjusted: 34000 }),
        married_joint: Object.freeze({ base: 32000, adjusted: 44000 }),
        head_of_household: Object.freeze({ base: 25000, adjusted: 34000 }),
        married_separate: Object.freeze({ base: 0, adjusted: 0 }),
      }),

      /**
       * FICA, which FERS employees pay in full (CSRS employees pay only the
       * Medicare portion). The Social Security wage base is the SSA 2026
       * figure; the rates are statutory (IRC 3101). The 0.9% Additional
       * Medicare Tax above $200k/$250k is not modelled.
       * https://www.ssa.gov/oact/cola/cbb.html
       */
      fica: Object.freeze({
        socialSecurityRate: 0.062,
        socialSecurityWageBase: 184500,
        medicareRate: 0.0145,
      }),
    }),

    /**
     * IRC 1(h) long-term capital gain and qualified dividend rate thresholds,
     * Rev. Proc. 2025-32 s.2.03. The 0% rate applies to taxable income up to
     * `zeroRateUpTo`, 15% up to `fifteenRateUpTo`, 20% above. Gains stack on
     * top of ordinary income, so the thresholds are measured against total
     * taxable income, not against the gain alone. The 3.8% net investment
     * income tax is not modelled.
     */
    capitalGains: Object.freeze({
      single: Object.freeze({ zeroRateUpTo: 49450, fifteenRateUpTo: 545500 }),
      married_joint: Object.freeze({ zeroRateUpTo: 98900, fifteenRateUpTo: 613700 }),
      head_of_household: Object.freeze({ zeroRateUpTo: 66200, fifteenRateUpTo: 579600 }),
      married_separate: Object.freeze({ zeroRateUpTo: 49450, fifteenRateUpTo: 306850 }),
    }),

    /**
     * Medicare Part B, from the CMS 2026 premium and deductible announcement.
     * https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-and-deductibles
     *
     * IRMAA tiers are the CMS 2026 published figures. Both the MAGI thresholds
     * and the tier premiums change every year — re-verify each November when
     * CMS publishes the coming year's figures. The lookback means the 2026
     * surcharge is set by the 2024 tax return.
     */
    medicare: Object.freeze({
      partBStandardMonthlyPremium: 202.9,
      partBDeductible: 283,
      irmaa: Object.freeze([
        Object.freeze({ singleMagiAbove: 109000, jointMagiAbove: 218000, partBMonthly: 284.1 }),
        Object.freeze({ singleMagiAbove: 137000, jointMagiAbove: 274000, partBMonthly: 405.7 }),
        Object.freeze({ singleMagiAbove: 171000, jointMagiAbove: 342000, partBMonthly: 527.2 }),
        Object.freeze({ singleMagiAbove: 205000, jointMagiAbove: 410000, partBMonthly: 648.8 }),
        Object.freeze({ singleMagiAbove: 500000, jointMagiAbove: 750000, partBMonthly: 689.3 }),
      ]),
      irmaaLookbackYears: 2,
    }),

    /**
     * FEHB premium sharing and planning defaults.
     * https://www.opm.gov/healthcare-insurance/healthcare/plan-information/premiums/
     *
     * The government pays the lesser of 72% of the programme-wide average
     * premium or 75% of the chosen plan's premium (5 U.S.C. 8906). The 2026
     * enrollee share rose about 12.3% on average; 7% is a long-run planning
     * default, not a forecast. The enrollee-share defaults are approximations
     * of typical nationwide plans, not any specific plan's rate.
     */
    fehb: Object.freeze({
      governmentShareMaxPercent: 75,
      governmentShareOfAveragePercent: 72,
      averageAnnualPremiumIncreasePercent: 7.0,
      defaultAnnualEnrolleeShare: Object.freeze({
        self: 3400,
        selfPlusOne: 7600,
        family: 8300,
      }),
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
