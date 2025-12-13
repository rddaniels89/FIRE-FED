import { describe, expect, it } from 'vitest';
import { calculateFersMultiplier, calculateFersResults } from '../fers';

describe('fers calculations', () => {
  it('uses 1.1% multiplier when age >= 62 and service >= 20', () => {
    const multiplier = calculateFersMultiplier({ retirementAge: 62, totalYearsOfService: 20 });
    expect(multiplier).toBeCloseTo(0.011, 6);
  });

  it('projects future service when includeFutureService is true', () => {
    const res = calculateFersResults({
      yearsOfService: 10,
      monthsOfService: 0,
      high3Salary: 100000,
      currentAge: 40,
      retirementAge: 60,
      showComparison: false,
      privateJobSalary: 0,
      privateJobYears: 0,
      includeFutureService: true,
    });
    expect(res.projectedYears).toBeCloseTo(30, 6);
    expect(res.stayFed.annualPension).toBeGreaterThan(0);
  });
});


