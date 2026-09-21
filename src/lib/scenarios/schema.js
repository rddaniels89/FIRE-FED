/**
 * The scenario schema: one profile, one model.
 *
 * Before version 3 a scenario carried the same person three times — an age
 * under `tsp`, another under `fers`, a "desired FIRE age" under `fire` and a
 * "retirement age" under both of the first two. Each calculator read its own
 * copy, so the app behaved like several calculators that happened to share a
 * page. Version 3 moves the person into `profile` and makes the three ages that
 * a federal retirement actually turns on into three separate fields:
 *
 *   separationAge            when federal employment ends
 *   annuityStartAge          when the FERS annuity begins (null = the path's default)
 *   socialSecurityClaimAge   when Social Security is claimed
 *
 * The legacy fields are kept as read-only mirrors so older components keep
 * working while they are migrated, and legacy writes are translated onto the
 * profile by `translateLegacyUpdates`. Nothing else may write to a mirror.
 *
 * Version 4 adds the `military` block: service periods with dates, the
 * deposit, military and VA income streams, the uniformed-services TSP
 * account, health coverage periods, and saved retired-pay calculations. The
 * pre-v4 fields `fers.militaryServiceYears` and `fers.militaryDepositPaid`
 * become mirrors of that block; a legacy year count with no dates is carried
 * as an undated period that is shown but never credited.
 *
 * Persistence: the cloud table has four JSONB columns (tsp, fers, fire,
 * summary). New blocks travel inside `summary_data.extensions` so no database
 * migration is required — see storage.js.
 */

import {
  ANNUAL_CATCH_UP_LIMIT,
  ANNUAL_ELECTIVE_DEFERRAL_LIMIT,
  CATCH_UP_AGE,
} from '../calculations/contributionLimits';
import { DEFAULT_MRA, FERS_HIRE_COHORTS, SURVIVOR_ELECTIONS } from '../calculations/fers';
import { FILING_STATUSES } from '../calculations/annualParameters';
import { MILITARY_RULES_VERSION } from '../military/status';
import { createServicePeriod, normalizeMilitaryServicePeriods } from '../military/servicePeriods';

export const SCENARIO_SCHEMA_VERSION = 4;

/** Blocks that live at the top level of a scenario. */
export const SCENARIO_BLOCKS = Object.freeze([
  'profile',
  'tsp',
  'fers',
  'fire',
  'household',
  'taxes',
  'healthcare',
  'career',
  'strategies',
  'military',
  'summary',
]);

/** Blocks that are persisted inside summary_data.extensions (see storage.js). */
export const EXTENSION_BLOCKS = Object.freeze([
  'profile',
  'household',
  'taxes',
  'healthcare',
  'career',
  'strategies',
  'military',
]);

/** Id of the single undated period a v3 `militaryServiceYears` figure migrates into. */
export const LEGACY_MILITARY_PERIOD_ID = 'legacy_military_years';

export const RETIREMENT_PATH_AUTO = 'auto';

export { FILING_STATUSES } from '../calculations/annualParameters';

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Deep-merges plain objects; arrays and scalars are replaced. */
export function deepMerge(base, patch) {
  if (!isObject(base)) return patch === undefined ? base : patch;
  if (!isObject(patch)) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    out[key] = isObject(value) && isObject(base[key]) ? deepMerge(base[key], value) : value;
  }
  return out;
}

export function createDefaultProfile() {
  return {
    currentAge: 42,
    // Months past the last birthday, 0-11. Whole years cannot settle a birth
    // year — someone aged 60 today was born in 1965 or 1966 depending on
    // whether their birthday has come round — and the FERS minimum retirement
    // age is a year-of-birth rule.
    currentAgeMonths: 0,
    // Both SSA and OPM use the previous year for a 1 January birthday. That is
    // a day-level rule and the day is never collected, so the user tells us.
    bornOnJanuaryFirst: false,
    separationAge: 55,
    annuityStartAge: null,
    socialSecurityClaimAge: 67,
    retirementPath: RETIREMENT_PATH_AUTO,
    isVeraOffered: false,
    employeeType: 'regular',
    hireCohort: FERS_HIRE_COHORTS.FERS_FRAE,
    // null means "derive from year of birth" using OPM's table. A number is an
    // explicit override for someone who knows their own MRA.
    mra: null,
    isDiscontinuedService: false,
    /** Who the plan is for; decides which sections and figures apply. See PROFILE_KINDS. */
    kind: 'federal',
  };
}

