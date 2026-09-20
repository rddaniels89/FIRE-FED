import { describe, expect, it } from 'vitest';
import { resolveRetirementPlan } from '../plan';
import { buildTimeline } from '../timeline';
import { findFireDate } from '../fireDate';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../scenarios/schema';
import { ISSUE_CODES } from '../../military/status';

/**
 * Military credit through the whole plan (spec §14.1 cases 18–23 and the §14.2
 * invariants). Everyone here is born after 1970, so the MRA is 57 and the year
 * is pinned so ages resolve to the same birth years on every run.
 */

const AS_OF = { asOfYear: 2026 };

/** Four years of documented active duty, 1998–2002. */
const PAID_PERIOD = {
  id: 'ad',
  dutyStatus: 'active_duty',
  startDate: '1998-06-15',
  endDate: '2002-06-14',
  characterStatus: 'confirmed_honorable_conditions',
  documentationStatus: 'dd214',
  inputProvenance: 'user_entered_official',
};

const scenario = ({ currentAge, separationAge, yearsOfService, military = null, employeeType = 'regular', extra = {} }) => {
  const s = normalizeScenario({
    ...createDefaultScenario('m'),
    profile: { currentAge, separationAge, socialSecurityClaimAge: 67, employeeType },
    tsp: { currentBalance: 400000, annualSalary: 110000, monthlyContributionPercent: 10, annualSalaryGrowthRate: 2, inflationRate: 2.5 },
    fers: { yearsOfService, monthsOfService: 0, high3Salary: 105000 },
    fire: { monthlyFireIncomeGoal: 5000, sideHustleIncome: 0 },
    summary: { monthlyExpenses: 4500, socialSecurity: { mode: 'manual', monthlyBenefit: 2400 } },
    ...extra,
  });
  return military ? applyScenarioUpdates(s, { military }) : s;
};

const paid = (periods = [PAID_PERIOD]) => ({ connection: 'self', servicePeriods: periods, deposit: { status: 'paid_in_full' } });
const unpaid = (periods = [PAID_PERIOD]) => ({ connection: 'self', servicePeriods: periods, deposit: { status: 'payments_in_progress' } });

const codes = (plan) => plan.military.issues.map((i) => i.code);

describe('case 18: military credit cannot satisfy the five civilian years', () => {
  it('leaves a 62-year-old with four civilian years and ten military years without an annuity', () => {
    const ten = { ...PAID_PERIOD, startDate: '1990-01-01', endDate: '1999-12-31' };
    const plan = resolveRetirementPlan(scenario({ currentAge: 61, separationAge: 62, yearsOfService: 3, military: paid([ten]) }), AS_OF);
    expect(plan.service.civilianYears).toBe(4);
    expect(plan.service.militaryCreditYears).toBeCloseTo(10, 10);
    expect(plan.isEligibleForAnnuity).toBe(false);
    expect(plan.path).toBeNull();
    expect(codes(plan)).toContain(ISSUE_CODES.MIL_FIVE_CIVILIAN_YEARS);
  });
});

describe('case 19: military credit changes the MRA+30 door', () => {
  const without = () => resolveRetirementPlan(scenario({ currentAge: 50, separationAge: 57, yearsOfService: 19 }), AS_OF);
  const withCredit = () => resolveRetirementPlan(scenario({ currentAge: 50, separationAge: 57, yearsOfService: 19, military: paid() }), AS_OF);

  it('turns a reduced MRA+10 retirement into an unreduced one', () => {
    expect(without().path).toBe('mra10_immediate');
    expect(without().annuity.ageReductionPercent).toBeGreaterThan(0);
    const p = withCredit();
    expect(p.service.civilianYears).toBe(26);
    expect(p.service.eligibilityYears).toBeCloseTo(30, 10);
    expect(p.path).toBe('immediate_unreduced');
    expect(p.annuity.ageReductionPercent).toBe(0);
    expect(p.military.status).toBe('supported');
  });

  it('case 22: pays the supplement, prorated on the 26 civilian years and not the 30', () => {
    const p = withCredit();
    expect(p.srs.isEligible).toBe(true);
    expect(p.srs.monthly).toBeCloseTo((p.socialSecurity.monthlyAt62 * 26) / 40, 6);
    expect(codes(p)).toContain(ISSUE_CODES.MIL_SRS_EXCLUSION);
    expect(without().srs.isEligible).toBe(false);
  });

  it('exit criterion: the annuity on the timeline rises and the FIRE date does not move later', () => {
    const before = buildTimeline(scenario({ currentAge: 50, separationAge: 57, yearsOfService: 19 }), AS_OF);
    const after = buildTimeline(scenario({ currentAge: 50, separationAge: 57, yearsOfService: 19, military: paid() }), AS_OF);
    const at58 = (t) => t.rows.find((r) => r.age === 58);
    expect(at58(after).pension).toBeGreaterThan(at58(before).pension);
    expect(at58(after).srs).toBeGreaterThan(0);
    expect(at58(before).srs).toBe(0);

    const fireBefore = findFireDate(scenario({ currentAge: 50, separationAge: 57, yearsOfService: 19 }), AS_OF);
    const fireAfter = findFireDate(scenario({ currentAge: 50, separationAge: 57, yearsOfService: 19, military: paid() }), AS_OF);
    expect(fireBefore.found).toBe(true);
    expect(fireAfter.found).toBe(true);
    expect(fireAfter.separationAge).toBeLessThanOrEqual(fireBefore.separationAge);
  });
});

