/**
 * Shared vocabulary for everything military-connected: how confident a result
 * is, where each input came from, and the stable catalogue of issues that the
 * UI, the PDF, the tests, and support all quote by code.
 *
 * Two ideas run through every military calculation and must never be blurred:
 *
 *   Precedence. A user-entered official award, balance, or agency determination
 *   beats a FireFed calculation from complete official inputs, which beats an
 *   estimate from incomplete inputs, which beats no calculation at all.
 *
 *   Never infer. Character of service, whether a Title 32 period is
 *   creditable, whether an order qualifies for a reduced Reserve retirement
 *   age, and whether retired pay must be waived are facts the user or an
 *   agency supplies. FireFed models the consequence of a fact; it does not
 *   decide the fact. When a required fact is unknown the result stops and
 *   says who decides it.
 *
 * Nothing in this module carries a dollar figure or a date. It is the language
 * the calculation modules speak, kept in one place so a code shown on screen,
 * printed in a report, and asserted in a test is always the same code.
 */

/**
 * Bumped whenever a military rule, rate table, or classification changes in a
 * way that could alter a saved result. Saved scenarios record the version they
 * were computed under so a later change is announced, never silently applied.
 */
export const MILITARY_RULES_VERSION = '2026.1';

/** The status carried by every military-connected result. */
export const MILITARY_RESULT_STATUS = Object.freeze({
  /** FireFed has the facts and an implemented rule. Show the result and its trace. */
  SUPPORTED: 'supported',
  /** FireFed projects a user-entered official amount; the amount itself is not calculated. */
  SUPPORTED_WITH_OFFICIAL_AMOUNT: 'supported_with_official_amount',
  /** A planning estimate is possible but not authoritative. Badge it. */
  ESTIMATE_ONLY: 'estimate_only',
  /** An agency must decide creditability or eligibility. Stop and say who. */
  OFFICIAL_DETERMINATION_REQUIRED: 'official_determination_required',
  /** The engine does not implement the case. Exclude it or take a manual amount. */
  NOT_SUPPORTED: 'not_supported',
});

/** Where a material input came from. Every sensitive input resolves to one of these. */
export const INPUT_PROVENANCE = Object.freeze({
  USER_ENTERED_OFFICIAL: 'user_entered_official',
  USER_ESTIMATE: 'user_estimate',
  FIREFED_CALCULATED: 'firefed_calculated',
  FIREFED_DEFAULT_ASSUMPTION: 'firefed_default_assumption',
  RULES_REGISTRY: 'rules_registry',
});

/**
 * The short label shown beside a number. Six labels, one per way a figure can
 * have arrived on the screen. "Not modeled" and "Official determination
 * required" are statuses rather than provenances, so they are listed here
 * rather than in INPUT_PROVENANCE.
 */
export const RESULT_LABELS = Object.freeze({
  OFFICIAL_INPUT: 'Official input',
  CALCULATED: 'Calculated',
  ESTIMATED: 'Estimated',
  ASSUMED: 'Assumed',
  NOT_MODELED: 'Not modeled',
  OFFICIAL_DETERMINATION_REQUIRED: 'Official determination required',
});

const PROVENANCE_LABEL = Object.freeze({
  [INPUT_PROVENANCE.USER_ENTERED_OFFICIAL]: RESULT_LABELS.OFFICIAL_INPUT,
  [INPUT_PROVENANCE.USER_ESTIMATE]: RESULT_LABELS.ESTIMATED,
  [INPUT_PROVENANCE.FIREFED_CALCULATED]: RESULT_LABELS.CALCULATED,
  [INPUT_PROVENANCE.FIREFED_DEFAULT_ASSUMPTION]: RESULT_LABELS.ASSUMED,
  [INPUT_PROVENANCE.RULES_REGISTRY]: RESULT_LABELS.CALCULATED,
});

/** The label for a provenance value; unknown provenance is treated as an estimate. */
export function labelForProvenance(provenance) {
  return PROVENANCE_LABEL[provenance] ?? RESULT_LABELS.ESTIMATED;
}

/** The label for a result status. */
export function labelForStatus(status) {
  switch (status) {
    case MILITARY_RESULT_STATUS.SUPPORTED:
      return RESULT_LABELS.CALCULATED;
    case MILITARY_RESULT_STATUS.SUPPORTED_WITH_OFFICIAL_AMOUNT:
      return RESULT_LABELS.OFFICIAL_INPUT;
    case MILITARY_RESULT_STATUS.ESTIMATE_ONLY:
      return RESULT_LABELS.ESTIMATED;
    case MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED:
      return RESULT_LABELS.OFFICIAL_DETERMINATION_REQUIRED;
    default:
      return RESULT_LABELS.NOT_MODELED;
  }
}

