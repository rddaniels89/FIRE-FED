/**
 * Survivor Benefit Plan, Reserve Component SBP, and the gross-to-net retired
 * pay ledger (spec §20.11).
 *
 * Supported: the standard spouse (and spouse-and-child) category on an
 * elected base, with the versioned premium formula, the 55% annuity, and the
 * paid-up rule (age 70 and 360 payments). Everything else — former spouse,
 * child-only, insurable interest, court orders, deemed elections — is
 * projected only from an official premium and annuity, and says so.
 *
 * RCSBP options A, B, and C have different commencement and cost rules and
 * official actuarial factors. Until the factor tables and golden cases are
 * in, RCSBP takes the official premium and annuity and is labelled as such.
 *
 * The SBP-DIC offset was phased out: two-thirds of DIC offset SBP in 2021,
 * one-third in 2022, none from 1 January 2023 (Pub. L. 116-92 §622). The
 * share is effective-dated for historical modelling.
 *
 * The ledger is an estimated net deposit. It is never called DFAS net pay
 * unless reconciled to a Retiree Account Statement.
 */

import { ISSUE_CODES, INPUT_PROVENANCE, raiseIssue } from './status';

export const SBP_CATEGORIES = Object.freeze({
  NONE: 'none',
  SPOUSE: 'spouse',
  SPOUSE_CHILD: 'spouse_child',
  CHILD_ONLY: 'child_only',
  FORMER_SPOUSE: 'former_spouse',
  INSURABLE_INTEREST: 'insurable_interest',
  UNKNOWN: 'unknown',
});

export const SBP_SUPPORTED_CATEGORIES = Object.freeze([SBP_CATEGORIES.SPOUSE, SBP_CATEGORIES.SPOUSE_CHILD]);

export const SBP_RULES = Object.freeze({
  /** The smallest base a member may elect. */
  minimumBase: 300,
  /** Standard spouse premium since the 1990 formula: 6.5% of the elected base. */
  spousePremiumRate: 0.065,
  spouseFormulaFrom: '1990-03-01',
  /** Standard annuity: 55% of the elected base (the two-tier 35% at 62 ended 2008-04-01). */
  annuityRate: 0.55,
  twoTierEndedOn: '2008-04-01',
  paidUp: Object.freeze({ age: 70, payments: 360, effectiveFrom: '2008-10-01' }),
  /** The child add-on for spouse-and-child is an actuarial factor; taken from the statement. */
  source: 'https://www.dfas.mil/retiredmilitary/provide/sbp/',
});

export const RCSBP_OPTIONS = Object.freeze({ A: 'A', B: 'B', C: 'C' });

const num = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};
const nonNeg = (v) => Math.max(0, num(v));

/** Share of DIC that offset SBP in a year, for historical modelling. */
export function sbpDicOffsetShare(year) {
  const y = num(year);
  if (y < 2021) return 1;
  if (y === 2021) return 2 / 3;
  if (y === 2022) return 1 / 3;
  return 0;
}

/** A blank election; callers override what the statement shows. */
export function createSbpElection(overrides = {}) {
  return {
    elected: 'unknown', // 'yes' | 'no' | 'unknown'
    category: SBP_CATEGORIES.UNKNOWN,
    fullBase: true,
    electedBase: null,
    electionDate: null,
    /** Official premium and annuity from the RAS or election form, when entered. */
    officialPremiumMonthly: null,
    officialAnnuityMonthly: null,
    provenance: INPUT_PROVENANCE.USER_ESTIMATE,
    premiumsPaidToDate: 0,
    ...overrides,
    rcsbp: { elected: false, noticeOfEligibilityDate: null, option: null, officialPremiumMonthly: null, officialAnnuityMonthly: null, provenance: INPUT_PROVENANCE.USER_ESTIMATE, ...(overrides.rcsbp ?? {}) },
  };
}

/**
 * The SBP premium and annuity for a supported election.
 *
 *   election        createSbpElection shape
 *   grossMonthly    the member's gross retired pay (the full base)
 *   memberAge       today, for the paid-up projection
 *
 * Returns { applies, supported, category, base, premiumMonthly, premiumSource,
 * annuityMonthly, annuitySource, paidUp, status, issues }.
 */
