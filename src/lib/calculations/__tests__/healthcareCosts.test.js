import { describe, expect, it } from 'vitest';
import {
  COVERAGE_TYPES,
  DEFAULT_MARKETPLACE_ANNUAL_PREMIUM,
  MEDICARE_ELIGIBILITY_AGE,
  calculateIrmaaSurcharge,
  projectHealthcareCostForYear,
  projectHealthcareCosts,
  resolveCoverageType,
} from '../healthcareCosts';
import { FEHB_OUTCOMES } from '../fehb';
import { getAnnualParameters } from '../annualParameters';

const params = getAnnualParameters(2026);
const SELF_SHARE = params.fehb.defaultAnnualEnrolleeShare.self;
const PART_B_MONTHLY = params.medicare.partBStandardMonthlyPremium;
const grow = (amount, years, rate = 7) => amount * Math.pow(1 + rate / 100, years);

describe('coverage while employed', () => {
  it('charges the default self-only FEHB share at 45', () => {
    const r = projectHealthcareCostForYear({ age: 45, isEmployed: true });
    expect(r.coverageType).toBe(COVERAGE_TYPES.FEHB);
    expect(r.fehbPremium).toBe(SELF_SHARE);
    expect(r.marketplacePremium).toBe(0);
    expect(r.medicarePartB).toBe(0);
  });

  // Employment keeps FEHB whatever the retirement outcome would later be.
  it('keeps FEHB while employed even on a path that will lose it', () => {
    expect(
      resolveCoverageType({ age: 50, fehbOutcome: FEHB_OUTCOMES.LOST_PERMANENTLY, isEmployed: true })
    ).toBe(COVERAGE_TYPES.FEHB);
  });
});

describe('coverage in retirement before 65', () => {
  // Retirees pay the same share as employees; only growth moves the number.
  it('continues FEHB at the grown enrollee share at 57', () => {
    const r = projectHealthcareCostForYear({
      age: 57,
      yearsFromNow: 12,
      fehbOutcome: FEHB_OUTCOMES.CONTINUES,
      isAnnuityPaying: true,
    });
    expect(r.coverageType).toBe(COVERAGE_TYPES.FEHB);
    expect(r.fehbPremium).toBeCloseTo(grow(SELF_SHARE, 12), 6);
  });

  it('sends a deferred retiree to the marketplace', () => {
    const r = projectHealthcareCostForYear({
      age: 57,
      yearsFromNow: 12,
      fehbOutcome: FEHB_OUTCOMES.LOST_PERMANENTLY,
    });
    expect(r.coverageType).toBe(COVERAGE_TYPES.MARKETPLACE);
    expect(r.fehbPremium).toBe(0);
    expect(r.marketplacePremium).toBeCloseTo(grow(DEFAULT_MARKETPLACE_ANNUAL_PREMIUM.self, 12), 6);
  });

  it('sends someone short of five years to the marketplace', () => {
    expect(
      resolveCoverageType({ age: 57, fehbOutcome: FEHB_OUTCOMES.NOT_ENROLLED_LONG_ENOUGH })
    ).toBe(COVERAGE_TYPES.MARKETPLACE);
  });

  // Postponing: marketplace until the annuity starts, FEHB from then on.
  it('bridges a postponed annuity on the marketplace and reinstates FEHB', () => {
    const before = resolveCoverageType({
      age: 58,
      fehbOutcome: FEHB_OUTCOMES.SUSPENDED_THEN_REINSTATED,
      isAnnuityPaying: false,
    });
    const after = resolveCoverageType({
      age: 62,
      fehbOutcome: FEHB_OUTCOMES.SUSPENDED_THEN_REINSTATED,
      isAnnuityPaying: true,
    });
    expect(before).toBe(COVERAGE_TYPES.MARKETPLACE);
    expect(after).toBe(COVERAGE_TYPES.FEHB);
  });

  it('uses the family marketplace default for a family enrollment', () => {
    const r = projectHealthcareCostForYear({
      age: 57,
      fehbOutcome: FEHB_OUTCOMES.LOST_PERMANENTLY,
      healthcare: { fehbEnrollmentType: 'family' },
    });
    expect(r.marketplacePremium).toBe(DEFAULT_MARKETPLACE_ANNUAL_PREMIUM.family);
  });

  it('reports no cover when the marketplace premium is explicitly zero', () => {
    expect(
      resolveCoverageType({
        age: 57,
        fehbOutcome: FEHB_OUTCOMES.LOST_PERMANENTLY,
        healthcare: { marketplaceAnnualPremium: 0 },
      })
    ).toBe(COVERAGE_TYPES.NONE);
  });
});