export const ISSUE_SEVERITY = Object.freeze({
  /** The affected calculation must not proceed. */
  BLOCK: 'block',
  /** The calculation proceeds with a caveat the user must see. */
  WARNING: 'warning',
  /** Explanation only. */
  INFO: 'info',
});

const OPM_CREDITABLE_SERVICE = 'https://www.opm.gov/retirement-center/fers-information/creditable-service/';
const OPM_HANDBOOK_CH22 = 'https://www.opm.gov/retirement-center/publications-forms/csrsfers-handbook/c022.pdf';
const OPM_MILITARY_RETIRED_PAY = 'https://www.opm.gov/retirement-center/fers-information/military-retired-pay/';
const OPM_FERS_TYPES = 'https://www.opm.gov/retirement-center/fers-information/types-of-retirement/';
const DOL_USERRA = 'https://www.dol.gov/agencies/vets/programs/userra';

/**
 * The issue catalogue. Each entry is what the user reads; the `entity` and any
 * per-occurrence detail are attached when the issue is raised. Remediation
 * always points at an official source or the user's own HR office, never at a
 * sales page.
 *
 * Codes prefixed MIL_ concern the federal-integration side; MRT_ codes for the
 * retirement calculator arrive with that engine. Later passes add to this
 * table; nothing is renamed once shipped.
 */