export function createDefaultTsp() {
  return {
    currentBalance: 50000,
    rothBalance: 0,
    rothContributionBasis: 0,
    monthlyContributionPercent: 10,
    annualSalary: 80000,
    annualSalaryGrowthRate: 3,
    includeEmployerMatch: true,
    includeAutomatic1Percent: true,
    annualEmployeeDeferralLimit: ANNUAL_ELECTIVE_DEFERRAL_LIMIT,
    annualCatchUpLimit: ANNUAL_CATCH_UP_LIMIT,
    catchUpAge: CATCH_UP_AGE,
    priorYearWages: undefined,
    inflationRate: 2.5,
    valueMode: 'nominal',
    allocation: { G: 10, F: 20, C: 40, S: 20, I: 10 },
    fundReturns: { G: 2, F: 3, C: 7, S: 8, I: 6 },
    contributionType: 'traditional',
    currentTaxRate: 22,
    retirementTaxRate: 15,
    showComparison: false,
    // Mirrors of profile fields. Read-only; see normalizeScenario.
    currentAge: 42,
    retirementAge: 55,
  };
}

export function createDefaultFers() {
  return {
    yearsOfService: 20,
    monthsOfService: 0,
    high3Salary: 85000,
    unusedSickLeaveHours: 0,
    survivorElection: SURVIVOR_ELECTIONS.NONE,
    annualLeaveHoursAtSeparation: 0,
    takeRefundOfContributions: false,
    militaryServiceYears: 0,
    militaryDepositPaid: false,
    // Mirrors of profile fields. Read-only; see normalizeScenario.
    currentAge: 42,
    retirementAge: 55,
  };
}

export function createDefaultFire() {
  return {
    monthlyFireIncomeGoal: 6000,
    sideHustleIncome: 500,
    sideHustleEndAge: null,
    annualTaxableSavings: 0,
    taxableBrokerageBalance: 0,
    cashBalance: 0,
    // Legacy: monthly spouse income. Migrated into household.spouse and kept as a mirror.
    spouseIncome: 0,
    // Mirror of profile.separationAge.
    desiredFireAge: 55,
  };
}

export function createDefaultSpouse() {
  return {
    enabled: false,
    label: 'Person B',
    currentAge: 42,
    annualIncome: 0,
    incomeEndAge: 65,
    socialSecurity: { piaMonthlyAtFra: 0, claimAge: 67 },
    pensionAnnual: 0,
    pensionStartAge: 65,
    isFederal: false,
    fers: {
      yearsOfService: 0,
      monthsOfService: 0,
      high3Salary: 0,
      separationAge: 62,
      annuityStartAge: null,
      hireCohort: FERS_HIRE_COHORTS.FERS_FRAE,
      // null means derive from the spouse's own year of birth, as for the
      // primary. A dual-fed spouse born before 1970 does not have an MRA of 57.
      mra: null,
      unusedSickLeaveHours: 0,
    },
    tspBalance: 0,
    tspContributionPercent: 0,
  };
}

export function createDefaultHousehold() {
  return {
    spouse: createDefaultSpouse(),
    /**
     * Optional ages at death for a survivor scenario. null means no death is
     * modelled. Today only the military and VA income streams honour these
     * (a stream stops on its owner's death; SBP and DIC start on the named
     * death); the full household death scenario arrives with the survivor
     * work.
     */
    deathAges: { primary: null, spouse: null },
  };
}

export function createDefaultTaxes() {
  return {
    filingStatus: FILING_STATUSES.SINGLE,
    includeStateTax: true,
    state: {
      code: 'NONE',
      rate: 0,
      exemptsFederalPension: false,
      exemptsSocialSecurity: true,
      pensionExclusion: 0,
    },
  };
}

/** Bridge strategies. Pro features; the timeline honours them when enabled. */
export function createDefaultStrategies() {
  return {
    sepp: { enabled: false, interestRate: 0.05 },
    rothConversion: { enabled: false, targetBracketRate: 0.12 },
    rolloverRothTspToIra: true,
  };
}

export function createDefaultHealthcare() {
  return {
    fehbEnrolled: true,
    fehbEnrollmentType: 'self',
    fehbAnnualEnrolleeShare: null,
    fehbYearsEnrolled: 5,
    enrolledSinceFirstOpportunity: false,
    tricareYears: 0,
    premiumGrowthPercent: 5,
    keepFehbWithMedicare: true,
    enrollInPartB: true,
    marketplaceAnnualPremium: null,
    otherCoverage: 'none',
    otherCoverageAnnualCost: 0,
    outOfPocketAnnual: 2000,
    includeIrmaa: false,
  };
}

