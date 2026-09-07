import { describe, expect, it } from 'vitest';
import {
  FERS_HIRE_COHORTS,
  SURVIVOR_ELECTIONS,
  calculateAnnualLeaveLumpSum,
  calculateFersRefund,
  calculateFersResults,
  calculateSurvivorBenefit,
  getFersContributionRate,
} from '../fers';
import { RETIREMENT_PATHS, evaluateRetirementPath } from '../retirementPaths';
import { calculateSrs, calculateSrsMonthly } from '../srs';
import { calculateFersColaRate, projectAnnuityWithCola } from '../cola';
import { FEHB_OUTCOMES } from '../fehb';
import { SPECIAL_PROVISION_TYPES } from '../specialProvisions';
import { resolveRetirementPlan } from '../../projection/plan';
import { buildTimeline } from '../../projection/timeline';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../scenarios/schema';

/**
 * Golden cases: one hand-computed answer per FERS retirement path (ROADMAP 52).
 *
 * Each case is worked out on paper from OPM's published rule text and then
 * traced through BOTH layers of the model:
 *
 *   1. The low-level calculator (calculateFersResults / evaluateRetirementPath /
 *      calculateSrs), which is what the rule text describes.
 *   2. The plan resolver (resolveRetirementPlan on a scenario), which is what
 *      the app actually reads. If the two ever disagree, the resolver is
 *      feeding the wrong inputs to a correct calculator.
 *
 * Where OPM publishes a worked example the URL is cited; otherwise the case is
 * constructed from the rule and the arithmetic is written out in the comment
 * so it can be checked without running anything.
 *
 * Every scenario here is built so the resolver's high-3 is exactly the input
 * high-3: current age equals separation age (so no salary growth is projected)
 * and salary growth is zero. The point of a golden case is that the expected
 * number is knowable in advance, not merely reproducible.
 *
 * Sources:
 *   Computation      https://www.opm.gov/retirement-center/fers-information/computation/
 *   Types            https://www.opm.gov/retirement-center/fers-information/types-of-retirement/
 *   Eligibility      https://www.opm.gov/retirement-center/fers-information/eligibility/
 *   Annual leave     https://www.opm.gov/policy-data-oversight/pay-leave/leave-administration/fact-sheets/lump-sum-payments-for-annual-leave/
 *   Contributions    https://www.opm.gov/retirement-center/fers-information/
 *   COLA             https://www.opm.gov/retirement-center/fers-information/cost-of-living-adjustments/
 */

const AS_OF_YEAR = 2026;
const HIGH3 = 100000;

/**
 * A scenario for someone at the point of separation: current age equals
 * separation age, so the resolver uses the high-3 exactly as given.
 */
const atSeparation = ({ age, years, months = 0, high3 = HIGH3, profile = {}, fers = {}, tsp = {}, ...rest }) =>
  applyScenarioUpdates(normalizeScenario(createDefaultScenario('golden')), {
    profile: { currentAge: age, separationAge: age, annuityStartAge: null, socialSecurityClaimAge: 67, ...profile },
    tsp: { annualSalary: high3, annualSalaryGrowthRate: 0, inflationRate: 2.5, currentBalance: 500000, ...tsp },
    fers: { yearsOfService: years, monthsOfService: months, high3Salary: high3, unusedSickLeaveHours: 0, ...fers },
    summary: { socialSecurity: { mode: 'not_configured', monthlyBenefit: 0 } },
    ...rest,
  });

const plan = (scenario) => resolveRetirementPlan(scenario, { asOfYear: AS_OF_YEAR });

describe('Golden 1: immediate unreduced at MRA with 30 years', () => {
  // OPM computation page: "Under Age 62 at Separation for Retirement ... 1 percent
  // of your high-3 average salary for each year of service."
  //   1% x 30 x 100,000 = 30,000 a year, 2,500 a month
  it('calculator: 30,000 unreduced, sick leave credited, supplement eligible', () => {
    const r = calculateFersResults({ yearsOfService: 30, high3Salary: HIGH3, currentAge: 57, retirementAge: 57 });
    expect(r.stayFed.multiplier).toBeCloseTo(0.01, 9);
    expect(r.stayFed.annualPension).toBeCloseTo(30000, 6);
    expect(r.stayFed.monthlyPension).toBeCloseTo(2500, 6);
    expect(r.ageReduction.percent).toBe(0);
    expect(r.stayFed.isEligible).toBe(true);

    const path = evaluateRetirementPath({ path: RETIREMENT_PATHS.IMMEDIATE_UNREDUCED, separationAge: 57, yearsOfService: 30 });
    expect(path.isEligible).toBe(true);
    expect(path.ageReductionPercent).toBe(0);
    expect(path.hasSupplement).toBe(true);
    expect(path.keepsFehb).toBe(true);
  });

  it('resolver: same 30,000, SRS eligible, FEHB continues', () => {
    const p = plan(atSeparation({ age: 57, years: 30 }));
    expect(p.path).toBe(RETIREMENT_PATHS.IMMEDIATE_UNREDUCED);
    expect(p.annuityStartAge).toBe(57);
    expect(p.service.eligibilityYears).toBe(30);
    expect(p.annuity.multiplier).toBeCloseTo(0.01, 9);
    expect(p.annuity.ageReductionPercent).toBe(0);
    expect(p.annuity.annualAtStart).toBeCloseTo(30000, 6);
    expect(p.srs.isEligible).toBe(true);
    expect(p.srs.startAge).toBe(57);
    expect(p.fehb.outcome).toBe(FEHB_OUTCOMES.CONTINUES);
    expect(p.keepsFehb).toBe(true);
  });
});

