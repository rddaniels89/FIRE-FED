import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRUST_FUND_HAIRCUT,
  SS_EARLIEST_CLAIM_AGE,
  SS_LATEST_CLAIM_AGE,
  TRUST_FUND_HAIRCUT_CITATION,
  applyTrustFundHaircut,
  birthYearFromAge,
  calculateSocialSecurityBenefit,
  claimingAdjustment,
  claimingAdjustmentFactor,
  estimatePiaFromSalary,
  estimateSocialSecurityAt62,
  fullRetirementAge,
  socialSecurityByClaimAge,
  trustFundHaircutApplies,
} from '../socialSecurity';

describe('full retirement age', () => {
  // https://www.ssa.gov/benefits/retirement/planner/agereduction.html
  it.each([
    [1937, 65, 0],
    [1938, 65, 2],
    [1940, 65, 6],
    [1942, 65, 10],
    [1943, 66, 0],
    [1954, 66, 0],
    [1955, 66, 2],
    [1956, 66, 4],
    [1957, 66, 6],
    [1958, 66, 8],
    [1959, 66, 10],
    [1960, 67, 0],
    [1985, 67, 0],
  ])('born %i -> %iy %im', (birthYear, years, months) => {
    const fra = fullRetirementAge({ birthYear });
    expect(fra.years).toBe(years);
    expect(fra.months).toBe(months);
    expect(fra.totalMonths).toBe(years * 12 + months);
    expect(fra.decimal).toBeCloseTo(years + months / 12, 10);
  });

  it('defaults to 67 without a birth year', () => {
    expect(fullRetirementAge().decimal).toBe(67);
  });
});

describe('birthYearFromAge', () => {
  it('subtracts the whole age from the reference year', () => {
    expect(birthYearFromAge({ currentAge: 40, asOfYear: 2026 })).toBe(1986);
    expect(birthYearFromAge({ currentAge: 40.9, asOfYear: 2026 })).toBe(1986);
  });

  it('defaults to the current calendar year', () => {
    expect(birthYearFromAge({ currentAge: 30 })).toBe(new Date().getFullYear() - 30);
  });
});

describe('claiming adjustment factor', () => {
  it('reduces 30% at 62 with FRA 67', () => {
    expect(claimingAdjustmentFactor({ claimAge: 62, fra: 67 })).toBeCloseTo(0.7, 10);
  });

  // 24 months x 5/9% = 13.33%.
  it('reduces 13.33% at 65 with FRA 67', () => {
    expect(claimingAdjustmentFactor({ claimAge: 65, fra: 67 })).toBeCloseTo(0.8667, 4);
  });

  it('credits 24% at 70 with FRA 67', () => {
    expect(claimingAdjustmentFactor({ claimAge: 70, fra: 67 })).toBeCloseTo(1.24, 10);
  });

  it('reduces 13.33% at 64 with FRA 66', () => {
    expect(claimingAdjustmentFactor({ claimAge: 64, fra: 66 })).toBeCloseTo(0.8667, 4);
  });

  it('credits 8% at 67 with FRA 66', () => {
    expect(claimingAdjustmentFactor({ claimAge: 67, fra: 66 })).toBeCloseTo(1.08, 10);
  });

  it('is exactly 1 at FRA', () => {
    expect(claimingAdjustmentFactor({ claimAge: 67, fra: 67 })).toBe(1);
    expect(claimingAdjustmentFactor({ claimAge: 66 + 4 / 12, birthYear: 1956 })).toBeCloseTo(1, 10);
  });

  it('works in whole months', () => {
    // 62 with FRA 66y10m: 58 months -> 36 x 5/9% + 22 x 5/12% = 20% + 9.1667%.
    const res = claimingAdjustment({ claimAgeMonths: 62 * 12, fraMonths: 66 * 12 + 10 });
    expect(res.reductionMonths).toBe(58);
    expect(res.creditMonths).toBe(0);
    expect(res.factor).toBeCloseTo(1 - 0.2 - (22 * 5) / 12 / 100, 10);
  });

  it('clamps the claim age to 62 and 70', () => {
    expect(claimingAdjustmentFactor({ claimAge: 55, fra: 67 })).toBeCloseTo(0.7, 10);
    expect(claimingAdjustmentFactor({ claimAge: 80, fra: 67 })).toBeCloseTo(1.24, 10);
    expect(SS_EARLIEST_CLAIM_AGE).toBe(62);
    expect(SS_LATEST_CLAIM_AGE).toBe(70);
  });

  it('derives FRA from a birth year when no FRA is given', () => {
    expect(claimingAdjustmentFactor({ claimAge: 62, birthYear: 1950 })).toBeCloseTo(0.75, 10);
    expect(claimingAdjustmentFactor({ claimAge: 62, birthYear: 1970 })).toBeCloseTo(0.7, 10);
  });
});

