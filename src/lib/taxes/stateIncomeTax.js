/**
 * State income tax — a flat-rate planning approximation.
 *
 * State treatment of a federal retiree's income varies on three axes that
 * matter far more than the exact bracket schedule:
 *
 *   1. Is there an income tax at all? (nine states: no)
 *   2. Is a federal civil-service annuity (CSRS/FERS) exempt, partly exempt
 *      via a dollar exclusion, or fully taxed?
 *   3. Is Social Security taxed? (eight states still do, most with income
 *      limits, as of tax year 2026)
 *
 * So each state is reduced to { rate, exemptsFederalPension,
 * exemptsSocialSecurity, pensionExclusion } and the tax is
 *
 *   taxable = ordinaryIncome + longTermCapitalGains
 *           - (exempt federal pension portion)
 *           + (federally taxable Social Security, if the state taxes it)
 *   tax     = max(0, taxable) x rate
 *
 * `rate` is a single effective rate meant to be representative of a retiree
 * household in the $50k-$150k range, not the statutory top rate and not a
 * bracket walk. States with progressive schedules are approximated; states
 * with local income taxes (MD, OH, PA, NY city) are approximated at state
 * level only unless noted.
 *
 * THESE PRESETS ARE PLANNING APPROXIMATIONS AND MUST BE VERIFIED against each
 * state's current-year instructions before being relied on. Several states are
 * mid-way through multi-year rate cuts (GA, IN, KY, MS, NE, WV among them) and
 * the figures here are best-effort for tax year 2026. Personal exemptions,
 * state standard deductions, and age-based subtractions that are not pension-
 * specific are folded into the effective rate rather than modelled.
 *
 * Sources (general):
 *   Tax Foundation state individual income tax rates
 *     https://taxfoundation.org/data/all/state/state-income-tax-rates/
 *   NARFE state tax roundup (federal annuity treatment)
 *     https://www.narfe.org/advocacy/state-tax-roundup/
 *   Each state's Department of Revenue instructions for the pension and
 *   Social Security subtractions cited in `notes`.
 */

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nonNegative(value) {
  return Math.max(0, num(value));
}

function preset(code, name, rate, exemptsFederalPension, exemptsSocialSecurity, notes, extra = {}) {
  return Object.freeze({
    code,
    name,
    rate,
    exemptsFederalPension,
    exemptsSocialSecurity,
    pensionExclusion: 0,
    notes,
    ...extra,
  });
}

const NO_TAX = 'No state income tax.';

/**
 * All 50 states plus DC. `pensionExclusion` is a dollar amount of federal
 * pension income excluded when the pension is not fully exempt; where the
 * exclusion is age- or income-limited the figure assumes the retiree
 * qualifies, and `notes` says what the limit is.
 */