export function createDefaultCareer() {
  return {
    enabled: false,
    grade: 12,
    step: 5,
    localityCode: 'RUS',
    annualRaisePercent: 2,
    promotions: [],
    yearsInCurrentStep: 0,
  };
}

/** Answers to "does anyone in this household have a military connection?" */
export const MILITARY_CONNECTIONS = Object.freeze({
  NONE: 'none',
  SELF: 'self',
  OTHER_MEMBER: 'other_member',
  MULTIPLE: 'multiple',
  UNSURE: 'unsure',
});

/**
 * Who the plan is for. Asked once, at onboarding and in the You section, so a
 * military member with no federal job is never shown FERS questions and a
 * veteran in federal service is pointed at the military sections.
 */
export const PROFILE_KINDS = Object.freeze({
  FEDERAL: 'federal',
  FEDERAL_WITH_MILITARY: 'federal_with_military',
  MILITARY_ONLY: 'military_only',
  SPOUSE_SURVIVOR: 'spouse_survivor',
});

export const PROFILE_KIND_LABELS = Object.freeze({
  [PROFILE_KINDS.FEDERAL]: 'Federal employee',
  [PROFILE_KINDS.FEDERAL_WITH_MILITARY]: 'Federal employee with military service',
  [PROFILE_KINDS.MILITARY_ONLY]: 'Military member or veteran, no federal job',
  [PROFILE_KINDS.SPOUSE_SURVIVOR]: 'Spouse or survivor of a service member, no federal job',
});

/** Whether the plan has a federal civilian job in it (FERS sections, FERS figures). */
export function isFederalEmployeeKind(kind) {
  return kind !== PROFILE_KINDS.MILITARY_ONLY && kind !== PROFILE_KINDS.SPOUSE_SURVIVOR;
}

/**
 * The scenario patch that records who the person is. It sets the military
 * connection when the answer implies one and nothing is recorded yet, and for
 * a plan with no federal job it clears the FERS service and salary defaults
 * (only untouched defaults; anything the user entered stays).
 */
export function profileKindUpdates(scenario, kind) {
  const updates = { profile: { kind } };
  const connection = scenario?.military?.connection ?? MILITARY_CONNECTIONS.NONE;
  if (connection === MILITARY_CONNECTIONS.NONE) {
    if (kind === PROFILE_KINDS.FEDERAL_WITH_MILITARY || kind === PROFILE_KINDS.MILITARY_ONLY) updates.military = { connection: MILITARY_CONNECTIONS.SELF };
    if (kind === PROFILE_KINDS.SPOUSE_SURVIVOR) updates.military = { connection: MILITARY_CONNECTIONS.OTHER_MEMBER };
  }
  if (!isFederalEmployeeKind(kind)) {
    const f = createDefaultFers();
    const t = createDefaultTsp();
    const fers = scenario?.fers ?? {};
    const tsp = scenario?.tsp ?? {};
    if (fers.yearsOfService === f.yearsOfService && fers.monthsOfService === f.monthsOfService) updates.fers = { yearsOfService: 0, monthsOfService: 0 };
    if (tsp.annualSalary === t.annualSalary && tsp.monthlyContributionPercent === t.monthlyContributionPercent) updates.tsp = { annualSalary: 0, monthlyContributionPercent: 0 };
  }
  return updates;
}

/** The user's current relationship to the uniformed services. */
export const MILITARY_RELATIONSHIPS = Object.freeze({
  ACTIVE_DUTY: 'active_duty',
  VETERAN: 'veteran',
  SELECTED_RESERVE: 'selected_reserve',
  OTHER_RESERVE_GUARD: 'other_reserve_guard',
  REGULAR_RETIREE: 'regular_retiree',
  RESERVE_RETIREE: 'reserve_retiree',
  SPOUSE: 'spouse',
  SURVIVOR: 'survivor',
  UNSURE: 'unsure',
});

/** Where the military service deposit stands with the agency. */
export const DEPOSIT_STATUSES = Object.freeze({
  NOT_REQUESTED: 'not_requested',
  EARNINGS_REQUESTED: 'earnings_requested',
  APPLICATION_SUBMITTED: 'application_submitted',
  AGENCY_QUOTE_RECEIVED: 'agency_quote_received',
  PAYMENTS_IN_PROGRESS: 'payments_in_progress',
  PAID_IN_FULL: 'paid_in_full',
  AGENCY_DENIED: 'agency_denied',
  UNKNOWN: 'unknown',
});

/**
 * The military block. Every sub-block is present from the start so later
 * passes fill structure rather than invent it; most stay empty for most users.
 */