describe('Golden 2: immediate unreduced at 60 with 20 years', () => {
  // The 1.1% factor needs age 62. At 60 it is 1%:
  //   1% x 20 x 100,000 = 20,000
  it('calculator: 1.0% multiplier, 20,000', () => {
    const r = calculateFersResults({ yearsOfService: 20, high3Salary: HIGH3, currentAge: 60, retirementAge: 60 });
    expect(r.stayFed.multiplier).toBeCloseTo(0.01, 9);
    expect(r.stayFed.annualPension).toBeCloseTo(20000, 6);
    expect(r.ageReduction.percent).toBe(0);
    expect(evaluateRetirementPath({ path: RETIREMENT_PATHS.IMMEDIATE_UNREDUCED, separationAge: 60, yearsOfService: 20 }).isEligible).toBe(true);
  });

  it('resolver: 20,000 with the supplement until 62', () => {
    const p = plan(atSeparation({ age: 60, years: 20 }));
    expect(p.path).toBe(RETIREMENT_PATHS.IMMEDIATE_UNREDUCED);
    expect(p.annuity.multiplier).toBeCloseTo(0.01, 9);
    expect(p.annuity.annualAtStart).toBeCloseTo(20000, 6);
    expect(p.srs.isEligible).toBe(true);
    expect(p.srs.startAge).toBe(60);
    expect(p.srs.endAge).toBe(62);
  });
});

describe('Golden 3: age 62 with 20 years, the 1.1% factor', () => {
  // OPM: "Age 62 or Older at Separation With 20 or More Years of Service —
  //  1.1 percent of your high-3 average salary for each year of service."
  //   1.1% x 20 x 100,000 = 22,000
  it('calculator: 1.1% multiplier, 22,000', () => {
    const r = calculateFersResults({ yearsOfService: 20, high3Salary: HIGH3, currentAge: 62, retirementAge: 62 });
    expect(r.stayFed.multiplier).toBeCloseTo(0.011, 9);
    expect(r.stayFed.annualPension).toBeCloseTo(22000, 6);
  });

  it('resolver: 22,000, and no supplement because it has already ended', () => {
    const p = plan(atSeparation({ age: 62, years: 20 }));
    expect(p.path).toBe(RETIREMENT_PATHS.IMMEDIATE_UNREDUCED);
    expect(p.annuity.multiplier).toBeCloseTo(0.011, 9);
    expect(p.annuity.annualAtStart).toBeCloseTo(22000, 6);
    expect(p.srs.isEligible).toBe(false);
    expect(p.srs.reason).toBe('age_62_or_over');
  });
});

describe('Golden 4: age 62 with 19 years 11 months, months matter', () => {
  // 19 years 11 months = 19.91667 years, which is less than 20, so 1%:
  //   1% x 19.91667 x 100,000 = 19,916.67
  // Not 1.1% x 19.91667 x 100,000 = 21,908.33.
  const years = 19 + 11 / 12;

  it('calculator: 1.0% multiplier, 19,916.67', () => {
    const r = calculateFersResults({ yearsOfService: 19, monthsOfService: 11, high3Salary: HIGH3, currentAge: 62, retirementAge: 62 });
    expect(r.totalYears).toBeCloseTo(years, 9);
    expect(r.stayFed.multiplier).toBeCloseTo(0.01, 9);
    expect(r.stayFed.annualPension).toBeCloseTo(19916.67, 1);
  });

  it('resolver: carries the months and stays at 1.0%', () => {
    const p = plan(atSeparation({ age: 62, years: 19, months: 11 }));
    expect(p.service.eligibilityYears).toBeCloseTo(years, 9);
    expect(p.annuity.multiplier).toBeCloseTo(0.01, 9);
    expect(p.annuity.annualAtStart).toBeCloseTo(19916.67, 1);
  });
});