export const STATE_TAX_PRESETS = Object.freeze([
  preset('AL', 'Alabama', 0.04, true, true,
    'Federal civil-service (CSRS/FERS) annuities are fully exempt. Rates 2-5%.'),
  preset('AK', 'Alaska', 0, true, true, NO_TAX),
  preset('AZ', 'Arizona', 0.025, false, true,
    'Flat 2.5%. Federal civil-service pension excluded only up to $2,500.', { pensionExclusion: 2500 }),
  preset('AR', 'Arkansas', 0.035, false, true,
    'Top rate 3.9% (2025). Retirement income exclusion of $6,000 for employer pensions.', { pensionExclusion: 6000 }),
  preset('CA', 'California', 0.06, false, true,
    'Progressive 1-13.3%; pensions fully taxed. Effective rate approximated.'),
  preset('CO', 'Colorado', 0.044, false, false,
    'Flat 4.4% (TABOR refunds may lower it). Pension/annuity subtraction $24,000 at 65+ ($20,000 at 55-64); Social Security is fully deductible only at 65+ (and at 55-64 under an AGI cap), so treated as partially taxed.',
    { pensionExclusion: 24000 }),
  preset('CT', 'Connecticut', 0.05, false, false,
    'Pension/annuity income 100% exempt and Social Security exempt for AGI under $75,000 single / $100,000 joint, phasing out above; treated as income-limited (not exempt) here.'),
  preset('DE', 'Delaware', 0.05, false, true,
    'Top rate 6.6%. Pension exclusion $12,500 at 60+ ($2,000 under 60).', { pensionExclusion: 12500 }),
  preset('DC', 'District of Columbia', 0.06, false, true,
    'Progressive 4-10.75%; no pension exclusion since 2015.'),
  preset('FL', 'Florida', 0, true, true, NO_TAX),
  preset('GA', 'Georgia', 0.0519, false, true,
    'Flat 5.19% (2025), scheduled to fall 0.1pt/yr toward 4.99%. Retirement income exclusion $65,000 at 65+ ($35,000 at 62-64) per person.',
    { pensionExclusion: 65000 }),
  preset('HI', 'Hawaii', 0.06, true, true,
    'Employer-funded pensions, including CSRS/FERS, are exempt. TSP withdrawals are taxed. Rates 1.4-11%.'),
  preset('ID', 'Idaho', 0.053, false, true,
    'Flat 5.3%. CSRS annuities deductible at 65+ (62 if disabled); FERS annuities are NOT covered by the deduction.'),
  preset('IL', 'Illinois', 0.0495, true, true,
    'Flat 4.95%. All qualified retirement income (pensions, TSP, IRA, Social Security) is exempt.'),
  preset('IN', 'Indiana', 0.0295, false, true,
    'Flat 2.95% (2026), falling to 2.9% in 2027. County taxes (about 1-3%) apply on top. Pensions taxed; only military retirement is exempt.'),
  preset('IA', 'Iowa', 0.038, true, true,
    'Flat 3.8%. Retirement income (pensions, TSP, IRA) fully exempt for taxpayers 55+ since 2023.'),
  preset('KS', 'Kansas', 0.052, true, true,
    'Rates 5.2/5.58% (2024 reform). Federal civil-service and KPERS pensions exempt; Social Security fully exempt since 2024.'),
  preset('KY', 'Kentucky', 0.035, false, true,
    'Flat 3.5% (2026, down from 4%). Pension income exclusion $31,110 per person.', { pensionExclusion: 31110 }),
  preset('LA', 'Louisiana', 0.03, true, true,
    'Flat 3% (2025). Federal retirement benefits are exempt.'),
  preset('ME', 'Maine', 0.06, false, true,
    'Rates 5.8-7.15%. Pension deduction equal to the maximum Social Security benefit (about $46,000 in 2025), reduced by Social Security received.',
    { pensionExclusion: 46000 }),
  preset('MD', 'Maryland', 0.065, false, true,
    'State 2-5.75% plus county 2.25-3.2%; approximated combined. Pension exclusion up to $39,500 at 65+, reduced by Social Security received.',
    { pensionExclusion: 39500 }),
  preset('MA', 'Massachusetts', 0.05, true, true,
    'Flat 5% (plus 4% surtax over $1M). Federal contributory pensions (CSRS/FERS) exempt; TSP withdrawals taxed.'),
  preset('MI', 'Michigan', 0.0425, true, true,
    'Flat 4.25%. The 2023 Lowering MI Costs Act restores full public-pension (including federal) deductibility for tax year 2026 onward; the phase-in applied 2023-2025.'),
  preset('MN', 'Minnesota', 0.06, false, false,
    'Rates 5.35-9.85%. Social Security subtraction is income-limited (full below about $84,000 single / $108,000 joint, phasing out). No general pension subtraction for FERS retirees.'),
  preset('MS', 'Mississippi', 0.044, true, true,
    'Flat 4.4% (2026), falling toward 4%. Retirement income (pensions, TSP, IRA, Social Security) exempt.'),
  preset('MO', 'Missouri', 0.047, false, true,
    'Top rate 4.7%. Public pension exemption (federal included) up to the maximum Social Security benefit (about $46,000); income limits removed in 2024. Social Security fully exempt since 2024.',
    { pensionExclusion: 46000 }),
  preset('MT', 'Montana', 0.055, false, false,
    'Rates 4.7/5.9% (2024 reform). Social Security taxed to the federally taxable amount. The former $5,060 pension exemption was repealed in the 2024 reform.'),
  preset('NE', 'Nebraska', 0.0455, false, true,
    'Top rate 4.55% (2026), falling to 3.99% in 2027. Social Security fully exempt from 2025. Pensions taxed; only military retirement is exempt.'),
  preset('NV', 'Nevada', 0, true, true, NO_TAX),
  preset('NH', 'New Hampshire', 0, true, true,
    'No tax on wages or retirement income; the interest and dividends tax was repealed for 2025.'),
  preset('NJ', 'New Jersey', 0.045, false, true,
    'Rates 1.4-10.75%. Retirement income exclusion at 62+: $75,000 single / $100,000 joint when total income is $100,000 or less, partial to $150,000.',
    { pensionExclusion: 75000 }),
  preset('NM', 'New Mexico', 0.045, false, false,
    'Rates 1.7-5.9%. Social Security exempt only for AGI under $100,000 single / $150,000 joint. $8,000 retirement exemption at 65+, income-limited.',
    { pensionExclusion: 8000 }),
  preset('NY', 'New York', 0.055, true, true,
    'Rates 4-10.9% (NYC adds up to 3.876%). Federal, state and local government pensions fully exempt; private up to $20,000. TSP withdrawals taxed beyond the $20,000 exclusion.'),
  preset('NC', 'North Carolina', 0.0399, false, true,
    'Flat 3.99% (2026). Bailey settlement exempts federal annuities only for those with five years of service by 12 Aug 1989; everyone else is fully taxed.'),
  preset('ND', 'North Dakota', 0.02, false, true,
    'Rates 0/1.95/2.5% (2023 reform). Pensions taxed; only military retirement is exempt.'),
  preset('OH', 'Ohio', 0.0275, false, true,
    'Flat 2.75% (2026). Municipal taxes (typically 1-2.5%) generally do not apply to pensions. Retirement income credit up to $200.'),
  preset('OK', 'Oklahoma', 0.045, false, true,
    'Top rate 4.75%. Pension exclusion $10,000; the portion of a CSRS annuity received in lieu of Social Security is fully exempt.',
    { pensionExclusion: 10000 }),
  preset('OR', 'Oregon', 0.08, false, true,
    'Rates 4.75-9.9%. Federal pension exempt only for the portion attributable to service before 1 Oct 1991; later service fully taxed.'),
  preset('PA', 'Pennsylvania', 0.0307, true, true,
    'Flat 3.07%. Retirement income (pensions, TSP, IRA, Social Security) exempt after retirement age. Local earned-income taxes do not reach pensions.'),
  preset('RI', 'Rhode Island', 0.045, false, false,
    'Rates 3.75-5.99%. Social Security exempt only at full retirement age and below an AGI limit (about $104,000 single / $130,000 joint). Pension/401k exclusion $20,000 at FRA with the same income limits.',
    { pensionExclusion: 20000 }),
  preset('SC', 'South Carolina', 0.05, false, true,
    'Top rate 6.2% (2025). Retirement income deduction $10,000 under 65; at 65+ a $15,000 deduction from any income.',
    { pensionExclusion: 10000 }),
  preset('SD', 'South Dakota', 0, true, true, NO_TAX),
  preset('TN', 'Tennessee', 0, true, true, NO_TAX),
  preset('TX', 'Texas', 0, true, true, NO_TAX),
  preset('UT', 'Utah', 0.045, false, false,
    'Flat 4.5%. Social Security is taxed but offset by a credit that phases out above $45,000 single / $75,000 joint. Retirement credit is small ($450).'),
  preset('VT', 'Vermont', 0.05, false, false,
    'Rates 3.35-8.75%. Social Security exempt only for AGI under $50,000 single / $65,000 joint, partial to $60,000 / $75,000. CSRS annuity exemption up to $10,000, income-limited; FERS taxed.'),
  preset('VA', 'Virginia', 0.05, false, true,
    'Rates 2-5.75%. Age deduction up to $12,000 at 65+, reduced dollar-for-dollar by AFAGI over $50,000 single / $75,000 joint.',
    { pensionExclusion: 12000 }),
  preset('WA', 'Washington', 0, true, true,
    'No income tax. A 7% tax applies to long-term capital gains above about $270,000 (not modelled).'),
  preset('WV', 'West Virginia', 0.045, false, true,
    'Top rate 4.82% (2025), with further triggered cuts. Social Security exemption phased in 35% (2024), 65% (2025), 100% (2026). Federal pension exclusion $2,000; separate $8,000 senior modification at 65+.',
    { pensionExclusion: 2000 }),
  preset('WI', 'Wisconsin', 0.05, false, true,
    'Rates 3.5-7.65%. Federal annuity exempt only if a member of the federal system before 1964. $5,000 retirement exclusion at 65+ only under $15,000/$30,000 income.'),
  preset('WY', 'Wyoming', 0, true, true, NO_TAX),
]);

