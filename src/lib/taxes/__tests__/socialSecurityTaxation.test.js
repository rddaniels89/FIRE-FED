import { describe, expect, it } from 'vitest';
import { calculateTaxableSocialSecurity } from '../socialSecurityTaxation';

// Worked against the IRS Publication 915 worksheet with the statutory
// thresholds: single 25,000 / 34,000, joint 32,000 / 44,000, MFS 0 / 0.

describe('calculateTaxableSocialSecurity', () => {
  it('taxes nothing at or below the base threshold', () => {
    // PI = 10,000 + 0.5 x 20,000 = 20,000 <= 25,000
    const res = calculateTaxableSocialSecurity({ filingStatus: 'single', otherIncome: 10000, socialSecurityBenefits: 20000 });
    expect(res.provisionalIncome).toBe(20000);
    expect(res.taxablePortion).toBe(0);
    expect(res.taxablePercent).toBe(0);
  });

  it('applies the 50% tier between the thresholds', () => {
    // PI = 20,000 + 10,000 = 30,000. Excess over 25,000 = 5,000.
    // min(0.5 x 5,000 = 2,500, 0.5 x 20,000 = 10,000) = 2,500
    const res = calculateTaxableSocialSecurity({ filingStatus: 'single', otherIncome: 20000, socialSecurityBenefits: 20000 });
    expect(res.provisionalIncome).toBe(30000);
    expect(res.taxablePortion).toBeCloseTo(2500, 6);
    expect(res.taxablePercent).toBeCloseTo(0.125, 6);
  });

  it('caps the 50% tier at half the benefit', () => {
    // PI = 32,000 + 2,000 = 34,000, right at the adjusted threshold.
    // min(0.5 x 9,000 = 4,500, 0.5 x 4,000 = 2,000) = 2,000
    const res = calculateTaxableSocialSecurity({ filingStatus: 'single', otherIncome: 32000, socialSecurityBenefits: 4000 });
    expect(res.taxablePortion).toBeCloseTo(2000, 6);
  });

  it('applies the 85% tier with the $4,500 single fixed amount', () => {
    // PI = 40,000 + 15,000 = 55,000 > 34,000.
    // first tier  = min(4,500, 0.5 x 30,000 = 15,000) = 4,500
    // second tier = 0.85 x (55,000 - 34,000) = 17,850
    // min(0.85 x 30,000 = 25,500, 4,500 + 17,850 = 22,350) = 22,350
    const res = calculateTaxableSocialSecurity({ filingStatus: 'single', otherIncome: 40000, socialSecurityBenefits: 30000 });
    expect(res.taxablePortion).toBeCloseTo(22350, 6);
    expect(res.taxablePercent).toBeCloseTo(0.745, 6);
  });

  it('hits the 85% ceiling for a married couple with a pension and TSP', () => {
    // PI = 90,000 + 20,000 = 110,000 > 44,000.
    // first tier  = min(6,000, 20,000) = 6,000
    // second tier = 0.85 x (110,000 - 44,000) = 56,100
    // min(0.85 x 40,000 = 34,000, 62,100) = 34,000  -> 85%
    const res = calculateTaxableSocialSecurity({ filingStatus: 'married_joint', otherIncome: 90000, socialSecurityBenefits: 40000 });
    expect(res.provisionalIncome).toBe(110000);
    expect(res.taxablePortion).toBeCloseTo(34000, 6);
    expect(res.taxablePercent).toBeCloseTo(0.85, 9);
  });

  it('uses zero thresholds for married filing separately', () => {
    // PI = 10,000 + 5,000 = 15,000; base = adjusted = 0.
    // first tier = min(0, 5,000) = 0; second = 0.85 x 15,000 = 12,750
    // min(0.85 x 10,000 = 8,500, 12,750) = 8,500
    const res = calculateTaxableSocialSecurity({ filingStatus: 'married_separate', otherIncome: 10000, socialSecurityBenefits: 10000 });
    expect(res.baseThreshold).toBe(0);
    expect(res.taxablePortion).toBeCloseTo(8500, 6);
  });

  it('returns zero with no benefits, without dividing by zero', () => {
    const res = calculateTaxableSocialSecurity({ filingStatus: 'single', otherIncome: 100000, socialSecurityBenefits: 0 });
    expect(res.taxablePortion).toBe(0);
    expect(res.taxablePercent).toBe(0);
  });

  it('rejects an unknown filing status', () => {
    expect(() => calculateTaxableSocialSecurity({ filingStatus: 'widow' })).toThrow(/filing status/);
  });
});
