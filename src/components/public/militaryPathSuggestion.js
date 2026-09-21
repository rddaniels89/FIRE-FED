/**
 * The "I am not sure" path (spec §20.14): a few plain questions that gather
 * only enough facts to suggest where to continue. It never declares
 * eligibility; every suggestion says what record decides it.
 */

import { CALCULATION_PATHS } from '../../lib/military/retirement/system';

export const WIZARD_QUESTIONS = Object.freeze([
  {
    id: 'status',
    label: 'Where are you today?',
    options: [
      { value: 'serving', label: 'Still serving (active, Guard, or Reserve)' },
      { value: 'separated', label: 'Separated or transferred, not yet receiving retired pay' },
      { value: 'retired_receiving', label: 'Already receiving military retired pay' },
      { value: 'unsure', label: 'Not sure how to describe it' },
    ],
  },
  {
    id: 'component',
    label: 'Which component is most of your service in?',
    options: [
      { value: 'active', label: 'Active duty' },
      { value: 'reserve', label: 'National Guard or Reserve' },
      { value: 'both', label: 'A mix of both' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'medical',
    label: 'Has your service issued a medical disposition (PDRL, TDRL, or separation with severance)?',
    options: [
      { value: 'yes', label: 'Yes, I have the orders' },
      { value: 'no', label: 'No' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'tera',
    label: 'Have you been approved for early retirement under TERA?',
    options: [
      { value: 'yes', label: 'Yes, I have the approval' },
      { value: 'no', label: 'No' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'activeYears',
    label: 'About how many years of active service?',
    showWhen: (a) => a.component === 'active' || a.component === 'both' || a.component === 'unsure',
    options: [
      { value: 'under_15', label: 'Under 15' },
      { value: '15_19', label: '15 to 19' },
      { value: '20_plus', label: '20 or more' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'qualifyingYears',
    label: 'How many qualifying ("good") years does your points statement show?',
    showWhen: (a) => a.component === 'reserve' || a.component === 'both' || a.component === 'unsure',
    options: [
      { value: 'under_20', label: 'Under 20' },
      { value: '20_plus', label: '20 or more' },
      { value: 'unsure', label: 'Not sure, or no statement yet' },
    ],
  },
]);

export const RECORDS = Object.freeze({
  dd214: 'DD 214 (block 12 for dates of service)',
  points: 'Retirement points statement and the 20-year letter (Notice of Eligibility)',
  orders: 'Retirement or separation orders',
  ras: 'Retiree Account Statement from DFAS',
  approval: 'The TERA approval from your service',
  medical: 'The medical disposition orders (PDRL, TDRL, or severance) with the DoD percentage',
});

/**
 * Suggests a path from the answers. Returns { path, headline, why, check,
 * confidence }, or a "not enough yet" result when nothing has been answered.
 */
export function suggestMilitaryPath(answers = {}) {
  const a = answers ?? {};
  const answered = Object.values(a).some((v) => v && v !== '');
  if (!answered) return { path: null, headline: 'Answer what you can; a suggestion appears here.', why: [], check: [], confidence: 'none' };

  const tentative = [a.status, a.component, a.medical, a.tera].filter((v) => !v || v === 'unsure').length > 0;
  const check = [];
  const why = [];

  if (a.status === 'retired_receiving') {
    why.push('You already receive retired pay, so the useful step is to check the model against your statement rather than estimate from scratch.');
    check.push(RECORDS.ras);
    return { path: CALCULATION_PATHS.ALREADY_RETIRED, headline: 'Continue with: check the model against my retired pay', why, check, confidence: 'clear' };
  }
  if (a.medical === 'yes') {
    why.push('A medical disposition on your orders is the fact the calculation starts from. FireFed works from that disposition and the DoD percentage; it does not evaluate fitness.');
    check.push(RECORDS.medical);
    return { path: CALCULATION_PATHS.MEDICAL, headline: 'Continue with: official medical retirement', why, check, confidence: 'clear' };
  }
  if (a.tera === 'yes') {
    why.push('TERA is calculated only under the approval your service issued. The reduction for service short of 20 years is shown as its own line.');
    check.push(RECORDS.approval);
    return { path: CALCULATION_PATHS.TERA, headline: 'Continue with: official TERA retirement', why, check, confidence: 'clear' };
  }

  const reserveLeaning = a.component === 'reserve' || (a.component === 'both' && a.activeYears !== '20_plus');
  if (reserveLeaning) {
    why.push('Guard and Reserve retirement is earned in points across qualifying years, and pay usually starts at 60. The points statement is the record that decides it.');
    if (a.qualifyingYears === 'under_20') why.push('With fewer than 20 qualifying years recorded, the result is a projection of a future retirement, not a current entitlement; the 20-year letter is the official confirmation.');
    check.push(RECORDS.points);
    if (a.component === 'both') check.push(RECORDS.dd214);
    return { path: CALCULATION_PATHS.RESERVE_NONREGULAR, headline: 'Continue with: Guard or Reserve retirement based on points', why, check, confidence: tentative || a.qualifyingYears === 'unsure' ? 'tentative' : 'clear' };
  }

  // Active, or unknown component.
  if (a.activeYears === '20_plus') {
    why.push('Twenty or more years of active service is the regular retirement the longevity formula was written for.');
  } else if (a.activeYears === '15_19') {
    why.push('With 15 to 19 years the regular path shows what 20 years would pay as a hypothetical. TERA appears only if your service has approved you; having the years alone does not open it.');
  } else if (a.activeYears === 'under_15') {
    why.push('Under 15 years there is no longevity retirement yet. The regular path can still show what 20 years would look like, and a medical disposition, if one exists, has its own path.');
  } else {
    why.push('The regular path fits most active-duty careers. Your DD 214 or statement of service gives the figure that decides it.');
  }
  check.push(RECORDS.dd214);
  if (a.component === 'unsure') check.push(RECORDS.points);
  return { path: CALCULATION_PATHS.REGULAR, headline: 'Continue with: active or regular retirement', why, check, confidence: tentative || !a.activeYears || a.activeYears === 'unsure' ? 'tentative' : 'clear' };
}
