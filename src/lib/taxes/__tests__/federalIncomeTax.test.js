import { describe, expect, it } from 'vitest';
import { getAnnualParameters } from '../../calculations/annualParameters';
import {
  calculateCapitalGainsTax,
  calculateFederalIncomeTax,
  calculateOrdinaryTax,
  calculateSeniorBonusDeduction,
  calculateStandardDeduction,
  marginalRateForTaxableIncome,
  roomInBracket,
} from '../federalIncomeTax';

// 2026 figures from Rev. Proc. 2025-32 as adjusted by the OBBBA.
const SINGLE_STD = 16100;
const JOINT_STD = 32200;

describe('2026 federal tax parameters', () => {
  it('carries the standard deductions and bracket ceilings', () => {
    const p = getAnnualParameters(2026);
    expect(p.federalTax.standardDeduction.single).toBe(SINGLE_STD);
    expect(p.federalTax.standardDeduction.married_joint).toBe(JOINT_STD);
    expect(p.federalTax.brackets.single.map((b) => b.upTo)).toEqual([12400, 50400, 105700, 201775, 256225, 640600, null]);
    expect(p.federalTax.brackets.married_separate[5].upTo).toBe(384350);
    expect(p.capitalGains.single.zeroRateUpTo).toBe(49450);
  });
});

describe('calculateFederalIncomeTax — single filer, 60,000 pension', () => {
  const res = calculateFederalIncomeTax({
    year: 2026,
    filingStatus: 'single',
    ordinaryIncome: 60000,
    ages: [58],
  });

  it('stacks the brackets by hand', () => {
    // taxable = 60,000 - 16,100 = 43,900
    // 10% x 12,400            = 1,240
    // 12% x (43,900 - 12,400) = 12% x 31,500 = 3,780
    // total                   = 5,020
    expect(res.agi).toBe(60000);
    expect(res.deduction).toBe(SINGLE_STD);
    expect(res.taxableIncome).toBe(43900);
    expect(res.ordinaryTax).toBeCloseTo(5020, 6);
    expect(res.capitalGainsTax).toBe(0);
    expect(res.totalTax).toBeCloseTo(5020, 6);
  });

  it('reports the effective and marginal rates', () => {
    // 5,020 / 60,000 = 0.083666...
    expect(res.effectiveRate).toBeCloseTo(5020 / 60000, 9);
    expect(res.marginalOrdinaryRate).toBe(0.12);
  });

  it('breaks the tax down by bracket', () => {
    expect(res.bracketBreakdown).toEqual([
      { rate: 0.10, amount: 12400, tax: 1240 },
      { rate: 0.12, amount: 31500, tax: 3780 },
    ]);
  });
});

describe('calculateFederalIncomeTax — married couple with Social Security at 85%', () => {
  const res = calculateFederalIncomeTax({
    year: 2026,
    filingStatus: 'married_joint',
    ordinaryIncome: 90000,
    socialSecurityBenefits: 40000,
    ages: [66, 64],
  });

  it('includes 85% of the benefit in AGI', () => {
    // From the SS worksheet: PI 110,000 -> taxable 34,000 (85% of 40,000)
    expect(res.taxableSocialSecurity).toBeCloseTo(34000, 6);
    expect(res.agi).toBeCloseTo(124000, 6);
    expect(res.grossIncome).toBe(130000);
  });

  it('adds one age-65 amount and the senior bonus, then stacks the brackets', () => {
    // standard = 32,200 + 1,650 (one spouse 65+)   = 33,850
    // senior bonus: 6,000, MAGI 124,000 < 150,000  = 6,000
    // deduction                                    = 39,850
    // taxable = 124,000 - 39,850                   = 84,150
    // 10% x 24,800                                 = 2,480
    // 12% x (84,150 - 24,800 = 59,350)             = 7,122
    // total                                        = 9,602
    expect(res.standardDeduction).toBe(33850);
    expect(res.seniorBonusDeduction).toBe(6000);
    expect(res.deduction).toBe(39850);
    expect(res.taxableIncome).toBeCloseTo(84150, 6);
    expect(res.totalTax).toBeCloseTo(9602, 6);
    expect(res.marginalOrdinaryRate).toBe(0.12);
  });
});

