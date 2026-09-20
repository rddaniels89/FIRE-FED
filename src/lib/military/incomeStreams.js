/**
 * Military and VA income streams: typed lines of income, each with its own
 * federal tax character, state treatment, cost-of-living policy, owner, and
 * dates, projected year by year for the household timeline.
 *
 * There is no such thing as "military income" in this module. A veteran's
 * household can receive retired pay, VA disability compensation, CRDP, CRSC,
 * a survivor annuity, and drill pay in the same year, and each is taxed
 * differently, adjusted differently, and stops on a different event. So each
 * is its own stream, and the rules are per type:
 *
 *   Stream                    Federal tax        State treatment       COLA
 *   active pay / drill pay    taxable wages      wages                 none (pay table)
 *   allowances (BAH/BAS)      not taxable        exempt                none
 *   reservist differential    taxable wages      wages                 none
 *   longevity retired pay     taxable pension    military retired pay  retired-pay COLA
 *   Reserve retired pay       taxable pension    military retired pay  retired-pay COLA
 *   disability retired pay    official class     military retired pay  retired-pay COLA
 *   CRDP                      taxable pension    military retired pay  retired-pay COLA
 *   CRSC                      not taxable        exempt                retired-pay COLA
 *   VA disability             not taxable        exempt                VA/SSA COLA
 *   VA DIC                    not taxable        exempt                VA/SSA COLA
 *   SBP / RCSBP annuity       taxable pension    pension (see note)    retired-pay COLA
 *
 * Amounts. A stream carries the gross amount the user entered, its frequency,
 * its status (official, calculated, estimated, assumed), and the date an
 * official amount was good for. CRDP and CRSC are projected only from an
 * official amount: FireFed does not calculate concurrent-receipt eligibility,
 * the VA waiver, the phase-in, or the better election.
 *
 * Projection. amount_t = gross × Π(1 + cola_y) over the years after the
 * as-of year. The retired-pay and VA/SSA policies both follow the scenario's
 * inflation assumption for future years (both are CPI-W adjustments); the
 * policies are kept distinct so published history can be applied per program.
 *
 * Death. A stream stops after its owner's death; a survivor stream (SBP, DIC)
 * starts after the death of the person it names. Since 1 January 2023 SBP is
 * not reduced by DIC, so both may run together. Whether a death is modelled at
 * all is the scenario's choice (household.deathAges); nothing is assumed.
 */

import { INPUT_PROVENANCE, ISSUE_CODES, raiseIssue } from './status';
import { SERVICE_OWNERS, parseIsoDate } from './servicePeriods';
import { estimateVaCompensation } from './vaCompensationRates';

export const STREAM_TYPES = Object.freeze({
  ACTIVE_PAY: 'active_pay',
  DRILL_PAY: 'drill_pay',
  ALLOWANCE: 'allowance',
  RESERVIST_DIFFERENTIAL: 'reservist_differential',
  LONGEVITY_RETIRED_PAY: 'longevity_retired_pay',
  RESERVE_RETIRED_PAY: 'reserve_retired_pay',
  DISABILITY_RETIRED_PAY: 'disability_retired_pay',
  CRDP: 'crdp',
  CRSC: 'crsc',
  VA_DISABILITY: 'va_disability',
  VA_DIC: 'va_dic',
  SBP: 'sbp',
  RCSBP: 'rcsbp',
  OTHER: 'other',
});

export const FEDERAL_TAX_CLASSES = Object.freeze({
  TAXABLE_WAGES: 'taxable_wages',
  TAXABLE_PENSION: 'taxable_pension',
  TAX_EXEMPT: 'tax_exempt',
  /** Disability retired pay: the user records the classification from the 1099-R. */
  OFFICIAL_CLASSIFICATION_REQUIRED: 'official_classification_required',
});

export const STATE_TREATMENTS = Object.freeze({
  MILITARY_RETIRED_PAY: 'military_retired_pay',
  PENSION: 'pension',
  WAGES: 'wages',
  EXEMPT: 'exempt',
});

export const COLA_POLICIES = Object.freeze({
  MILITARY_RETIRED_PAY: 'military_retired_pay',
  VA_SSA: 'va_ssa',
  NONE: 'none',
  USER_RATE: 'user_rate',
  MANUAL_SCHEDULE: 'manual_schedule',
});