export function createDefaultMilitary() {
  return {
    connection: MILITARY_CONNECTIONS.NONE,
    relationship: null,
    servicePeriods: [],
    deposit: {
      /** 'official_balance' when the agency figure is entered; 'estimate' otherwise. */
      mode: 'estimate',
      status: DEPOSIT_STATUSES.NOT_REQUESTED,
      officialBalance: null,
      officialBalanceThroughDate: null,
      paidAmount: 0,
      paidThroughDate: null,
      paidInFullDate: null,
      firstFersCoverageDate: null,
      /** Overrides the derived interest-accrual date when the agency has stated one. */
      interestAccrualDate: null,
      plannedPaymentDate: null,
      /** [{ id, date, amount, official }] in any order; the engine sorts them. */
      payments: [],
    },
    incomeStreams: [],
    /**
     * Whether the person receives military retired pay and of what type. This
     * gates the FERS credit: regular retired pay must be waived to credit the
     * service; chapter 1223 Reserve retired pay and certain disability awards
     * are exceptions the user identifies; an unknown type stops the credit.
     */
    retiredPay: {
      receives: 'no',
      type: null,
      officialDeterminationStatus: 'unknown',
      chapter61Exception: 'unknown',
      exceptionAcknowledged: false,
      waiver: { mode: 'none', effectiveAge: null },
    },
    tsp: {
      /** The civilian account is scenario.tsp; only its limit-sharing facts live here. */
      civilian: { ytdEmployeeDeferrals: 0, payPeriodsPerYear: 26, yearsOfServiceInSystem: null, vestingYears: null },
      uniformedServices: {
        enabled: false,
        /** 'brs' | 'legacy' | 'neither' — legacy (High-36/REDUX) members get no service contributions. */
        coverageSystem: 'neither',
        brsOptedIn: false,
        serviceEntryDate: null,
        monthsOfService: null,
        traditionalTaxableBalance: 0,
        traditionalTaxExemptBasis: null,
        rothBalance: 0,
        rothContributionBasis: 0,
        unvestedAutomaticBalance: 0,
        outstandingLoanBalance: null,
        balanceAsOfDate: null,
        hasCombatZoneContributions: false,
        /** Current contributions from military pay, while contributing. */
        contributing: false,
        monthlyBasicPay: 0,
        employeePercent: 0,
        contributionType: 'traditional',
        contributionEndAge: null,
        combatZoneTaxExemptAnnual: 0,
        ytdEmployeeDeferrals: 0,
        payPeriodsPerYear: 12,
      },
      otherSharedPlanDeferrals: 0,
      userraMakeUp: [],
    },
    brs: {
      continuationPay: { offered: false, multiple: null, monthlyBasicPay: null, paymentDate: null, installments: 1, obligationYears: 4, provenance: 'user_estimate' },
      lumpSum: { electionPercent: 0, officialDiscountRate: null, discountRateYear: null, discountRateSource: null, vaOffsetKnown: false },
    },
    /** Survivor Benefit Plan election as read from the orders or RAS; never inferred. */
    sbp: {
      elected: 'unknown',
      category: 'unknown',
      fullBase: true,
      electedBase: null,
      electionDate: null,
      officialPremiumMonthly: null,
      officialAnnuityMonthly: null,
      provenance: 'user_estimate',
      premiumsPaidToDate: 0,
      rcsbp: { elected: false, noticeOfEligibilityDate: null, option: null, officialPremiumMonthly: null, officialAnnuityMonthly: null, provenance: 'user_estimate' },
    },
    /** Gross-to-net ledger inputs: official adjustments and withholding assumptions. */
    netPay: {
      vaWaiverMonthly: 0,
      crdpMonthly: 0,
      crscMonthly: 0,
      federalWithholdingRate: 0,
      stateWithholdingRate: 0,
      otherDeductionsMonthly: 0,
      adjustmentsOfficial: false,
      reconciledToRas: false,
    },
    coverage: [],
    retirementScenarios: [],
    rulesVersion: MILITARY_RULES_VERSION,
  };
}

export function createDefaultSummary() {
  return {
    monthlyExpenses: 4000,
    socialSecurity: {
      mode: 'not_configured', // 'not_configured' | 'estimate' | 'manual'
      claimingAge: 67, // mirror of profile.socialSecurityClaimAge
      monthlyBenefit: 0, // the SSA statement figure at full retirement age
      percentOfSalary: 30,
      trustFundHaircut: null, // { startYear, percent } or null
    },
    assumptions: {
      pensionEndAge: 85,
      safeWithdrawalRate: 0.04,
      endAge: 95,
      expectedReturnPercent: null, // null → derived from TSP allocation
      spendingInflationPercent: null, // null → tsp.inflationRate
      // Take-home pay left over after spending and contributions while working
      // is kept as cash. Off means it is treated as spent.
      saveWorkingSurplus: true,
    },
  };
}