describe('coverage at 65', () => {
  it('pays Part B alongside FEHB when both are kept', () => {
    const r = projectHealthcareCostForYear({
      age: MEDICARE_ELIGIBILITY_AGE,
      fehbOutcome: FEHB_OUTCOMES.CONTINUES,
      isAnnuityPaying: true,
    });
    expect(r.coverageType).toBe(COVERAGE_TYPES.FEHB_WITH_MEDICARE);
    expect(r.medicarePartB).toBeCloseTo(PART_B_MONTHLY * 12, 6);
    expect(r.fehbPremium).toBe(SELF_SHARE);
    expect(r.irmaaSurcharge).toBe(0);
  });

  it('drops to Medicare only when FEHB is not kept', () => {
    const r = projectHealthcareCostForYear({
      age: 70,
      fehbOutcome: FEHB_OUTCOMES.CONTINUES,
      isAnnuityPaying: true,
      healthcare: { keepFehbWithMedicare: false },
    });
    expect(r.coverageType).toBe(COVERAGE_TYPES.MEDICARE_ONLY);
    expect(r.fehbPremium).toBe(0);
    expect(r.medicarePartB).toBeCloseTo(PART_B_MONTHLY * 12, 6);
  });

  it('charges no Part B when not enrolled', () => {
    const r = projectHealthcareCostForYear({
      age: 66,
      fehbOutcome: FEHB_OUTCOMES.CONTINUES,
      isAnnuityPaying: true,
      healthcare: { enrollInPartB: false },
    });
    expect(r.medicarePartB).toBe(0);
  });

  it('adds the IRMAA surcharge when asked', () => {
    const r = projectHealthcareCostForYear({
      age: 66,
      fehbOutcome: FEHB_OUTCOMES.CONTINUES,
      isAnnuityPaying: true,
      magiTwoYearsPrior: 120000,
      includeIrmaa: true,
    });
    expect(r.irmaaSurcharge).toBeCloseTo((284.1 - PART_B_MONTHLY) * 12, 6);
  });
});

describe('IRMAA tiers', () => {
  it('finds the first tier at $120,000 single', () => {
    const r = calculateIrmaaSurcharge({ magi: 120000, filingStatus: 'single', year: 2026 });
    expect(r.tierIndex).toBe(0);
    expect(r.monthlySurcharge).toBeCloseTo(284.1 - 202.9, 6);
    expect(r.annualSurcharge).toBeCloseTo((284.1 - 202.9) * 12, 6);
  });

  it('charges nothing below the first threshold', () => {
    const r = calculateIrmaaSurcharge({ magi: 109000, filingStatus: 'single', year: 2026 });
    expect(r.tierIndex).toBe(-1);
    expect(r.monthlySurcharge).toBe(0);
  });

  it('reads joint thresholds for a joint return', () => {
    expect(calculateIrmaaSurcharge({ magi: 120000, filingStatus: 'married_joint' }).tierIndex).toBe(-1);
    expect(calculateIrmaaSurcharge({ magi: 300000, filingStatus: 'married_joint' }).tierIndex).toBe(1);
  });

  it('reaches the top tier above $500,000', () => {
    const r = calculateIrmaaSurcharge({ magi: 600000, filingStatus: 'single' });
    expect(r.tierIndex).toBe(4);
    expect(r.monthlySurcharge).toBeCloseTo(689.3 - 202.9, 6);
  });
});