describe('Golden 5: MRA+10 taken immediately at 57 with 15 years', () => {
  // OPM: "your benefit will be reduced by 5/12 of 1% for each full month (5%
  //  per year) that you were under age 62 on the date your annuity began."
  //   60 months under 62 x 5/12% = 25%
  //   1% x 15 x 100,000 = 15,000; 15,000 x (1 - 0.25) = 11,250
  // No supplement: "If you receive ... an immediate MRA+10 benefit, you will
  // not be eligible for the annuity supplement."
  it('calculator: 25% reduction, 11,250, no supplement', () => {
    const r = calculateFersResults({ yearsOfService: 15, high3Salary: HIGH3, currentAge: 57, retirementAge: 57 });
    expect(r.ageReduction.isMra10).toBe(true);
    expect(r.ageReduction.percent).toBeCloseTo(25, 9);
    expect(r.stayFed.annualPensionBeforeReductions).toBeCloseTo(15000, 6);
    expect(r.ageReduction.annual).toBeCloseTo(3750, 6);
    expect(r.stayFed.annualPension).toBeCloseTo(11250, 6);

    const path = evaluateRetirementPath({ path: RETIREMENT_PATHS.MRA10_IMMEDIATE, separationAge: 57, yearsOfService: 15 });
    expect(path.isEligible).toBe(true);
    expect(path.ageReductionPercent).toBeCloseTo(25, 9);
    expect(path.hasSupplement).toBe(false);
    expect(path.keepsFehb).toBe(true);

    const srs = calculateSrs({ retirementAge: 57, creditableYearsOfService: 15, socialSecurityAt62Monthly: 1800 });
    expect(srs.isEligible).toBe(false);
    expect(srs.annualBeforeEarningsTest).toBe(0);
  });

  it('resolver: chooses MRA+10, 11,250, no SRS, FEHB continues', () => {
    const p = plan(atSeparation({ age: 57, years: 15 }));
    expect(p.path).toBe(RETIREMENT_PATHS.MRA10_IMMEDIATE);
    expect(p.annuityStartAge).toBe(57);
    expect(p.annuity.ageReductionPercent).toBeCloseTo(25, 9);
    expect(p.annuity.annualAtStart).toBeCloseTo(11250, 6);
    expect(p.srs.isEligible).toBe(false);
    expect(p.fehb.outcome).toBe(FEHB_OUTCOMES.CONTINUES);
  });
});

describe('Golden 6: MRA+10 postponed to 62', () => {
  // Zero full months under 62 at the start date, so no reduction:
  //   1% x 15 x 100,000 = 15,000
  // FEHB is suspended at separation and reinstated when the annuity begins.
  it('calculator: no reduction at 62, FEHB kept', () => {
    const path = evaluateRetirementPath({ path: RETIREMENT_PATHS.MRA10_POSTPONED, separationAge: 57, yearsOfService: 15, annuityStartAge: 62 });
    expect(path.isEligible).toBe(true);
    expect(path.annuityStartAge).toBe(62);
    expect(path.ageReductionPercent).toBe(0);
    expect(path.keepsFehb).toBe(true);
    expect(path.hasSupplement).toBe(false);

    const r = calculateFersResults({ yearsOfService: 15, high3Salary: HIGH3, currentAge: 57, retirementAge: 62 });
    expect(r.ageReduction.percent).toBe(0);
    expect(r.stayFed.annualPension).toBeCloseTo(15000, 6);
  });

  it('resolver: 15,000 from 62, frozen for five years, FEHB suspended then reinstated', () => {
    const s = atSeparation({ age: 57, years: 15, profile: { annuityStartAge: 62 } });
    const p = plan(s);
    expect(p.path).toBe(RETIREMENT_PATHS.MRA10_POSTPONED);
    expect(p.isPostponed).toBe(true);
    expect(p.annuityStartAge).toBe(62);
    expect(p.annuity.ageReductionPercent).toBe(0);
    expect(p.annuity.annualAtStart).toBeCloseTo(15000, 6);
    expect(p.annuity.nominalFreezeYears).toBe(5);
    expect(p.srs.isEligible).toBe(false);
    expect(p.fehb.outcome).toBe(FEHB_OUTCOMES.SUSPENDED_THEN_REINSTATED);
    expect(p.keepsFehb).toBe(true);

    // The timeline shows no annuity in the gap and 15,000 the year it starts.
    const t = buildTimeline(s, { asOfYear: AS_OF_YEAR });
    expect(t.rows.find((r) => r.age === 61).pension).toBe(0);
    expect(t.rows.find((r) => r.age === 62).pension).toBeCloseTo(15000, 6);
  });
});

