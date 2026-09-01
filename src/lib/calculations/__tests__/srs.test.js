import { describe, expect, it } from 'vitest';
import {
  SRS_INELIGIBILITY_REASONS,
  applySrsEarningsTest,
  calculateSrs,
  calculateSrsMonthly,
  evaluateSrsEligibility,
  getSrsEarningsTestExemptAmount,
} from '../srs';

const EXEMPT = getSrsEarningsTestExemptAmount();

// Verified against https://www.ssa.gov/oact/cola/rtea.html for 2026.
const SSA_2026_UNDER_FRA = 24480;

describe('SRS eligibility', () => {
  it('qualifies MRA+30', () => {
    const res = evaluateSrsEligibility({ retirementAge: 57, creditableYearsOfService: 30, mra: 57 });
    expect(res.isEligible).toBe(true);
    expect(res.isPayableNow).toBe(true);
  });

  it('qualifies age 60 with 20 years', () => {
    expect(evaluateSrsEligibility({ retirementAge: 60, creditableYearsOfService: 20 }).isEligible).toBe(true);
  });

  // The most consequential exclusion: MRA+10 is a reduced annuity, so no
  // supplement — a retiree who assumes otherwise overstates early income badly.
  it('excludes MRA+10, which is reduced rather than unreduced', () => {
    const res = evaluateSrsEligibility({ retirementAge: 57, creditableYearsOfService: 10, mra: 57 });
    expect(res.isEligible).toBe(false);
    expect(res.reason).toBe(SRS_INELIGIBILITY_REASONS.NOT_IMMEDIATE_UNREDUCED);
  });

  it('excludes deferred and postponed retirement', () => {
    const res = evaluateSrsEligibility({
      retirementAge: 57,
      creditableYearsOfService: 30,
      isDeferredOrPostponed: true,
    });
    expect(res.isEligible).toBe(false);
    expect(res.reason).toBe(SRS_INELIGIBILITY_REASONS.DEFERRED_OR_POSTPONED);
  });

  it('excludes anyone already 62, since the supplement has ended', () => {
    const res = evaluateSrsEligibility({ retirementAge: 62, creditableYearsOfService: 30 });
    expect(res.isEligible).toBe(false);
    expect(res.reason).toBe(SRS_INELIGIBILITY_REASONS.AGE_62_OR_OVER);
  });

  it('qualifies a VERA retiree but defers payment to MRA', () => {
    const res = evaluateSrsEligibility({
      retirementAge: 50,
      creditableYearsOfService: 20,
      mra: 57,
      isVoluntaryEarlyRetirement: true,
    });
    expect(res.isEligible).toBe(true);
    expect(res.isPayableNow).toBe(false);
    expect(res.payableFromAge).toBe(57);
  });

  it('pays a VERA retiree immediately once past MRA', () => {
    const res = evaluateSrsEligibility({
      retirementAge: 58,
      creditableYearsOfService: 20,
      mra: 57,
      isVoluntaryEarlyRetirement: true,
    });
    expect(res.isPayableNow).toBe(true);
  });
});

describe('SRS amount', () => {
  // OPM's worked form: age-62 benefit x whole years of civilian service / 40.
  it('prorates the age-62 benefit over a 40-year career', () => {
    expect(calculateSrsMonthly({ socialSecurityAt62Monthly: 2000, civilianYearsOfService: 30 })).toBeCloseTo(1500, 6);
    expect(calculateSrsMonthly({ socialSecurityAt62Monthly: 1800, civilianYearsOfService: 20 })).toBeCloseTo(900, 6);
  });

  it('rounds service to the nearest whole year', () => {
    const up = calculateSrsMonthly({ socialSecurityAt62Monthly: 2000, civilianYearsOfService: 30.6 });
    const down = calculateSrsMonthly({ socialSecurityAt62Monthly: 2000, civilianYearsOfService: 30.4 });
    expect(up).toBeCloseTo((2000 * 31) / 40, 6);
    expect(down).toBeCloseTo((2000 * 30) / 40, 6);
  });

  it('returns zero without a Social Security estimate to prorate', () => {
    expect(calculateSrsMonthly({ socialSecurityAt62Monthly: 0, civilianYearsOfService: 30 })).toBe(0);
  });
});

