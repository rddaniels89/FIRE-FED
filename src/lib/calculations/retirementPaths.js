/**
 * The FERS retirement paths, and what each one costs.
 *
 * Choosing between them is not a matter of degree. Two people with identical
 * service and identical high-3 can end up with different annuities, different
 * health insurance, and one with a supplement and one without, purely from which
 * door they leave through. The differences that decide it:
 *
 *   Age reduction   MRA+10 is cut 5% for every year under 62, permanently.
 *                   VERA is not reduced at all under FERS.
 *   FEHB            Deferred retirement ends it for good. Postponing keeps it.
 *                   That is frequently worth more than the annuity difference.
 *   Sick leave      Credited only when the annuity is immediate. A deferred
 *                   annuitant loses the lot.
 *   Supplement      Immediate unreduced only. Never on deferred, postponed or
 *                   MRA+10.
 *
 * https://www.opm.gov/retirement-center/fers-information/types-of-retirement/
 */

import { DEFAULT_MRA, calculateMra10ReductionPercent } from './fers';

export const RETIREMENT_PATHS = Object.freeze({
  IMMEDIATE_UNREDUCED: 'immediate_unreduced',
  MRA10_IMMEDIATE: 'mra10_immediate',
  MRA10_POSTPONED: 'mra10_postponed',
  DEFERRED: 'deferred',
  VERA: 'vera',
});

export const PATH_LABELS = Object.freeze({
  [RETIREMENT_PATHS.IMMEDIATE_UNREDUCED]: 'Immediate, unreduced',
  [RETIREMENT_PATHS.MRA10_IMMEDIATE]: 'MRA+10, starting now',
  [RETIREMENT_PATHS.MRA10_POSTPONED]: 'MRA+10, postponed',
  [RETIREMENT_PATHS.DEFERRED]: 'Deferred',
  [RETIREMENT_PATHS.VERA]: 'Early out (VERA)',
});

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Immediate, unreduced: MRA with 30, age 60 with 20, or age 62 with 5. */
export function qualifiesForImmediateUnreduced({ age, yearsOfService, mra = DEFAULT_MRA }) {
  const a = num(age);
  const y = num(yearsOfService);
  const m = num(mra, DEFAULT_MRA);
  return (a >= 62 && y >= 5) || (a >= 60 && y >= 20) || (a >= m && y >= 30);
}

/** MRA with at least 10 years, where an unreduced route is not already open. */
export function qualifiesForMra10({ age, yearsOfService, mra = DEFAULT_MRA }) {
  return (
    !qualifiesForImmediateUnreduced({ age, yearsOfService, mra }) &&
    num(age) >= num(mra, DEFAULT_MRA) &&
    num(yearsOfService) >= 10
  );
}

/**
 * VERA: offered during a reduction in force or major reorganisation. Age 50 with
 * 20 years, or any age with 25.
 *
 * Under FERS there is no age reduction — the CSRS penalty of 2% a year under 55
 * does not apply, which is what makes an early out worth taking.
 */
export function qualifiesForVera({ age, yearsOfService }) {
  const a = num(age);
  const y = num(yearsOfService);
  return (a >= 50 && y >= 20) || y >= 25;
}

/** Deferred: separated with at least 5 years, annuity claimed later. */
export function qualifiesForDeferred({ yearsOfService }) {
  return num(yearsOfService) >= 5;
}

/**
 * The earliest age a deferred annuity can begin, unreduced where possible.
 *
 * 62 with 5 years, 60 with 20, or MRA with 30. With 10 to 29 years the annuity
 * can start at MRA but is reduced like MRA+10.
 */
export function earliestUnreducedDeferredAge({ yearsOfService, mra = DEFAULT_MRA }) {
  const y = num(yearsOfService);
  const m = num(mra, DEFAULT_MRA);
  if (y >= 30) return m;
  if (y >= 20) return 60;
  if (y >= 5) return 62;
  return null;
}

/**
 * Evaluates one path for a given separation.
 *
 * `annuityStartAge` only matters for the postponed and deferred paths, where the
 * retiree chooses when payments begin and that choice sets the reduction.
 */
