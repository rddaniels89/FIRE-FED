import { describe, expect, it } from 'vitest';
import { RECORDS, WIZARD_QUESTIONS, suggestMilitaryPath } from '../militaryPathSuggestion';

describe('the "not sure" wizard suggests a path without deciding eligibility', () => {
  it('says nothing until something is answered', () => {
    expect(suggestMilitaryPath({})).toMatchObject({ path: null, confidence: 'none' });
  });

  it('routes retirees to the reconciliation path, medical dispositions to medical, approvals to TERA', () => {
    expect(suggestMilitaryPath({ status: 'retired_receiving' })).toMatchObject({ path: 'already_retired', check: [RECORDS.ras] });
    expect(suggestMilitaryPath({ status: 'serving', medical: 'yes', tera: 'yes' })).toMatchObject({ path: 'medical', check: [RECORDS.medical] });
    expect(suggestMilitaryPath({ status: 'separated', medical: 'no', tera: 'yes' })).toMatchObject({ path: 'tera', check: [RECORDS.approval] });
  });

  it('points Guard and Reserve members at the points path and names the 20-year letter', () => {
    const r = suggestMilitaryPath({ status: 'serving', component: 'reserve', medical: 'no', tera: 'no', qualifyingYears: 'under_20' });
    expect(r.path).toBe('reserve_nonregular');
    expect(r.why.join(' ')).toMatch(/projection of a future retirement/);
    expect(r.check).toContain(RECORDS.points);
    // A mixed career without 20 active years leans Reserve, and asks for both records.
    const mixed = suggestMilitaryPath({ status: 'separated', component: 'both', medical: 'no', tera: 'no', activeYears: 'under_15', qualifyingYears: '20_plus' });
    expect(mixed.path).toBe('reserve_nonregular');
    expect(mixed.check).toEqual([RECORDS.points, RECORDS.dd214]);
    expect(mixed.confidence).toBe('clear');
  });

  it('active service goes to the regular path; 15 to 19 years never becomes a TERA suggestion', () => {
    const twenty = suggestMilitaryPath({ status: 'serving', component: 'active', medical: 'no', tera: 'no', activeYears: '20_plus' });
    expect(twenty).toMatchObject({ path: 'regular', confidence: 'clear' });
    const midway = suggestMilitaryPath({ status: 'serving', component: 'active', medical: 'no', tera: 'no', activeYears: '15_19' });
    expect(midway.path).toBe('regular');
    expect(midway.why.join(' ')).toMatch(/only if your service has approved you/);
    const unsure = suggestMilitaryPath({ status: 'unsure', component: 'unsure', medical: 'unsure', tera: 'unsure' });
    expect(unsure.path).toBe('regular');
    expect(unsure.confidence).toBe('tentative');
    expect(unsure.check).toEqual([RECORDS.dd214, RECORDS.points]);
  });

  it('never uses eligibility or recommendation language', () => {
    const texts = [];
    for (const answers of [{ status: 'retired_receiving' }, { medical: 'yes' }, { tera: 'yes' }, { component: 'reserve', qualifyingYears: 'under_20' }, { component: 'active', activeYears: '15_19' }, { status: 'unsure' }]) {
      const r = suggestMilitaryPath(answers);
      texts.push(r.headline, ...r.why, ...r.check);
    }
    for (const q of WIZARD_QUESTIONS) texts.push(q.label, ...q.options.map((o) => o.label));
    expect(texts.join(' ').toLowerCase()).not.toMatch(/you qualify|you are eligible|you should|best|recommend|guaranteed|approved for benefits/);
  });
});
