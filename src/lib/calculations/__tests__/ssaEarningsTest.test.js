import { describe, expect, it } from 'vitest';
import {
  ANNUAL_PARAMETERS,
  CURRENT_PARAMETER_YEAR,
  getAnnualParameters,
  getDefinedParameterYears,
} from '../annualParameters';
import {
  EARNINGS_TEST_CASES,
  WITHHOLDING_DIVISOR_FRA_YEAR,
  WITHHOLDING_DIVISOR_UNDER_FRA,
  calculateEarningsTestWithholding,
} from '../ssaEarningsTest';

// Verified against https://www.ssa.gov/oact/cola/rtea.html for 2026.
const SSA_2026 = { underFra: 24480, fraYear: 65160 };

describe('annual parameters', () => {
  it('carries the verified 2026 SSA earnings-test amounts', () => {
    const p = getAnnualParameters(2026);
    expect(p.ssaEarningsTest.underFraExemptAmount).toBe(SSA_2026.underFra);
    expect(p.ssaEarningsTest.fraYearExemptAmount).toBe(SSA_2026.fraYear);
  });

  it('keeps the monthly figures consistent with the annual ones', () => {
    const p = getAnnualParameters(2026).ssaEarningsTest;
    expect(p.underFraExemptAmount / 12).toBeCloseTo(2040, 6);
    expect(p.fraYearExemptAmount / 12).toBeCloseTo(5430, 6);
  });

  it('reports an exact match for a defined year', () => {
    expect(getAnnualParameters(CURRENT_PARAMETER_YEAR).isExact).toBe(true);
  });

  // A scenario projected years ahead should use the latest known figures rather
  // than zero, but must be able to say it is doing so.
  it('carries the latest year forward for an undefined future year, and says so', () => {
    const p = getAnnualParameters(2031);
    expect(p.isExact).toBe(false);
    expect(p.requestedYear).toBe(2031);
    expect(p.year).toBe(CURRENT_PARAMETER_YEAR);
  });

  it('falls back rather than throwing on a nonsense year', () => {
    expect(getAnnualParameters(undefined).isExact).toBe(true);
    expect(getAnnualParameters('not-a-year').isExact).toBe(false);
  });

  it('exposes every defined year in ascending order', () => {
    const years = getDefinedParameterYears();
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(years).toContain(CURRENT_PARAMETER_YEAR);
    expect(years.length).toBe(Object.keys(ANNUAL_PARAMETERS).length);
  });
});

describe('earnings test — under FRA all year', () => {
  it('withholds nothing at the limit', () => {
    const res = calculateEarningsTestWithholding({
      benefitAnnual: 20000,
      earnedIncome: SSA_2026.underFra,
      year: 2026,
    });
    expect(res.case).toBe(EARNINGS_TEST_CASES.UNDER_FRA_ALL_YEAR);
    expect(res.withheld).toBe(0);
  });

  it('withholds $1 for every $2 above the limit', () => {
    const res = calculateEarningsTestWithholding({
      benefitAnnual: 20000,
      earnedIncome: SSA_2026.underFra + 10000,
      year: 2026,
    });
    expect(res.withholdingDivisor).toBe(WITHHOLDING_DIVISOR_UNDER_FRA);
    expect(res.withheld).toBeCloseTo(5000, 6);
    expect(res.benefitAfterTest).toBeCloseTo(15000, 6);
  });
});

describe('earnings test — the year FRA is reached', () => {
  // A higher limit and a gentler ratio: $65,160 and $1 per $3, counting only
  // earnings before the FRA month.
  it('uses the higher exempt amount and withholds $1 per $3', () => {
    const res = calculateEarningsTestWithholding({
      benefitAnnual: 30000,
      earnedIncome: SSA_2026.fraYear + 9000,
      reachesFraThisYear: true,
      year: 2026,
    });
    expect(res.case).toBe(EARNINGS_TEST_CASES.FRA_YEAR);
    expect(res.exemptAmount).toBe(SSA_2026.fraYear);
    expect(res.withholdingDivisor).toBe(WITHHOLDING_DIVISOR_FRA_YEAR);
    expect(res.withheld).toBeCloseTo(3000, 6);
  });

  it('withholds nothing on earnings that would be penalised under the lower limit', () => {
    const earnings = SSA_2026.underFra + 20000; // over the under-FRA limit
    expect(earnings).toBeLessThan(SSA_2026.fraYear);

    const underFra = calculateEarningsTestWithholding({
      benefitAnnual: 30000,
      earnedIncome: earnings,
      year: 2026,
    });
    const fraYear = calculateEarningsTestWithholding({
      benefitAnnual: 30000,
      earnedIncome: earnings,
      reachesFraThisYear: true,
      year: 2026,
    });

    expect(underFra.withheld).toBeGreaterThan(0);
    expect(fraYear.withheld).toBe(0);
  });
});

describe('earnings test — at or past FRA', () => {
  it('applies no limit at all', () => {
    const res = calculateEarningsTestWithholding({
      benefitAnnual: 30000,
      earnedIncome: 500000,
      isAtOrPastFra: true,
      year: 2026,
    });
    expect(res.case).toBe(EARNINGS_TEST_CASES.AT_OR_PAST_FRA);
    expect(res.exemptAmount).toBeNull();
    expect(res.withheld).toBe(0);
    expect(res.benefitAfterTest).toBe(30000);
  });
});

describe('earnings test — bounds', () => {
  it('never withholds more than the benefit', () => {
    const res = calculateEarningsTestWithholding({
      benefitAnnual: 12000,
      earnedIncome: SSA_2026.underFra + 200000,
      year: 2026,
    });
    expect(res.withheld).toBe(12000);
    expect(res.benefitAfterTest).toBe(0);
    expect(res.isFullyOffset).toBe(true);
  });

  it('flags when it fell back to carried-forward parameters', () => {
    const res = calculateEarningsTestWithholding({
      benefitAnnual: 20000,
      earnedIncome: 30000,
      year: 2031,
    });
    expect(res.usesExactYearParameters).toBe(false);
    expect(res.parameterYear).toBe(CURRENT_PARAMETER_YEAR);
  });
});