describe('Golden 7: deferred, separated at 45 with 15 years', () => {
  // Deferred with 15 years: unreduced from 62, reduced like MRA+10 from the MRA.
  //   At 62: 1% x 15 x 100,000 = 15,000, no reduction.
  //   At 57: 60 months under 62 x 5/12% = 25%; 15,000 x 0.75 = 11,250.
  // Sick leave is credited only on an immediate annuity, so 2,087 hours adds
  // nothing here. FEHB ends permanently.
  it('calculator: unreduced at 62, 25% reduced at 57, no sick leave, no FEHB', () => {
    const at62 = evaluateRetirementPath({ path: RETIREMENT_PATHS.DEFERRED, separationAge: 45, yearsOfService: 15, annuityStartAge: 62 });
    expect(at62.isEligible).toBe(true);
    expect(at62.annuityStartAge).toBe(62);
    expect(at62.ageReductionPercent).toBe(0);
    expect(at62.creditsSickLeave).toBe(false);
    expect(at62.keepsFehb).toBe(false);
    expect(at62.hasSupplement).toBe(false);

    const at57 = evaluateRetirementPath({ path: RETIREMENT_PATHS.DEFERRED, separationAge: 45, yearsOfService: 15, annuityStartAge: 57 });
    expect(at57.annuityStartAge).toBe(57);
    expect(at57.ageReductionPercent).toBeCloseTo(25, 9);

    expect(calculateFersResults({ yearsOfService: 15, high3Salary: HIGH3, currentAge: 45, retirementAge: 62 }).stayFed.annualPension).toBeCloseTo(15000, 6);
    expect(calculateFersResults({ yearsOfService: 15, high3Salary: HIGH3, currentAge: 45, retirementAge: 57 }).stayFed.annualPension).toBeCloseTo(11250, 6);
  });

  it('resolver: defaults the start to 62 at 15,000, ignores sick leave, loses FEHB', () => {
    const p = plan(atSeparation({ age: 45, years: 15, fers: { unusedSickLeaveHours: 2087 } }));
    expect(p.path).toBe(RETIREMENT_PATHS.DEFERRED);
    expect(p.isDeferred).toBe(true);
    expect(p.annuityStartAge).toBe(62);
    expect(p.service.creditsSickLeave).toBe(false);
    expect(p.service.sickLeaveYears).toBe(0);
    expect(p.service.computationYears).toBe(15);
    expect(p.annuity.ageReductionPercent).toBe(0);
    expect(p.annuity.annualAtStart).toBeCloseTo(15000, 6);
    expect(p.annuity.nominalFreezeYears).toBe(17);
    expect(p.srs.isEligible).toBe(false);
    expect(p.fehb.outcome).toBe(FEHB_OUTCOMES.LOST_PERMANENTLY);
    expect(p.keepsFehb).toBe(false);
  });

  it('resolver: claiming at 57 instead is reduced 25% to 11,250', () => {
    const p = plan(atSeparation({ age: 45, years: 15, profile: { annuityStartAge: 57 } }));
    expect(p.path).toBe(RETIREMENT_PATHS.DEFERRED);
    expect(p.annuityStartAge).toBe(57);
    expect(p.annuity.ageReductionPercent).toBeCloseTo(25, 9);
    expect(p.annuity.annualAtStart).toBeCloseTo(11250, 6);
  });
});

describe('Golden 8: deferred with 20 years, claimed at 60', () => {
  // With 20 years the deferred annuity is unreduced from 60 (the 60+20 door).
  //   1% x 20 x 100,000 = 20,000. Not 1.1%: the retiree is under 62.
  it('calculator: unreduced from 60', () => {
    const path = evaluateRetirementPath({ path: RETIREMENT_PATHS.DEFERRED, separationAge: 50, yearsOfService: 20 });
    expect(path.annuityStartAge).toBe(60);
    expect(path.ageReductionPercent).toBe(0);
    const r = calculateFersResults({ yearsOfService: 20, high3Salary: HIGH3, currentAge: 50, retirementAge: 60 });
    expect(r.stayFed.multiplier).toBeCloseTo(0.01, 9);
    expect(r.stayFed.annualPension).toBeCloseTo(20000, 6);
  });

  it('resolver: 20,000 from 60, unreduced', () => {
    const p = plan(atSeparation({ age: 50, years: 20 }));
    expect(p.path).toBe(RETIREMENT_PATHS.DEFERRED);
    expect(p.annuityStartAge).toBe(60);
    expect(p.annuity.ageReductionPercent).toBe(0);
    expect(p.annuity.multiplier).toBeCloseTo(0.01, 9);
    expect(p.annuity.annualAtStart).toBeCloseTo(20000, 6);
    expect(p.annuity.nominalFreezeYears).toBe(10);
  });
});

describe('Golden 9: VERA at 50 with 20 years', () => {
  // OPM types page: early retirement needs "age 50 with 20 years of service, or
  // any age with 25". Under FERS there is no age reduction.
  //   1% x 20 x 100,000 = 20,000
  // Supplement: "you will not be eligible for the annuity supplement until you
  // reach your MRA" — payable from 57, ends at 62.
  it('calculator: no reduction, supplement from MRA', () => {
    const path = evaluateRetirementPath({ path: RETIREMENT_PATHS.VERA, separationAge: 50, yearsOfService: 20, isVeraOffered: true });
    expect(path.isEligible).toBe(true);
    expect(path.ageReductionPercent).toBe(0);
    expect(path.hasSupplement).toBe(true);
    expect(path.keepsFehb).toBe(true);

    const srs = calculateSrs({ retirementAge: 50, creditableYearsOfService: 20, socialSecurityAt62Monthly: 1800, isVoluntaryEarlyRetirement: true });
    expect(srs.isEligible).toBe(true);
    expect(srs.isPayableNow).toBe(false);
    expect(srs.payableFromAge).toBe(57);
    expect(srs.yearsPayable).toBe(5);
    // 1,800 x 20/40 = 900 a month
    expect(srs.monthlyBeforeEarningsTest).toBeCloseTo(900, 6);
  });

  it('resolver: picks VERA when offered, 20,000, SRS from 57', () => {
    const p = plan(atSeparation({ age: 50, years: 20, profile: { isVeraOffered: true } }));
    expect(p.path).toBe(RETIREMENT_PATHS.VERA);
    expect(p.annuityStartAge).toBe(50);
    expect(p.annuity.ageReductionPercent).toBe(0);
    expect(p.annuity.annualAtStart).toBeCloseTo(20000, 6);
    expect(p.srs.isEligible).toBe(true);
    expect(p.srs.startAge).toBe(57);
    expect(p.srs.endAge).toBe(62);
    expect(p.fehb.outcome).toBe(FEHB_OUTCOMES.CONTINUES);

    // Without the offer the same person is deferred.
    expect(plan(atSeparation({ age: 50, years: 20 })).path).toBe(RETIREMENT_PATHS.DEFERRED);
  });
});