describe('calculateFederalIncomeTax — long-term capital gains stacking', () => {
  it('taxes gains at 0% when total taxable income sits exactly at the boundary', () => {
    // taxable = 30,000 + 35,550 - 16,100 = 49,450 = the single 0% ceiling.
    // ordinary slice = 30,000 - 16,100 = 13,900:
    //   10% x 12,400 = 1,240; 12% x 1,500 = 180  -> 1,420
    // gains slice 13,900..49,450 all within 0%    -> 0
    const res = calculateFederalIncomeTax({
      year: 2026,
      filingStatus: 'single',
      ordinaryIncome: 30000,
      longTermCapitalGains: 35550,
      ages: [60],
    });
    expect(res.taxableIncome).toBe(49450);
    expect(res.taxableOrdinaryIncome).toBe(13900);
    expect(res.taxableCapitalGains).toBe(35550);
    expect(res.ordinaryTax).toBeCloseTo(1420, 6);
    expect(res.capitalGainsTax).toBe(0);
    expect(res.totalTax).toBeCloseTo(1420, 6);
  });

  it('taxes only the dollars above the boundary at 15%', () => {
    // One hundred dollars more of gain: 15% x 100 = 15
    const res = calculateFederalIncomeTax({
      year: 2026,
      filingStatus: 'single',
      ordinaryIncome: 30000,
      longTermCapitalGains: 35650,
      ages: [60],
    });
    expect(res.capitalGainsTax).toBeCloseTo(15, 6);
    expect(res.capitalGainsBreakdown).toEqual([
      { rate: 0, amount: 35550, tax: 0 },
      { rate: 0.15, amount: 100, tax: 15 },
    ]);
  });

  it('lets the deduction absorb gains when ordinary income is small', () => {
    // ordinary 10,000 < deduction 16,100: 6,100 of deduction hits the gains.
    // taxable = 10,000 + 20,000 - 16,100 = 13,900, all of it gains at 0%.
    const res = calculateFederalIncomeTax({
      year: 2026,
      filingStatus: 'single',
      ordinaryIncome: 10000,
      longTermCapitalGains: 20000,
    });
    expect(res.taxableOrdinaryIncome).toBe(0);
    expect(res.taxableCapitalGains).toBe(13900);
    expect(res.totalTax).toBe(0);
    // Next ordinary dollar is taxed at 10% (deduction is used up).
    expect(res.marginalOrdinaryRate).toBe(0.10);
  });

  it('walks a large gain through 0, 15 and 20%', () => {
    // ordinary slice 50,000; gains 600,000 -> top = 650,000
    //  0%: 50,000..98,900   =  48,900 -> 0
    // 15%: 98,900..613,700  = 514,800 -> 77,220
    // 20%: 613,700..650,000 =  36,300 -> 7,260
    const res = calculateCapitalGainsTax({ year: 2026, filingStatus: 'married_joint', ordinaryTaxable: 50000, gains: 600000 });
    expect(res.tax).toBeCloseTo(84480, 6);
    expect(res.breakdown.map((b) => b.amount)).toEqual([48900, 514800, 36300]);
  });
});

describe('age-65 standard deduction', () => {
  it('adds 2,050 for a single filer aged 65', () => {
    // 16,100 + 2,050 = 18,150
    const std = calculateStandardDeduction({ year: 2026, filingStatus: 'single', ages: [65] });
    expect(std.seniors).toBe(1);
    expect(std.total).toBe(18150);
  });

  it('adds 1,650 per spouse for a joint return', () => {
    // 32,200 + 2 x 1,650 = 35,500
    expect(calculateStandardDeduction({ year: 2026, filingStatus: 'married_joint', ages: [67, 65] }).total).toBe(35500);
    expect(calculateStandardDeduction({ year: 2026, filingStatus: 'married_joint', ages: [67, 63] }).total).toBe(33850);
  });

  it('ignores extra ages beyond what the filing status allows', () => {
    expect(calculateStandardDeduction({ year: 2026, filingStatus: 'single', ages: [70, 70] }).seniors).toBe(1);
  });

  it('flows into the full computation for a 65-year-old with a 60,000 pension', () => {
    // deduction = 18,150 + 6,000 senior bonus = 24,150
    // taxable   = 60,000 - 24,150 = 35,850
    // 10% x 12,400 = 1,240; 12% x 23,450 = 2,814 -> 4,054
    const res = calculateFederalIncomeTax({ year: 2026, filingStatus: 'single', ordinaryIncome: 60000, ages: [65] });
    expect(res.standardDeduction).toBe(18150);
    expect(res.seniorBonusDeduction).toBe(6000);
    expect(res.taxableIncome).toBe(35850);
    expect(res.totalTax).toBeCloseTo(4054, 6);
  });

  it('keeps the senior bonus when itemising beats the standard deduction', () => {
    // itemised 30,000 > 18,150 standard; bonus 6,000 still applies -> 36,000
    const res = calculateFederalIncomeTax({
      year: 2026,
      filingStatus: 'single',
      ordinaryIncome: 60000,
      ages: [65],
      itemizedDeductions: 30000,
    });
    expect(res.usesItemizedDeductions).toBe(true);
    expect(res.deduction).toBe(36000);
  });
});