describe('case 20: military credit changes the age-60 with 20 door', () => {
  it('makes 17 civilian years at 60 an unreduced retirement', () => {
    const without = resolveRetirementPlan(scenario({ currentAge: 55, separationAge: 60, yearsOfService: 12 }), AS_OF);
    const p = resolveRetirementPlan(scenario({ currentAge: 55, separationAge: 60, yearsOfService: 12, military: paid() }), AS_OF);
    expect(without.path).toBe('mra10_immediate');
    expect(p.path).toBe('immediate_unreduced');
    expect(p.annuity.annualAtStart).toBeGreaterThan(without.annuity.annualAtStart);
  });
});

describe('case 21: military credit triggers the 1.1% factor at 62 with 20', () => {
  it('raises the multiplier from 1.0% to 1.1% on every year', () => {
    const without = resolveRetirementPlan(scenario({ currentAge: 58, separationAge: 62, yearsOfService: 13 }), AS_OF);
    const p = resolveRetirementPlan(scenario({ currentAge: 58, separationAge: 62, yearsOfService: 13, military: paid() }), AS_OF);
    expect(without.annuity.multiplier).toBe(0.01);
    expect(p.annuity.multiplier).toBe(0.011);
    expect(p.service.computationYears).toBeCloseTo(21, 10);
  });
});

describe('case 23: military credit is excluded from the special-provision covered minimum', () => {
  it('does not let 18 covered years plus 4 military years retire a law enforcement officer at 50', () => {
    const p = resolveRetirementPlan(
      scenario({ currentAge: 45, separationAge: 50, yearsOfService: 13, employeeType: 'law_enforcement', military: paid() }),
      AS_OF
    );
    expect(p.service.civilianYears).toBe(18);
    expect(p.service.eligibilityYears).toBeCloseTo(22, 10);
    // Not a special-provision retirement: 22 total years do not stand in for 20 covered years.
    // The officer can still defer on 18 civilian years, which is the ordinary FERS door.
    expect(p.isSpecialProvision).toBe(false);
    expect(p.path).toBe('deferred');
    expect(p.annuityStartAge).toBeGreaterThan(50);
    expect(codes(p)).toContain(ISSUE_CODES.MIL_SPECIAL_SERVICE_EXCLUSION);
  });

  it('still adds the credit to the computation once the officer qualifies on covered service alone', () => {
    const without = resolveRetirementPlan(scenario({ currentAge: 45, separationAge: 50, yearsOfService: 15, employeeType: 'law_enforcement' }), AS_OF);
    const p = resolveRetirementPlan(scenario({ currentAge: 45, separationAge: 50, yearsOfService: 15, employeeType: 'law_enforcement', military: paid() }), AS_OF);
    expect(without.isSpecialProvision).toBe(true);
    expect(p.isSpecialProvision).toBe(true);
    expect(p.annuity.annualAtStart).toBeGreaterThan(without.annuity.annualAtStart);
  });
});