describe('other coverage', () => {
  it('replaces the premium with the VA cost', () => {
    const r = projectHealthcareCostForYear({
      age: 57,
      fehbOutcome: FEHB_OUTCOMES.CONTINUES,
      isAnnuityPaying: true,
      healthcare: { otherCoverage: 'va', otherCoverageAnnualCost: 1200 },
    });
    expect(r.coverageType).toBe(COVERAGE_TYPES.VA_TRICARE);
    expect(r.fehbPremium).toBe(0);
    expect(r.marketplacePremium).toBe(0);
    expect(r.otherCoverageCost).toBe(1200);
  });

  // TRICARE For Life requires Part B.
  it('still pays Part B at 65 with TRICARE', () => {
    const r = projectHealthcareCostForYear({
      age: 65,
      healthcare: { otherCoverage: 'tricare', otherCoverageAnnualCost: 700 },
    });
    expect(r.coverageType).toBe(COVERAGE_TYPES.VA_TRICARE);
    expect(r.medicarePartB).toBeCloseTo(PART_B_MONTHLY * 12, 6);
    expect(r.otherCoverageCost).toBe(700);
  });
});

describe('growth', () => {
  it('compounds the premium at 7% over ten years', () => {
    const r = projectHealthcareCostForYear({ age: 55, yearsFromNow: 10, isEmployed: true });
    expect(r.fehbPremium).toBeCloseTo(SELF_SHARE * Math.pow(1.07, 10), 6);
    expect(r.outOfPocket).toBeCloseTo(2000 * Math.pow(1.07, 10), 6);
  });

  it('honours a custom growth rate and explicit share', () => {
    const r = projectHealthcareCostForYear({
      age: 55,
      yearsFromNow: 10,
      isEmployed: true,
      healthcare: { premiumGrowthPercent: 3, fehbAnnualEnrolleeShare: 5000 },
    });
    expect(r.fehbPremium).toBeCloseTo(5000 * Math.pow(1.03, 10), 6);
  });

  it('sums every component into the total', () => {
    const r = projectHealthcareCostForYear({ age: 45, isEmployed: true });
    expect(r.total).toBeCloseTo(r.fehbPremium + r.outOfPocket, 6);
  });
});

describe('a full projection', () => {
  it('moves through employment, the marketplace bridge, FEHB and Medicare', () => {
    const years = projectHealthcareCosts({
      startAge: 55,
      endAge: 67,
      fehbOutcome: FEHB_OUTCOMES.SUSPENDED_THEN_REINSTATED,
      separationAge: 57,
      annuityStartAge: 62,
    });
    const at = (age) => years.find((y) => y.age === age);

    expect(years).toHaveLength(12);
    expect(at(55).coverageType).toBe(COVERAGE_TYPES.FEHB);
    expect(at(55).isEmployed).toBe(true);
    expect(at(58).coverageType).toBe(COVERAGE_TYPES.MARKETPLACE);
    expect(at(62).coverageType).toBe(COVERAGE_TYPES.FEHB);
    expect(at(65).coverageType).toBe(COVERAGE_TYPES.FEHB_WITH_MEDICARE);
    expect(at(66).yearsFromNow).toBe(11);
    expect(at(66).fehbPremium).toBeCloseTo(grow(SELF_SHARE, 11), 6);
  });

  it('looks MAGI back two years for IRMAA', () => {
    const years = projectHealthcareCosts({
      startAge: 65,
      endAge: 67,
      fehbOutcome: FEHB_OUTCOMES.CONTINUES,
      includeIrmaa: true,
      magiByAge: { 63: 120000, 64: 50000 },
    });
    expect(years[0].irmaaSurcharge).toBeGreaterThan(0);
    expect(years[1].irmaaSurcharge).toBe(0);
  });
});
