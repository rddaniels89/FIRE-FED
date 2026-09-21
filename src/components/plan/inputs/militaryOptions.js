/** Option lists and labels for the military inputs and results screens. */

import { MILITARY_CONNECTIONS, MILITARY_RELATIONSHIPS, DEPOSIT_STATUSES } from '../../../lib/scenarios/schema';
import { BRANCHES, CHARACTER_STATUS, COMPONENTS, DOCUMENTATION_STATUS, DUTY_STATUS } from '../../../lib/military/servicePeriods';
import { INPUT_PROVENANCE } from '../../../lib/military/status';
import { AMOUNT_STATUSES, COLA_POLICIES, FEDERAL_TAX_CLASSES, FREQUENCIES, STREAM_TYPES, STREAM_TYPE_RULES } from '../../../lib/military/incomeStreams';
import { CHAPTER_61_EXCEPTION, DETERMINATION_STATUSES, RETIRED_PAY_RECEIPT, RETIRED_PAY_TYPES, WAIVER_MODES } from '../../../lib/military/retiredPayWaiver';

export const CONNECTION_OPTIONS = [
  { value: MILITARY_CONNECTIONS.NONE, label: 'No' },
  { value: MILITARY_CONNECTIONS.SELF, label: 'Yes, me' },
  { value: MILITARY_CONNECTIONS.OTHER_MEMBER, label: 'Yes, another household member' },
  { value: MILITARY_CONNECTIONS.MULTIPLE, label: 'Yes, more than one person' },
  { value: MILITARY_CONNECTIONS.UNSURE, label: 'Not sure' },
];

export const RELATIONSHIP_OPTIONS = [
  { value: '', label: 'Choose one' },
  { value: MILITARY_RELATIONSHIPS.ACTIVE_DUTY, label: 'Active duty' },
  { value: MILITARY_RELATIONSHIPS.VETERAN, label: 'Veteran' },
  { value: MILITARY_RELATIONSHIPS.SELECTED_RESERVE, label: 'Selected Reserve' },
  { value: MILITARY_RELATIONSHIPS.OTHER_RESERVE_GUARD, label: 'Other Reserve or Guard' },
  { value: MILITARY_RELATIONSHIPS.REGULAR_RETIREE, label: 'Regular military retiree' },
  { value: MILITARY_RELATIONSHIPS.RESERVE_RETIREE, label: 'Reserve retiree or gray-area retiree' },
  { value: MILITARY_RELATIONSHIPS.SPOUSE, label: 'Spouse of a service member or veteran' },
  { value: MILITARY_RELATIONSHIPS.SURVIVOR, label: 'Survivor' },
  { value: MILITARY_RELATIONSHIPS.UNSURE, label: 'Not sure' },
];

export const BRANCH_OPTIONS = [
  { value: BRANCHES.ARMY, label: 'Army' },
  { value: BRANCHES.NAVY, label: 'Navy' },
  { value: BRANCHES.AIR_FORCE, label: 'Air Force' },
  { value: BRANCHES.MARINE_CORPS, label: 'Marine Corps' },
  { value: BRANCHES.COAST_GUARD, label: 'Coast Guard' },
  { value: BRANCHES.SPACE_FORCE, label: 'Space Force' },
  { value: BRANCHES.PUBLIC_HEALTH_SERVICE, label: 'Public Health Service Commissioned Corps' },
  { value: BRANCHES.NOAA_CORPS, label: 'NOAA Commissioned Officer Corps' },
  { value: BRANCHES.OTHER, label: 'Other or not sure' },
];

export const COMPONENT_OPTIONS = [
  { value: COMPONENTS.REGULAR, label: 'Regular (active component)' },
  { value: COMPONENTS.RESERVE, label: 'Reserve' },
  { value: COMPONENTS.NATIONAL_GUARD, label: 'National Guard' },
  { value: COMPONENTS.OTHER, label: 'Other' },
  { value: COMPONENTS.UNKNOWN, label: 'Not sure' },
];

export const DUTY_STATUS_OPTIONS = [
  { value: DUTY_STATUS.ACTIVE_DUTY, label: 'Active duty' },
  { value: DUTY_STATUS.ACTIVE_DUTY_FOR_TRAINING, label: 'Active duty for training' },
  { value: DUTY_STATUS.INACTIVE_DUTY_TRAINING, label: 'Inactive-duty training (drill)' },
  { value: DUTY_STATUS.ACADEMY, label: 'Service academy (cadet or midshipman)' },
  { value: DUTY_STATUS.ROTC, label: 'ROTC' },
  { value: DUTY_STATUS.TITLE32_FULL_TIME, label: 'Title 32 full-time National Guard duty' },
  { value: DUTY_STATUS.STATE_ACTIVE_DUTY, label: 'State active duty' },
  { value: DUTY_STATUS.UNKNOWN, label: 'Not sure' },
];

export const DUTY_STATUS_LABELS = Object.fromEntries(DUTY_STATUS_OPTIONS.map((o) => [o.value, o.label]));