describe('Golden 10: sick leave counts for computation, not eligibility', () => {
  // 2,087 hours is one leave year. 29 years of service plus one year of sick
  // leave is 30 computation years but still 29 eligibility years, so at 57 the
  // door is MRA+10 (reduced 25%), not MRA+30:
  //   1% x 30 x 100,000 = 30,000; x 0.75 = 22,500
  it('calculator: computation 30, eligibility 29, MRA+10 reduction applies', () => {
    const r = calculateFersResults({ yearsOfService: 29, high3Salary: HIGH3, currentAge: 57, retirementAge: 57, unusedSickLeaveHours: 2087 });
    expect(r.service.sickLeaveYears).toBeCloseTo(1, 9);
    expect(r.service.computationYears).toBeCloseTo(30, 9);
    expect(r.service.eligibilityYears).toBe(29);
    expect(r.ageReduction.isMra10).toBe(true);
    expect(r.ageReduction.percent).toBeCloseTo(25, 9);
    expect(r.stayFed.annualPensionBeforeReductions).toBeCloseTo(30000, 6);
    expect(r.stayFed.annualPension).toBeCloseTo(22500, 6);

    expect(evaluateRetirementPath({ path: RETIREMENT_PATHS.IMMEDIATE_UNREDUCED, separationAge: 57, yearsOfService: 29 }).isEligible).toBe(false);
    expect(evaluateRetirementPath({ path: RETIREMENT_PATHS.MRA10_IMMEDIATE, separationAge: 57, yearsOfService: 29 }).isEligible).toBe(true);
  });

  it('resolver: MRA+10 with sick leave credited on the immediate annuity', () => {
    const p = plan(atSeparation({ age: 57, years: 29, fers: { unusedSickLeaveHours: 2087 } }));
    expect(p.path).toBe(RETIREMENT_PATHS.MRA10_IMMEDIATE);
    expect(p.service.eligibilityYears).toBe(29);
    expect(p.service.creditsSickLeave).toBe(true);
    expect(p.service.sickLeaveYears).toBeCloseTo(1, 9);
    expect(p.service.computationYears).toBeCloseTo(30, 9);
    expect(p.annuity.ageReductionPercent).toBeCloseTo(25, 9);
    expect(p.annuity.annualAtStart).toBeCloseTo(22500, 6);
    expect(p.srs.isEligible).toBe(false);

    // One more year of real service and the same person is MRA+30, unreduced:
    //   1% x 31 x 100,000 = 31,000
    const mra30 = plan(atSeparation({ age: 57, years: 30, fers: { unusedSickLeaveHours: 2087 } }));
    expect(mra30.path).toBe(RETIREMENT_PATHS.IMMEDIATE_UNREDUCED);
    expect(mra30.annuity.annualAtStart).toBeCloseTo(31000, 6);
  });
});

describe('Golden 11: full survivor election on a 40,000 annuity', () => {
  // OPM: "If the total of the survivor benefit(s) you elect equals 50% of your
  // benefit, your annuity is reduced by 10%."
  //   Gross 40,000: retiree 40,000 x 0.90 = 36,000; survivor 40,000 x 0.50 = 20,000
  // 40,000 gross from 1% x 20 x 200,000 at age 60.
  it('calculator: retiree 36,000, survivor 20,000', () => {
    const s = calculateSurvivorBenefit({ annualPensionBeforeSurvivorReduction: 40000, election: SURVIVOR_ELECTIONS.FULL });
    expect(s.annualReduction).toBeCloseTo(4000, 6);
    expect(s.annualPensionAfterReduction).toBeCloseTo(36000, 6);
    expect(s.survivorAnnualBenefit).toBeCloseTo(20000, 6);
    expect(s.survivorMonthlyBenefit).toBeCloseTo(20000 / 12, 6);

    const r = calculateFersResults({ yearsOfService: 20, high3Salary: 200000, currentAge: 60, retirementAge: 60, survivorElection: SURVIVOR_ELECTIONS.FULL });
    expect(r.stayFed.annualPensionBeforeSurvivorReduction).toBeCloseTo(40000, 6);
    expect(r.stayFed.annualPension).toBeCloseTo(36000, 6);
    expect(r.survivor.survivorAnnualBenefit).toBeCloseTo(20000, 6);
  });

  it('resolver: the annuity paid is 36,000 and the survivor figure is 20,000', () => {
    const p = plan(atSeparation({ age: 60, years: 20, high3: 200000, fers: { survivorElection: SURVIVOR_ELECTIONS.FULL } }));
    expect(p.annuity.annualAtStart).toBeCloseTo(36000, 6);
    expect(p.annuity.survivor.reductionPercent).toBe(10);
    expect(p.annuity.survivor.annualReduction).toBeCloseTo(4000, 6);
    expect(p.annuity.survivor.survivorAnnualBenefit).toBeCloseTo(20000, 6);
  });
});