describe('calculateSocialSecurityBenefit', () => {
  it('pays 1,400 on a 2,000 PIA claimed at 62 with FRA 67', () => {
    const res = calculateSocialSecurityBenefit({ piaMonthlyAtFra: 2000, claimAge: 62, fra: 67 });
    expect(res.monthlyAtClaim).toBeCloseTo(1400, 6);
    expect(res.annualAtClaim).toBeCloseTo(16800, 6);
    expect(res.factor).toBeCloseTo(0.7, 10);
    expect(res.reductionMonths).toBe(60);
    expect(res.creditMonths).toBe(0);
    expect(res.fra.decimal).toBe(67);
    expect(res.haircutApplies).toBe(false);
    expect(res.monthlyAfterHaircut).toBeCloseTo(1400, 6);
  });

  it('resolves FRA from a birth year', () => {
    const res = calculateSocialSecurityBenefit({ piaMonthlyAtFra: 2000, claimAge: 70, birthYear: 1957 });
    expect(res.fra.years).toBe(66);
    expect(res.fra.months).toBe(6);
    expect(res.creditMonths).toBe(42);
    expect(res.factor).toBeCloseTo(1.28, 10);
  });

  it('grows the PIA by COLA before applying the claiming factor', () => {
    const res = calculateSocialSecurityBenefit({
      piaMonthlyAtFra: 2000,
      claimAge: 67,
      fra: 67,
      colaRate: 0.02,
      yearsOfColaBeforeClaim: 5,
    });
    expect(res.monthlyAtClaim).toBeCloseTo(2000 * Math.pow(1.02, 5), 6);
  });

  it('applies the trust-fund haircut only from its start year', () => {
    const haircut = { startYear: 2033, percent: 23 };
    const before = calculateSocialSecurityBenefit({
      piaMonthlyAtFra: 2000, claimAge: 67, fra: 67, trustFundHaircut: haircut, claimYear: 2032,
    });
    const atStart = calculateSocialSecurityBenefit({
      piaMonthlyAtFra: 2000, claimAge: 67, fra: 67, trustFundHaircut: haircut, claimYear: 2033,
    });
    expect(before.haircutApplies).toBe(false);
    expect(before.monthlyAfterHaircut).toBeCloseTo(2000, 6);
    expect(atStart.haircutApplies).toBe(true);
    expect(atStart.monthlyAfterHaircut).toBeCloseTo(1540, 6);
    expect(atStart.monthlyAtClaim).toBeCloseTo(2000, 6);
  });

  it('never applies a haircut without a claim year', () => {
    const res = calculateSocialSecurityBenefit({
      piaMonthlyAtFra: 2000, claimAge: 67, fra: 67, trustFundHaircut: DEFAULT_TRUST_FUND_HAIRCUT,
    });
    expect(res.haircutApplies).toBe(false);
    expect(res.monthlyAfterHaircut).toBeCloseTo(2000, 6);
  });
});