describe('the deposit gate and what the plan reports', () => {
  it('credits nothing while the deposit is unpaid and the plan matches the no-military plan', () => {
    const none = resolveRetirementPlan(scenario({ currentAge: 50, separationAge: 57, yearsOfService: 19 }), AS_OF);
    const p = resolveRetirementPlan(scenario({ currentAge: 50, separationAge: 57, yearsOfService: 19, military: unpaid() }), AS_OF);
    expect(p.service.militaryCreditYears).toBe(0);
    expect(p.path).toBe(none.path);
    expect(p.annuity.annualAtStart).toBe(none.annuity.annualAtStart);
    expect(p.srs.monthly).toBe(none.srs.monthly);
    expect(p.military.reason).toBe('deposit_unpaid');
    expect(p.military.hasRecordedService).toBe(true);
    expect(codes(p)).toContain(ISSUE_CODES.MIL_DEPOSIT_PARTIAL);
  });

  it('marks an estimated period as an estimate all the way up', () => {
    const p = resolveRetirementPlan(
      scenario({ currentAge: 50, separationAge: 57, yearsOfService: 19, military: paid([{ ...PAID_PERIOD, inputProvenance: 'user_estimate' }]) }),
      AS_OF
    );
    expect(p.service.militaryCreditYears).toBeCloseTo(4, 10);
    expect(p.military.status).toBe('estimate_only');
  });

  it('notes a spouse\'s recorded service without applying it to the primary', () => {
    const p = resolveRetirementPlan(
      scenario({ currentAge: 50, separationAge: 57, yearsOfService: 19, military: paid([{ ...PAID_PERIOD, ownerId: 'spouse' }]) }),
      AS_OF
    );
    expect(p.service.militaryCreditYears).toBe(0);
    expect(codes(p)).toContain(ISSUE_CODES.MIL_SPOUSE_CREDIT_NOT_MODELED);
  });

  it('carries a migrated legacy year count as recorded but not credited', () => {
    // A v3 row has no military block; building it from the v4 default would carry one and skip the migration.
    const { military: _v4Block, ...v3Shape } = createDefaultScenario('l');
    const legacy = normalizeScenario({ ...v3Shape, schemaVersion: 3, profile: { currentAge: 50, separationAge: 57 }, fers: { yearsOfService: 19, militaryServiceYears: 4, militaryDepositPaid: true } });
    const p = resolveRetirementPlan(legacy, AS_OF);
    expect(p.military.recordedYears).toBe(4);
    expect(p.military.creditYears).toBe(0);
    expect(p.path).toBe('mra10_immediate');
    expect(codes(p)).toContain(ISSUE_CODES.MIL_LEGACY_YEARS_UNDATED);
  });

  it('reports nothing when there is no military connection', () => {
    const p = resolveRetirementPlan(scenario({ currentAge: 50, separationAge: 57, yearsOfService: 19 }), AS_OF);
    expect(p.military).toMatchObject({ creditYears: 0, status: null, reason: 'no_service', hasRecordedService: false, issues: [] });
  });
});

/** A small deterministic generator; no property-testing library is installed. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('invariants (spec §14.2)', () => {
  const rand = lcg(2026_09_19);
  const cases = Array.from({ length: 40 }, () => {
    const currentAge = 40 + Math.floor(rand() * 20);
    const separationAge = currentAge + Math.floor(rand() * 12);
    const yearsOfService = Math.floor(rand() * 25);
    const years = 1 + Math.floor(rand() * 8);
    const startYear = 1975 + Math.floor(rand() * 25);
    const period = { ...PAID_PERIOD, startDate: `${startYear}-01-01`, endDate: `${startYear + years - 1}-12-31` };
    return { currentAge, separationAge, yearsOfService, period };
  });

  it('military credit never changes the High-3', () => {
    for (const c of cases) {
      const a = resolveRetirementPlan(scenario(c), AS_OF);
      const b = resolveRetirementPlan(scenario({ ...c, military: paid([c.period]) }), AS_OF);
      expect(b.high3.high3AtSeparation).toBe(a.high3.high3AtSeparation);
    }
  });

  it('military credit never enters the supplement numerator', () => {
    for (const c of cases) {
      const b = resolveRetirementPlan(scenario({ ...c, military: paid([c.period]) }), AS_OF);
      if (!b.srs.isEligible) continue;
      expect(b.srs.monthly).toBeCloseTo((b.socialSecurity.monthlyAt62 * Math.round(b.service.civilianYears)) / 40, 6);
    }
  });

  it('adding paid military service never reduces the annuity or closes an open door', () => {
    for (const c of cases) {
      const a = resolveRetirementPlan(scenario(c), AS_OF);
      const b = resolveRetirementPlan(scenario({ ...c, military: paid([c.period]) }), AS_OF);
      expect(b.service.eligibilityYears).toBeGreaterThanOrEqual(a.service.eligibilityYears);
      if (a.isEligibleForAnnuity) {
        expect(b.isEligibleForAnnuity).toBe(true);
        expect(b.annuity.annualAtStart).toBeGreaterThanOrEqual(a.annuity.annualAtStart - 1e-6);
      }
    }
  });

  it('an unpaid deposit never changes any figure', () => {
    for (const c of cases) {
      const a = resolveRetirementPlan(scenario(c), AS_OF);
      const b = resolveRetirementPlan(scenario({ ...c, military: unpaid([c.period]) }), AS_OF);
      expect(b.service.eligibilityYears).toBe(a.service.eligibilityYears);
      expect(b.annuity.annualAtStart).toBe(a.annuity.annualAtStart);
      expect(b.srs.monthly).toBe(a.srs.monthly);
    }
  });

  it('unknown states never silently become credit', () => {
    for (const c of cases) {
      const a = resolveRetirementPlan(scenario(c), AS_OF);
      const b = resolveRetirementPlan(scenario({ ...c, military: paid([{ ...c.period, characterStatus: 'unknown' }]) }), AS_OF);
      expect(b.service.militaryCreditYears).toBe(0);
      expect(b.annuity.annualAtStart).toBe(a.annuity.annualAtStart);
    }
  });
});