/** Lookup by two-letter code (case-insensitive). Returns undefined if unknown. */
export function getStatePreset(code) {
  const wanted = String(code ?? '').trim().toUpperCase();
  return STATE_TAX_PRESETS.find((s) => s.code === wanted);
}

/**
 * State tax on one year of retirement income.
 *
 * `ordinaryIncome` is all ordinary income INCLUDING the federal pension but
 * EXCLUDING Social Security; the pension is passed again as
 * `federalPensionIncome` so the exemption can be carved out of it. States that
 * tax Social Security start from the federally taxable amount, which is what
 * `taxableSocialSecurityFederal` carries in. `socialSecurityBenefits` (gross)
 * is accepted for symmetry and reporting but does not enter the calculation.
 */
export function calculateStateIncomeTax({
  state,
  ordinaryIncome = 0,
  federalPensionIncome = 0,
  socialSecurityBenefits = 0,
  taxableSocialSecurityFederal = 0,
  longTermCapitalGains = 0,
} = {}) {
  const resolved = typeof state === 'string' ? getStatePreset(state) : state;
  if (!resolved) {
    throw new Error(`Unknown state: ${typeof state === 'string' ? state : JSON.stringify(state)}`);
  }

  const rate = nonNegative(resolved.rate);
  const ordinary = nonNegative(ordinaryIncome);
  const pension = Math.min(ordinary, nonNegative(federalPensionIncome));
  const gains = nonNegative(longTermCapitalGains);
  const taxableSs = nonNegative(taxableSocialSecurityFederal);

  const exemptPension = resolved.exemptsFederalPension
    ? pension
    : Math.min(pension, nonNegative(resolved.pensionExclusion));
  const taxedSocialSecurity = resolved.exemptsSocialSecurity ? 0 : taxableSs;

  const taxableIncome = Math.max(0, ordinary + gains - exemptPension + taxedSocialSecurity);
  const tax = taxableIncome * rate;

  return {
    code: resolved.code ?? null,
    rate,
    exemptFederalPension: exemptPension,
    taxedSocialSecurity,
    socialSecurityBenefits: nonNegative(socialSecurityBenefits),
    taxableIncome,
    tax,
    isApproximation: true,
  };
}
