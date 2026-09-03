import { describe, expect, it } from 'vitest';
import {
  FERS_MILITARY_DEPOSIT_RATE,
  INTEREST_FREE_YEARS,
  calculateMilitaryDeposit,
  evaluateMilitaryDepositDecision,
} from '../militaryDeposit';

describe('the deposit owed', () => {
  it('is 3% of the basic pay earned while serving', () => {
    expect(FERS_MILITARY_DEPOSIT_RATE).toBe(0.03);
    expect(calculateMilitaryDeposit({ militaryBasicPay: 100000 }).principal).toBeCloseTo(3000, 6);
  });

  it('charges no interest for the first two years of FERS coverage', () => {
    expect(INTEREST_FREE_YEARS).toBe(2);
    const r = calculateMilitaryDeposit({
      militaryBasicPay: 100000,
      yearsSinceFersCoverageBegan: 2,
      annualInterestRate: 0.04,
    });
    expect(r.interest).toBeCloseTo(0, 6);
    expect(r.total).toBeCloseTo(3000, 6);
  });

  it('accrues interest only on the years past the grace period', () => {
    const r = calculateMilitaryDeposit({
      militaryBasicPay: 100000,
      yearsSinceFersCoverageBegan: 5,
      annualInterestRate: 0.04,
    });
    // Three accruing years, not five.
    expect(r.total).toBeCloseTo(3000 * Math.pow(1.04, 3), 4);
    expect(r.isAccruingInterest).toBe(true);
  });

  it('counts down the interest-free window that remains', () => {
    expect(calculateMilitaryDeposit({ militaryBasicPay: 1000, yearsSinceFersCoverageBegan: 0 })
      .interestFreeYearsRemaining).toBe(2);
    expect(calculateMilitaryDeposit({ militaryBasicPay: 1000, yearsSinceFersCoverageBegan: 1.5 })
      .interestFreeYearsRemaining).toBe(0.5);
    expect(calculateMilitaryDeposit({ militaryBasicPay: 1000, yearsSinceFersCoverageBegan: 9 })
      .interestFreeYearsRemaining).toBe(0);
  });

  it('treats nonsense as zero rather than producing a wrong bill', () => {
    expect(calculateMilitaryDeposit({ militaryBasicPay: -5000 }).total).toBe(0);
    expect(calculateMilitaryDeposit({}).total).toBe(0);
  });
});

describe('whether paying is worth it', () => {
  // Four years of service in the 1990s at roughly $20,000 a year of basic pay:
  // a $2,400 deposit against an annuity increase paid for life.
  const scenario = {
    militaryYears: 4,
    militaryBasicPay: 80000,
    high3Salary: 110000,
    multiplier: 0.01,
    yearsOfAnnuityExpected: 25,
  };

  it('values the service at the same rate as any other creditable time', () => {
    const r = evaluateMilitaryDepositDecision(scenario);
    expect(r.annualAnnuityIncrease).toBeCloseTo(4400, 6); // 110k x 4 x 1%
    expect(r.monthlyAnnuityIncrease).toBeCloseTo(366.67, 1);
  });

  it('breaks even in well under a year here', () => {
    const r = evaluateMilitaryDepositDecision(scenario);
    expect(r.deposit.total).toBeCloseTo(2400, 6);
    expect(r.breakEvenYears).toBeCloseTo(2400 / 4400, 4);
    expect(r.isWorthPaying).toBe(true);
  });

  it('reports the lifetime gain net of the deposit', () => {
    const r = evaluateMilitaryDepositDecision(scenario);
    expect(r.lifetimeIncrease).toBeCloseTo(110000, 6); // 4400 x 25
    expect(r.netLifetimeGain).toBeCloseTo(110000 - 2400, 4);
  });

  it('uses the 1.1% multiplier when that is what applies', () => {
    const r = evaluateMilitaryDepositDecision({ ...scenario, multiplier: 0.011 });
    expect(r.annualAnnuityIncrease).toBeCloseTo(4840, 6);
  });

  // The consequence that never appears in the money: military time counts
  // toward the service thresholds, so a deposit can make an earlier retirement
  // legal rather than merely larger.
  it('flags that the service also counts toward eligibility', () => {
    expect(evaluateMilitaryDepositDecision(scenario).addsEligibility).toBe(true);
    expect(evaluateMilitaryDepositDecision({ ...scenario, militaryYears: 0 }).addsEligibility).toBe(false);
  });

  it('declines to compute a break-even with no annuity to gain', () => {
    const r = evaluateMilitaryDepositDecision({ ...scenario, high3Salary: 0 });
    expect(r.breakEvenYears).toBeNull();
    expect(r.isWorthPaying).toBe(false);
  });

  it('turns against paying when interest has run long enough', () => {
    const r = evaluateMilitaryDepositDecision({
      ...scenario,
      militaryBasicPay: 80000,
      yearsSinceFersCoverageBegan: 40,
      annualInterestRate: 0.06,
      yearsOfAnnuityExpected: 2,
    });
    // A short expected annuity plus decades of interest is the one case where
    // the usual answer flips.
    expect(r.breakEvenYears).toBeGreaterThan(2);
    expect(r.isWorthPaying).toBe(false);
  });
});
