import { describe, expect, it } from 'vitest';
import {
  SURVIVOR_ELECTIONS,
  calculateFersMultiplier,
  calculateFersResults,
  calculateSurvivorBenefit,
  convertSickLeaveHoursToServiceYears,
  calculateMra10ReductionPercent,
  evaluateFersRegularEligibility,
  findEarliestFersImmediateRetirementAge,
} from '../fers';

describe('fers calculations', () => {
  it('uses 1.1% multiplier when age >= 62 and service >= 20', () => {
    const multiplier = calculateFersMultiplier({ retirementAge: 62, totalYearsOfService: 20 });
    expect(multiplier).toBeCloseTo(0.011, 6);
  });

  it('projects future service when includeFutureService is true', () => {
    const res = calculateFersResults({
      yearsOfService: 10,
      monthsOfService: 0,
      high3Salary: 100000,
      currentAge: 40,
      retirementAge: 60,
      showComparison: false,
      privateJobSalary: 0,
      privateJobYears: 0,
      includeFutureService: true,
    });
    expect(res.projectedYears).toBeCloseTo(30, 6);
    expect(res.stayFed.annualPension).toBeGreaterThan(0);
  });

  it('computes a simplified MRA+10 reduction percent for annuity start under 62', () => {
    const reductionAt57 = calculateMra10ReductionPercent({ annuityStartAge: 57, mra: 57 });
    expect(reductionAt57).toBeCloseTo(25, 6); // 5 years under 62
    const reductionAt62 = calculateMra10ReductionPercent({ annuityStartAge: 62, mra: 57 });
    expect(reductionAt62).toBeCloseTo(0, 6);
  });

  it('detects MRA+10 immediate eligibility when age >= MRA and service >= 10 (and not otherwise fully eligible)', () => {
    const res = evaluateFersRegularEligibility({ age: 57, totalYearsOfService: 10, mra: 57 });
    expect(res.isEligibleImmediate).toBe(true);
    expect(res.isEligibleImmediateMra10).toBe(true);
    expect(res.isEligibleImmediateUnreduced).toBe(false);
  });

  it('finds earliest immediate retirement age given current age + service projection', () => {
    const earliest = findEarliestFersImmediateRetirementAge({
      currentAge: 40,
      totalYearsOfService: 10,
      mra: 57,
      maxAgeToCheck: 70,
    });
    // 40 + 17 years => 57 age, 27 years service => not immediate (needs 30), but MRA+10 is eligible at 57.
    expect(earliest).toBe(57);
  });
});



describe('unused sick leave', () => {
  it('converts hours at the 2,087-hour leave year', () => {
    expect(convertSickLeaveHoursToServiceYears(2087)).toBeCloseTo(1, 6);
    expect(convertSickLeaveHoursToServiceYears(1043.5)).toBeCloseTo(0.5, 6);
    expect(convertSickLeaveHoursToServiceYears(0)).toBe(0);
    expect(convertSickLeaveHoursToServiceYears(-100)).toBe(0);
  });

  it('raises the annuity without touching eligibility service', () => {
    const base = {
      yearsOfService: 30,
      monthsOfService: 0,
      high3Salary: 100000,
      currentAge: 57,
      retirementAge: 57,
      showComparison: false,
    };

    const without = calculateFersResults(base);
    const with1044Hours = calculateFersResults({ ...base, unusedSickLeaveHours: 2087 });

    // Eligibility service is untouched: sick leave cannot qualify you to retire.
    expect(with1044Hours.service.eligibilityYears).toBeCloseTo(without.service.eligibilityYears, 6);
    // Computation service gains the full year, worth 1% of high-3.
    expect(with1044Hours.service.computationYears).toBeCloseTo(31, 6);
    expect(with1044Hours.stayFed.annualPension - without.stayFed.annualPension).toBeCloseTo(1000, 4);
  });

  // Sick leave must not push someone over the 20-year line for the 1.1% factor,
  // which would inflate the whole annuity rather than adding a year to it.
  it('cannot buy the 1.1% multiplier at 62', () => {
    const justUnder = calculateFersResults({
      yearsOfService: 19,
      monthsOfService: 0,
      high3Salary: 100000,
      currentAge: 62,
      retirementAge: 62,
      showComparison: false,
      unusedSickLeaveHours: 2087 * 2,
    });

    expect(justUnder.service.computationYears).toBeCloseTo(21, 6);
    expect(justUnder.stayFed.multiplier).toBeCloseTo(0.01, 6);
  });
});

