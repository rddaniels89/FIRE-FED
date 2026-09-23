/**
 * Military retired pay and FERS credit: the three paths, and the waiver
 * scenario.
 *
 * Under 5 U.S.C. 8411(c)(2) military service is not creditable for a FERS
 * annuity while the person receives military retired pay, unless the retired
 * pay was awarded (a) under chapter 1223 of title 10, the non-regular Reserve
 * retirement paid from age 60, or (b) for a service-connected disability
 * incurred in combat with an enemy of the United States or caused by an
 * instrumentality of war in the line of duty during a period of war. Anyone
 * else must waive the retired pay, effective when the FERS annuity begins, to
 * have the service credited, and must still pay the deposit.
 *
 * So there are three paths, and which one applies is a fact about the award
 * that FireFed cannot infer from the amount, the branch, or the dates:
 *
 *   1. No retired pay.            Credit is modelled as in fersCredit.js.
 *   2. Retired pay, no exception. Nothing is credited in the plan until the
 *                                 user confirms the type and records an
 *                                 elected waiver with the agency's
 *                                 determination. An exploratory waiver
 *                                 scenario is available, marked hypothetical.
 *   3. Retired pay under an        Credit is permitted without a waiver once
 *      exception.                  the user identifies the exception and
 *                                 acknowledges that HR and OPM decide it.
 *
 * Chapter 61 disability retired pay never enters the automated waiver path:
 * whether it qualifies for the combat or instrumentality-of-war exception, and
 * what waiving it would do to VA offsets, CRDP, CRSC, and tax treatment, are
 * determinations FireFed does not make. An unknown retirement type stops the
 * credit outright.
 *
 * The waiver scenario is the whole plan run with the retired-pay stream
 * stopped at the FERS annuity start, CRDP stopped with it, the deposit paid,
 * and every creditable period credited; against the plan as it stands. It is
 * shown under the warning in RETIRED_PAY_WAIVER_WARNING, always. FireFed
 * never generates or submits a waiver letter.
 */

import { ISSUE_CODES, raiseIssue } from './status';
import { SERVICE_OWNERS } from './servicePeriods';
import { STREAM_TYPES } from './incomeStreams';

export const RETIRED_PAY_TYPES = Object.freeze({
  REGULAR_LONGEVITY: 'regular_longevity',
  /** Chapter 1223 non-regular (Reserve/Guard) retired pay. */
  RESERVE_NONREGULAR: 'reserve_nonregular',
  /** Chapter 61 disability retired pay. */
  DISABILITY_CHAPTER_61: 'disability_chapter61',
  TERA: 'tera',
  OTHER: 'other',
  UNKNOWN: 'unknown',
});

export const RETIRED_PAY_RECEIPT = Object.freeze({ NO: 'no', YES: 'yes', UNKNOWN: 'unknown' });

export const DETERMINATION_STATUSES = Object.freeze({
  CONFIRMED: 'confirmed',
  PENDING: 'pending',
  DENIED: 'denied',
  UNKNOWN: 'unknown',
});

export const CHAPTER_61_EXCEPTION = Object.freeze({
  /** The user has an official finding that the exception applies. */
  CONFIRMED: 'combat_or_instrumentality_confirmed',
  NOT_APPLICABLE: 'not_applicable',
  UNKNOWN: 'unknown',
});

export const WAIVER_MODES = Object.freeze({
  NONE: 'none',
  /** An exploratory scenario only; never the authoritative plan. */
  HYPOTHETICAL: 'hypothetical',
  /** The user has elected the waiver with the agency; the plan follows it. */
  ELECTED: 'elected',
});

export const RETIRED_PAY_PATHS = Object.freeze({
  NO_RETIRED_PAY: 'no_retired_pay',
  WAIVER_REQUIRED: 'waiver_required',
  WAIVER_ELECTED: 'waiver_elected',
  EXCEPTION: 'regulatory_exception',
  DETERMINATION_REQUIRED: 'official_determination_required',
  TYPE_UNKNOWN: 'type_unknown',
});