describe('Golden 12: law enforcement at 50 with 20 covered years', () => {
  // OPM computation page, special provisions: "1.7% of your high-3 average
  // salary multiplied by your years of service which do not exceed 20, PLUS 1%
  // of your high-3 average salary multiplied by your service exceeding 20 years".
  //   1.7% x 20 x 100,000 = 34,000
  // COLA is paid from the start rather than withheld until 62.
  it('calculator: 34,000 with COLA from the first anniversary', () => {
    const r = calculateFersResults({ yearsOfService: 20, high3Salary: HIGH3, currentAge: 50, retirementAge: 50, isSpecialProvision: true, cpiIncrease: 0.025 });
    expect(r.stayFed.annualPension).toBeCloseTo(34000, 6);
    expect(r.stayFed.multiplier).toBeCloseTo(0.017, 9);
    expect(r.specialProvision.enhancedYears).toBe(20);
    expect(r.specialProvision.standardYears).toBe(0);
    expect(r.specialProvision.advantageOverStandard).toBeCloseTo(14000, 6);
    expect(r.cola.startAge).toBe(50);
    // Diet COLA on 2.5% CPI is 2%: the second year is 34,000 x 1.02 = 34,680.
    const proj = projectAnnuityWithCola({ annualPension: 34000, startAge: 50, endAge: 53, cpiIncrease: 0.025, isSpecialProvision: true });
    expect(proj.years[0].nominal).toBeCloseTo(34000, 6);
    expect(proj.years[1].nominal).toBeCloseTo(34680, 6);
  });

  it('resolver: special provision immediate, 34,000, COLA at 50', () => {
    const s = atSeparation({ age: 50, years: 20, profile: { employeeType: SPECIAL_PROVISION_TYPES.LAW_ENFORCEMENT } });
    const p = plan(s);
    expect(p.isSpecialProvision).toBe(true);
    expect(p.path).toBe(RETIREMENT_PATHS.IMMEDIATE_UNREDUCED);
    expect(p.annuityStartAge).toBe(50);
    expect(p.annuity.annualAtStart).toBeCloseTo(34000, 6);
    expect(p.annuity.ageReductionPercent).toBe(0);
    expect(p.annuity.colaStartAge).toBe(50);
    expect(p.tspAccess.traditionalPenaltyFreeAge).toBe(50);

    const t = buildTimeline(s, { asOfYear: AS_OF_YEAR });
    expect(t.rows.find((r) => r.age === 50).pension).toBeCloseTo(34000, 6);
    expect(t.rows.find((r) => r.age === 51).pension).toBeCloseTo(34680, 6);
  });

  // DISCREPANCY. specialProvisions.js says a special provision retiree under 62
  // has the supplement (hasSupplement: age < 62) and OPM agrees: the supplement
  // is payable immediately to a law enforcement officer retiring at 50 under
  // the special provisions, and is exempt from the earnings test until MRA.
  // But resolveRetirementPlan calls calculateSrs with the regular-FERS test
  // (MRA+30 or 60+20, or a VERA flag), so an LEO at 50 with 20 years is told
  // the supplement is not payable and the timeline pays no SRS from 50 to 62.
  // Expected: srs.isEligible true, startAge 50, monthly = SS62 x 20/40 = 900.
  it('resolver: the supplement is payable immediately to a special provision retiree', () => {
    const s = atSeparation({
      age: 50,
      years: 20,
      profile: { employeeType: SPECIAL_PROVISION_TYPES.LAW_ENFORCEMENT },
      summary: { socialSecurity: { mode: 'manual', monthlyBenefit: 1800 / 0.7 } },
    });
    const p = plan(s);
    expect(p.srs.isEligible).toBe(true);
    expect(p.srs.startAge).toBe(50);
    expect(p.srs.monthly).toBeCloseTo(900, 3);
  });
});