describe('survivor annuity election', () => {
  const gross = 40000;

  it('costs 10% for a 50% survivor benefit', () => {
    const res = calculateSurvivorBenefit({
      annualPensionBeforeSurvivorReduction: gross,
      election: SURVIVOR_ELECTIONS.FULL,
    });
    expect(res.annualReduction).toBeCloseTo(4000, 6);
    expect(res.annualPensionAfterReduction).toBeCloseTo(36000, 6);
    // The survivor's share is based on the annuity before the reduction.
    expect(res.survivorAnnualBenefit).toBeCloseTo(20000, 6);
  });

  it('costs 5% for a 25% survivor benefit', () => {
    const res = calculateSurvivorBenefit({
      annualPensionBeforeSurvivorReduction: gross,
      election: SURVIVOR_ELECTIONS.PARTIAL,
    });
    expect(res.annualReduction).toBeCloseTo(2000, 6);
    expect(res.survivorAnnualBenefit).toBeCloseTo(10000, 6);
  });

  it('leaves the annuity whole and the survivor with nothing when declined', () => {
    const res = calculateSurvivorBenefit({
      annualPensionBeforeSurvivorReduction: gross,
      election: SURVIVOR_ELECTIONS.NONE,
    });
    expect(res.annualPensionAfterReduction).toBeCloseTo(gross, 6);
    expect(res.survivorAnnualBenefit).toBe(0);
  });

  it('treats an unrecognised election as no election', () => {
    const res = calculateSurvivorBenefit({
      annualPensionBeforeSurvivorReduction: gross,
      election: 'three-quarters',
    });
    expect(res.election).toBe(SURVIVOR_ELECTIONS.NONE);
    expect(res.annualReduction).toBe(0);
  });

  it('reduces the annuity that flows through to lifetime totals', () => {
    const base = {
      yearsOfService: 30,
      monthsOfService: 0,
      high3Salary: 100000,
      currentAge: 57,
      retirementAge: 57,
      showComparison: false,
    };

    const none = calculateFersResults(base);
    const full = calculateFersResults({ ...base, survivorElection: SURVIVOR_ELECTIONS.FULL });

    expect(full.stayFed.annualPensionBeforeSurvivorReduction).toBeCloseTo(30000, 4);
    expect(full.stayFed.annualPension).toBeCloseTo(27000, 4);
    expect(full.stayFed.lifetimePension).toBeLessThan(none.stayFed.lifetimePension);
    expect(full.survivor.survivorAnnualBenefit).toBeCloseTo(15000, 4);
  });
});

describe('backward compatibility', () => {
  it('is unchanged when the new inputs are omitted', () => {
    const args = {
      yearsOfService: 25,
      monthsOfService: 6,
      high3Salary: 95000,
      currentAge: 50,
      retirementAge: 60,
      showComparison: false,
      includeFutureService: true,
    };

    const res = calculateFersResults(args);
    expect(res.service.sickLeaveYears).toBe(0);
    expect(res.survivor.reductionPercent).toBe(0);
    expect(res.stayFed.annualPension).toBeCloseTo(
      res.stayFed.annualPensionBeforeSurvivorReduction,
      6
    );
  });
});