export const ISSUE_CATALOG = Object.freeze({
  MIL_DATES_MISSING: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'This service period has no start or end date, so FireFed cannot model it.',
    remediation: 'Enter the dates from your DD 214 or statement of service. Until then the period is excluded from every total.',
    source: OPM_CREDITABLE_SERVICE,
  }),
  MIL_PERIOD_OVERLAP: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Two service periods cover the same calendar days.',
    remediation: 'Adjust the dates, or mark one record as a sub-period of the other so the days are counted once.',
    source: OPM_HANDBOOK_CH22,
  }),
  MIL_DUTY_STATUS_UNKNOWN: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'The duty status for this period is unknown, and creditability depends on it.',
    remediation: 'Check the character and type of service on your DD 214 or orders. Your agency HR office can confirm what OPM will credit.',
    source: OPM_CREDITABLE_SERVICE,
  }),
  MIL_TITLE32_UNKNOWN: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Full-time National Guard duty is creditable only under specific Title 32 sections and only when it interrupted federal civilian service. The authority for this period is not known.',
    remediation: 'Find the order authority on your orders (for example 32 U.S.C. 502(f)) and confirm creditability with your agency HR office. No credit is modeled until then.',
    source: OPM_CREDITABLE_SERVICE,
  }),
  MIL_CHARACTER_UNKNOWN: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Creditable military service must have been performed under honorable conditions, and that has not been confirmed for this period.',
    remediation: 'Check the character of service on your DD 214. FireFed does not infer it and models no credit until it is confirmed.',
    source: OPM_HANDBOOK_CH22,
  }),
  MIL_DRILL_NOT_CREDITABLE: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'Inactive-duty training (weekend drill) is not creditable civilian-retirement service.',
    remediation: 'Nothing to do. Only active duty, active duty for training, and certain full-time Guard duty can be credited.',
    source: OPM_CREDITABLE_SERVICE,
  }),
  MIL_STATE_ACTIVE_DUTY_NOT_CREDITABLE: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'State active duty is service to the state, not federal military service, and is not creditable for FERS.',
    remediation: 'Nothing to do. If the same period included federal orders, record that portion separately.',
    source: OPM_CREDITABLE_SERVICE,
  }),
  MIL_RULE_NOT_IMPLEMENTED: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'FireFed does not implement the creditability rule for this type of service.',
    remediation: 'Ask your agency HR office whether OPM will credit it. If it is credited, enter it as active duty with the dates from the official determination.',
    source: OPM_HANDBOOK_CH22,
  }),
  MIL_USERRA_DETERMINATION: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'This period interrupted federal civilian employment. Credit and the deposit amount depend on a reemployment determination FireFed cannot make.',
    remediation: 'Confirm your reemployment rights and the deposit computation with your agency HR office.',
    source: DOL_USERRA,
  }),
  MIL_PRE_1957_NO_DEPOSIT: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'Service before 1 January 1957 is creditable without a deposit.',
    remediation: 'Nothing to do.',
    source: OPM_HANDBOOK_CH22,
  }),
  MIL_ESTIMATED_PERIOD: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'This period is a user estimate rather than an official record, so results that depend on it are estimates.',
    remediation: 'Replace the estimate with the dates and character of service from your DD 214 when you have it.',
    source: OPM_CREDITABLE_SERVICE,
  }),
  MIL_LEGACY_YEARS_UNDATED: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Military service was recorded as a number of years without dates. It is shown for reference but no credit is modeled.',
    remediation: 'Add each period of service with its dates so FireFed can model the deposit and the credit.',
    source: OPM_CREDITABLE_SERVICE,
  }),
  MIL_DEPOSIT_AFTER_SEPARATION: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'The planned deposit payment falls after separation from federal civilian service. A deposit cannot be completed after separation, so no credit is modeled.',
    remediation: 'Move the planned payment before your separation date, or confirm your agency will accept payment before your final pay period.',
    source: OPM_HANDBOOK_CH22,
  }),
  MIL_DEPOSIT_EARNINGS_MISSING: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'No military basic pay is recorded for part of this service, so the deposit for it cannot be estimated.',
    remediation: 'Request your estimated earnings from DFAS (or the pay center for your service) and enter basic pay by calendar year, or enter the official balance your agency quoted.',
    source: OPM_CREDITABLE_SERVICE,
  }),
  MIL_DEPOSIT_INTEREST_UNVERIFIED: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'The interest on this deposit is an estimate: the interest-accrual date or a historical interest rate is missing or not yet verified against OPM\'s published table.',
    remediation: 'Your agency\'s official balance controls. Enter it in official-balance mode, or supply the date you first became covered by FERS.',
    source: OPM_CREDITABLE_SERVICE,
  }),
  MIL_DEPOSIT_PLANNED: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'Credit for this service assumes the deposit is paid in full on the planned payment date.',
    remediation: 'Record each payment as it is made so the plan reflects the paid balance rather than the intention.',
    source: OPM_HANDBOOK_CH22,
  }),
  MIL_DEPOSIT_OFFICIAL_BALANCE: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'The deposit figure is the official balance you entered, projected forward with interest from its through-date.',
    remediation: 'Nothing to do. Update the balance when your agency issues a new one.',
    source: OPM_CREDITABLE_SERVICE,
  }),
  MIL_DEPOSIT_PARTIAL: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'The deposit for this service is not recorded as paid in full, so no FERS credit is modeled for it.',
    remediation: 'Each period earns credit only once its deposit is fully paid before you separate. Record the paid-in-full date from your agency when you have it.',
    source: OPM_HANDBOOK_CH22,
  }),
  MIL_SPOUSE_CREDIT_NOT_MODELED: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'Military service recorded for the other household member is not yet applied to their FERS figures.',
    remediation: 'Nothing to do now. Their credit will be modeled when household military service is supported.',
    source: OPM_CREDITABLE_SERVICE,
  }),
  MIL_STREAM_AMOUNT_MISSING: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'This income stream has no amount, so it is left out of the plan.',
    remediation: 'Enter the monthly or annual gross amount from your award letter, Retiree Account Statement, or leave and earnings statement.',
    source: OPM_CREDITABLE_SERVICE,
  }),
  MIL_CRDP_CRSC_MANUAL: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'Concurrent receipt (CRDP or CRSC) is projected only from an official amount. FireFed does not calculate eligibility, the VA offset, the phase-in, or which election is better.',
    remediation: 'Enter the CRDP or CRSC amount from your DFAS Retiree Account Statement with its date. Until then the stream is excluded from the plan.',
    source: 'https://www.dfas.mil/retiredmilitary/disability/comparison/',
  }),
  MIL_OFFICIAL_AMOUNT_STALE: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'The official amount for this stream is more than eighteen months old. A cost-of-living adjustment has probably changed it.',
    remediation: 'Confirm the current amount on your latest award letter or Retiree Account Statement and update the date.',
    source: 'https://www.va.gov/disability/compensation-rates/veteran-rates/',
  }),
  MIL_STATE_TAX_UNVERIFIED: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'State projection does not include a verified military-retirement exclusion. Military retired pay is taxed at the state rate until the rule for this state has been checked against its revenue department.',
    remediation: 'Nothing to do in the plan. Check your state\'s instructions for its military retirement subtraction; the plan may be overstating state tax.',
    source: 'https://taxfoundation.org/data/all/state/states-that-tax-military-retirement-pay/',
  }),
  MIL_DISABILITY_RETIRED_PAY_TAX_UNKNOWN: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'Disability retired pay can be taxable or excludable depending on an official classification FireFed does not make. It is projected as taxable until you record the classification.',
    remediation: 'Check the taxable amount shown on your Form 1099-R or Retiree Account Statement and set the tax treatment on this stream to match.',
    source: 'https://www.irs.gov/publications/p525',
  }),
  MIL_SBP_STATE_TREATMENT_UNKNOWN: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'A Survivor Benefit Plan annuity is projected as a taxable pension. Whether your state extends its military-retirement exclusion to survivor annuities is not yet modeled.',
    remediation: 'Nothing to do. Check your state\'s instructions if the state tax on this stream matters to the plan.',
    source: 'https://www.dfas.mil/retiredmilitary/survivors/',
  }),
  MIL_VA_TABLE_ESTIMATE: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'This VA compensation amount is read from the current rate table for the rating and dependents entered. It is an estimate, not your award.',
    remediation: 'Replace it with the monthly amount and date from your VA award letter when you have it.',
    source: 'https://www.va.gov/disability/compensation-rates/veteran-rates/',
  }),
  // ---------------------------------------------- retirement calculator (MRT_)
  MRT_PATH_UNKNOWN: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Choose which retirement you are estimating: active or regular, Guard or Reserve by points, an official medical retirement, TERA, or a check of retired pay you already receive.',
    remediation: 'Pick the path. If you are not sure, the "not sure" path explains each one; it cannot declare eligibility.',
    source: 'https://militarypay.defense.gov/Pay/Retirement/',
  }),
  MRT_PATH_UNSUPPORTED: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'This calculation path is not implemented yet. FireFed can project an official retired-pay amount you enter, but it will not estimate this retirement.',
    remediation: 'Enter the monthly gross from your service estimate or Retiree Account Statement as an income stream instead.',
    source: 'https://militarypay.defense.gov/Pay/Retirement/',
  }),
  MRT_SYSTEM_UNCONFIRMED: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'The retirement system has not been confirmed from your record. The result is an estimate until it is.',
    remediation: 'Check the retirement system shown on your service record or in your pay system and confirm it here. FireFed can suggest one from your entry date but cannot decide it.',
    source: 'https://militarypay.defense.gov/Pay/Retirement/',
  }),
  MRT_SYSTEM_CONFLICT: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'The retirement system you chose does not fit the entry date or election you entered. FireFed does not switch systems on its own.',
    remediation: 'Check the date you first entered service (DIEMS) and any Career Status Bonus or BRS election against your record, then correct whichever is wrong.',
    source: 'https://militarypay.defense.gov/Pay/Retirement/',
  }),
  MRT_1405_SERVICE_UNKNOWN: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Creditable service for the retired-pay multiplier is not recorded. FireFed does not compute it from enlistment and retirement dates.',
    remediation: 'Enter the years, months, and days of creditable service from your service record or retirement estimate (10 U.S.C. 1405 service).',
    source: 'https://militarypay.defense.gov/Pay/Retirement/ActiveDuty/',
  }),
  MRT_ACTIVE_SERVICE_BELOW_THRESHOLD: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'Under 20 years of active service is not a regular retirement. The figure shown is a hypothetical comparison, not an available retirement.',
    remediation: 'A retirement under 20 years exists only under a specific official authority (TERA or a medical retirement). Nothing here says one applies to you.',
    source: 'https://militarypay.defense.gov/Pay/Retirement/ActiveDuty/',
  }),
  MRT_PAY_ENTRY_DATE_UNKNOWN: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'The pay entry base date is not recorded, so every month is priced in the lowest years-of-service band. The pay base is an estimate.',
    remediation: 'Enter the pay entry base date from your leave and earnings statement, or enter the official High-36 average from your retirement estimate.',
    source: 'https://www.dfas.mil/militarymembers/payentitlements/Pay-Tables/',
  }),
  MRT_PAY_HISTORY_INCOMPLETE: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'Fewer than 36 months of the pay base come from a published pay table, so the High-36 average is an estimate.',
    remediation: 'Enter the official High-36 average from your service retirement estimate, or add the career grade dates so every month can be priced.',
    source: 'https://www.dfas.mil/militarymembers/payentitlements/Pay-Tables/',
  }),
  MRT_RETIRED_GRADE_UNCONFIRMED: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'The retired grade is taken as the last grade entered. Whether you retire in that grade can depend on a satisfactory-service determination FireFed does not make.',
    remediation: 'Confirm the retired grade with your service if you held it for less than the required time.',
    source: 'https://militarypay.defense.gov/Pay/Retirement/ActiveDuty/',
  }),
  MRT_PAY_TABLE_MISSING: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'No basic pay table covers this grade and date, so the pay base cannot be built.',
    remediation: 'Enter the official pay base from your retirement estimate, or a retirement date within the years FireFed has tables for.',
    source: 'https://www.dfas.mil/militarymembers/payentitlements/Pay-Tables/',
  }),
  MRT_FUTURE_PAY_TABLE_ASSUMED: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'Some months fall after the latest published pay table and are projected at the basic-pay growth assumption. They are not official rates.',
    remediation: 'The figure will change when the official table for those years is published. Adjust the growth assumption to see the sensitivity.',
    source: 'https://www.dfas.mil/militarymembers/payentitlements/Pay-Tables/',
  }),
  MRT_DERIVED_PAY_TABLE: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'Some months are priced from a pay table derived from a later year by removing the across-the-board raise, not from that year\'s published table.',
    remediation: 'Enter the official High-36 from your retirement estimate if you have it; the published tables for earlier years are a verification item.',
    source: 'https://www.dfas.mil/militarymembers/payentitlements/Pay-Tables/',
  }),
  MRT_REDUX_UNCONFIRMED: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'A REDUX calculation runs only with a stated Career Status Bonus election. FireFed does not infer the election from dates.',
    remediation: 'Confirm from your record whether you accepted the Career Status Bonus at 15 years. If not, your system is High-36.',
    source: 'https://militarypay.defense.gov/Pay/Retirement/ActiveDuty/',
  }),
  MRT_FIRST_COLA_CONVENTION: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'The first cost-of-living adjustment is prorated by the quarter you retire in. The proration FireFed applies is pending verification against the DoD Financial Management Regulation.',
    remediation: 'Nothing to do. The effect is a fraction of one year\'s adjustment.',
    source: 'https://comptroller.defense.gov/Portals/45/documents/fmr/Volume_07b.pdf',
  }),
  // ---- TSP coordination (spec §4.7, §6.9)
  MIL_TSP_SHARED_LIMIT_EXCEEDED: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Planned employee contributions across the civilian and uniformed-services TSP accounts (and any other plan that shares the limit) exceed this year’s elective-deferral limit.',
    remediation: 'The combined figure has to fit the limit. Agency and service contributions do not count toward it; tax-exempt combat-zone traditional contributions do not either.',
    source: 'https://www.tsp.gov/publications/tspfs07.pdf',
  }),
  MIL_TSP_ANNUAL_ADDITIONS_EXCEEDED: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Employee, automatic, and matching contributions to this account exceed the annual-additions limit for the year.',
    remediation: 'The 415(c) limit applies per plan and includes tax-exempt combat-zone contributions. Reduce the planned figure or record the actual one.',
    source: 'https://www.tsp.gov/publications/tspfs07.pdf',
  }),
  MIL_TSP_MATCH_AT_RISK: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'At the planned pace this account reaches the shared limit before the last pay period, and the pay periods after that receive no matching contribution.',
    remediation: 'Matching is paid per pay period on that period’s deferral. The figure shown is what the entered plan would leave unmatched; FireFed does not say what to contribute.',
    source: 'https://www.tsp.gov/making-contributions/contribution-types/',
  }),
  MIL_TSP_TAX_EXEMPT_BASIS_MISSING: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'This account has received tax-exempt combat-zone contributions, but the tax-exempt balance is not recorded. Withdrawals are projected as fully taxable until it is.',
    remediation: 'Enter the tax-exempt balance from your TSP statement; it is returned tax-free, pro rata, on withdrawal.',
    source: 'https://www.tsp.gov/making-contributions/contribution-types/',
  }),
  MIL_TSP_VESTING_AT_RISK: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'The automatic contributions in this account are not yet vested. Service in the other retirement system does not count toward vesting them.',
    remediation: 'FERS automatic contributions vest after three years of civilian service (two for some positions); BRS after two years of uniformed service.',
    source: 'https://www.tsp.gov/making-contributions/contribution-types/',
  }),
  MIL_USERRA_TRANSACTION_INCOMPLETE: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'A USERRA make-up or restoration entry is missing its type or the year it is attributed to, so it cannot be applied to a limit.',
    remediation: 'Record each make-up employee contribution and each restored agency contribution separately, with the year it replaces.',
    source: 'https://www.tsp.gov/publications/tspfs08.pdf',
  }),
  // ---- BRS extras (spec §20.8)
  MRT_BRS_CP_OFFER_REQUIRED: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Continuation pay is left out of the total because no official offer is recorded. There is no generic multiple; it varies by service, component, and year.',
    remediation: 'Enter the multiple, the monthly basic pay, and the payment date from your service’s official offer and mark them official.',
    source: 'https://militarypay.defense.gov/BlendedRetirement/',
  }),
  MRT_BRS_CP_FORFEITURE: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'Continuation pay carries an additional service obligation. Leaving before it ends can require repaying the unearned portion.',
    remediation: 'The obligation end date shown comes from the payment date and the obligation years on the offer.',
    source: 'https://militarypay.defense.gov/BlendedRetirement/',
  }),
  MRT_BRS_LSDR_MISSING: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'The lump-sum scenario is disabled: the official DoD lump-sum discount rate for this year is missing or stale.',
    remediation: 'Enter the rate from the current DoD memorandum with its year. FireFed does not substitute a generic rate.',
    source: 'https://militarypay.defense.gov/BlendedRetirement/',
  }),
  MRT_BRS_LUMP_SUM_VA_IMPACT: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'The lump-sum scenario is gross only. How a VA waiver or offset interacts with a reduced pension is not recorded.',
    remediation: 'Record the VA and concurrent-receipt facts to see the net effect; DFAS applies the official rules.',
    source: 'https://militarypay.defense.gov/BlendedRetirement/',
  }),
  MRT_BRS_LUMP_SUM_ALGORITHM_UNVERIFIED: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'The lump-sum discounting follows the statute’s description; the COLA, timing, and rounding conventions of the DoD calculation are pending verification.',
    remediation: 'Compare with the figure your service or DFAS provides before relying on it.',
    source: 'https://www.law.cornell.edu/uscode/text/10/1415',
  }),
  // ---- health coverage (spec §4.8)
  MIL_TRS_FEHB_CONFLICT: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Under the current rule a Selected Reserve member who is eligible for FEHB cannot purchase TRICARE Reserve Select. The statute changes on 1 January 2030.',
    remediation: 'Record confirmed alternative coverage for this period, or move the TRS period to start on or after the change.',
    source: 'https://tricare.mil/Plans/HealthPlans/TRS',
  }),
  MIL_TRS_FEHB_RULE_CHANGED: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'This TRICARE Reserve Select period begins after the FEHB restriction is scheduled to end. The change is enacted but not yet in effect; confirm the enrollment when the time comes.',
    remediation: 'Nothing to do now. The period is modeled as entered.',
    source: 'https://tricare.mil/Plans/HealthPlans/TRS',
  }),
  MIL_TRR_FEHB_CONFLICT: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Under the current rule a Retired Reserve member who is eligible for FEHB cannot purchase TRICARE Retired Reserve.',
    remediation: 'Record confirmed alternative coverage for this period.',
    source: 'https://tricare.mil/Plans/HealthPlans/TRR',
  }),
  MIL_TFL_PARTB_MISSING: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'TRICARE For Life requires Medicare Part A and Part B. No Part B date is recorded for this period, so the coverage is incomplete.',
    remediation: 'Enter the Part B effective date; the Part B premium stays in the projection.',
    source: 'https://tricare.mil/Plans/HealthPlans/TFL',
  }),
  MIL_CHAMPVA_TRICARE_CONFLICT: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'The same person is recorded with CHAMPVA and TRICARE coverage in the same period. A person eligible for TRICARE cannot receive CHAMPVA.',
    remediation: 'Correct the coverage record to what the VA and TRICARE have actually confirmed.',
    source: 'https://www.va.gov/family-and-caregiver-benefits/health-and-disability/champva/',
  }),
  MIL_CHAMPVA_MEDICARE_PARTS: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'A Medicare-eligible CHAMPVA beneficiary generally needs both Part A and Part B to keep CHAMPVA. Only one part is recorded.',
    remediation: 'Enter both Medicare dates, or confirm the exception with the VA.',
    source: 'https://www.va.gov/family-and-caregiver-benefits/health-and-disability/champva/',
  }),
  MIL_TAMP_DURATION: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'TAMP provides 180 days of coverage. This period is longer than that.',
    remediation: 'Shorten the period or record the coverage that follows it.',
    source: 'https://tricare.mil/Plans/SpecialPrograms/TAMP',
  }),
  MIL_TAMP_UNCONFIRMED: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'TAMP eligibility depends on the circumstances of separation. This period is modeled as user-confirmed coverage only.',
    remediation: 'Check the eligibility box once your service confirms it.',
    source: 'https://tricare.mil/Plans/SpecialPrograms/TAMP',
  }),
  MIL_CHCBP_DURATION: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'CHCBP is limited to 18 months for members and 36 months for other beneficiary categories. This period is longer than its category allows.',
    remediation: 'Shorten the period or record the coverage that follows it. Enrollment deadlines apply.',
    source: 'https://tricare.mil/Plans/SpecialPrograms/CHCBP',
  }),
  MIL_COVERAGE_OVERLAP: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'Two coverage periods for the same person overlap. Both costs are counted for the overlapping months.',
    remediation: 'If one is secondary coverage, that is fine; otherwise adjust the dates.',
    source: 'https://tricare.mil/Plans/Eligibility',
  }),
  MIL_COVERAGE_UNCONFIRMED: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'Neither enrollment nor eligibility is confirmed for this coverage period. The cost is projected as entered, but FireFed cannot treat the coverage as in place.',
    remediation: 'Check enrollment or eligibility once the program confirms it.',
    source: 'https://tricare.mil/Plans/Eligibility',
  }),
  MIL_TRICARE_COST_UNVERIFIED: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'The premium for this period comes from FireFed’s TRICARE table, which holds the last verified year. Enter the current amount from your enrollment to replace it.',
    remediation: 'TRICARE publishes new costs each calendar year.',
    source: 'https://tricare.mil/Costs',
  }),
  MRT_RESERVE_POINTS_OFFICIAL_REQUIRED: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'The retirement points used are an estimate. An actual entitlement needs the totals from your official point statement.',
    remediation: 'Enter the total points and qualifying years from your retirement points statement (ARPC, HRC, NPC, or your service equivalent).',
    source: 'https://militarypay.defense.gov/Pay/Retirement/Reserve/',
  }),
  MRT_RESERVE_POINTS_MISMATCH: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'The year-by-year points do not add up to the official total entered. FireFed does not pick one; the difference has to be resolved.',
    remediation: 'Compare each retirement year with your points statement. The statement controls once the rows agree with it.',
    source: 'https://militarypay.defense.gov/Pay/Retirement/Reserve/',
  }),
  MRT_QUALIFYING_YEARS_INSUFFICIENT: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'Fewer than 20 qualifying years are recorded, so this is a projection of a future retirement, not a current entitlement.',
    remediation: 'A qualifying year needs at least 50 points. The 20-year letter (Notice of Eligibility) is the official confirmation.',
    source: 'https://militarypay.defense.gov/Pay/Retirement/Reserve/',
  }),
  MRT_INACTIVE_POINT_CAP_APPLIED: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'Inactive-duty points in this retirement year exceed the ceiling for its ending date, so the excess is not credited. Active-duty points are never capped this way.',
    remediation: 'Nothing to do. The ceiling was 60, 75, 90, and is now 130, by the retirement-year ending date.',
    source: 'https://militarypay.defense.gov/Pay/Retirement/Reserve/',
  }),
  MRT_RETIRED_RESERVE_STATUS_UNKNOWN: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'Whether you stayed in the Retired Reserve or were discharged changes the years of service used for the pay base. It is not recorded, so the pay base is an estimate.',
    remediation: 'Check your retirement orders or discharge certificate and record the status.',
    source: 'https://militarypay.defense.gov/Pay/Retirement/Reserve/',
  }),
  MRT_REDUCED_AGE_UNVERIFIED: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'The reduced retired-pay age rests on qualifying duty that has not been verified by your service. It is an estimate; the age-60 comparison is kept.',
    remediation: 'Ask your service to verify the qualifying periods, or enter the official eligibility date once it is issued.',
    source: 'https://militarypay.defense.gov/Pay/Retirement/Reserve/',
  }),
  MRT_HEALTH_AGE_DIFFERS: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'An earlier retired-pay age does not move retiree health coverage earlier. TRICARE for retirees still begins at 60.',
    remediation: 'Plan coverage between the retired-pay start and 60 separately (for example TRICARE Retired Reserve).',
    source: 'https://tricare.mil/Plans/Eligibility',
  }),
  MRT_DUPLICATE_PLAN_INCOME: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'The same military pension is entering the plan twice: once from a linked calculation and once as a manually entered stream.',
    remediation: 'Remove the manual stream or unlink the calculation so the pension is counted once.',
    source: 'https://militarypay.defense.gov/Pay/Retirement/',
  }),
  MRT_RULES_STALE: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'This saved calculation was made under an earlier rules version. It has not been changed; recalculate to apply the current rules.',
    remediation: 'Open the calculation and recalculate. The earlier result stays in the history.',
    source: 'https://militarypay.defense.gov/Pay/Retirement/',
  }),
  MRT_OFFICIAL_RECONCILIATION_MISMATCH: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'FireFed\'s figure differs from the official amount you entered by more than the tolerance. The official amount controls the projection; the difference is diagnosed, not hidden.',
    remediation: 'Compare the pay base, service, system, and rounding in the trace with your estimate or statement to find the cause.',
    source: 'https://www.dfas.mil/retiredmilitary/plan/estimate/',
  }),
  MIL_RETIRED_PAY_TYPE_UNKNOWN: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'You receive military retired pay of an unknown type. Whether it must be waived to credit the service is an agency determination.',
    remediation: 'Identify the retirement type from your retirement orders or Retiree Account Statement and confirm the treatment with your agency HR office and OPM.',
    source: OPM_MILITARY_RETIRED_PAY,
  }),
  MIL_WAIVER_CONFIRMATION_REQUIRED: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Military retired pay of this type must be waived, effective when the FERS annuity begins, before the service can be credited. No credit is modeled until the waiver is elected and your agency\'s determination is recorded. A hypothetical waiver comparison is available.',
    remediation: 'Confirm the retirement type and the waiver requirement with your agency HR office and OPM. If you elect the waiver, record it here with the agency\'s determination; FireFed does not prepare or submit the waiver.',
    source: OPM_MILITARY_RETIRED_PAY,
  }),
  MIL_WAIVER_ELECTED: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'The plan credits the military service on the basis of an elected waiver of retired pay, effective when the FERS annuity begins. Retired pay and CRDP stop then.',
    remediation: 'Confirm the effect on survivor coverage, VA-related payments, and healthcare with your agency, OPM, and DFAS.',
    source: OPM_MILITARY_RETIRED_PAY,
  }),
  MIL_WAIVER_HYPOTHETICAL: Object.freeze({
    severity: ISSUE_SEVERITY.WARNING,
    message: 'This is a hypothetical waiver scenario. It is not the plan of record and not a waiver determination or recommendation.',
    remediation: 'Confirm the treatment of your retired pay, service credit, survivor coverage, VA-related payments, and healthcare with your agency, OPM, and DFAS before acting.',
    source: OPM_MILITARY_RETIRED_PAY,
  }),
  MIL_RESERVE_RETIRED_PAY_CONFIRMATION: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Reserve (chapter 1223) retired pay can be kept while the service is credited, but only once you confirm that is the retirement type on your orders and acknowledge that your agency and OPM make the determination.',
    remediation: 'Check the retirement authority on your retirement orders or Retiree Account Statement, confirm it with your agency HR office, and record the confirmation here.',
    source: OPM_MILITARY_RETIRED_PAY,
  }),
  MIL_RETIRED_PAY_EXCEPTION_APPLIED: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'The plan credits the military service without a waiver under a statutory exception you identified. Your agency and OPM control whether the exception applies.',
    remediation: 'Keep the official determination with your retirement records.',
    source: OPM_MILITARY_RETIRED_PAY,
  }),
  MIL_CH61_OFFICIAL_INPUT_REQUIRED: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Chapter 61 disability retired pay is not credited by FireFed unless you have an official finding that it was awarded for a disability incurred in combat or caused by an instrumentality of war. FireFed does not decide that, and does not model waiving disability retired pay.',
    remediation: 'Ask your agency HR office and OPM whether the exception applies to your award. Until then the retired pay is projected as entered and no service credit is modeled.',
    source: OPM_MILITARY_RETIRED_PAY,
  }),
  MIL_FIVE_CIVILIAN_YEARS: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Military service cannot supply the five years of civilian service FERS requires for any annuity.',
    remediation: 'Nothing to do. The plan stays ineligible until five civilian years are reached.',
    source: OPM_FERS_TYPES,
  }),
  MIL_SRS_EXCLUSION: Object.freeze({
    severity: ISSUE_SEVERITY.INFO,
    message: 'Credited military service does not count toward the FERS annuity supplement, which is prorated on civilian FERS service only.',
    remediation: 'Nothing to do.',
    source: OPM_FERS_TYPES,
  }),
  MIL_SPECIAL_SERVICE_EXCLUSION: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'Military service cannot satisfy the covered-service minimum for law enforcement, firefighter, or air traffic controller retirement.',
    remediation: 'Nothing to do. The special-provision test uses covered civilian service only.',
    source: OPM_FERS_TYPES,
  }),
});

