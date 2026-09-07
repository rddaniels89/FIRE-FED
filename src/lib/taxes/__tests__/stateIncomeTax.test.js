import { describe, expect, it } from 'vitest';
import { STATE_TAX_PRESETS, calculateStateIncomeTax, getStatePreset } from '../stateIncomeTax';

describe('STATE_TAX_PRESETS', () => {
  it('covers all 50 states plus DC with unique codes', () => {
    expect(STATE_TAX_PRESETS).toHaveLength(51);
    const codes = STATE_TAX_PRESETS.map((s) => s.code);
    expect(new Set(codes).size).toBe(51);
    expect(codes).toContain('DC');
  });

  it('has a rate, both exemption flags and a note on every entry', () => {
    for (const s of STATE_TAX_PRESETS) {
      expect(typeof s.rate).toBe('number');
      expect(s.rate).toBeGreaterThanOrEqual(0);
      expect(s.rate).toBeLessThan(0.15);
      expect(typeof s.exemptsFederalPension).toBe('boolean');
      expect(typeof s.exemptsSocialSecurity).toBe('boolean');
      expect(typeof s.notes).toBe('string');
      expect(s.notes.length).toBeGreaterThan(0);
    }
  });

  it('marks the nine no-income-tax states at zero', () => {
    for (const code of ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY']) {
      expect(getStatePreset(code).rate).toBe(0);
    }
  });

  it('flags the states still taxing Social Security in 2026', () => {
    const taxing = STATE_TAX_PRESETS.filter((s) => !s.exemptsSocialSecurity).map((s) => s.code).sort();
    expect(taxing).toEqual(['CO', 'CT', 'MN', 'MT', 'NM', 'RI', 'UT', 'VT']);
  });

  it('looks up by code case-insensitively', () => {
    expect(getStatePreset('pa').name).toBe('Pennsylvania');
    expect(getStatePreset('ZZ')).toBeUndefined();
  });
});

describe('calculateStateIncomeTax', () => {
  it('exempts a federal pension in Pennsylvania', () => {
    // 60,000 ordinary, all of it federal pension, fully exempt -> 0 x 3.07%
    const res = calculateStateIncomeTax({ state: 'PA', ordinaryIncome: 60000, federalPensionIncome: 60000 });
    expect(res.exemptFederalPension).toBe(60000);
    expect(res.taxableIncome).toBe(0);
    expect(res.tax).toBe(0);
  });

  it('taxes the same pension in North Carolina', () => {
    // 60,000 x 3.99% = 2,394
    const res = calculateStateIncomeTax({ state: 'NC', ordinaryIncome: 60000, federalPensionIncome: 60000 });
    expect(res.exemptFederalPension).toBe(0);
    expect(res.taxableIncome).toBe(60000);
    expect(res.tax).toBeCloseTo(2394, 6);
  });

  it('applies a dollar exclusion in Kentucky', () => {
    // 60,000 - 31,110 exclusion = 28,890 x 3.5% = 1,011.15
    const res = calculateStateIncomeTax({ state: 'KY', ordinaryIncome: 60000, federalPensionIncome: 60000 });
    expect(res.exemptFederalPension).toBe(31110);
    expect(res.tax).toBeCloseTo(1011.15, 6);
  });

  it('never excludes more pension than there is', () => {
    // 10,000 pension against a 31,110 exclusion excludes 10,000, not 31,110.
    const res = calculateStateIncomeTax({ state: 'KY', ordinaryIncome: 40000, federalPensionIncome: 10000 });
    expect(res.exemptFederalPension).toBe(10000);
    expect(res.taxableIncome).toBe(30000);
  });

  it('adds federally taxable Social Security only where the state taxes it', () => {
    // Montana: (50,000 + 10,000) x 5.5% = 3,300
    const mt = calculateStateIncomeTax({
      state: 'MT',
      ordinaryIncome: 50000,
      socialSecurityBenefits: 30000,
      taxableSocialSecurityFederal: 10000,
    });
    expect(mt.taxedSocialSecurity).toBe(10000);
    expect(mt.tax).toBeCloseTo(3300, 6);

    // North Carolina exempts it: 50,000 x 3.99% = 1,995
    const nc = calculateStateIncomeTax({
      state: 'NC',
      ordinaryIncome: 50000,
      socialSecurityBenefits: 30000,
      taxableSocialSecurityFederal: 10000,
    });
    expect(nc.taxedSocialSecurity).toBe(0);
    expect(nc.tax).toBeCloseTo(1995, 6);
  });

  it('taxes long-term capital gains at the flat rate', () => {
    // (20,000 + 10,000) x 4.95% = 1,485 (IL exempts the pension entirely)
    const res = calculateStateIncomeTax({
      state: 'IL',
      ordinaryIncome: 50000,
      federalPensionIncome: 30000,
      longTermCapitalGains: 10000,
    });
    expect(res.tax).toBeCloseTo(1485, 6);
  });

  it('accepts a custom state object', () => {
    // 80,000 - min(30,000, 5,000) = 75,000 x 4% = 3,000
    const res = calculateStateIncomeTax({
      state: { code: 'XX', rate: 0.04, exemptsFederalPension: false, exemptsSocialSecurity: true, pensionExclusion: 5000 },
      ordinaryIncome: 80000,
      federalPensionIncome: 30000,
    });
    expect(res.tax).toBeCloseTo(3000, 6);
    expect(res.isApproximation).toBe(true);
  });

  it('rejects an unknown state code', () => {
    expect(() => calculateStateIncomeTax({ state: 'ZZ', ordinaryIncome: 1 })).toThrow(/Unknown state/);
  });
});