export function evaluateRetirementPath({
  path,
  separationAge,
  yearsOfService,
  annuityStartAge,
  mra = DEFAULT_MRA,
  isVeraOffered = false,
} = {}) {
  const sepAge = num(separationAge);
  const years = num(yearsOfService);
  const m = num(mra, DEFAULT_MRA);

  const base = {
    path,
    label: PATH_LABELS[path] ?? path,
    isEligible: false,
    reason: null,
    annuityStartAge: null,
    ageReductionPercent: 0,
    creditsSickLeave: false,
    keepsFehb: false,
    hasSupplement: false,
    notes: [],
  };

  switch (path) {
    case RETIREMENT_PATHS.IMMEDIATE_UNREDUCED: {
      if (!qualifiesForImmediateUnreduced({ age: sepAge, yearsOfService: years, mra: m })) {
        return { ...base, reason: 'Needs your MRA with 30 years, age 60 with 20, or age 62 with 5.' };
      }
      return {
        ...base,
        isEligible: true,
        annuityStartAge: sepAge,
        creditsSickLeave: true,
        keepsFehb: true,
        // The supplement bridges to 62, so it is worth nothing from 62 onward.
        hasSupplement: sepAge < 62,
        notes: ['No age reduction.', 'Unused sick leave is credited to the computation.'],
      };
    }

    case RETIREMENT_PATHS.MRA10_IMMEDIATE: {
      if (!qualifiesForMra10({ age: sepAge, yearsOfService: years, mra: m })) {
        return { ...base, reason: 'Needs your MRA with at least 10 years, without an unreduced route open.' };
      }
      return {
        ...base,
        isEligible: true,
        annuityStartAge: sepAge,
        ageReductionPercent: calculateMra10ReductionPercent({ annuityStartAge: sepAge, mra: m }),
        creditsSickLeave: true,
        keepsFehb: true,
        hasSupplement: false,
        notes: [
          'Reduced 5% for every year under 62, permanently.',
          'No Special Retirement Supplement on this route.',
        ],
      };
    }

    case RETIREMENT_PATHS.MRA10_POSTPONED: {
      if (!qualifiesForMra10({ age: sepAge, yearsOfService: years, mra: m })) {
        return { ...base, reason: 'Only an MRA+10 separation can be postponed.' };
      }
      const startAge = Math.max(sepAge, num(annuityStartAge, sepAge));
      return {
        ...base,
        isEligible: true,
        annuityStartAge: startAge,
        ageReductionPercent: calculateMra10ReductionPercent({ annuityStartAge: startAge, mra: m }),
        creditsSickLeave: true,
        // Suspended at separation and reinstated when the annuity begins, which
        // is the whole reason to postpone rather than defer.
        keepsFehb: true,
        hasSupplement: false,
        startsLaterThanSeparation: startAge > sepAge,
        notes: [
          startAge >= 62
            ? `Starting the annuity at 62 instead of ${sepAge} removes the age reduction entirely.`
            : `Starting at ${startAge} shrinks the reduction rather than removing it.`,
          'FEHB is suspended until the annuity begins, then reinstated.',
          'No supplement, and nothing accrues while you wait.',
        ],
      };
    }

    case RETIREMENT_PATHS.DEFERRED: {
      if (!qualifiesForDeferred({ yearsOfService: years })) {
        return { ...base, reason: 'Needs at least 5 years of creditable service.' };
      }
      const unreducedAt = earliestUnreducedDeferredAge({ yearsOfService: years, mra: m });
      const startAge = Math.max(num(annuityStartAge, unreducedAt ?? 62), m);
      // Reduced only when claimed BEFORE the age this service length earns
      // unreduced. Claiming at 60 with 20 years is not an early claim.
      const reduced = years >= 10 && unreducedAt !== null && startAge < unreducedAt && startAge >= m;
      return {
        ...base,
        isEligible: true,
        annuityStartAge: startAge,
        ageReductionPercent: reduced
          ? calculateMra10ReductionPercent({ annuityStartAge: startAge, mra: m })
          : 0,
        // Sick leave is credited only on an immediate annuity. A deferred
        // annuitant loses every hour of it.
        creditsSickLeave: false,
        keepsFehb: false,
        hasSupplement: false,
        notes: [
          'FEHB ends permanently — a deferred annuitant cannot re-enrol.',
          'Unused sick leave is not credited.',
          'No Special Retirement Supplement.',
          unreducedAt ? `Unreduced from age ${unreducedAt}.` : '',
        ].filter(Boolean),
      };
    }

    case RETIREMENT_PATHS.VERA: {
      if (!isVeraOffered) {
        return { ...base, reason: 'Only available when your agency offers an early out.' };
      }
      if (!qualifiesForVera({ age: sepAge, yearsOfService: years })) {
        return { ...base, reason: 'Needs age 50 with 20 years, or any age with 25.' };
      }
      return {
        ...base,
        isEligible: true,
        annuityStartAge: sepAge,
        // FERS applies no age reduction to an early out. CSRS would.
        ageReductionPercent: 0,
        creditsSickLeave: true,
        keepsFehb: true,
        hasSupplement: sepAge < 62,
        notes: [
          'No age reduction under FERS.',
          sepAge < m
            ? `The supplement is payable, but not until your MRA at ${m}.`
            : 'The supplement is payable from now until 62.',
        ],
      };
    }

    default:
      return { ...base, reason: 'Unknown retirement path.' };
  }
}

/**
 * The start age worth showing a path at, when the caller has not chosen one.
 *
 * Postponing and deferring are only interesting for what waiting buys, so both
 * default to the age that removes the reduction. Showing a postponed annuity
 * starting the day of separation makes it look identical to taking it
 * immediately, which is exactly the comparison a retiree needs to see.
 */
export function defaultAnnuityStartAge({ path, separationAge, yearsOfService, mra = DEFAULT_MRA }) {
  const sepAge = num(separationAge);
  if (path === RETIREMENT_PATHS.MRA10_POSTPONED) return Math.max(sepAge, 62);
  if (path === RETIREMENT_PATHS.DEFERRED) {
    return Math.max(sepAge, earliestUnreducedDeferredAge({ yearsOfService, mra }) ?? 62);
  }
  return sepAge;
}

/** Every path for one separation, eligible ones first. */
export function evaluateAllRetirementPaths({
  separationAge,
  yearsOfService,
  annuityStartAge,
  mra = DEFAULT_MRA,
  isVeraOffered = false,
} = {}) {
  return Object.values(RETIREMENT_PATHS)
    .map((path) =>
      evaluateRetirementPath({
        path,
        separationAge,
        yearsOfService,
        annuityStartAge:
          annuityStartAge ?? defaultAnnuityStartAge({ path, separationAge, yearsOfService, mra }),
        mra,
        isVeraOffered,
      })
    )
    .sort((a, b) => Number(b.isEligible) - Number(a.isEligible));
}
