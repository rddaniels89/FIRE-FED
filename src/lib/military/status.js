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
  MIL_RETIRED_PAY_TYPE_UNKNOWN: Object.freeze({
    severity: ISSUE_SEVERITY.BLOCK,
    message: 'You receive military retired pay of an unknown type. Whether it must be waived to credit the service is an agency determination.',
    remediation: 'Identify the retirement type from your retirement orders or Retiree Account Statement and confirm the treatment with your agency HR office and OPM.',
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