export function createDefaultScenario(name = 'New Scenario') {
  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    id: Date.now().toString(),
    name,
    createdAt: new Date().toISOString(),
    profile: createDefaultProfile(),
    tsp: createDefaultTsp(),
    fers: createDefaultFers(),
    fire: createDefaultFire(),
    household: createDefaultHousehold(),
    taxes: createDefaultTaxes(),
    healthcare: createDefaultHealthcare(),
    career: createDefaultCareer(),
    strategies: createDefaultStrategies(),
    military: createDefaultMilitary(),
    summary: createDefaultSummary(),
  };
}

/**
 * v2 → v3: derive the profile from the duplicated legacy fields.
 *
 * The legacy meaning of each field decides where it lands:
 *   fire.desiredFireAge   "when I leave"            → separationAge
 *   fers.retirementAge    "when the pension starts" → annuityStartAge, when later
 *   tsp.currentAge        the person's age          → currentAge
 *   fire.spouseIncome     monthly, perpetual        → household.spouse, annualised
 */
function migrateV2ToV3(s) {
  const tsp = s.tsp ?? {};
  const fers = s.fers ?? {};
  const fire = s.fire ?? {};
  const summary = s.summary ?? {};

  const currentAge = num(tsp.currentAge, num(fers.currentAge, 42));
  const separationAge = num(fire.desiredFireAge, num(tsp.retirementAge, num(fers.retirementAge, 55)));
  const legacyPensionAge = num(fers.retirementAge, separationAge);
  const annuityStartAge = legacyPensionAge > separationAge ? legacyPensionAge : null;

  const profile = {
    ...createDefaultProfile(),
    ...(s.profile ?? {}),
    currentAge,
    separationAge,
    annuityStartAge,
    socialSecurityClaimAge: num(summary.socialSecurity?.claimingAge, 67),
  };

  const spouseMonthly = num(fire.spouseIncome, 0);
  const household = s.household ?? createDefaultHousehold();
  if (spouseMonthly > 0 && !s.household) {
    household.spouse = {
      ...createDefaultSpouse(),
      enabled: true,
      currentAge,
      annualIncome: spouseMonthly * 12,
      // The legacy figure never stopped. Preserve that until the user says otherwise.
      incomeEndAge: null,
    };
  }

  return { ...s, profile, household, schemaVersion: 3 };
}

/**
 * v3 → v4: the military year count and deposit flag become a military block.
 *
 * The legacy figure had no dates, no branch, and no character of service, so
 * it cannot be credited under the v4 rules. It becomes one undated period
 * with `approximateYears` set, which the classifier holds for an official
 * determination and the UI shows with a prompt to enter the real periods.
 * A saved row is re-migrated on every load (the row does not persist its
 * schema version), so this must be a no-op when the block already exists.
 */
function migrateV3ToV4(s) {
  if (s.military && typeof s.military === 'object') return { ...s, schemaVersion: 4 };

  const fers = s.fers ?? {};
  const military = createDefaultMilitary();
  const legacyYears = num(fers.militaryServiceYears, 0);
  if (legacyYears > 0) {
    military.connection = MILITARY_CONNECTIONS.SELF;
    military.servicePeriods = [createServicePeriod({ id: LEGACY_MILITARY_PERIOD_ID, approximateYears: legacyYears })];
    military.deposit.status = fers.militaryDepositPaid ? DEPOSIT_STATUSES.PAID_IN_FULL : DEPOSIT_STATUSES.UNKNOWN;
  }
  return { ...s, military, schemaVersion: 4 };
}

export function migrateScenarioToLatest(scenario) {
  if (!scenario || typeof scenario !== 'object') return scenario;

  let s = { ...scenario };
  let version = Number(s.schemaVersion ?? 0);

  if (version < 1) {
    s.schemaVersion = 1;
    version = 1;
  }

  if (version < 2) {
    s = {
      ...s,
      meta: {
        ...(s.meta ?? {}),
        updatedAt: s.meta?.updatedAt ? s.meta.updatedAt : s.createdAt || new Date().toISOString(),
      },
      schemaVersion: 2,
    };
    version = 2;
  }

  if (version < 3) {
    s = migrateV2ToV3(s);
    version = 3;
  }

  if (version < 4) {
    s = migrateV3ToV4(s);
    version = 4;
  }

  if (!Number.isFinite(version) || version !== SCENARIO_SCHEMA_VERSION) {
    s.schemaVersion = SCENARIO_SCHEMA_VERSION;
  }

  return s;
}

