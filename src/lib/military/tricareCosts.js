/**
 * TRICARE premium and enrollment-fee table for the coverage projection.
 *
 * Every figure is a published calendar-year amount for the beneficiary group
 * shown. The 2026 amounts are pending human verification against the TRICARE
 * cost pages (docs/MILITARY-VERIFICATION.md); until then the 2025 published
 * amounts stand in and every result built on them says so.
 *
 *   TRS   https://tricare.mil/Plans/HealthPlans/TRS
 *   TRR   https://tricare.mil/Plans/HealthPlans/TRR
 *   CHCBP https://tricare.mil/Plans/SpecialPrograms/CHCBP
 *   Costs https://tricare.mil/Costs
 */

export const TRICARE_COSTS_YEAR = 2025;
export const TRICARE_COSTS_VERIFIED = false;

/** Monthly premiums or annualised enrollment fees, by plan and enrollment type. */
export const TRICARE_COSTS = Object.freeze({
  trs: Object.freeze({ label: 'TRICARE Reserve Select', monthly: Object.freeze({ self: 54.84, family: 265.91 }), source: 'https://tricare.mil/Plans/HealthPlans/TRS' }),
  trr: Object.freeze({ label: 'TRICARE Retired Reserve', monthly: Object.freeze({ self: 645.84, family: 1551.5 }), source: 'https://tricare.mil/Plans/HealthPlans/TRR' }),
  /** CHCBP is billed quarterly; shown per month. */
  chcbp: Object.freeze({ label: 'Continued Health Care Benefit Program', monthly: Object.freeze({ self: 1893 / 3, family: 4539 / 3 }), source: 'https://tricare.mil/Plans/SpecialPrograms/CHCBP' }),
  /** Retiree enrollment fees, Group A (entered service before 2018-01-01), per year → per month. */
  tricare_prime: Object.freeze({ label: 'TRICARE Prime (retiree, Group A)', monthly: Object.freeze({ self: 363 / 12, family: 726 / 12 }), source: 'https://tricare.mil/Costs' }),
  tricare_select: Object.freeze({ label: 'TRICARE Select (retiree, Group A)', monthly: Object.freeze({ self: 158 / 12, family: 316 / 12 }), source: 'https://tricare.mil/Costs' }),
  /** TFL has no enrollment fee; Medicare Part B is the premium. */
  tfl: Object.freeze({ label: 'TRICARE For Life', monthly: Object.freeze({ self: 0, family: 0 }), source: 'https://tricare.mil/Plans/HealthPlans/TFL' }),
  /** TAMP is premium-free for the 180 days. */
  tamp: Object.freeze({ label: 'Transitional Assistance Management Program', monthly: Object.freeze({ self: 0, family: 0 }), source: 'https://tricare.mil/Plans/SpecialPrograms/TAMP' }),
});

/** The table's monthly premium for a plan and enrollment type, or null when the plan is not in the table. */
export function tricareMonthlyPremium({ plan, enrollment = 'self' } = {}) {
  const row = TRICARE_COSTS[plan];
  if (!row) return null;
  const key = enrollment === 'family' || enrollment === 'selfPlusOne' ? 'family' : 'self';
  return { monthly: row.monthly[key], year: TRICARE_COSTS_YEAR, verified: TRICARE_COSTS_VERIFIED, source: row.source, label: row.label };
}