/** Spec §6.7: shown immediately above every waiver comparison, without exception. */
export const RETIRED_PAY_WAIVER_WARNING =
  'This is a financial scenario, not a waiver determination or recommendation. Confirm the treatment of your retired pay, service credit, survivor coverage, VA-related payments, and healthcare with your agency, OPM, and DFAS before acting.';

/** The retired-pay block with every field present. */
export function createDefaultRetiredPay() {
  return {
    receives: RETIRED_PAY_RECEIPT.NO,
    type: null,
    officialDeterminationStatus: DETERMINATION_STATUSES.UNKNOWN,
    chapter61Exception: CHAPTER_61_EXCEPTION.UNKNOWN,
    /** The user acknowledges that HR and OPM decide the exception. */
    exceptionAcknowledged: false,
    waiver: {
      mode: WAIVER_MODES.NONE,
      /** null = the FERS annuity start age of the plan. */
      effectiveAge: null,
    },
  };
}

const RETIRED_PAY_STREAM_TYPES = new Set([STREAM_TYPES.LONGEVITY_RETIRED_PAY, STREAM_TYPES.RESERVE_RETIRED_PAY, STREAM_TYPES.DISABILITY_RETIRED_PAY]);

/**
 * Which path applies, and whether the plan may credit the service.
 *
 * Returns
 *   path                 RETIRED_PAY_PATHS
 *   allowsCredit         the authoritative plan may credit paid, creditable periods
 *   waiverScenarioAllowed  an exploratory waiver comparison may be offered
 *   waiverElected        credit rests on an elected waiver the agency has confirmed
 *   exceptionApplied     credit rests on a user-identified statutory exception
 *   issues               what stops or qualifies the credit
 */
export function evaluateRetiredPayGate(military) {
  const rp = { ...createDefaultRetiredPay(), ...(military?.retiredPay ?? {}) };
  const waiver = { ...createDefaultRetiredPay().waiver, ...(rp.waiver ?? {}) };
  const issues = [];
  const entity = { type: 'retiredPay', id: 'primary' };
  const base = { path: null, allowsCredit: false, waiverScenarioAllowed: false, waiverElected: false, exceptionApplied: false, retiredPay: { ...rp, waiver }, issues };

  if (rp.receives === RETIRED_PAY_RECEIPT.NO) {
    return { ...base, path: RETIRED_PAY_PATHS.NO_RETIRED_PAY, allowsCredit: true };
  }
  if (rp.receives === RETIRED_PAY_RECEIPT.UNKNOWN || !rp.type || rp.type === RETIRED_PAY_TYPES.UNKNOWN) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_RETIRED_PAY_TYPE_UNKNOWN, { entity, detail: { receives: rp.receives, type: rp.type ?? null } }));
    return { ...base, path: RETIRED_PAY_PATHS.TYPE_UNKNOWN };
  }

  const confirmed = rp.officialDeterminationStatus === DETERMINATION_STATUSES.CONFIRMED;

  if (rp.type === RETIRED_PAY_TYPES.RESERVE_NONREGULAR) {
    // Chapter 1223: creditable without a waiver, once the user confirms that
    // is what the award is and acknowledges who decides.
    if (confirmed && rp.exceptionAcknowledged) {
      issues.push(raiseIssue(ISSUE_CODES.MIL_RETIRED_PAY_EXCEPTION_APPLIED, { entity, detail: { exception: 'chapter_1223' } }));
      return { ...base, path: RETIRED_PAY_PATHS.EXCEPTION, allowsCredit: true, exceptionApplied: true };
    }
    issues.push(raiseIssue(ISSUE_CODES.MIL_RESERVE_RETIRED_PAY_CONFIRMATION, { entity, detail: { officialDeterminationStatus: rp.officialDeterminationStatus, exceptionAcknowledged: Boolean(rp.exceptionAcknowledged) } }));
    return { ...base, path: RETIRED_PAY_PATHS.DETERMINATION_REQUIRED };
  }

  if (rp.type === RETIRED_PAY_TYPES.DISABILITY_CHAPTER_61) {
    // Never the automated waiver path. Credit only under the combat or
    // instrumentality-of-war exception the user has an official finding for.
    if (rp.chapter61Exception === CHAPTER_61_EXCEPTION.CONFIRMED && confirmed && rp.exceptionAcknowledged) {
      issues.push(raiseIssue(ISSUE_CODES.MIL_RETIRED_PAY_EXCEPTION_APPLIED, { entity, detail: { exception: 'chapter_61_combat_or_instrumentality' } }));
      return { ...base, path: RETIRED_PAY_PATHS.EXCEPTION, allowsCredit: true, exceptionApplied: true };
    }
    issues.push(raiseIssue(ISSUE_CODES.MIL_CH61_OFFICIAL_INPUT_REQUIRED, { entity, detail: { chapter61Exception: rp.chapter61Exception, officialDeterminationStatus: rp.officialDeterminationStatus } }));
    return { ...base, path: RETIRED_PAY_PATHS.DETERMINATION_REQUIRED };
  }

  // Regular longevity, TERA, or other: a waiver is required.
  if (waiver.mode === WAIVER_MODES.ELECTED && confirmed) {
    issues.push(raiseIssue(ISSUE_CODES.MIL_WAIVER_ELECTED, { entity, detail: { effectiveAge: waiver.effectiveAge } }));
    return { ...base, path: RETIRED_PAY_PATHS.WAIVER_ELECTED, allowsCredit: true, waiverElected: true, waiverScenarioAllowed: true };
  }
  issues.push(raiseIssue(ISSUE_CODES.MIL_WAIVER_CONFIRMATION_REQUIRED, { entity, detail: { type: rp.type, waiverMode: waiver.mode, officialDeterminationStatus: rp.officialDeterminationStatus } }));
  return { ...base, path: RETIRED_PAY_PATHS.WAIVER_REQUIRED, waiverScenarioAllowed: true };
}

