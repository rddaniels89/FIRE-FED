/**
 * State income-tax treatment of military retired pay, by jurisdiction.
 *
 * Military retired pay is not a federal civil-service annuity, and most states
 * treat it differently: about thirty exempt it entirely, a dozen exclude a
 * dollar amount or an age band, and the rest tax it like any pension. A
 * planner that applied the FERS-annuity rule to a military pension would be
 * wrong in most states.
 *
 * Each rule below is a transcription and stays `verified: false` until someone
 * has checked it against the state revenue department's current-year
 * instructions and recorded the date. Until then the engine does NOT apply the
 * exclusion: it taxes military retired pay as ordinary income at the state's
 * effective rate and raises MIL_STATE_TAX_UNVERIFIED, so a plan can never
 * quietly rely on an unchecked exemption. Verifying a state is a one-line
 * change: set `verified` to the source and `reviewedOn` to the date.
 *
 * Rules carry `effectiveFrom` / `effectiveTo` tax years because several are
 * recent or temporary (California's 2025–2029 exclusion, New Mexico's
 * 2024–2026 exemption, Virginia's phase-in). A rule outside its window is not
 * applied.
 *
 * General sources for the transcription (each state's instructions control):
 *   Tax Foundation, "States that tax military retirement pay"
 *   MOAA state tax guide; each state DOR's military retirement page
 */

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const MILITARY_RETIRED_PAY_TREATMENTS = Object.freeze({
  NO_INCOME_TAX: 'no_income_tax',
  FULL_EXEMPTION: 'full_exemption',
  PARTIAL_EXCLUSION: 'partial_exclusion',
  TAXED: 'taxed',
});

function rule(code, treatment, { exclusion = null, minAge = null, effectiveFrom = null, effectiveTo = null, notes = '', source = null, verified = false, reviewedOn = null } = {}) {
  return Object.freeze({ code, treatment, exclusion, minAge, effectiveFrom, effectiveTo, notes, source, verified, reviewedOn });
}

const T = MILITARY_RETIRED_PAY_TREATMENTS;