describe('trust-fund haircut', () => {
  it('reflects the 2025 Trustees Report: 2033, 77% payable', () => {
    expect(DEFAULT_TRUST_FUND_HAIRCUT).toEqual({ startYear: 2033, percent: 23 });
    expect(Object.isFrozen(DEFAULT_TRUST_FUND_HAIRCUT)).toBe(true);
    expect(TRUST_FUND_HAIRCUT_CITATION).toContain('https://www.ssa.gov/oact/trsum/');
  });

  it('cuts every year from the start year, including for existing claimants', () => {
    const haircut = DEFAULT_TRUST_FUND_HAIRCUT;
    expect(applyTrustFundHaircut({ monthly: 1000, year: 2032, trustFundHaircut: haircut })).toBe(1000);
    expect(applyTrustFundHaircut({ monthly: 1000, year: 2033, trustFundHaircut: haircut })).toBeCloseTo(770, 6);
    expect(applyTrustFundHaircut({ monthly: 1000, year: 2050, trustFundHaircut: haircut })).toBeCloseTo(770, 6);
    expect(trustFundHaircutApplies({ year: 2033, trustFundHaircut: haircut })).toBe(true);
    expect(trustFundHaircutApplies({ year: 2032, trustFundHaircut: haircut })).toBe(false);
  });

  it('leaves the benefit alone when no haircut is configured', () => {
    expect(applyTrustFundHaircut({ monthly: 1000, year: 2040 })).toBe(1000);
    expect(applyTrustFundHaircut({ monthly: 1000, year: 2040, trustFundHaircut: null })).toBe(1000);
    expect(applyTrustFundHaircut({ monthly: 1000, year: 2040, trustFundHaircut: { startYear: 2033, percent: 0 } })).toBe(1000);
  });
});

describe('socialSecurityByClaimAge', () => {
  it('lists 62 through 70 with monthly amounts strictly ascending', () => {
    const rows = socialSecurityByClaimAge({ piaMonthlyAtFra: 2000, fra: 67 });
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => r.claimAge)).toEqual([62, 63, 64, 65, 66, 67, 68, 69, 70]);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].monthly).toBeGreaterThan(rows[i - 1].monthly);
    }
    expect(rows[0].monthly).toBeCloseTo(1400, 6);
    expect(rows[5].monthly).toBeCloseTo(2000, 6);
    expect(rows[8].monthly).toBeCloseTo(2480, 6);
    expect(rows[8].annual).toBeCloseTo(2480 * 12, 6);
  });

  it('breaks even at 77 for waiting from 62 to 63 with FRA 67', () => {
    const rows = socialSecurityByClaimAge({ piaMonthlyAtFra: 2000, fra: 67 });
    expect(rows[0].cumulativeBreakEvenAgeVsPrior).toBeNull();
    expect(rows[1].cumulativeBreakEvenAgeVsPrior).toBeCloseTo(77, 6);
  });

  it('accepts a birth year in place of an FRA', () => {
    const rows = socialSecurityByClaimAge({ piaMonthlyAtFra: 2000, birthYear: 1950 });
    expect(rows[0].factor).toBeCloseTo(0.75, 10);
    expect(rows[4].factor).toBe(1);
  });
});

describe('estimateSocialSecurityAt62', () => {
  it('equals the 62 row of the claiming-age table', () => {
    const rows = socialSecurityByClaimAge({ piaMonthlyAtFra: 2000, fra: 67 });
    expect(estimateSocialSecurityAt62({ piaMonthlyAtFra: 2000, fra: 67 })).toBeCloseTo(rows[0].monthly, 10);
    expect(estimateSocialSecurityAt62({ piaMonthlyAtFra: 2000, birthYear: 1950 })).toBeCloseTo(1500, 6);
  });
});

describe('estimatePiaFromSalary', () => {
  it('returns a monthly share of salary, defaulting to 30%', () => {
    expect(estimatePiaFromSalary({ annualSalary: 120000 })).toBeCloseTo(3000, 6);
    expect(estimatePiaFromSalary({ annualSalary: 120000, replacementPercent: 40 })).toBeCloseTo(4000, 6);
  });

  it('returns zero for garbage input', () => {
    expect(estimatePiaFromSalary({ annualSalary: 'x' })).toBe(0);
    expect(estimatePiaFromSalary({})).toBe(0);
  });
});
