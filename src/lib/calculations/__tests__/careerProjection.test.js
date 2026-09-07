import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANNUAL_PAY_RAISE_PERCENT,
  WGI_WAITING_PERIOD_YEARS,
  computeHigh3FromSalaryPath,
  projectCareerSalaries,
  promotionStep,
  whatIfOneMoreYear,
} from '../careerProjection';
import {
  EXECUTIVE_SCHEDULE_LEVEL_IV_CAP,
  GS_BASE_TABLE,
  GS_PAY_TABLE_YEAR,
  LOCALITY_AREAS,
  calculateGsSalary,
  getLocality,
} from '../gsPay';

const flat = (overrides = {}) => ({
  grade: 12,
  step: 3,
  localityCode: 'RUS',
  currentAge: 40,
  separationAge: 45,
  annualRaisePercent: 0,
  ...overrides,
});

describe('within-grade increase waiting periods', () => {
  it("matches OPM's 52/104/156-week schedule", () => {
    expect(WGI_WAITING_PERIOD_YEARS).toEqual({ 1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2, 7: 3, 8: 3, 9: 3 });
    expect(WGI_WAITING_PERIOD_YEARS[10]).toBeUndefined();
  });

  // GS-12 step 3: one year to step 4, then two years to step 5.
  it('advances a GS-12 step 3 to step 5 over five years', () => {
    const { years } = projectCareerSalaries(flat());
    expect(years.map((y) => y.step)).toEqual([3, 4, 4, 5, 5]);
    expect(years.map((y) => y.age)).toEqual([40, 41, 42, 43, 44]);
    expect(years.map((y) => y.isWgiYear)).toEqual([false, true, false, true, false]);
  });

  it('credits time already served at the current step', () => {
    const { years } = projectCareerSalaries(flat({ step: 4, yearsInCurrentStep: 1 }));
    expect(years.map((y) => y.step)).toEqual([4, 5, 5, 6, 6]);
  });

  it('holds at step 10', () => {
    const { years } = projectCareerSalaries(flat({ step: 10 }));
    expect(years.every((y) => y.step === 10)).toBe(true);
  });
});

describe('the two-step promotion rule', () => {
  // GS-12 step 3 -> two steps up is step 5 (86,659). GS-13 step 1 (90,925)
  // already clears it.
  it('lands a GS-12 step 3 at GS-13 step 1', () => {
    expect(promotionStep({ fromGrade: 12, fromStep: 3, toGrade: 13 })).toEqual({
      grade: 13,
      step: 1,
      basePay: GS_BASE_TABLE[13][0],
    });
  });

  // GS-13 step 7 -> two steps up is step 9 (115,173). GS-14 steps 1-3 fall
  // short; step 4 (118,192) is the first that reaches it.
  it('lands a GS-13 step 7 at GS-14 step 4', () => {
    expect(GS_BASE_TABLE[13][8]).toBe(115173);
    expect(GS_BASE_TABLE[14][2]).toBeLessThan(115173);
    expect(GS_BASE_TABLE[14][3]).toBeGreaterThanOrEqual(115173);
    expect(promotionStep({ fromGrade: 13, fromStep: 7, toGrade: 14 })).toEqual({
      grade: 14,
      step: 4,
      basePay: 118192,
    });
  });

  // Two steps above step 10 is held at step 10 (99,404); GS-13 step 4
  // (100,018) is the first rate to reach it.
  it('holds the reference rate at step 10 for a step 9 or 10 employee', () => {
    expect(promotionStep({ fromGrade: 12, fromStep: 10, toGrade: 13 })).toEqual({
      grade: 13,
      step: 4,
      basePay: 100018,
    });
  });

  it('refuses grades and steps that do not exist', () => {
    expect(promotionStep({ fromGrade: 12, fromStep: 11, toGrade: 13 })).toBeNull();
    expect(promotionStep({ fromGrade: 12, fromStep: 3, toGrade: 16 })).toBeNull();
  });

  // At 42 the employee is GS-12 step 4 (one WGI in). Two steps up is step 6
  // (89,208); GS-13 step 1 (90,925) clears it. Then 1-year WGIs to step 3.
  it('applies a promotion at the given age and restarts the step clock', () => {
    const { years } = projectCareerSalaries(flat({ promotions: [{ atAge: 42, toGrade: 13 }] }));
    expect(years.map((y) => y.grade)).toEqual([12, 12, 13, 13, 13]);
    expect(years.map((y) => y.step)).toEqual([3, 4, 1, 2, 3]);
    expect(years.map((y) => y.isPromotionYear)).toEqual([false, false, true, false, false]);

    const promoted = years[2];
    expect(promoted.basePay).toBe(90925);
    expect(promoted.salary).toBe(calculateGsSalary({ grade: 13, step: 1, localityCode: 'RUS' }).salary);
    expect(promoted.salary).toBe(106437);

    const last = years[4];
    expect(last.basePay).toBe(GS_BASE_TABLE[13][2]);
    expect(last.salary).toBe(Math.round(96987 * (1 + 17.06 / 100)));
  });
});