describe('senior bonus deduction phase-out', () => {
  it('reduces by 6% of MAGI above 75,000 for a single filer', () => {
    // 6,000 - 0.06 x (100,000 - 75,000) = 6,000 - 1,500 = 4,500
    expect(calculateSeniorBonusDeduction({ year: 2026, filingStatus: 'single', ages: [70], magi: 100000 })).toBeCloseTo(4500, 6);
  });

  it('is fully phased out at 175,000 single', () => {
    // 6,000 - 0.06 x 100,000 = 0
    expect(calculateSeniorBonusDeduction({ year: 2026, filingStatus: 'single', ages: [70], magi: 175000 })).toBe(0);
    expect(calculateSeniorBonusDeduction({ year: 2026, filingStatus: 'single', ages: [70], magi: 300000 })).toBe(0);
  });

  it('phases the joint 12,000 from 150,000', () => {
    // 12,000 - 0.06 x (200,000 - 150,000) = 12,000 - 3,000 = 9,000
    expect(calculateSeniorBonusDeduction({ year: 2026, filingStatus: 'married_joint', ages: [70, 68], magi: 200000 })).toBeCloseTo(9000, 6);
  });

  it('is unavailable under 65, to married-separate filers, and outside 2025-2028', () => {
    expect(calculateSeniorBonusDeduction({ year: 2026, filingStatus: 'single', ages: [64], magi: 0 })).toBe(0);
    expect(calculateSeniorBonusDeduction({ year: 2026, filingStatus: 'married_separate', ages: [70], magi: 0 })).toBe(0);
    expect(calculateSeniorBonusDeduction({ year: 2029, filingStatus: 'single', ages: [70], magi: 0 })).toBe(0);
    expect(calculateSeniorBonusDeduction({ year: 2024, filingStatus: 'single', ages: [70], magi: 0 })).toBe(0);
  });

  it('shows up in the full computation', () => {
    const res = calculateFederalIncomeTax({ year: 2026, filingStatus: 'single', ordinaryIncome: 100000, ages: [70] });
    expect(res.seniorBonusDeduction).toBeCloseTo(4500, 6);
    // 18,150 + 4,500 = 22,650
    expect(res.deduction).toBeCloseTo(22650, 6);
  });
});

describe('roomInBracket and marginalRateForTaxableIncome', () => {
  it('measures the room left in the 12% bracket', () => {
    // 50,400 - 43,900 = 6,500
    expect(roomInBracket({ year: 2026, filingStatus: 'single', taxableIncome: 43900, targetRate: 0.12 })).toBe(6500);
  });

  it('measures room to the top of a higher bracket', () => {
    // 105,700 - 43,900 = 61,800
    expect(roomInBracket({ year: 2026, filingStatus: 'single', taxableIncome: 43900, targetRate: 0.22 })).toBe(61800);
  });

  it('reports zero once past the target bracket', () => {
    expect(roomInBracket({ year: 2026, filingStatus: 'single', taxableIncome: 60000, targetRate: 0.12 })).toBe(0);
  });

  it('reports unlimited room in the top bracket', () => {
    expect(roomInBracket({ year: 2026, filingStatus: 'single', taxableIncome: 60000, targetRate: 0.37 })).toBe(Infinity);
  });

  it('treats negative taxable income as zero', () => {
    expect(roomInBracket({ year: 2026, filingStatus: 'married_joint', taxableIncome: -5000, targetRate: 0.10 })).toBe(24800);
  });

  it('rejects a rate that is not a bracket', () => {
    expect(() => roomInBracket({ year: 2026, filingStatus: 'single', taxableIncome: 0, targetRate: 0.25 })).toThrow(/bracket/);
  });

  it('gives the rate of the next dollar, including at an exact ceiling', () => {
    expect(marginalRateForTaxableIncome({ year: 2026, filingStatus: 'single', taxableIncome: 43900 })).toBe(0.12);
    expect(marginalRateForTaxableIncome({ year: 2026, filingStatus: 'single', taxableIncome: 50400 })).toBe(0.22);
    expect(marginalRateForTaxableIncome({ year: 2026, filingStatus: 'single', taxableIncome: 1000000 })).toBe(0.37);
    expect(marginalRateForTaxableIncome({ year: 2026, filingStatus: 'single', taxableIncome: 0 })).toBe(0.10);
  });

  it('shows a zero marginal rate when the deduction is not used up', () => {
    const res = calculateFederalIncomeTax({ year: 2026, filingStatus: 'single', ordinaryIncome: 10000 });
    expect(res.taxableIncome).toBe(0);
    expect(res.marginalOrdinaryRate).toBe(0);
  });
});

describe('calculateOrdinaryTax', () => {
  it('reaches the top bracket for a large income', () => {
    // single, 700,000 taxable:
    // 10% x 12,400 = 1,240
    // 12% x 38,000 = 4,560
    // 22% x 55,300 = 12,166
    // 24% x 96,075 = 23,058
    // 32% x 54,450 = 17,424
    // 35% x 384,375 = 134,531.25
    // 37% x 59,400 = 21,978
    // total = 214,957.25
    const res = calculateOrdinaryTax({ year: 2026, filingStatus: 'single', taxableIncome: 700000 });
    expect(res.tax).toBeCloseTo(214957.25, 6);
    expect(res.breakdown).toHaveLength(7);
  });

  it('rejects an unknown filing status', () => {
    expect(() => calculateOrdinaryTax({ year: 2026, filingStatus: 'qualifying_widow', taxableIncome: 1 })).toThrow(/filing status/);
  });
});

describe('carried-forward parameters', () => {
  it('flags a projection year with no defined parameters', () => {
    const res = calculateFederalIncomeTax({ year: 2031, filingStatus: 'single', ordinaryIncome: 60000 });
    expect(res.usesExactYearParameters).toBe(false);
    expect(res.parameterYear).toBe(2026);
  });
});