/**
 * Writes the profile onto the legacy mirror fields. The profile is the only
 * source of truth; a mirror that disagrees with it is a bug.
 */
export function applyProfileMirrors(scenario) {
  const p = scenario.profile;
  const annuityStart = p.annuityStartAge == null ? p.separationAge : Math.max(p.annuityStartAge, p.separationAge);
  const spouse = scenario.household?.spouse;
  const spouseMonthly = spouse?.enabled ? num(spouse.annualIncome, 0) / 12 : 0;

  return {
    ...scenario,
    tsp: { ...scenario.tsp, currentAge: p.currentAge, retirementAge: p.separationAge },
    fers: { ...scenario.fers, currentAge: p.currentAge, retirementAge: annuityStart, ...militaryMirrors(scenario.military) },
    fire: { ...scenario.fire, desiredFireAge: p.separationAge, spouseIncome: spouseMonthly },
    summary: {
      ...scenario.summary,
      socialSecurity: { ...scenario.summary.socialSecurity, claimingAge: p.socialSecurityClaimAge },
    },
  };
}

/**
 * The legacy `fers.militaryServiceYears` and `fers.militaryDepositPaid` as
 * read-only mirrors of the military block. The years figure is what the user
 * has recorded (creditable periods plus any undated legacy count), rounded to
 * the month; it is display only and no engine reads it after Pass 2.
 */
function militaryMirrors(military) {
  const periods = military?.servicePeriods ?? [];
  const { totals } = normalizeMilitaryServicePeriods(periods);
  const years = totals.creditableYears + totals.undatedApproximateYears;
  return {
    militaryServiceYears: Math.round(years * 12) / 12,
    militaryDepositPaid: military?.deposit?.status === DEPOSIT_STATUSES.PAID_IN_FULL,
  };
}

/** Coerces the profile into a consistent state. */
function sanitizeProfile(profile) {
  const currentAge = Math.min(100, Math.max(16, num(profile.currentAge, 42)));
  const currentAgeMonths = Math.min(11, Math.max(0, Math.floor(num(profile.currentAgeMonths, 0))));
  const separationAge = Math.min(100, Math.max(currentAge, num(profile.separationAge, currentAge)));
  const rawStart = profile.annuityStartAge;
  const annuityStartAge =
    rawStart === null || rawStart === undefined || rawStart === ''
      ? null
      : Math.min(100, Math.max(separationAge, num(rawStart, separationAge)));
  const socialSecurityClaimAge = Math.min(70, Math.max(62, num(profile.socialSecurityClaimAge, 67)));
  return {
    ...profile,
    currentAge,
    currentAgeMonths,
    bornOnJanuaryFirst: Boolean(profile.bornOnJanuaryFirst),
    separationAge,
    annuityStartAge,
    socialSecurityClaimAge,
    // Left null so the plan resolver can derive it from the birth year; only a
    // deliberate override is carried through as a number.
    mra: profile.mra === null || profile.mra === undefined || profile.mra === '' ? null : num(profile.mra, DEFAULT_MRA),
  };
}

export function normalizeScenario(scenario) {
  const migrated = migrateScenarioToLatest(scenario);
  const base = createDefaultScenario(migrated?.name || 'Scenario');

  let merged = { ...base, ...(migrated ?? {}) };
  for (const block of SCENARIO_BLOCKS) {
    merged[block] = deepMerge(base[block], migrated?.[block] ?? {});
  }
  merged.profile = sanitizeProfile(merged.profile);
  merged.schemaVersion = SCENARIO_SCHEMA_VERSION;

  return applyProfileMirrors(merged);
}

/**
 * Legacy components still write the fields they always wrote. Those writes are
 * redirected onto the profile so the mirrors never become a second source of
 * truth. Returns a new updates object; the input is not modified.
 */
