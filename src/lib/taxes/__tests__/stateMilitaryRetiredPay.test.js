import { describe, expect, it } from 'vitest';
import {
  MILITARY_RETIRED_PAY_TREATMENTS as T,
  STATE_MILITARY_RETIRED_PAY_RULES,
  getStateMilitaryRetiredPayRule,
  stateMilitaryRetiredPayExclusion,
} from '../stateMilitaryRetiredPay';
import { STATE_TAX_PRESETS, calculateStateIncomeTax } from '../stateIncomeTax';
import { calculateHouseholdTaxes } from '..';

describe('the rule table', () => {
  it('covers every state preset and DC', () => {
    for (const p of STATE_TAX_PRESETS) {
      expect(STATE_MILITARY_RETIRED_PAY_RULES[p.code], p.code).toBeDefined();
    }
    expect(Object.keys(STATE_MILITARY_RETIRED_PAY_RULES)).toHaveLength(51);
  });

  it('marks the nine no-income-tax states and carries a treatment for every other one', () => {
    const none = Object.values(STATE_MILITARY_RETIRED_PAY_RULES).filter((r) => r.treatment === T.NO_INCOME_TAX).map((r) => r.code).sort();
    expect(none).toEqual(['AK', 'FL', 'NH', 'NV', 'SD', 'TN', 'TX', 'WA', 'WY']);
    for (const r of Object.values(STATE_MILITARY_RETIRED_PAY_RULES)) expect(Object.values(T)).toContain(r.treatment);
  });

  it('starts every taxing state unverified, so no exclusion is applied silently', () => {
    for (const r of Object.values(STATE_MILITARY_RETIRED_PAY_RULES)) {
      if (r.treatment === T.NO_INCOME_TAX) continue;
      expect(r.verified, r.code).toBe(false);
      expect(r.reviewedOn, r.code).toBeNull();
    }
    expect(getStateMilitaryRetiredPayRule('va').code).toBe('VA');
    expect(getStateMilitaryRetiredPayRule('ZZ')).toBeNull();
  });
});

describe('applying a rule', () => {
  const verified = {
    FULL: { code: 'FULL', treatment: T.FULL_EXEMPTION, exclusion: null, minAge: null, effectiveFrom: 2021, effectiveTo: null, verified: 'test', reviewedOn: '2026-09-20' },
    CAP: { code: 'CAP', treatment: T.PARTIAL_EXCLUSION, exclusion: 20000, minAge: null, effectiveFrom: 2025, effectiveTo: 2029, verified: 'test', reviewedOn: '2026-09-20' },
    AGED: { code: 'AGED', treatment: T.PARTIAL_EXCLUSION, exclusion: 3000, minAge: 62, effectiveFrom: null, effectiveTo: null, verified: 'test', reviewedOn: '2026-09-20' },
    RAW: { code: 'RAW', treatment: T.FULL_EXEMPTION, exclusion: null, minAge: null, effectiveFrom: null, effectiveTo: null, verified: false, reviewedOn: null },
    FACTS: { code: 'FACTS', treatment: T.PARTIAL_EXCLUSION, exclusion: null, minAge: null, effectiveFrom: null, effectiveTo: null, verified: 'test', reviewedOn: '2026-09-20' },
  };
  const apply = (code, over = {}) => stateMilitaryRetiredPayExclusion({ code, militaryRetiredPay: 30000, taxYear: 2026, age: 60, rules: verified, ...over });

  it('excludes in full, or up to the cap, once verified', () => {
    expect(apply('FULL')).toMatchObject({ excluded: 30000, applied: true, verified: true });
    expect(apply('CAP')).toMatchObject({ excluded: 20000, applied: true });
    expect(apply('CAP', { militaryRetiredPay: 12000 }).excluded).toBe(12000);
  });

  it('never applies an unverified rule', () => {
    expect(apply('RAW')).toMatchObject({ excluded: 0, applied: false, verified: false, reason: 'unverified' });
  });

  it('case 49: honours the effective window on both sides', () => {
    expect(apply('CAP', { taxYear: 2024 })).toMatchObject({ excluded: 0, reason: 'before_effective_window' });
    expect(apply('CAP', { taxYear: 2025 }).excluded).toBe(20000);
    expect(apply('CAP', { taxYear: 2029 }).excluded).toBe(20000);
    expect(apply('CAP', { taxYear: 2030 })).toMatchObject({ excluded: 0, reason: 'after_effective_window' });
    expect(apply('FULL', { taxYear: 2020 }).reason).toBe('before_effective_window');
  });

  it('honours an age condition', () => {
    expect(apply('AGED', { age: 61 })).toMatchObject({ excluded: 0, reason: 'below_minimum_age' });
    expect(apply('AGED', { age: 62 }).excluded).toBe(3000);
    expect(apply('AGED', { age: null }).reason).toBe('below_minimum_age');
  });

  it('refuses to guess a partial rule whose facts are not modelled', () => {
    expect(apply('FACTS')).toMatchObject({ excluded: 0, applied: false, reason: 'rule_needs_facts_not_modelled' });
  });

  it('treats a no-income-tax state as fully excluded without verification', () => {
    expect(stateMilitaryRetiredPayExclusion({ code: 'TX', militaryRetiredPay: 30000, taxYear: 2026 })).toMatchObject({ excluded: 30000, applied: true, verified: true });
  });
});