export const ISSUE_CODES = Object.freeze(
  Object.fromEntries(Object.keys(ISSUE_CATALOG).map((code) => [code, code]))
);

/**
 * Raises an issue from the catalogue against an entity. The shape is stable:
 *
 *   { code, severity, entity, message, remediation, source, detail }
 *
 * `entity` names what the issue is about ({ type: 'servicePeriod', id }) so the
 * UI can attach it to the right row. `detail` carries per-occurrence facts such
 * as the overlapping day count; it never carries free text from the user.
 */
export function raiseIssue(code, { entity = null, detail = null } = {}) {
  const def = ISSUE_CATALOG[code];
  if (!def) throw new Error(`Unknown military issue code: ${code}`);
  return Object.freeze({
    code,
    severity: def.severity,
    entity,
    message: def.message,
    remediation: def.remediation,
    source: def.source,
    detail,
  });
}

/** True when any issue in the list blocks the calculation it belongs to. */
export function hasBlockingIssue(issues) {
  return Array.isArray(issues) && issues.some((i) => i?.severity === ISSUE_SEVERITY.BLOCK);
}

/**
 * Combines statuses from several parts of one result into the status the whole
 * result carries. Weakest wins: any blocked part blocks the whole; any estimate
 * makes the whole an estimate.
 */
export function combineStatuses(statuses) {
  const order = [
    MILITARY_RESULT_STATUS.NOT_SUPPORTED,
    MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED,
    MILITARY_RESULT_STATUS.ESTIMATE_ONLY,
    MILITARY_RESULT_STATUS.SUPPORTED_WITH_OFFICIAL_AMOUNT,
    MILITARY_RESULT_STATUS.SUPPORTED,
  ];
  const present = (statuses ?? []).filter(Boolean);
  if (present.length === 0) return MILITARY_RESULT_STATUS.NOT_SUPPORTED;
  for (const s of order) if (present.includes(s)) return s;
  return MILITARY_RESULT_STATUS.NOT_SUPPORTED;
}
