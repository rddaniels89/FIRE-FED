import { describe, expect, it } from 'vitest';
import {
  INPUT_PROVENANCE,
  ISSUE_CATALOG,
  ISSUE_CODES,
  ISSUE_SEVERITY,
  MILITARY_RESULT_STATUS,
  MILITARY_RULES_VERSION,
  RESULT_LABELS,
  combineStatuses,
  hasBlockingIssue,
  labelForProvenance,
  labelForStatus,
  raiseIssue,
} from '../status';

describe('issue catalogue', () => {
  it('gives every code a severity, a message, a remediation, and an https source', () => {
    for (const [code, def] of Object.entries(ISSUE_CATALOG)) {
      expect(Object.values(ISSUE_SEVERITY), `${code} severity`).toContain(def.severity);
      expect(def.message, `${code} message`).toMatch(/\S/);
      expect(def.remediation, `${code} remediation`).toMatch(/\S/);
      expect(def.source, `${code} source`).toMatch(/^https:\/\//);
      expect(ISSUE_CODES[code]).toBe(code);
    }
  });

  it('never points a remediation at a sales page or a recommendation', () => {
    for (const [code, def] of Object.entries(ISSUE_CATALOG)) {
      const text = `${def.message} ${def.remediation}`.toLowerCase();
      expect(text, code).not.toMatch(/upgrade|pro plan|pricing|you should|you qualify/);
    }
  });

  it('raises a frozen issue with the entity and detail attached', () => {
    const issue = raiseIssue(ISSUE_CODES.MIL_PERIOD_OVERLAP, { entity: { type: 'servicePeriod', id: 'p1' }, detail: { days: 3 } });
    expect(issue).toMatchObject({
      code: 'MIL_PERIOD_OVERLAP',
      severity: ISSUE_SEVERITY.BLOCK,
      entity: { type: 'servicePeriod', id: 'p1' },
      detail: { days: 3 },
    });
    expect(issue.message).toBe(ISSUE_CATALOG.MIL_PERIOD_OVERLAP.message);
    expect(Object.isFrozen(issue)).toBe(true);
  });

  it('refuses an unknown code rather than inventing one', () => {
    expect(() => raiseIssue('MIL_NOPE')).toThrow(/Unknown military issue code/);
  });

  it('detects a blocking issue in a list', () => {
    expect(hasBlockingIssue([raiseIssue(ISSUE_CODES.MIL_SRS_EXCLUSION)])).toBe(false);
    expect(hasBlockingIssue([raiseIssue(ISSUE_CODES.MIL_SRS_EXCLUSION), raiseIssue(ISSUE_CODES.MIL_DATES_MISSING)])).toBe(true);
    expect(hasBlockingIssue([])).toBe(false);
    expect(hasBlockingIssue(undefined)).toBe(false);
  });
});

describe('statuses and labels', () => {
  it('has the five statuses from the spec', () => {
    expect(Object.values(MILITARY_RESULT_STATUS).sort()).toEqual(
      ['estimate_only', 'not_supported', 'official_determination_required', 'supported', 'supported_with_official_amount'].sort()
    );
  });

  it('combines statuses so the weakest part decides the whole', () => {
    const S = MILITARY_RESULT_STATUS;
    expect(combineStatuses([S.SUPPORTED, S.SUPPORTED])).toBe(S.SUPPORTED);
    expect(combineStatuses([S.SUPPORTED, S.ESTIMATE_ONLY])).toBe(S.ESTIMATE_ONLY);
    expect(combineStatuses([S.ESTIMATE_ONLY, S.OFFICIAL_DETERMINATION_REQUIRED])).toBe(S.OFFICIAL_DETERMINATION_REQUIRED);
    expect(combineStatuses([S.SUPPORTED, S.NOT_SUPPORTED])).toBe(S.NOT_SUPPORTED);
    expect(combineStatuses([S.SUPPORTED_WITH_OFFICIAL_AMOUNT, S.SUPPORTED])).toBe(S.SUPPORTED_WITH_OFFICIAL_AMOUNT);
    expect(combineStatuses([])).toBe(S.NOT_SUPPORTED);
  });

  it('maps provenance and status onto the six result labels', () => {
    expect(labelForProvenance(INPUT_PROVENANCE.USER_ENTERED_OFFICIAL)).toBe(RESULT_LABELS.OFFICIAL_INPUT);
    expect(labelForProvenance(INPUT_PROVENANCE.FIREFED_CALCULATED)).toBe(RESULT_LABELS.CALCULATED);
    expect(labelForProvenance(INPUT_PROVENANCE.FIREFED_DEFAULT_ASSUMPTION)).toBe(RESULT_LABELS.ASSUMED);
    expect(labelForProvenance('garbage')).toBe(RESULT_LABELS.ESTIMATED);
    expect(labelForStatus(MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED)).toBe(RESULT_LABELS.OFFICIAL_DETERMINATION_REQUIRED);
    expect(labelForStatus(MILITARY_RESULT_STATUS.NOT_SUPPORTED)).toBe(RESULT_LABELS.NOT_MODELED);
  });

  it('carries a rules version saved scenarios can be compared against', () => {
    expect(MILITARY_RULES_VERSION).toMatch(/^\d{4}\.\d+$/);
  });
});