export function computeSbp({ election, grossMonthly = 0, memberAge = null } = {}) {
  const e = createSbpElection(election ?? {});
  const issues = [];
  const none = { applies: false, supported: false, category: e.category, base: 0, premiumMonthly: 0, annuityMonthly: 0, paidUp: null, issues };
  if (e.elected === 'no') return { ...none, status: 'declined' };
  if (e.elected !== 'yes') {
    issues.push(raiseIssue(ISSUE_CODES.MRT_SBP_ELECTION_INCOMPLETE, { detail: { reason: 'election_unknown' } }));
    return { ...none, status: 'unknown' };
  }
  const gross = nonNeg(grossMonthly);
  const officialPremium = e.officialPremiumMonthly === null || e.officialPremiumMonthly === undefined ? null : nonNeg(e.officialPremiumMonthly);
  const officialAnnuity = e.officialAnnuityMonthly === null || e.officialAnnuityMonthly === undefined ? null : nonNeg(e.officialAnnuityMonthly);
  const official = e.provenance === INPUT_PROVENANCE.USER_ENTERED_OFFICIAL;
  const supported = SBP_SUPPORTED_CATEGORIES.includes(e.category);

  if (!supported) {
    if (e.category === SBP_CATEGORIES.UNKNOWN || e.category === SBP_CATEGORIES.NONE) {
      issues.push(raiseIssue(ISSUE_CODES.MRT_SBP_ELECTION_INCOMPLETE, { detail: { reason: 'category_missing' } }));
      return { ...none, status: 'blocked' };
    }
    issues.push(raiseIssue(ISSUE_CODES.MRT_SBP_CATEGORY_OFFICIAL_ONLY, { detail: { category: e.category } }));
    if (officialPremium === null || officialAnnuity === null) return { ...none, status: 'blocked' };
    return { applies: true, supported: false, category: e.category, base: null, premiumMonthly: officialPremium, premiumSource: 'official', annuityMonthly: officialAnnuity, annuitySource: 'official', paidUp: paidUpProjection({ e, memberAge }), status: 'official_amount', issues };
  }

  const base = e.fullBase ? gross : nonNeg(e.electedBase);
  if (base <= 0) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_SBP_ELECTION_INCOMPLETE, { detail: { reason: 'base_missing' } }));
    return { ...none, status: 'blocked' };
  }
  if (base < SBP_RULES.minimumBase) issues.push(raiseIssue(ISSUE_CODES.MRT_SBP_BASE_BELOW_MINIMUM, { detail: { base, minimum: SBP_RULES.minimumBase } }));
  if (!e.fullBase && base > gross && gross > 0) issues.push(raiseIssue(ISSUE_CODES.MRT_SBP_BASE_ABOVE_GROSS, { detail: { base, gross } }));

  // Premium: the 6.5% formula for elections under the 1990 rule; older
  // threshold-formula elections and the child add-on come from the statement.
  let premium;
  let premiumSource;
  if (officialPremium !== null) {
    premium = officialPremium;
    premiumSource = 'official';
  } else {
    premium = base * SBP_RULES.spousePremiumRate;
    premiumSource = 'formula_6_5';
    if (e.electionDate && e.electionDate < SBP_RULES.spouseFormulaFrom) issues.push(raiseIssue(ISSUE_CODES.MRT_SBP_PREMIUM_FORMULA_UNVERIFIED, { detail: { electionDate: e.electionDate } }));
    if (e.category === SBP_CATEGORIES.SPOUSE_CHILD) issues.push(raiseIssue(ISSUE_CODES.MRT_SBP_CHILD_ADDON_OFFICIAL, {}));
  }
  const annuity = officialAnnuity !== null ? officialAnnuity : base * SBP_RULES.annuityRate;
  const paidUp = paidUpProjection({ e, memberAge });
  if (paidUp.eligibleNow) issues.push(raiseIssue(ISSUE_CODES.MRT_SBP_PAID_UP, { detail: { payments: paidUp.paymentsMade } }));
  const status = official && (officialPremium !== null || officialAnnuity !== null) ? 'official_amount' : official ? 'supported' : 'estimate';
  return {
    applies: true,
    supported: true,
    category: e.category,
    base,
    premiumMonthly: premium,
    premiumSource,
    annuityMonthly: annuity,
    annuitySource: officialAnnuity !== null ? 'official' : 'formula_55',
    paidUp,
    status,
    issues,
  };
}