describe('MRA+10 age reduction reaches the annuity', () => {
  const base = {
    yearsOfService: 15,
    monthsOfService: 0,
    high3Salary: 100000,
    currentAge: 57,
    retirementAge: 57,
    showComparison: false,
    cpiIncrease: 0,
  };

  // The defect this covers: the reduction existed in the library but the result
  // path used an older eligibility function with no MRA+10 branch, so someone
  // retiring at MRA with 10-29 years saw an unreduced pension.
  it('reduces an MRA+10 annuity by 5% for each year under 62', () => {
    const res = calculateFersResults(base);

    expect(res.ageReduction.isMra10).toBe(true);
    expect(res.ageReduction.percent).toBeCloseTo(25, 6); // 60 months x 5/12
    expect(res.stayFed.annualPensionBeforeReductions).toBeCloseTo(15000, 4);
    expect(res.stayFed.annualPension).toBeCloseTo(11250, 4); // 15000 less 25%
  });

  it('leaves an unreduced retirement alone', () => {
    // 30 years at MRA qualifies for an immediate unreduced annuity.
    const res = calculateFersResults({ ...base, yearsOfService: 30 });
    expect(res.ageReduction.isMra10).toBe(false);
    expect(res.ageReduction.percent).toBe(0);
    expect(res.stayFed.annualPension).toBeCloseTo(res.stayFed.annualPensionBeforeReductions, 6);
  });

  it('applies no reduction at 62 even with only 10 years', () => {
    const res = calculateFersResults({ ...base, currentAge: 62, retirementAge: 62, yearsOfService: 10 });
    expect(res.ageReduction.percent).toBe(0);
  });

  // OPM reduces for age first; the survivor's share is a percentage of what
  // remains, not of the original figure.
  it('reduces for age before the survivor election', () => {
    const res = calculateFersResults({ ...base, survivorElection: SURVIVOR_ELECTIONS.FULL });

    expect(res.stayFed.annualPensionBeforeSurvivorReduction).toBeCloseTo(11250, 4);
    expect(res.stayFed.annualPension).toBeCloseTo(10125, 4); // less a further 10%
    expect(res.survivor.survivorAnnualBenefit).toBeCloseTo(5625, 4); // half of 11250
  });
});

describe('FERS COLA reaches the lifetime figures', () => {
  const base = {
    yearsOfService: 30,
    monthsOfService: 0,
    high3Salary: 100000,
    currentAge: 57,
    retirementAge: 57,
    retirementEndAge: 85,
    showComparison: false,
  };

  it('reports nominal above real, because the diet COLA trails inflation', () => {
    const res = calculateFersResults({ ...base, cpiIncrease: 0.025 });
    expect(res.cola.lifetimeNominal).toBeGreaterThan(res.cola.lifetimeReal);
    expect(res.cola.purchasingPowerRetained).toBeLessThan(1);
  });

  it('withholds adjustments until 62 for an ordinary retiree', () => {
    const res = calculateFersResults({ ...base, cpiIncrease: 0.025 });
    expect(res.cola.startAge).toBe(62);
  });

  it('collapses to a level annuity when inflation is zero', () => {
    const res = calculateFersResults({ ...base, cpiIncrease: 0 });
    expect(res.cola.lifetimeNominal).toBeCloseTo(res.stayFed.annualPension * 28, 2);
    expect(res.cola.lifetimeNominal).toBeCloseTo(res.cola.lifetimeReal, 6);
  });
});

describe('special provision service in the full result', () => {
  const base = {
    yearsOfService: 25,
    monthsOfService: 0,
    high3Salary: 120000,
    currentAge: 50,
    retirementAge: 50,
    showComparison: false,
    cpiIncrease: 0,
  };

  it('uses the 1.7% formula rather than the flat rate', () => {
    const std = calculateFersResults(base);
    const spec = calculateFersResults({ ...base, isSpecialProvision: true });

    // 120k x 20 x 1.7% + 120k x 5 x 1% = 40,800 + 6,000
    expect(spec.stayFed.annualPensionBeforeReductions).toBeCloseTo(46800, 4);
    expect(std.stayFed.annualPensionBeforeReductions).toBeCloseTo(30000, 4);
    expect(spec.specialProvision.advantageOverStandard).toBeCloseTo(16800, 4);
  });

  it('reports the blended effective multiplier', () => {
    const spec = calculateFersResults({ ...base, isSpecialProvision: true });
    expect(spec.stayFed.multiplier).toBeCloseTo(46800 / (120000 * 25), 6);
  });

  it('pays COLA from the start instead of waiting for 62', () => {
    const spec = calculateFersResults({ ...base, isSpecialProvision: true, cpiIncrease: 0.025 });
    expect(spec.cola.startAge).toBe(50);
  });

  it('leaves ordinary retirements untouched', () => {
    expect(calculateFersResults(base).specialProvision).toBeNull();
  });
});