/** The primary's retired-pay streams (longevity, Reserve, disability) and their CRDP. */
export function retiredPayStreamIds(military) {
  const streams = Array.isArray(military?.incomeStreams) ? military.incomeStreams : [];
  const primary = (s) => (s.ownerId ?? SERVICE_OWNERS.PRIMARY) === SERVICE_OWNERS.PRIMARY;
  return {
    retiredPay: streams.filter((s) => primary(s) && RETIRED_PAY_STREAM_TYPES.has(s.type)).map((s) => s.id),
    crdp: streams.filter((s) => primary(s) && s.type === STREAM_TYPES.CRDP).map((s) => s.id),
  };
}

/**
 * The military block with the retired pay waived from `effectiveAge`: the
 * retired-pay streams and CRDP end the year before, the waiver is recorded as
 * elected and confirmed so the credit gate opens, the deposit is recorded as
 * paid, and the block is marked hypothetical so nothing downstream can mistake
 * it for the user's facts.
 */
export function applyRetiredPayWaiver(military, { effectiveAge, hypothetical = true } = {}) {
  const ids = retiredPayStreamIds(military);
  const stop = new Set([...ids.retiredPay, ...ids.crdp]);
  const endAge = effectiveAge === null || effectiveAge === undefined ? null : Math.floor(Number(effectiveAge)) - 1;
  const incomeStreams = (military?.incomeStreams ?? []).map((s) =>
    stop.has(s.id) ? { ...s, endAge: endAge === null ? s.endAge : Math.min(endAge, s.endAge ?? Infinity), waivedForFersCredit: true } : s
  );
  return {
    ...military,
    incomeStreams,
    retiredPay: {
      ...createDefaultRetiredPay(),
      ...(military?.retiredPay ?? {}),
      officialDeterminationStatus: DETERMINATION_STATUSES.CONFIRMED,
      waiver: { mode: WAIVER_MODES.ELECTED, effectiveAge: effectiveAge ?? null, hypothetical },
    },
    deposit: { ...(military?.deposit ?? {}), status: 'paid_in_full' },
    hypotheticalWaiver: hypothetical,
  };
}