describe('SRS earnings test', () => {
  it('withholds nothing at or below the exempt amount', () => {
    const res = applySrsEarningsTest({
      srsAnnual: 18000,
      annualEarnedIncome: EXEMPT,
    });
    expect(res.withheld).toBe(0);
    expect(res.srsAnnualAfterTest).toBe(18000);
  });

  it('withholds $1 for every $2 above the exempt amount', () => {
    const res = applySrsEarningsTest({
      srsAnnual: 18000,
      annualEarnedIncome: EXEMPT + 10000,
      exemptAmount: EXEMPT,
    });
    expect(res.withheld).toBeCloseTo(5000, 6);
    expect(res.srsAnnualAfterTest).toBeCloseTo(13000, 6);
  });

  it('cannot withhold more than the supplement itself', () => {
    const res = applySrsEarningsTest({
      srsAnnual: 12000,
      annualEarnedIncome: EXEMPT + 100000,
    });
    expect(res.withheld).toBe(12000);
    expect(res.srsAnnualAfterTest).toBe(0);
    expect(res.isFullyOffset).toBe(true);
  });
});

describe('calculateSrs', () => {
  it('models a GS-13 leaving at MRA+30 end to end', () => {
    const res = calculateSrs({
      retirementAge: 57,
      creditableYearsOfService: 30,
      socialSecurityAt62Monthly: 2000,
      mra: 57,
    });

    expect(res.isEligible).toBe(true);
    expect(res.monthlyBeforeEarningsTest).toBeCloseTo(1500, 6);
    expect(res.yearsPayable).toBe(5); // 57 to 62
    expect(res.lifetimeTotal).toBeCloseTo(1500 * 12 * 5, 4);
  });

  it('pays nothing when ineligible, without inventing an amount', () => {
    const res = calculateSrs({
      retirementAge: 57,
      creditableYearsOfService: 10,
      socialSecurityAt62Monthly: 2000,
      mra: 57,
    });
    expect(res.isEligible).toBe(false);
    expect(res.monthlyBeforeEarningsTest).toBe(0);
    expect(res.lifetimeTotal).toBe(0);
  });

  it('shortens the payment window for a VERA retiree waiting on MRA', () => {
    const res = calculateSrs({
      retirementAge: 52,
      creditableYearsOfService: 25,
      socialSecurityAt62Monthly: 2000,
      mra: 57,
      isVoluntaryEarlyRetirement: true,
    });
    // Eligible at 52 but not paid until 57, so five years of supplement, not ten.
    expect(res.isEligible).toBe(true);
    expect(res.isPayableNow).toBe(false);
    expect(res.yearsPayable).toBe(5);
  });

  it('reduces the supplement for post-retirement earnings', () => {
    const res = calculateSrs({
      retirementAge: 57,
      creditableYearsOfService: 30,
      socialSecurityAt62Monthly: 2000,
      mra: 57,
      annualEarnedIncome: EXEMPT + 20000,
    });
    expect(res.annualBeforeEarningsTest).toBeCloseTo(18000, 6);
    expect(res.annualAfterEarningsTest).toBeCloseTo(8000, 6);
  });
});

describe('SRS earnings-test parameters', () => {
  // The supplement ends at 62 and full retirement age is 67, so a recipient can
  // never be in their FRA year. Only the under-FRA figure is reachable here.
  it('uses the under-FRA exempt amount for 2026', () => {
    expect(getSrsEarningsTestExemptAmount(2026)).toBe(SSA_2026_UNDER_FRA);
  });

  it('always withholds at $1 per $2, never the FRA-year ratio', () => {
    const res = applySrsEarningsTest({
      srsAnnual: 18000,
      annualEarnedIncome: SSA_2026_UNDER_FRA + 10000,
      year: 2026,
    });
    expect(res.withholdingDivisor).toBe(2);
    expect(res.withheld).toBeCloseTo(5000, 6);
  });

  it('reports when a projection used carried-forward parameters', () => {
    const res = applySrsEarningsTest({ srsAnnual: 18000, annualEarnedIncome: 40000, year: 2031 });
    expect(res.usesExactYearParameters).toBe(false);
  });
});