export function translateLegacyUpdates(updates, current) {
  if (!updates || typeof updates !== 'object') return updates;

  const profilePatch = {};
  const out = { ...updates };

  const tspAge = updates.tsp?.currentAge;
  const fersAge = updates.fers?.currentAge;
  if (tspAge !== undefined || fersAge !== undefined) {
    profilePatch.currentAge = num(tspAge ?? fersAge, current?.profile?.currentAge);
  }

  const sep = updates.fire?.desiredFireAge ?? updates.tsp?.retirementAge;
  if (sep !== undefined) {
    profilePatch.separationAge = num(sep, current?.profile?.separationAge);
  }

  const pensionAge = updates.fers?.retirementAge;
  if (pensionAge !== undefined) {
    const sepAge = profilePatch.separationAge ?? current?.profile?.separationAge;
    const start = num(pensionAge, sepAge);
    // A legacy "retirement age" at or before separation means the pension starts
    // on separation, which is the path default rather than a chosen date.
    profilePatch.annuityStartAge = start > sepAge ? start : null;
    // The legacy pension calculator has no separate separation age. When the
    // user moves the retirement age *earlier* than today's separation age, they
    // mean "retire then", so separation follows.
    if (start < sepAge && profilePatch.separationAge === undefined) {
      profilePatch.separationAge = start;
    }
  }

  const claim = updates.summary?.socialSecurity?.claimingAge;
  if (claim !== undefined) {
    profilePatch.socialSecurityClaimAge = num(claim, current?.profile?.socialSecurityClaimAge);
  }

  const spouseMonthly = updates.fire?.spouseIncome;
  if (spouseMonthly !== undefined) {
    const monthly = num(spouseMonthly, 0);
    out.household = deepMerge(out.household ?? {}, {
      spouse: { enabled: monthly > 0 || Boolean(current?.household?.spouse?.enabled), annualIncome: monthly * 12 },
    });
  }

  // Legacy military writes land on the undated legacy period and the deposit
  // status. Once real dated periods exist the year count is derived from them,
  // so a legacy write is ignored rather than allowed to disagree.
  const legacyYears = updates.fers?.militaryServiceYears;
  const legacyPaid = updates.fers?.militaryDepositPaid;
  if (legacyYears !== undefined || legacyPaid !== undefined) {
    const existing = current?.military?.servicePeriods ?? [];
    const dated = existing.filter((p) => p.id !== LEGACY_MILITARY_PERIOD_ID);
    const militaryPatch = {};
    if (legacyYears !== undefined && dated.length === 0) {
      const years = Math.max(0, num(legacyYears, 0));
      militaryPatch.servicePeriods =
        years > 0 ? [createServicePeriod({ id: LEGACY_MILITARY_PERIOD_ID, approximateYears: years })] : [];
      if (years > 0 && (current?.military?.connection ?? MILITARY_CONNECTIONS.NONE) === MILITARY_CONNECTIONS.NONE) {
        militaryPatch.connection = MILITARY_CONNECTIONS.SELF;
      }
    }
    if (legacyPaid !== undefined) {
      militaryPatch.deposit = { status: legacyPaid ? DEPOSIT_STATUSES.PAID_IN_FULL : DEPOSIT_STATUSES.UNKNOWN };
    }
    if (Object.keys(militaryPatch).length > 0) out.military = deepMerge(out.military ?? {}, militaryPatch);
    if (out.fers) {
      const { militaryServiceYears: _y, militaryDepositPaid: _p, ...rest } = out.fers;
      out.fers = rest;
    }
  }

  if (Object.keys(profilePatch).length > 0) {
    out.profile = { ...(updates.profile ?? {}), ...profilePatch };
  }

  return out;
}

/** Applies an update to a scenario: legacy translation, per-block merge, normalise. */
export function applyScenarioUpdates(current, updates) {
  const translated = translateLegacyUpdates(updates, current);
  let next = { ...current, ...translated };
  for (const block of SCENARIO_BLOCKS) {
    if (translated[block]) next[block] = deepMerge(current[block] ?? {}, translated[block]);
  }
  next.meta = { ...(current.meta ?? {}), ...(updates?.meta ?? {}), updatedAt: new Date().toISOString() };
  return normalizeScenario(next);
}