export const CHARACTER_OPTIONS = [
  { value: CHARACTER_STATUS.CONFIRMED_HONORABLE_CONDITIONS, label: 'Official record confirms honorable conditions' },
  { value: CHARACTER_STATUS.NOT_CONFIRMED, label: 'Official record does not confirm it' },
  { value: CHARACTER_STATUS.UNKNOWN, label: 'Not sure' },
];

export const DOCUMENTATION_OPTIONS = [
  { value: DOCUMENTATION_STATUS.DD214, label: 'DD 214' },
  { value: DOCUMENTATION_STATUS.STATEMENT_OF_SERVICE, label: 'Statement of service' },
  { value: DOCUMENTATION_STATUS.OTHER_OFFICIAL, label: 'Other official record' },
  { value: DOCUMENTATION_STATUS.NONE, label: 'No record to hand' },
  { value: DOCUMENTATION_STATUS.UNKNOWN, label: 'Not sure' },
];

export const PROVENANCE_OPTIONS = [
  { value: INPUT_PROVENANCE.USER_ENTERED_OFFICIAL, label: 'Copied from an official record' },
  { value: INPUT_PROVENANCE.USER_ESTIMATE, label: 'My best estimate' },
];

export const DEPOSIT_MODE_OPTIONS = [
  { value: 'official_balance', label: 'I have the official balance from my agency (recommended)' },
  { value: 'estimate', label: 'Estimate it from my basic pay by year' },
];

export const DEPOSIT_STATUS_OPTIONS = [
  { value: DEPOSIT_STATUSES.NOT_REQUESTED, label: 'Not requested' },
  { value: DEPOSIT_STATUSES.EARNINGS_REQUESTED, label: 'Earnings statement requested' },
  { value: DEPOSIT_STATUSES.APPLICATION_SUBMITTED, label: 'Application (SF 3108) submitted' },
  { value: DEPOSIT_STATUSES.AGENCY_QUOTE_RECEIVED, label: 'Agency balance received' },
  { value: DEPOSIT_STATUSES.PAYMENTS_IN_PROGRESS, label: 'Payments in progress' },
  { value: DEPOSIT_STATUSES.PAID_IN_FULL, label: 'Paid in full (agency confirmed)' },
  { value: DEPOSIT_STATUSES.AGENCY_DENIED, label: 'Agency denied credit' },
  { value: DEPOSIT_STATUSES.UNKNOWN, label: 'Not sure' },
];

export const DEPOSIT_STATUS_LABELS = Object.fromEntries(DEPOSIT_STATUS_OPTIONS.map((o) => [o.value, o.label]));

export const RECEIPT_OPTIONS = [
  { value: RETIRED_PAY_RECEIPT.NO, label: 'No' },
  { value: RETIRED_PAY_RECEIPT.YES, label: 'Yes' },
  { value: RETIRED_PAY_RECEIPT.UNKNOWN, label: 'Not sure' },
];

export const RETIRED_PAY_TYPE_OPTIONS = [
  { value: '', label: 'Choose the type on your retirement orders' },
  { value: RETIRED_PAY_TYPES.REGULAR_LONGEVITY, label: 'Regular (active-duty) longevity retirement' },
  { value: RETIRED_PAY_TYPES.RESERVE_NONREGULAR, label: 'Reserve or Guard non-regular retirement (chapter 1223)' },
  { value: RETIRED_PAY_TYPES.DISABILITY_CHAPTER_61, label: 'Disability retirement (chapter 61)' },
  { value: RETIRED_PAY_TYPES.TERA, label: 'Temporary Early Retirement Authority (TERA)' },
  { value: RETIRED_PAY_TYPES.OTHER, label: 'Other' },
  { value: RETIRED_PAY_TYPES.UNKNOWN, label: 'Not sure' },
];

export const RETIRED_PAY_TYPE_LABELS = Object.fromEntries(RETIRED_PAY_TYPE_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]));

export const DETERMINATION_OPTIONS = [
  { value: DETERMINATION_STATUSES.UNKNOWN, label: 'Not yet asked' },
  { value: DETERMINATION_STATUSES.PENDING, label: 'Asked, waiting' },
  { value: DETERMINATION_STATUSES.CONFIRMED, label: 'Confirmed by my agency or OPM' },
  { value: DETERMINATION_STATUSES.DENIED, label: 'Denied' },
];

export const CHAPTER_61_OPTIONS = [
  { value: CHAPTER_61_EXCEPTION.UNKNOWN, label: 'Not sure' },
  { value: CHAPTER_61_EXCEPTION.CONFIRMED, label: 'Official finding: combat or instrumentality-of-war disability' },
  { value: CHAPTER_61_EXCEPTION.NOT_APPLICABLE, label: 'Does not apply' },
];

export const WAIVER_MODE_OPTIONS = [
  { value: WAIVER_MODES.NONE, label: 'Not waiving' },
  { value: WAIVER_MODES.ELECTED, label: 'Elected with my agency' },
];

export const STREAM_TYPE_OPTIONS = Object.entries(STREAM_TYPE_RULES).map(([value, r]) => ({ value, label: r.label }));

export const STREAM_TYPE_LABELS = Object.fromEntries(STREAM_TYPE_OPTIONS.map((o) => [o.value, o.label]));