export const STATE_MILITARY_RETIRED_PAY_RULES = Object.freeze({
  AL: rule('AL', T.FULL_EXEMPTION, { notes: 'Military retirement fully exempt.' }),
  AK: rule('AK', T.NO_INCOME_TAX),
  AZ: rule('AZ', T.FULL_EXEMPTION, { effectiveFrom: 2021, notes: 'Fully exempt from tax year 2021.' }),
  AR: rule('AR', T.FULL_EXEMPTION, { effectiveFrom: 2018, notes: 'Fully exempt from tax year 2018.' }),
  CA: rule('CA', T.PARTIAL_EXCLUSION, { exclusion: 20000, effectiveFrom: 2025, effectiveTo: 2029, notes: 'Up to $20,000 excluded for tax years 2025–2029 when AGI is at or below $125,000 single / $250,000 joint; taxed in full otherwise.' }),
  CO: rule('CO', T.PARTIAL_EXCLUSION, { exclusion: 15000, notes: 'Under 55: up to $15,000 of military retirement subtracted. 55–64: $20,000 and 65+: $24,000 under the general pension subtraction.' }),
  CT: rule('CT', T.FULL_EXEMPTION, { notes: 'Military retirement fully exempt.' }),
  DE: rule('DE', T.PARTIAL_EXCLUSION, { exclusion: 12500, effectiveFrom: 2022, notes: 'Up to $12,500 excluded at any age from tax year 2022.' }),
  DC: rule('DC', T.PARTIAL_EXCLUSION, { exclusion: 3000, minAge: 62, notes: 'Up to $3,000 of military retired pay excluded at 62+; otherwise taxed.' }),
  FL: rule('FL', T.NO_INCOME_TAX),
  GA: rule('GA', T.PARTIAL_EXCLUSION, { exclusion: 17500, effectiveFrom: 2022, notes: 'Under 62: up to $17,500 excluded, plus another $17,500 with at least $17,500 of earned income. 62+: the general retirement exclusion ($35,000; $65,000 at 65+).' }),
  HI: rule('HI', T.FULL_EXEMPTION, { notes: 'Military retirement fully exempt.' }),
  ID: rule('ID', T.PARTIAL_EXCLUSION, { exclusion: null, minAge: 65, notes: 'Fully deductible at 65+ (62+ if disabled), reduced by Social Security received; taxed below that age.' }),
  IL: rule('IL', T.FULL_EXEMPTION, { notes: 'Military retirement fully exempt.' }),
  IN: rule('IN', T.FULL_EXEMPTION, { effectiveFrom: 2022, notes: 'Fully exempt from tax year 2022.' }),
  IA: rule('IA', T.FULL_EXEMPTION, { notes: 'Military retirement fully exempt.' }),
  KS: rule('KS', T.FULL_EXEMPTION, { notes: 'Military retirement fully exempt.' }),
  KY: rule('KY', T.PARTIAL_EXCLUSION, { exclusion: 31110, notes: 'Service before 1998 fully exempt; later service falls under the $31,110 pension exclusion.' }),
  LA: rule('LA', T.FULL_EXEMPTION, { notes: 'Military retirement fully exempt.' }),
  ME: rule('ME', T.FULL_EXEMPTION, { notes: 'Military retirement fully exempt.' }),
  MD: rule('MD', T.PARTIAL_EXCLUSION, { exclusion: 12500, effectiveFrom: 2023, notes: 'Under 55: up to $12,500 subtracted; 55+: up to $20,000.' }),
  MA: rule('MA', T.FULL_EXEMPTION, { notes: 'Military retirement fully exempt.' }),
  MI: rule('MI', T.FULL_EXEMPTION, { notes: 'Military retirement fully exempt.' }),
  MN: rule('MN', T.FULL_EXEMPTION, { notes: 'Military retirement subtraction removes it in full.' }),
  MS: rule('MS', T.FULL_EXEMPTION, { notes: 'Retirement income, including military, exempt.' }),
  MO: rule('MO', T.FULL_EXEMPTION, { effectiveFrom: 2016, notes: 'Fully exempt from tax year 2016.' }),
  MT: rule('MT', T.PARTIAL_EXCLUSION, { exclusion: null, effectiveFrom: 2024, notes: 'From 2024 a 50% subtraction of military retirement, limited to those who first became residents or first received the pay from 2024, for five years; otherwise taxed.' }),
  NE: rule('NE', T.FULL_EXEMPTION, { effectiveFrom: 2022, notes: 'Fully exempt from tax year 2022.' }),
  NV: rule('NV', T.NO_INCOME_TAX),
  NH: rule('NH', T.NO_INCOME_TAX),
  NJ: rule('NJ', T.FULL_EXEMPTION, { notes: 'Military retirement fully exempt.' }),
  NM: rule('NM', T.PARTIAL_EXCLUSION, { exclusion: 30000, effectiveFrom: 2024, effectiveTo: 2026, notes: 'Up to $30,000 exempt for tax years 2024–2026 ($20,000 in 2023).' }),
  NY: rule('NY', T.FULL_EXEMPTION, { notes: 'Military retirement fully exempt.' }),
  NC: rule('NC', T.FULL_EXEMPTION, { effectiveFrom: 2021, notes: 'Fully exempt from tax year 2021 for retirees with 20 years of service or a medical retirement.' }),
  ND: rule('ND', T.FULL_EXEMPTION, { effectiveFrom: 2019, notes: 'Fully exempt from tax year 2019.' }),
  OH: rule('OH', T.FULL_EXEMPTION, { notes: 'Military retirement fully exempt.' }),
  OK: rule('OK', T.FULL_EXEMPTION, { effectiveFrom: 2022, notes: 'Fully exempt from tax year 2022.' }),
  OR: rule('OR', T.PARTIAL_EXCLUSION, { exclusion: null, notes: 'Only the portion attributable to service before 1 October 1991 is exempt.' }),
  PA: rule('PA', T.FULL_EXEMPTION, { notes: 'Retirement income, including military, exempt.' }),
  RI: rule('RI', T.FULL_EXEMPTION, { effectiveFrom: 2023, notes: 'Fully exempt from tax year 2023.' }),
  SC: rule('SC', T.FULL_EXEMPTION, { effectiveFrom: 2022, notes: 'Fully exempt from tax year 2022.' }),
  SD: rule('SD', T.NO_INCOME_TAX),
  TN: rule('TN', T.NO_INCOME_TAX),
  TX: rule('TX', T.NO_INCOME_TAX),
  UT: rule('UT', T.FULL_EXEMPTION, { effectiveFrom: 2021, notes: 'A nonrefundable credit equal to the tax on military retirement pay, from tax year 2021.' }),
  VT: rule('VT', T.PARTIAL_EXCLUSION, { exclusion: 10000, effectiveFrom: 2022, notes: 'Up to $10,000 exempt for AGI under $50,000 single / $65,000 joint, phasing out above.' }),
  VA: rule('VA', T.PARTIAL_EXCLUSION, { exclusion: 40000, effectiveFrom: 2025, notes: 'Military benefits subtraction: $40,000 from tax year 2025 ($30,000 in 2024), any age from 2024.' }),
  WA: rule('WA', T.NO_INCOME_TAX),
  WV: rule('WV', T.FULL_EXEMPTION, { effectiveFrom: 2018, notes: 'Fully exempt from tax year 2018.' }),
  WI: rule('WI', T.FULL_EXEMPTION, { notes: 'Military retirement fully exempt.' }),
  WY: rule('WY', T.NO_INCOME_TAX),
});