describe('Golden 13: the FERS diet COLA', () => {
  // OPM COLA page: CPI up to 2% -> the CPI; 2% to 3% -> 2%; above 3% -> CPI minus 1.
  it('calculator: 2.5% CPI pays 2%, 4% CPI pays 3%', () => {
    expect(calculateFersColaRate(0.025)).toBeCloseTo(0.02, 9);
    expect(calculateFersColaRate(0.04)).toBeCloseTo(0.03, 9);
    expect(calculateFersColaRate(0.015)).toBeCloseTo(0.015, 9);
  });

  // A regular retiree at 57 gets no adjustment until 62. With a 30,000 annuity
  // and 2.5% CPI the payment is flat 30,000 for ages 57-61, then
  //   62: 30,000 x 1.02 = 30,600, 63: 31,212.
  it('calculator: no COLA before 62 for a regular retiree', () => {
    const proj = projectAnnuityWithCola({ annualPension: 30000, startAge: 57, endAge: 64, cpiIncrease: 0.025 });
    const at = (age) => proj.years.find((y) => y.age === age).nominal;
    expect(at(57)).toBeCloseTo(30000, 6);
    expect(at(61)).toBeCloseTo(30000, 6);
    expect(at(62)).toBeCloseTo(30600, 6);
    expect(at(63)).toBeCloseTo(31212, 6);
  });

  // The timeline counts COLA years from 62, so its first adjusted payment is
  // the age-63 row (projectAnnuityWithCola adjusts the age-62 row). Both agree
  // that nothing is paid before 62; the one-year offset is a modelling
  // convention, not a rule difference, and is pinned here so it cannot drift.
  it('timeline: the pension row is flat until 62 and grows 2% a year after', () => {
    const t = buildTimeline(atSeparation({ age: 57, years: 30 }), { asOfYear: AS_OF_YEAR });
    const pension = (age) => t.rows.find((r) => r.age === age).pension;
    expect(pension(57)).toBeCloseTo(30000, 6);
    expect(pension(61)).toBeCloseTo(30000, 6);
    expect(pension(62)).toBeCloseTo(30000, 6);
    expect(pension(63)).toBeCloseTo(30600, 6);
    expect(pension(64)).toBeCloseTo(31212, 6);

    // At 4% CPI the diet COLA is 3%: 63 -> 30,900.
    const hot = buildTimeline(atSeparation({ age: 57, years: 30, tsp: { inflationRate: 4 } }), { asOfYear: AS_OF_YEAR });
    expect(hot.rows.find((r) => r.age === 63).pension).toBeCloseTo(30900, 6);
  });
});

describe('Golden 14: the Special Retirement Supplement', () => {
  // OPM's own worked example (types-of-retirement page): "$1,000 ... 30 years
  // under FERS, OPM would divide 30 by 40 (.75) and multiply ($1,000 x .75 = $750)."
  // Same rule at 1,800: 1,800 x 30/40 = 1,350 a month, 16,200 a year.
  it('calculator: 1,800 x 30/40 = 1,350 a month', () => {
    expect(calculateSrsMonthly({ socialSecurityAt62Monthly: 1800, civilianYearsOfService: 30 })).toBeCloseTo(1350, 6);
    const srs = calculateSrs({ retirementAge: 57, creditableYearsOfService: 30, socialSecurityAt62Monthly: 1800 });
    expect(srs.isEligible).toBe(true);
    expect(srs.monthlyBeforeEarningsTest).toBeCloseTo(1350, 6);
    expect(srs.annualBeforeEarningsTest).toBeCloseTo(16200, 6);
    expect(srs.yearsPayable).toBe(5);
    expect(srs.lifetimeTotal).toBeCloseTo(81000, 6);
  });

  // The resolver works from the statement PIA at FRA, not the age-62 figure.
  // For FRA 67 the age-62 benefit is 70% of PIA, so PIA = 1,800 / 0.70.
  it('resolver: derives the age-62 benefit from the PIA and pays 1,350 a month', () => {
    const s = atSeparation({ age: 57, years: 30, summary: { socialSecurity: { mode: 'manual', monthlyBenefit: 1800 / 0.7 } } });
    const p = plan(s);
    expect(p.socialSecurity.fra.decimal).toBe(67);
    expect(p.socialSecurity.monthlyAt62).toBeCloseTo(1800, 6);
    expect(p.srs.isEligible).toBe(true);
    expect(p.srs.monthly).toBeCloseTo(1350, 6);
    expect(p.srs.annual).toBeCloseTo(16200, 6);

    const t = buildTimeline(s, { asOfYear: AS_OF_YEAR });
    expect(t.rows.find((r) => r.age === 57).srs).toBeCloseTo(16200, 6);
    expect(t.rows.find((r) => r.age === 61).srs).toBeCloseTo(16200, 6);
    expect(t.rows.find((r) => r.age === 62).srs).toBe(0);
  });
});