export const FREQUENCY_OPTIONS = [
  { value: FREQUENCIES.MONTHLY, label: 'per month' },
  { value: FREQUENCIES.ANNUAL, label: 'per year' },
];

export const AMOUNT_STATUS_OPTIONS = [
  { value: AMOUNT_STATUSES.OFFICIAL, label: 'Official (award letter or statement)' },
  { value: AMOUNT_STATUSES.ESTIMATED, label: 'Estimate' },
  { value: AMOUNT_STATUSES.ASSUMED, label: 'Assumption' },
];

export const COLA_OPTIONS = [
  { value: COLA_POLICIES.MILITARY_RETIRED_PAY, label: 'Military retired-pay COLA (follows inflation)' },
  { value: COLA_POLICIES.VA_SSA, label: 'VA / Social Security COLA (follows inflation)' },
  { value: COLA_POLICIES.NONE, label: 'No adjustment' },
  { value: COLA_POLICIES.USER_RATE, label: 'My own rate' },
];

export const TAX_CLASS_OPTIONS = [
  { value: '', label: 'Not yet recorded (projected as taxable)' },
  { value: FEDERAL_TAX_CLASSES.TAXABLE_PENSION, label: 'Taxable (per my 1099-R)' },
  { value: FEDERAL_TAX_CLASSES.TAX_EXEMPT, label: 'Excluded from income (per my 1099-R)' },
];

export const FEDERAL_TAX_CLASS_LABELS = Object.freeze({
  [FEDERAL_TAX_CLASSES.TAXABLE_WAGES]: 'Taxable wages',
  [FEDERAL_TAX_CLASSES.TAXABLE_PENSION]: 'Taxable pension',
  [FEDERAL_TAX_CLASSES.TAX_EXEMPT]: 'Not taxable',
  [FEDERAL_TAX_CLASSES.OFFICIAL_CLASSIFICATION_REQUIRED]: 'Per official classification',
});

export const OWNER_OPTIONS = [
  { value: 'primary', label: 'Me' },
  { value: 'spouse', label: 'Spouse or partner' },
];

export const VA_RATING_OPTIONS = [{ value: '', label: 'Choose a rating' }, ...[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((r) => ({ value: String(r), label: `${r}%` }))];

/** Stream types that are projected only from an official amount. */
export const OFFICIAL_ONLY_TYPES = new Set(Object.entries(STREAM_TYPE_RULES).filter(([, r]) => r.officialOnly).map(([t]) => t));

export const VA_DISABILITY_TYPE = STREAM_TYPES.VA_DISABILITY;
export const DISABILITY_RETIRED_PAY_TYPE = STREAM_TYPES.DISABILITY_RETIRED_PAY;

// ---- pass 9: TSP, BRS extras, coverage periods
export const UNIFORMED_TSP_SYSTEM_OPTIONS = [
  { value: 'neither', label: 'Not sure / no service contributions' },
  { value: 'brs', label: 'Blended Retirement System (service automatic and matching)' },
  { value: 'legacy', label: 'Legacy (High-36 or REDUX): no service contributions' },
];

export const TSP_CONTRIBUTION_KIND_OPTIONS = [
  { value: 'traditional', label: 'Traditional' },
  { value: 'roth', label: 'Roth' },
];

export const LUMP_SUM_OPTIONS = [
  { value: '0', label: 'No lump sum' },
  { value: '25', label: '25% lump sum' },
  { value: '50', label: '50% lump sum' },
];

export const COVERAGE_SOURCE_OPTIONS = [
  { value: 'fehb', label: 'FEHB' },
  { value: 'pshb', label: 'PSHB (Postal)' },
  { value: 'tricare_prime', label: 'TRICARE Prime' },
  { value: 'tricare_select', label: 'TRICARE Select' },
  { value: 'tricare_overseas', label: 'TRICARE Overseas' },
  { value: 'trs', label: 'TRICARE Reserve Select' },
  { value: 'trr', label: 'TRICARE Retired Reserve' },
  { value: 'tfl', label: 'TRICARE For Life' },
  { value: 'tamp', label: 'TAMP (180-day transitional)' },
  { value: 'chcbp', label: 'CHCBP (continued health care)' },
  { value: 'champva', label: 'CHAMPVA' },
  { value: 'va_healthcare', label: 'VA health care (out-of-pocket only)' },
  { value: 'medicare_advantage', label: 'Medicare Advantage' },
  { value: 'medicare_only', label: 'Medicare A/B only' },
  { value: 'other_employer', label: 'Other employer coverage' },
  { value: 'marketplace', label: 'Marketplace plan' },
];

export const COVERAGE_ENROLLMENT_OPTIONS = [
  { value: 'self', label: 'Self only' },
  { value: 'selfPlusOne', label: 'Self plus one' },
  { value: 'family', label: 'Family' },
];

export const COVERAGE_RELATIONSHIP_OPTIONS = [
  { value: 'sponsor', label: 'Sponsor / member' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'former_spouse', label: 'Former spouse' },
  { value: 'survivor', label: 'Survivor' },
];
