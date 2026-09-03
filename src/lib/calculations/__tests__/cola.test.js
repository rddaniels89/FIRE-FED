import { describe, expect, it } from 'vitest';
import { FERS_COLA_START_AGE, calculateFersColaRate, isFersColaPayableAtAge, projectAnnuityWithCola } from '../cola';

describe('FERS diet COLA rate', () => {
  // CPI up to 2% -> full CPI
  it('passes CPI through at or below 2%', () => {
    expect(calculateFersColaRate(0.015)).toBeCloseTo(0.015, 6);
    expect(calculateFersColaRate(0.02)).toBeCloseTo(0.02, 6);
  });

  // CPI over 2 and up to 3% -> flat 2%
  it('caps at 2% when CPI is between 2 and 3 percent', () => {
    expect(calculateFersColaRate(0.025)).toBeCloseTo(0.02, 6);
    expect(calculateFersColaRate(0.03)).toBeCloseTo(0.02, 6);
  });

  // CPI above 3% -> CPI minus one point
  it('subtracts a full point above 3%', () => {
    expect(calculateFersColaRate(0.04)).toBeCloseTo(0.03, 6);
    expect(calculateFersColaRate(0.08)).toBeCloseTo(0.07, 6);
  });

  it('never returns a negative or nonsense rate', () => {
    expect(calculateFersColaRate(0)).toBe(0);
    expect(calculateFersColaRate(-0.02)).toBe(0);
    expect(calculateFersColaRate('nonsense')).toBe(0);
  });

  // The diet COLA means a FERS annuity loses ground whenever inflation is above
  // 2%, permanently and by design.
  it('always trails inflation above 2%', () => {
    for (const cpi of [0.025, 0.03, 0.05, 0.09]) {
      expect(calculateFersColaRate(cpi)).toBeLessThan(cpi);
    }
  });
});

describe('when a COLA is payable', () => {
  it('withholds it before 62 for an ordinary retiree', () => {
    expect(isFersColaPayableAtAge({ age: 57 })).toBe(false);
    expect(isFersColaPayableAtAge({ age: 61 })).toBe(false);
    expect(isFersColaPayableAtAge({ age: FERS_COLA_START_AGE })).toBe(true);
  });

  it('pays special provision and disability retirees immediately', () => {
    expect(isFersColaPayableAtAge({ age: 50, isSpecialProvision: true })).toBe(true);
    expect(isFersColaPayableAtAge({ age: 45, isDisabilityRetirement: true })).toBe(true);
  });
});

describe('projecting an annuity', () => {
  it('holds the annuity flat when there is no inflation', () => {
    const p = projectAnnuityWithCola({ annualPension: 30000, startAge: 60, endAge: 65, cpiIncrease: 0 });
    expect(p.years).toHaveLength(5);
    expect(p.finalYearNominal).toBeCloseTo(30000, 6);
    expect(p.lifetimeNominal).toBeCloseTo(150000, 6);
  });

  // The gap this whole module exists to expose: five years of a fixed annuity
  // before the first adjustment ever arrives.
  it('pays no adjustment before 62, so purchasing power falls', () => {
    const p = projectAnnuityWithCola({ annualPension: 30000, startAge: 57, endAge: 62, cpiIncrease: 0.025 });
    expect(p.years.every((y) => y.nominal === 30000)).toBe(true);
    expect(p.finalYearReal).toBeLessThan(30000);
    expect(p.purchasingPowerRetained).toBeLessThan(1);
  });

  it('starts adjusting once the retiree reaches 62', () => {
    const p = projectAnnuityWithCola({ annualPension: 30000, startAge: 60, endAge: 70, cpiIncrease: 0.025 });
    const at61 = p.years.find((y) => y.age === 61);
    const at65 = p.years.find((y) => y.age === 65);
    expect(at61.nominal).toBeCloseTo(30000, 6); // still under 62
    expect(at65.nominal).toBeGreaterThan(30000);
  });

  it('adjusts a special provision retiree from the start', () => {
    const ordinary = projectAnnuityWithCola({ annualPension: 30000, startAge: 50, endAge: 62, cpiIncrease: 0.025 });
    const special = projectAnnuityWithCola({
      annualPension: 30000,
      startAge: 50,
      endAge: 62,
      cpiIncrease: 0.025,
      isSpecialProvision: true,
    });
    expect(special.lifetimeNominal).toBeGreaterThan(ordinary.lifetimeNominal);
  });

  // Because the COLA trails inflation, real value falls even after 62.
  it('still loses real value after adjustments begin', () => {
    const p = projectAnnuityWithCola({ annualPension: 30000, startAge: 62, endAge: 85, cpiIncrease: 0.03 });
    expect(p.finalYearNominal).toBeGreaterThan(30000);
    expect(p.finalYearReal).toBeLessThan(30000);
  });

  it('returns nothing for an empty span', () => {
    const p = projectAnnuityWithCola({ annualPension: 30000, startAge: 70, endAge: 70, cpiIncrease: 0.02 });
    expect(p.years).toHaveLength(0);
    expect(p.lifetimeNominal).toBe(0);
  });
});