/** Paid-up SBP: premiums stop at age 70 with 360 payments made (10 U.S.C. 1452(j)). */
export function paidUpProjection({ e, memberAge }) {
  const made = nonNeg(e.premiumsPaidToDate);
  const remaining = Math.max(0, SBP_RULES.paidUp.payments - made);
  const age = memberAge === null || memberAge === undefined ? null : num(memberAge);
  const yearsToPayments = Math.ceil(remaining / 12);
  const ageAtPaymentsDone = age === null ? null : age + yearsToPayments;
  const paidUpAge = age === null ? null : Math.max(SBP_RULES.paidUp.age, ageAtPaymentsDone);
  return {
    paymentsMade: made,
    paymentsRemaining: remaining,
    eligibleNow: age !== null && age >= SBP_RULES.paidUp.age && remaining === 0,
    paidUpAge,
    rule: `${SBP_RULES.paidUp.age} and ${SBP_RULES.paidUp.payments} payments`,
  };
}

/**
 * RCSBP: official amounts only until the factor tables are in.
 */
export function computeRcsbp({ rcsbp } = {}) {
  const issues = [];
  const r = rcsbp ?? {};
  if (!r.elected) return { applies: false, issues };
  const premium = r.officialPremiumMonthly === null || r.officialPremiumMonthly === undefined ? null : nonNeg(r.officialPremiumMonthly);
  const annuity = r.officialAnnuityMonthly === null || r.officialAnnuityMonthly === undefined ? null : nonNeg(r.officialAnnuityMonthly);
  const official = r.provenance === INPUT_PROVENANCE.USER_ENTERED_OFFICIAL;
  if (premium === null || annuity === null || !official) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_RCSBP_OFFICIAL_AMOUNT_REQUIRED, { detail: { option: r.option ?? null } }));
    return { applies: true, blocked: true, option: r.option ?? null, premiumMonthly: premium, annuityMonthly: annuity, issues };
  }
  return { applies: true, blocked: false, option: r.option ?? null, noticeOfEligibilityDate: r.noticeOfEligibilityDate ?? null, premiumMonthly: premium, annuityMonthly: annuity, status: 'official_amount', issues };
}

/**
 * The monthly ledger from gross retired pay to the estimated net deposit.
 * Every line is labelled with where it came from; nothing is inferred.
 */
export function retiredPayLedger({ grossMonthly = 0, sbpPremiumMonthly = 0, rcsbpPremiumMonthly = 0, vaWaiverMonthly = 0, crdpMonthly = 0, crscMonthly = 0, federalWithholdingRate = 0, stateWithholdingRate = 0, otherDeductionsMonthly = 0, adjustmentsOfficial = false, reconciledToRas = false } = {}) {
  const issues = [];
  const gross = nonNeg(grossMonthly);
  const lines = [{ id: 'gross', label: 'Gross retired pay', amount: gross, source: 'calculated' }];
  const push = (id, label, amount, source) => {
    if (amount !== 0) lines.push({ id, label, amount, source });
  };
  push('sbp', 'SBP premium', -nonNeg(sbpPremiumMonthly), 'election');
  push('rcsbp', 'RCSBP premium', -nonNeg(rcsbpPremiumMonthly), 'official');
  push('va_waiver', 'VA waiver / offset', -nonNeg(vaWaiverMonthly), 'official');
  push('crdp', 'CRDP restored', nonNeg(crdpMonthly), 'official');
  push('crsc', 'CRSC (paid separately, tax-exempt)', nonNeg(crscMonthly), 'official');
  const taxableBase = Math.max(0, gross - nonNeg(sbpPremiumMonthly) - nonNeg(rcsbpPremiumMonthly) - nonNeg(vaWaiverMonthly) + nonNeg(crdpMonthly));
  push('federal_withholding', `Federal withholding assumption (${(num(federalWithholdingRate) * 100).toFixed(1)}%)`, -taxableBase * Math.max(0, num(federalWithholdingRate)), 'assumption');
  push('state_withholding', `State withholding assumption (${(num(stateWithholdingRate) * 100).toFixed(1)}%)`, -taxableBase * Math.max(0, num(stateWithholdingRate)), 'assumption');
  push('other', 'Other official deductions or debts', -nonNeg(otherDeductionsMonthly), 'official');
  const net = lines.reduce((s, l) => s + l.amount, 0);
  if (nonNeg(vaWaiverMonthly) > 0 || nonNeg(crdpMonthly) > 0 || nonNeg(crscMonthly) > 0) {
    issues.push(raiseIssue(ISSUE_CODES.MRT_CONCURRENT_RECEIPT_MANUAL, { detail: { adjustmentsOfficial } }));
  }
  if (!reconciledToRas) issues.push(raiseIssue(ISSUE_CODES.MRT_NET_NOT_RECONCILED));
  return {
    lines,
    net,
    label: reconciledToRas ? 'Net pay (reconciled to RAS)' : 'Estimated net deposit',
    reconciledToRas,
    issues,
  };
}