export function getStateMilitaryRetiredPayRule(code) {
  return STATE_MILITARY_RETIRED_PAY_RULES[String(code ?? '').toUpperCase()] ?? null;
}

/**
 * How much of a year's military retired pay a state excludes.
 *
 *   code                 state code
 *   militaryRetiredPay   the year's taxable military retired pay (CRDP included)
 *   taxYear              for the effective window
 *   age                  the retiree's age, for age-banded rules
 *   rules                the table to use; tests pass their own
 *
 * Returns { excluded, treatment, verified, applied, reason, rule }. `applied`
 * is false, and `excluded` is 0, whenever the rule is unverified, outside its
 * window, age-gated below the age, or absent, and `reason` says which.
 */
export function stateMilitaryRetiredPayExclusion({ code, militaryRetiredPay = 0, taxYear, age = null, rules = STATE_MILITARY_RETIRED_PAY_RULES } = {}) {
  const pay = Math.max(0, num(militaryRetiredPay));
  const r = rules[String(code ?? '').toUpperCase()] ?? null;
  const base = { excluded: 0, treatment: r?.treatment ?? null, verified: Boolean(r?.verified), applied: false, reason: null, rule: r };
  if (!r) return { ...base, reason: 'no_rule' };
  if (r.treatment === T.NO_INCOME_TAX) return { ...base, excluded: pay, applied: true, verified: true, reason: null };
  if (!r.verified) return { ...base, reason: 'unverified' };
  const y = num(taxYear, null);
  if (r.effectiveFrom !== null && y !== null && y < r.effectiveFrom) return { ...base, reason: 'before_effective_window' };
  if (r.effectiveTo !== null && y !== null && y > r.effectiveTo) return { ...base, reason: 'after_effective_window' };
  if (r.minAge !== null && (age === null || num(age) < r.minAge)) return { ...base, reason: 'below_minimum_age' };
  if (r.treatment === T.FULL_EXEMPTION) return { ...base, excluded: pay, applied: true };
  if (r.treatment === T.PARTIAL_EXCLUSION) {
    if (r.exclusion === null) return { ...base, reason: 'rule_needs_facts_not_modelled' };
    return { ...base, excluded: Math.min(pay, num(r.exclusion)), applied: true };
  }
  return { ...base, applied: true, reason: null };
}