describe('through the state and household tax engines', () => {
  it('taxes military retired pay in full in an unverified state and reports why', () => {
    const r = calculateStateIncomeTax({ state: 'VA', ordinaryIncome: 60000, militaryRetiredPayIncome: 30000, taxYear: 2026, age: 60 });
    expect(r.militaryRetiredPay).toBe(30000);
    expect(r.exemptMilitaryRetiredPay).toBe(0);
    expect(r.militaryRuleApplied).toBe(false);
    expect(r.militaryRuleReason).toBe('unverified');
    expect(r.taxableIncome).toBe(60000);
  });

  it('keeps military retired pay out of the federal-pension exclusion', () => {
    // Alabama exempts CSRS/FERS annuities; the military pay is a separate, unverified line.
    const r = calculateStateIncomeTax({ state: 'AL', ordinaryIncome: 70000, federalPensionIncome: 40000, militaryRetiredPayIncome: 30000, taxYear: 2026, age: 60 });
    expect(r.exemptFederalPension).toBe(40000);
    expect(r.exemptMilitaryRetiredPay).toBe(0);
    expect(r.taxableIncome).toBe(30000);
  });

  it('household taxes: military retired pay is ordinary income federally, tax-exempt income is untouched', () => {
    const base = calculateHouseholdTaxes({ year: 2026, filingStatus: 'single', ages: [62], income: { federalPension: 40000 }, state: null });
    const withRetiredPay = calculateHouseholdTaxes({ year: 2026, filingStatus: 'single', ages: [62], income: { federalPension: 40000, militaryRetiredPay: 24000 }, state: null });
    const withExempt = calculateHouseholdTaxes({ year: 2026, filingStatus: 'single', ages: [62], income: { federalPension: 40000, taxExemptIncome: 24000 }, state: null });
    expect(withRetiredPay.ordinaryIncome).toBe(64000);
    expect(withRetiredPay.federalTax).toBeGreaterThan(base.federalTax);
    expect(withExempt.ordinaryIncome).toBe(40000);
    expect(withExempt.federalTax).toBe(base.federalTax);
    expect(withExempt.taxExemptIncome).toBe(24000);
  });

  it('tax-exempt income does not raise the taxable share of Social Security', () => {
    const a = calculateHouseholdTaxes({ year: 2026, filingStatus: 'single', ages: [67], income: { federalPension: 20000, socialSecurity: 24000 }, state: null });
    const b = calculateHouseholdTaxes({ year: 2026, filingStatus: 'single', ages: [67], income: { federalPension: 20000, socialSecurity: 24000, taxExemptIncome: 30000 }, state: null });
    expect(b.federal.taxableSocialSecurity).toBe(a.federal.taxableSocialSecurity);
    const c = calculateHouseholdTaxes({ year: 2026, filingStatus: 'single', ages: [67], income: { federalPension: 20000, socialSecurity: 24000, militaryRetiredPay: 30000 }, state: null });
    expect(c.federal.taxableSocialSecurity).toBeGreaterThan(a.federal.taxableSocialSecurity);
  });
});