describe('Golden 15: employee contribution by hire cohort', () => {
  // 0.8% (before 2013), 3.1% (FERS-RAE, 2013), 4.4% (FERS-FRAE, 2014+).
  it('calculator: 0.8 / 3.1 / 4.4 percent', () => {
    expect(getFersContributionRate(FERS_HIRE_COHORTS.FERS)).toBeCloseTo(0.008, 9);
    expect(getFersContributionRate(FERS_HIRE_COHORTS.FERS_RAE)).toBeCloseTo(0.031, 9);
    expect(getFersContributionRate(FERS_HIRE_COHORTS.FERS_FRAE)).toBeCloseTo(0.044, 9);
  });

  it('resolver and timeline: the cohort sets the deduction from salary', () => {
    for (const [cohort, rate] of [
      [FERS_HIRE_COHORTS.FERS, 0.008],
      [FERS_HIRE_COHORTS.FERS_RAE, 0.031],
      [FERS_HIRE_COHORTS.FERS_FRAE, 0.044],
    ]) {
      const s = atSeparation({ age: 55, years: 28, profile: { separationAge: 57, hireCohort: cohort } });
      expect(plan(s).fersContributionRate).toBeCloseTo(rate, 9);
      const row = buildTimeline(s, { asOfYear: AS_OF_YEAR }).rows.find((r) => r.age === 55);
      expect(row.fersContribution).toBeCloseTo(HIGH3 * rate, 6);
    }
  });
});

describe('Golden 16: annual leave lump sum', () => {
  // OPM fact sheet: paid at the hourly rate in effect at separation, computed
  // on the 2,087-hour year. 104,350 / 2,087 = 50.00 an hour; 240 hours = 12,000.
  it('calculator: 240 hours at 104,350 = 12,000', () => {
    const r = calculateAnnualLeaveLumpSum({ annualSalary: 104350, hours: 240 });
    expect(r.hourlyRate).toBeCloseTo(50, 9);
    expect(r.grossPayment).toBeCloseTo(12000, 6);
    expect(r.exceedsTypicalCap).toBe(false);
  });

  it('resolver: 12,000 lands as bridge cash in the separation year', () => {
    const s = atSeparation({ age: 57, years: 30, high3: 104350, fers: { annualLeaveHoursAtSeparation: 240 } });
    const p = plan(s);
    expect(p.annualLeave.hourlyRate).toBeCloseTo(50, 9);
    expect(p.annualLeave.grossPayment).toBeCloseTo(12000, 6);
    const t = buildTimeline(s, { asOfYear: AS_OF_YEAR });
    expect(t.rows.find((r) => r.age === 57).lumpSums).toBeCloseTo(12000, 6);
    expect(t.rows.find((r) => r.age === 58).lumpSums).toBe(0);
  });
});

describe('Golden 17: refund of FERS contributions', () => {
  // 5 U.S.C. 8422(i). Three years at 100,000 under FERS-FRAE (4.4%) with no
  // interest: 3 x 4,400 = 13,200.
  it('calculator: 13,200 with zero interest', () => {
    const r = calculateFersRefund({ annualSalaries: [100000, 100000, 100000], hireCohort: FERS_HIRE_COHORTS.FERS_FRAE, interestRate: 0 });
    expect(r.contributionRate).toBeCloseTo(0.044, 9);
    expect(r.totalContributions).toBeCloseTo(13200, 6);
    expect(r.interest).toBe(0);
    expect(r.refundAmount).toBeCloseTo(13200, 6);
  });

  // The resolver only offers the refund when no annuity is available (under 5
  // years) and applies the default Treasury interest rate; with a flat 100,000
  // history the contributions are 13,200 and interest is on top.
  it('resolver: offers the refund only when no annuity is available', () => {
    const s = atSeparation({ age: 40, years: 3, fers: { takeRefundOfContributions: true } });
    const p = plan(s);
    expect(p.isEligibleForAnnuity).toBe(false);
    expect(p.refund.contributionRate).toBeCloseTo(0.044, 9);
    expect(p.refund.totalContributions).toBeCloseTo(13200, 6);
    expect(p.refund.refundAmount).toBeGreaterThanOrEqual(13200);

    const fiveYears = plan(atSeparation({ age: 40, years: 5, fers: { takeRefundOfContributions: true } }));
    expect(fiveYears.path).toBe(RETIREMENT_PATHS.DEFERRED);
    expect(fiveYears.refund).toBeNull();
  });
});

describe('Beyond the list: the 1.1% factor and a postponed start', () => {
  // OPM: the 1.1% factor applies at "Age 62 or Older at Separation With 20 or
  // More Years of Service". A postponed MRA+10 annuity is computed as of the
  // separation date; reaching 62 while waiting does not earn the higher rate.
  //   Separated at 57 with 25 years, postponed to 62: 1% x 25 x 100,000 = 25,000.
  //
  // DISCREPANCY. calculateFersResults keys the multiplier off `retirementAge`,
  // and the resolver passes the annuity START age, so the model pays 1.1%
  // (27,500) to someone who separated at 57. The same applies to a deferred
  // annuitant with 20+ years who claims at 62 rather than 60.
  it('resolver: a postponed annuity keeps the separation-age multiplier', () => {
    const p = plan(atSeparation({ age: 57, years: 25, profile: { annuityStartAge: 62 } }));
    expect(p.path).toBe(RETIREMENT_PATHS.MRA10_POSTPONED);
    expect(p.annuity.multiplier).toBeCloseTo(0.01, 9);
    expect(p.annuity.annualAtStart).toBeCloseTo(25000, 6);
  });
});