export const SCENARIO_TEMPLATES = Object.freeze([
  {
    id: 'template_20s',
    name: 'Starter (20s)',
    description: 'Early career baseline with modest TSP savings and high growth runway.',
    overrides: {
      profile: { currentAge: 27, separationAge: 50 },
      tsp: { currentBalance: 15000, annualSalary: 70000, monthlyContributionPercent: 10 },
      fers: { yearsOfService: 2, monthsOfService: 0, high3Salary: 70000 },
      fire: { monthlyFireIncomeGoal: 5500 },
      summary: { monthlyExpenses: 3500 },
    },
  },
  {
    id: 'template_30s',
    name: 'Starter (30s)',
    description: 'Mid-career baseline: stronger salary, meaningful TSP base, and a realistic FIRE target.',
    overrides: {
      profile: { currentAge: 35, separationAge: 55 },
      tsp: { currentBalance: 50000, annualSalary: 90000, monthlyContributionPercent: 12 },
      fers: { yearsOfService: 8, monthsOfService: 0, high3Salary: 90000 },
      fire: { monthlyFireIncomeGoal: 6000 },
      summary: { monthlyExpenses: 4200 },
    },
  },
  {
    id: 'template_40s',
    name: 'Starter (40s)',
    description: 'Late mid-career: prioritize eligibility timing and bridge planning.',
    overrides: {
      profile: { currentAge: 45, separationAge: 57 },
      tsp: { currentBalance: 160000, annualSalary: 115000, monthlyContributionPercent: 15 },
      fers: { yearsOfService: 15, monthsOfService: 0, high3Salary: 115000 },
      fire: { monthlyFireIncomeGoal: 7000 },
      summary: { monthlyExpenses: 5200 },
    },
  },
  {
    id: 'template_50s',
    name: 'Starter (50s)',
    description: 'Pre-retirement: focus on "earliest eligible" and near-term cashflow assumptions.',
    overrides: {
      profile: { currentAge: 55, separationAge: 60 },
      tsp: { currentBalance: 350000, annualSalary: 140000, monthlyContributionPercent: 15 },
      fers: { yearsOfService: 25, monthsOfService: 0, high3Salary: 140000 },
      fire: { monthlyFireIncomeGoal: 8000 },
      summary: { monthlyExpenses: 6500 },
    },
  },
]);

export function buildScenarioFromTemplate(templateId, nameOverride) {
  const template = SCENARIO_TEMPLATES.find((t) => t.id === templateId);
  const base = createDefaultScenario(nameOverride || template?.name || 'New Scenario');
  if (!template) return normalizeScenario(base);

  let s = {
    ...base,
    name: nameOverride || template.name,
    meta: { ...(base.meta ?? {}), templateId: template.id, updatedAt: new Date().toISOString() },
  };
  for (const block of SCENARIO_BLOCKS) {
    if (template.overrides[block]) s[block] = deepMerge(base[block], template.overrides[block]);
  }
  return normalizeScenario(s);
}

export const getValueByPath = (obj, path) => {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
};

export const DIFF_FIELDS = Object.freeze([
  { path: 'profile.currentAge', label: 'Current age' },
  { path: 'profile.currentAgeMonths', label: 'Current age (months)' },
  { path: 'profile.separationAge', label: 'Separation age' },
  { path: 'profile.annuityStartAge', label: 'Annuity start age' },
  { path: 'profile.socialSecurityClaimAge', label: 'Social Security claim age' },
  { path: 'profile.retirementPath', label: 'Retirement path' },
  { path: 'profile.hireCohort', label: 'FERS contribution tier' },
  { path: 'tsp.currentBalance', label: 'TSP: current balance' },
  { path: 'tsp.rothBalance', label: 'TSP: Roth balance' },
  { path: 'tsp.monthlyContributionPercent', label: 'TSP: contribution %' },
  { path: 'tsp.annualSalary', label: 'Salary' },
  { path: 'tsp.valueMode', label: 'TSP: real vs nominal' },
  { path: 'fers.yearsOfService', label: 'FERS: years of service' },
  { path: 'fers.high3Salary', label: 'FERS: high-3' },
  { path: 'fers.unusedSickLeaveHours', label: 'FERS: unused sick leave' },
  { path: 'fers.survivorElection', label: 'FERS: survivor election' },
  { path: 'fire.monthlyFireIncomeGoal', label: 'Income goal (monthly)' },
  { path: 'fire.sideHustleIncome', label: 'Side income (monthly)' },
  { path: 'household.spouse.enabled', label: 'Spouse modeled' },
  { path: 'household.spouse.annualIncome', label: 'Spouse income (annual)' },
  { path: 'taxes.filingStatus', label: 'Filing status' },
  { path: 'taxes.state.code', label: 'State' },
  { path: 'healthcare.fehbEnrollmentType', label: 'FEHB enrollment' },
  { path: 'summary.monthlyExpenses', label: 'Monthly expenses' },
  { path: 'summary.socialSecurity.monthlyBenefit', label: 'Social Security at FRA (monthly)' },
  { path: 'summary.assumptions.safeWithdrawalRate', label: 'Safe withdrawal rate' },
]);

export function getScenarioDiff(fromScenario, toScenario) {
  if (!fromScenario || !toScenario) return [];
  const diffs = [];
  for (const field of DIFF_FIELDS) {
    const fromValue = getValueByPath(fromScenario, field.path);
    const toValue = getValueByPath(toScenario, field.path);
    const equal = Object.is(fromValue, toValue) || JSON.stringify(fromValue) === JSON.stringify(toValue);
    if (!equal) diffs.push({ ...field, from: fromValue, to: toValue });
  }
  return diffs;
}
