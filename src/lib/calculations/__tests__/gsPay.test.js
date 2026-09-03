import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALITY_CODE,
  EXECUTIVE_SCHEDULE_LEVEL_IV_CAP,
  GS_BASE_TABLE,
  GS_PAY_TABLE_YEAR,
  LOCALITY_AREAS,
  calculateGsSalary,
  estimateHigh3FromGrade,
  getGsBasePay,
  getLocality,
} from '../gsPay';

/**
 * Spot values transcribed from OPM's published 2026 tables. If a January
 * regeneration changes these, that is the change being noticed rather than a
 * test being wrong.
 */
describe('the 2026 base schedule matches OPM', () => {
  it('covers 15 grades of 10 steps', () => {
    expect(Object.keys(GS_BASE_TABLE)).toHaveLength(15);
    expect(Object.values(GS_BASE_TABLE).every((steps) => steps.length === 10)).toBe(true);
  });

  it("carries OPM's published rates", () => {
    expect(getGsBasePay({ grade: 1, step: 1 })).toBe(22584);
    expect(getGsBasePay({ grade: 13, step: 1 })).toBe(90925);
    expect(getGsBasePay({ grade: 13, step: 10 })).toBe(118204);
    expect(getGsBasePay({ grade: 15, step: 10 })).toBe(164301);
  });

  it('increases with both grade and step', () => {
    for (let g = 1; g <= 15; g += 1) {
      const steps = GS_BASE_TABLE[g];
      for (let s = 1; s < 10; s += 1) expect(steps[s]).toBeGreaterThan(steps[s - 1]);
    }
    for (let g = 2; g <= 15; g += 1) {
      expect(GS_BASE_TABLE[g][0]).toBeGreaterThan(GS_BASE_TABLE[g - 1][0]);
    }
  });

  it('refuses grades and steps that do not exist', () => {
    expect(getGsBasePay({ grade: 16, step: 1 })).toBeNull();
    expect(getGsBasePay({ grade: 13, step: 11 })).toBeNull();
    expect(getGsBasePay({ grade: 13, step: 0 })).toBeNull();
  });
});

describe('locality areas', () => {
  it('holds all 58 published areas with their stated percentages', () => {
    expect(LOCALITY_AREAS).toHaveLength(58);
    expect(getLocality('RUS').percent).toBe(17.06);
    expect(getLocality('DCB').percent).toBe(33.94);
    expect(getLocality('CHI').percent).toBe(30.86);
  });

  // Alaska and Hawaii are described as "State of X" rather than a pay area and
  // were silently dropped by the first parser.
  it('includes Alaska and Hawaii', () => {
    expect(getLocality('AK').percent).toBe(32.36);
    expect(getLocality('HI').percent).toBe(22.21);
  });

  it('defaults to Rest of U.S., which covers most of the workforce', () => {
    expect(DEFAULT_LOCALITY_CODE).toBe('RUS');
    expect(getLocality(DEFAULT_LOCALITY_CODE)).not.toBeNull();
  });
});

describe('locality-adjusted salary', () => {
  // OPM's own published cells.
  it('reproduces published locality rates exactly', () => {
    expect(calculateGsSalary({ grade: 13, step: 1, localityCode: 'RUS' }).salary).toBe(106437);
    expect(calculateGsSalary({ grade: 13, step: 1, localityCode: 'DCB' }).salary).toBe(121785);
    expect(calculateGsSalary({ grade: 1, step: 1, localityCode: 'RUS' }).salary).toBe(26437);
  });

  it('reports the locality adjustment separately from base', () => {
    const r = calculateGsSalary({ grade: 13, step: 1, localityCode: 'DCB' });
    expect(r.basePay).toBe(90925);
    expect(r.localityAdjustment).toBe(r.salary - r.basePay);
    expect(r.locality.name).toMatch(/Washington/);
  });

  // The cap is the only thing that breaks the multiplication, and it is worth
  // roughly $17,000 to a senior employee in an expensive area.
  it('caps senior pay at Executive Schedule Level IV', () => {
    const r = calculateGsSalary({ grade: 15, step: 10, localityCode: 'DCB' });
    expect(r.wasCapped).toBe(true);
    expect(r.salary).toBe(EXECUTIVE_SCHEDULE_LEVEL_IV_CAP);

    const uncapped = Math.round(164301 * (1 + 33.94 / 100));
    expect(uncapped).toBeGreaterThan(EXECUTIVE_SCHEDULE_LEVEL_IV_CAP);
    expect(uncapped - r.salary).toBeGreaterThan(15000);
  });

  it('does not cap where the percentage does not reach it', () => {
    const r = calculateGsSalary({ grade: 15, step: 10, localityCode: 'RUS' });
    expect(r.wasCapped).toBe(false);
    expect(r.salary).toBeLessThan(EXECUTIVE_SCHEDULE_LEVEL_IV_CAP);
  });

  it('falls back to Rest of U.S. for an unknown locality', () => {
    const r = calculateGsSalary({ grade: 13, step: 5, localityCode: 'NOPE' });
    expect(r.locality.code).toBe('RUS');
  });

  it('returns null rather than a wrong number for an invalid grade', () => {
    expect(calculateGsSalary({ grade: 99, step: 1 })).toBeNull();
  });
});

describe('high-3 from a grade', () => {
  it('uses the locality-adjusted salary', () => {
    expect(estimateHigh3FromGrade({ grade: 13, step: 5, localityCode: 'DCB' })).toBe(
      calculateGsSalary({ grade: 13, step: 5, localityCode: 'DCB' }).salary
    );
  });

  // A capped high-3 must stay capped: building one from the uncapped figure
  // would overstate the pension for life.
  it('respects the cap', () => {
    expect(estimateHigh3FromGrade({ grade: 15, step: 10, localityCode: 'DCB' })).toBe(
      EXECUTIVE_SCHEDULE_LEVEL_IV_CAP
    );
  });
});

describe('the table year is stated', () => {
  it('names the year the figures come from', () => {
    expect(GS_PAY_TABLE_YEAR).toBe(2026);
  });
});
