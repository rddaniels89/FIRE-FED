import { describe, expect, it } from 'vitest';
import {
  FILING_STATUSES,
  STATE_TAX_PRESETS,
  calculateFederalIncomeTax,
  calculateHouseholdTaxes,
  calculateStateIncomeTax,
  calculateTaxableSocialSecurity,
  estimateFicaTax,
  roomInBracket,
} from '../index';

describe('estimateFicaTax', () => {
  it('caps Social Security at the 2026 wage base of 184,500', () => {
    // 6.2% x 184,500 = 11,439; 1.45% x 184,500 = 2,675.25; total 14,114.25
    const res = estimateFicaTax({ wages: 184500, year: 2026 });
    expect(res.socialSecurityWages).toBe(184500);
    expect(res.socialSecurityTax).toBeCloseTo(11439, 6);
    expect(res.medicareTax).toBeCloseTo(2675.25, 6);
    expect(res.totalTax).toBeCloseTo(14114.25, 6);
  });

  it('keeps Medicare uncapped above the wage base', () => {
    // SS still 11,439; Medicare 1.45% x 200,000 = 2,900; total 14,339
    const res = estimateFicaTax({ wages: 200000, year: 2026 });
    expect(res.socialSecurityTax).toBeCloseTo(11439, 6);
    expect(res.medicareTax).toBeCloseTo(2900, 6);
    expect(res.totalTax).toBeCloseTo(14339, 6);
  });

  it('is a straight 7.65% below the base', () => {
    // 100,000 x 0.0765 = 7,650
    expect(estimateFicaTax({ wages: 100000 }).totalTax).toBeCloseTo(7650, 6);
    expect(estimateFicaTax({ wages: 0 }).totalTax).toBe(0);
  });
});

describe('calculateHouseholdTaxes', () => {
  it('combines a FERS retiree\'s streams, excluding Roth, with Pennsylvania state tax', () => {
    const res = calculateHouseholdTaxes({
      year: 2026,
      filingStatus: 'single',
      ages: [58],
      income: {
        federalPension: 40000,
        srs: 12000,
        traditionalWithdrawals: 20000,
        rothWithdrawals: 10000,
      },
      state: 'PA',
    });

    // ordinary = 40,000 + 12,000 + 20,000 = 72,000 (Roth 10,000 excluded)
    expect(res.ordinaryIncome).toBe(72000);
    expect(res.grossIncome).toBe(72000);
    expect(res.rothWithdrawals).toBe(10000);

    // federal: taxable = 72,000 - 16,100 = 55,900
    //   10% x 12,400 = 1,240; 12% x 38,000 = 4,560; 22% x 5,500 = 1,210 -> 7,010
    expect(res.federal.taxableIncome).toBe(55900);
    expect(res.federalTax).toBeCloseTo(7010, 6);

    // state (PA): pension exempt -> (72,000 - 40,000) x 3.07% = 982.40
    expect(res.state.code).toBe('PA');
    expect(res.stateTax).toBeCloseTo(982.4, 6);

    // total 7,992.40; effective 7,992.40 / 72,000
    expect(res.totalTax).toBeCloseTo(7992.4, 6);
    expect(res.effectiveRate).toBeCloseTo(7992.4 / 72000, 9);
  });

  it('passes the federally taxable Social Security through to the state', () => {
    const res = calculateHouseholdTaxes({
      year: 2026,
      filingStatus: 'married_joint',
      ages: [66, 64],
      income: { federalPension: 60000, traditionalWithdrawals: 30000, socialSecurity: 40000 },
      state: 'MT',
    });
    // federal taxable SS = 34,000 (see federalIncomeTax tests); MT taxes it.
    expect(res.federal.taxableSocialSecurity).toBeCloseTo(34000, 6);
    expect(res.state.taxedSocialSecurity).toBeCloseTo(34000, 6);
    // (90,000 + 34,000) x 5.5% = 6,820
    expect(res.stateTax).toBeCloseTo(6820, 6);
    expect(res.grossIncome).toBe(130000);
  });

  it('runs with no state', () => {
    const res = calculateHouseholdTaxes({ filingStatus: 'single', income: { wages: 50000 } });
    expect(res.state).toBeNull();
    expect(res.stateTax).toBe(0);
    expect(res.totalTax).toBe(res.federalTax);
  });

  it('accepts a preset object as the state', () => {
    const il = STATE_TAX_PRESETS.find((s) => s.code === 'IL');
    const res = calculateHouseholdTaxes({ filingStatus: 'single', income: { federalPension: 50000 }, state: il });
    expect(res.stateTax).toBe(0);
  });

  it('reports a zero effective rate on zero income', () => {
    const res = calculateHouseholdTaxes({ filingStatus: 'single', income: {} });
    expect(res.grossIncome).toBe(0);
    expect(res.effectiveRate).toBe(0);
  });
});

describe('index re-exports', () => {
  it('exposes the module functions and filing statuses', () => {
    expect(typeof calculateFederalIncomeTax).toBe('function');
    expect(typeof calculateStateIncomeTax).toBe('function');
    expect(typeof calculateTaxableSocialSecurity).toBe('function');
    expect(typeof roomInBracket).toBe('function');
    expect(FILING_STATUSES.MARRIED_JOINT).toBe('married_joint');
  });
});