export const AMOUNT_STATUSES = Object.freeze({
  OFFICIAL: 'official',
  CALCULATED: 'calculated',
  ESTIMATED: 'estimated',
  ASSUMED: 'assumed',
});

export const FREQUENCIES = Object.freeze({ MONTHLY: 'monthly', ANNUAL: 'annual' });

/** Official amounts older than this are flagged; every program here adjusts at least annually. */
export const OFFICIAL_AMOUNT_FRESHNESS_MONTHS = 18;

const T = STREAM_TYPES;
const F = FEDERAL_TAX_CLASSES;
const S = STATE_TREATMENTS;
const C = COLA_POLICIES;

export const STREAM_TYPE_RULES = Object.freeze({
  [T.ACTIVE_PAY]: Object.freeze({ label: 'Military basic pay', federalTaxClass: F.TAXABLE_WAGES, stateTreatment: S.WAGES, colaPolicy: C.NONE, officialOnly: false, survivor: false }),
  [T.DRILL_PAY]: Object.freeze({ label: 'Drill pay', federalTaxClass: F.TAXABLE_WAGES, stateTreatment: S.WAGES, colaPolicy: C.NONE, officialOnly: false, survivor: false }),
  [T.ALLOWANCE]: Object.freeze({ label: 'Military allowances (BAH/BAS)', federalTaxClass: F.TAX_EXEMPT, stateTreatment: S.EXEMPT, colaPolicy: C.NONE, officialOnly: false, survivor: false }),
  [T.RESERVIST_DIFFERENTIAL]: Object.freeze({ label: 'Reservist differential', federalTaxClass: F.TAXABLE_WAGES, stateTreatment: S.WAGES, colaPolicy: C.NONE, officialOnly: false, survivor: false }),
  [T.LONGEVITY_RETIRED_PAY]: Object.freeze({ label: 'Military retired pay', federalTaxClass: F.TAXABLE_PENSION, stateTreatment: S.MILITARY_RETIRED_PAY, colaPolicy: C.MILITARY_RETIRED_PAY, officialOnly: false, survivor: false }),
  [T.RESERVE_RETIRED_PAY]: Object.freeze({ label: 'Reserve retired pay', federalTaxClass: F.TAXABLE_PENSION, stateTreatment: S.MILITARY_RETIRED_PAY, colaPolicy: C.MILITARY_RETIRED_PAY, officialOnly: false, survivor: false }),
  [T.DISABILITY_RETIRED_PAY]: Object.freeze({ label: 'Disability retired pay', federalTaxClass: F.OFFICIAL_CLASSIFICATION_REQUIRED, stateTreatment: S.MILITARY_RETIRED_PAY, colaPolicy: C.MILITARY_RETIRED_PAY, officialOnly: false, survivor: false }),
  [T.CRDP]: Object.freeze({ label: 'CRDP', federalTaxClass: F.TAXABLE_PENSION, stateTreatment: S.MILITARY_RETIRED_PAY, colaPolicy: C.MILITARY_RETIRED_PAY, officialOnly: true, survivor: false }),
  [T.CRSC]: Object.freeze({ label: 'CRSC', federalTaxClass: F.TAX_EXEMPT, stateTreatment: S.EXEMPT, colaPolicy: C.MILITARY_RETIRED_PAY, officialOnly: true, survivor: false }),
  [T.VA_DISABILITY]: Object.freeze({ label: 'VA disability compensation', federalTaxClass: F.TAX_EXEMPT, stateTreatment: S.EXEMPT, colaPolicy: C.VA_SSA, officialOnly: false, survivor: false }),
  [T.VA_DIC]: Object.freeze({ label: 'VA DIC', federalTaxClass: F.TAX_EXEMPT, stateTreatment: S.EXEMPT, colaPolicy: C.VA_SSA, officialOnly: false, survivor: true }),
  [T.SBP]: Object.freeze({ label: 'SBP survivor annuity', federalTaxClass: F.TAXABLE_PENSION, stateTreatment: S.PENSION, colaPolicy: C.MILITARY_RETIRED_PAY, officialOnly: false, survivor: true }),
  [T.RCSBP]: Object.freeze({ label: 'RCSBP survivor annuity', federalTaxClass: F.TAXABLE_PENSION, stateTreatment: S.PENSION, colaPolicy: C.MILITARY_RETIRED_PAY, officialOnly: false, survivor: true }),
  [T.OTHER]: Object.freeze({ label: 'Other military-connected income', federalTaxClass: F.TAXABLE_PENSION, stateTreatment: S.PENSION, colaPolicy: C.NONE, officialOnly: false, survivor: false }),
});

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `is_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

/** A stream with every field present. Callers override what they know. */
export function createIncomeStream(overrides = {}) {
  const type = overrides.type ?? T.OTHER;
  const rules = STREAM_TYPE_RULES[type] ?? STREAM_TYPE_RULES[T.OTHER];
  return {
    id: overrides.id ?? nextId(),
    ownerId: SERVICE_OWNERS.PRIMARY,
    type,
    label: rules.label,
    grossAmount: null,
    frequency: FREQUENCIES.MONTHLY,
    /** Whole ages on the owner's timeline; null start = already paying, null end = for life. */
    startAge: null,
    endAge: null,
    /** Optional exact dates, used when present to derive the ages. */
    startDate: null,
    endDate: null,
    officialAmountAsOfDate: null,
    amountStatus: AMOUNT_STATUSES.OFFICIAL,
    inputProvenance: INPUT_PROVENANCE.USER_ENTERED_OFFICIAL,
    /** null = the type's default federal class; set for disability retired pay. */
    federalTaxClassOverride: null,
    colaPolicy: rules.colaPolicy,
    /** Decimal annual rate for COLA_POLICIES.USER_RATE. */
    colaRate: null,
    /** { [year]: decimal } for COLA_POLICIES.MANUAL_SCHEDULE; missing years use inflation. */
    colaSchedule: null,
    stopsOnOwnerDeath: true,
    /** Survivor streams: 'primary' | 'spouse' whose death starts the stream. */
    startsOnDeathOf: rules.survivor ? SERVICE_OWNERS.PRIMARY : null,
    /** VA table-assisted estimate inputs when amountStatus is estimated. */
    vaEstimate: null,
    /** Retired-pay facts the waiver rules read (later pass). */
    retiredPayType: null,
    waiverStatus: null,
    /** A saved retirement calculation this stream mirrors (later pass). */
    sourceCalculationId: null,
    ...overrides,
  };
}

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** The federal class and state treatment a stream is projected under. */
export function classifyStreamTax(stream) {
  const rules = STREAM_TYPE_RULES[stream?.type] ?? STREAM_TYPE_RULES[T.OTHER];
  let federalTaxClass = stream?.federalTaxClassOverride ?? rules.federalTaxClass;
  let classificationRequired = false;
  if (federalTaxClass === F.OFFICIAL_CLASSIFICATION_REQUIRED) {
    // Never infer tax-free: project as taxable and say the classification is missing.
    federalTaxClass = F.TAXABLE_PENSION;
    classificationRequired = true;
  }
  const stateTreatment = federalTaxClass === F.TAX_EXEMPT ? S.EXEMPT : rules.stateTreatment;
  return { federalTaxClass, stateTreatment, classificationRequired, isTaxExempt: federalTaxClass === F.TAX_EXEMPT };
}

/** Gross annual amount from the entered amount and frequency, before COLA. */
export function annualGross(stream) {
  const amount = num(stream?.grossAmount, 0);
  if (amount <= 0) return 0;
  return stream.frequency === FREQUENCIES.ANNUAL ? amount : amount * 12;
}

/** Whole age at an ISO date, from an age in years and months as of a date. */
export function ageAtIsoDate({ isoDate, currentAge, currentAgeMonths = 0, asOfDate }) {
  const d = parseIsoDate(isoDate);
  if (!d) return null;
  const now = asOfDate instanceof Date ? asOfDate : new Date(asOfDate ?? Date.now());
  const nowMonths = now.getFullYear() * 12 + now.getMonth();
  const birthMonths = nowMonths - Math.floor(num(currentAge)) * 12 - Math.min(11, Math.max(0, Math.floor(num(currentAgeMonths))));
  const targetMonths = d.getUTCFullYear() * 12 + d.getUTCMonth();
  return Math.floor((targetMonths - birthMonths) / 12);
}

/**
 * Validates and annotates streams. Excluded streams are kept with their
 * reason; nothing is silently dropped.
 *
 *   military   the scenario's military block
 *   asOfDate   for the freshness check
 *
 * Returns { streams: [{ ...stream, resolved }], issues }, where `resolved`
 * carries the tax classes, the annual gross, whether the stream is included,
 * and the estimate detail when the amount came from the VA table.
 */
export function resolveMilitaryIncomeStreams(military, { asOfDate = new Date() } = {}) {
  const list = Array.isArray(military?.incomeStreams) ? military.incomeStreams : [];
  const issues = [];
  const streams = list.map((raw) => {
    const stream = createIncomeStream(raw);
    const entity = { type: 'incomeStream', id: stream.id };
    const rules = STREAM_TYPE_RULES[stream.type] ?? STREAM_TYPE_RULES[T.OTHER];
    const own = [];
    let included = true;
    let gross = annualGross(stream);
    let estimate = null;

    // A VA table-assisted estimate stands in when no amount was entered.
    if (stream.type === T.VA_DISABILITY && gross <= 0 && stream.vaEstimate?.rating) {
      estimate = estimateVaCompensation(stream.vaEstimate);
      if (estimate) {
        gross = estimate.annual;
        own.push(raiseIssue(ISSUE_CODES.MIL_VA_TABLE_ESTIMATE, { entity, detail: { rating: estimate.rating, monthly: estimate.monthly, effectiveDate: estimate.effectiveDate } }));
      }
    }

    if (gross <= 0) {
      own.push(raiseIssue(ISSUE_CODES.MIL_STREAM_AMOUNT_MISSING, { entity }));
      included = false;
    }
    if (rules.officialOnly) {
      const official = stream.amountStatus === AMOUNT_STATUSES.OFFICIAL && !estimate;
      own.push(raiseIssue(ISSUE_CODES.MIL_CRDP_CRSC_MANUAL, { entity, detail: { type: stream.type, official } }));
      if (!official) included = false;
    }
    const tax = classifyStreamTax(stream);
    if (tax.classificationRequired) own.push(raiseIssue(ISSUE_CODES.MIL_DISABILITY_RETIRED_PAY_TAX_UNKNOWN, { entity }));
    if ((stream.type === T.SBP || stream.type === T.RCSBP) && included) own.push(raiseIssue(ISSUE_CODES.MIL_SBP_STATE_TREATMENT_UNKNOWN, { entity }));

    if (stream.amountStatus === AMOUNT_STATUSES.OFFICIAL && stream.officialAmountAsOfDate) {
      const d = parseIsoDate(stream.officialAmountAsOfDate);
      const now = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
      if (d) {
        const months = (now.getFullYear() - d.getUTCFullYear()) * 12 + (now.getMonth() - d.getUTCMonth());
        if (months > OFFICIAL_AMOUNT_FRESHNESS_MONTHS) {
          own.push(raiseIssue(ISSUE_CODES.MIL_OFFICIAL_AMOUNT_STALE, { entity, detail: { officialAmountAsOfDate: stream.officialAmountAsOfDate, monthsOld: months } }));
        }
      }
    }

    issues.push(...own);
    return {
      ...stream,
      resolved: {
        included,
        annualGross: gross,
        federalTaxClass: tax.federalTaxClass,
        stateTreatment: tax.stateTreatment,
        isTaxExempt: tax.isTaxExempt,
        isSurvivor: Boolean(stream.startsOnDeathOf),
        estimate,
        issues: own,
      },
    };
  });
  return { streams, issues };
}

/** Cumulative COLA factor for a stream over `years` future years from the as-of year. */
export function colaFactor(stream, { years, inflation, asOfYear }) {
  const n = Math.max(0, Math.floor(num(years)));
  switch (stream.colaPolicy) {
    case C.NONE:
      return 1;
    case C.USER_RATE:
      return Math.pow(1 + num(stream.colaRate, inflation), n);
    case C.MANUAL_SCHEDULE: {
      let f = 1;
      for (let k = 1; k <= n; k += 1) {
        const y = num(asOfYear) + k;
        const r = stream.colaSchedule && stream.colaSchedule[y] !== undefined ? num(stream.colaSchedule[y]) : num(inflation);
        f *= 1 + r;
      }
      return f;
    }
    case C.MILITARY_RETIRED_PAY:
    case C.VA_SSA:
    default:
      return Math.pow(1 + num(inflation), n);
  }
}

/**
 * The household's military income in one plan year.
 *
 *   resolved       from resolveMilitaryIncomeStreams
 *   yearsFromNow   0 for the current year
 *   asOfYear, year
 *   ages           { primary, spouse } this year (spouse may be null)
 *   inflation      decimal
 *   deathAges      { primary, spouse } or null; null values mean no death modelled
 *   profile        { currentAge, currentAgeMonths } and asOfDate, for date-based windows
 *
 * Returns totals by tax bucket for the tax engine and the row, plus each
 * stream's amount for the display.
 */
export function projectMilitaryIncomeForYear({ resolved, yearsFromNow, asOfYear, year, ages, inflation, deathAges = null, profile = null, asOfDate = null }) {
  const out = { total: 0, taxableWages: 0, militaryRetiredPay: 0, taxablePension: 0, taxExempt: 0, survivorIncome: 0, byStream: [] };
  const streams = resolved?.streams ?? [];
  for (const s of streams) {
    if (!s.resolved.included) continue;
    const owner = s.ownerId ?? SERVICE_OWNERS.PRIMARY;
    const ownerAge = owner === SERVICE_OWNERS.SPOUSE ? ages?.spouse : ages?.primary;
    if (ownerAge === null || ownerAge === undefined) continue;

    // Window on the owner's age, from dates when given.
    const startAge = s.startDate && profile ? ageAtIsoDate({ isoDate: s.startDate, ...profile, asOfDate }) : s.startAge;
    const endAge = s.endDate && profile ? ageAtIsoDate({ isoDate: s.endDate, ...profile, asOfDate }) : s.endAge;
    if (startAge !== null && startAge !== undefined && ownerAge < num(startAge)) continue;
    if (endAge !== null && endAge !== undefined && ownerAge > num(endAge)) continue;

    // Death: the owner's ends it; a survivor stream needs the named death first.
    const ownerDeath = deathAges?.[owner];
    if (s.stopsOnOwnerDeath && ownerDeath !== null && ownerDeath !== undefined && ownerAge > num(ownerDeath)) continue;
    if (s.startsOnDeathOf) {
      const deceasedDeath = deathAges?.[s.startsOnDeathOf];
      if (deceasedDeath === null || deceasedDeath === undefined) continue;
      const deceasedAge = s.startsOnDeathOf === SERVICE_OWNERS.SPOUSE ? ages?.spouse : ages?.primary;
      if (deceasedAge === null || deceasedAge === undefined || deceasedAge <= num(deceasedDeath)) continue;
    }

    const amount = s.resolved.annualGross * colaFactor(s, { years: yearsFromNow, inflation, asOfYear });
    if (amount <= 0) continue;
    out.total += amount;
    if (s.resolved.isTaxExempt) out.taxExempt += amount;
    else if (s.resolved.federalTaxClass === F.TAXABLE_WAGES) out.taxableWages += amount;
    else if (s.resolved.stateTreatment === S.MILITARY_RETIRED_PAY) out.militaryRetiredPay += amount;
    else out.taxablePension += amount;
    if (s.resolved.isSurvivor) out.survivorIncome += amount;
    out.byStream.push({ id: s.id, type: s.type, label: s.label, ownerId: owner, amount, federalTaxClass: s.resolved.federalTaxClass, stateTreatment: s.resolved.stateTreatment });
  }
  void year;
  return out;
}

/** The first plan age at which a stream pays, for the income-start list; null if never in the window. */
export function firstPayingAge(resolvedStream, { currentAge, endAge, ages, deathAges, inflation, asOfYear }) {
  for (let age = num(currentAge); age <= num(endAge); age += 1) {
    const i = age - num(currentAge);
    const r = projectMilitaryIncomeForYear({
      resolved: { streams: [resolvedStream] },
      yearsFromNow: i,
      asOfYear,
      year: num(asOfYear) + i,
      ages: ages(age),
      inflation,
      deathAges,
    });
    if (r.total > 0) return age;
  }
  return null;
}