describe('the annual across-the-board raise', () => {
  it('defaults to a 2% planning assumption', () => {
    expect(DEFAULT_ANNUAL_PAY_RAISE_PERCENT).toBe(2.0);
  });

  it('compounds the table year over year', () => {
    const { years } = projectCareerSalaries(
      flat({ step: 10, separationAge: 43, annualRaisePercent: 2 })
    );
    const base = GS_BASE_TABLE[12][9];
    expect(years.map((y) => y.basePay)).toEqual([
      base,
      Math.round(base * 1.02),
      Math.round(base * 1.02 ** 2),
    ]);
    expect(years.map((y) => y.year)).toEqual([
      GS_PAY_TABLE_YEAR,
      GS_PAY_TABLE_YEAR + 1,
      GS_PAY_TABLE_YEAR + 2,
    ]);
    expect(years.every((y) => y.localityPercent === getLocality('RUS').percent)).toBe(true);
  });

  // The cap rises with the raise but keeps biting: a senior employee in
  // Washington stays held at Level IV every year.
  it('keeps the Executive Schedule cap in force after raises', () => {
    const dc = LOCALITY_AREAS.find((l) => /Washington/.test(l.name));
    expect(dc.code).toBe('DCB');

    const { years } = projectCareerSalaries(
      flat({ grade: 15, step: 10, localityCode: dc.code, separationAge: 44, annualRaisePercent: 2 })
    );
    years.forEach((row, n) => {
      const scaledCap = Math.round(EXECUTIVE_SCHEDULE_LEVEL_IV_CAP * 1.02 ** n);
      expect(row.wasCapped).toBe(true);
      expect(row.salary).toBe(scaledCap);
      expect(row.salary).toBeLessThan(Math.round(row.basePay * (1 + dc.percent / 100)));
    });
  });
});

describe('high-3 from a salary path', () => {
  it('averages the best three consecutive years', () => {
    expect(computeHigh3FromSalaryPath([1, 2, 3, 10, 1])).toBe(5);
    expect(computeHigh3FromSalaryPath([100, 200])).toBe(150);
    expect(computeHigh3FromSalaryPath([])).toBe(0);
  });

  it('is the last three years when salary only rises', () => {
    const p = projectCareerSalaries(
      flat({ grade: 13, step: 5, separationAge: 50, annualRaisePercent: 2 })
    );
    const salaries = p.years.map((y) => y.salary);
    for (let i = 1; i < salaries.length; i += 1) {
      expect(salaries[i]).toBeGreaterThan(salaries[i - 1]);
    }
    const lastThree = salaries.slice(-3);
    expect(p.high3AtSeparation).toBeCloseTo(lastThree.reduce((a, b) => a + b, 0) / 3, 6);
    expect(p.salaryAtSeparation).toBe(salaries[salaries.length - 1]);
    expect(p.cumulativeEarnings).toBe(salaries.reduce((a, b) => a + b, 0));
  });
});

describe('one more year', () => {
  it('raises the high-3 when salary is rising', () => {
    const r = whatIfOneMoreYear(flat({ annualRaisePercent: 2 }));
    expect(r.baseline.separationAge).toBe(45);
    expect(r.oneMoreYear.separationAge).toBe(46);
    expect(r.high3Delta).toBeGreaterThan(0);
    expect(r.salaryDelta).toBeGreaterThan(0);
    expect(r.oneMoreYear.high3AtSeparation - r.baseline.high3AtSeparation).toBe(r.high3Delta);
  });

  it('adds nothing when the salary is flat', () => {
    const r = whatIfOneMoreYear(flat({ step: 10 }));
    expect(r.high3Delta).toBe(0);
    expect(r.salaryDelta).toBe(0);
  });
});

describe('guards', () => {
  it('returns a single row when separation is not after the current age', () => {
    const p = projectCareerSalaries(flat({ separationAge: 40 }));
    expect(p.years).toHaveLength(1);
    expect(p.years[0].age).toBe(40);
    expect(p.salaryAtSeparation).toBe(p.high3AtSeparation);
  });

  it('refuses grades and steps that do not exist', () => {
    expect(projectCareerSalaries(flat({ grade: 16 }))).toBeNull();
    expect(projectCareerSalaries(flat({ grade: 0 }))).toBeNull();
    expect(projectCareerSalaries(flat({ step: 11 }))).toBeNull();
    expect(projectCareerSalaries(flat({ step: 0 }))).toBeNull();
  });

  it('ignores promotions outside the projected ages or to bad grades', () => {
    const p = projectCareerSalaries(
      flat({ promotions: [{ atAge: 60, toGrade: 13 }, { atAge: 41, toGrade: 99 }] })
    );
    expect(p.years.every((y) => y.grade === 12)).toBe(true);
  });

  it('names the table year it projected from', () => {
    const p = projectCareerSalaries(flat({ startYear: GS_PAY_TABLE_YEAR + 5, year: GS_PAY_TABLE_YEAR + 5 }));
    expect(p.payTableYear).toBe(GS_PAY_TABLE_YEAR);
    expect(p.payTableIsExact).toBe(false);
  });
});
