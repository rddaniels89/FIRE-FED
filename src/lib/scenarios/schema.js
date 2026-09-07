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

export const SCENARIO_SCHEMA_VERSION = 3;

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
  'summary',
]);

/** Blocks that are persisted inside summary_data.extensions (see storage.js). */
export const EXTENSION_BLOCKS = Object.freeze(['profile', 'household', 'taxes', 'healthcare', 'career', 'strategies']);

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
    separationAge: 55,
    annuityStartAge: null,
    socialSecurityClaimAge: 67,
    retirementPath: RETIREMENT_PATH_AUTO,
    isVeraOffered: false,
    employeeType: 'regular',
    hireCohort: FERS_HIRE_COHORTS.FERS_FRAE,
    mra: DEFAULT_MRA,
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
      mra: DEFAULT_MRA,
      unusedSickLeaveHours: 0,
    },
    tspBalance: 0,
    tspContributionPercent: 0,
  };
}

export function createDefaultHousehold() {
  return { spouse: createDefaultSpouse() };
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
    fers: { ...scenario.fers, currentAge: p.currentAge, retirementAge: annuityStart },
    fire: { ...scenario.fire, desiredFireAge: p.separationAge, spouseIncome: spouseMonthly },
    summary: {
      ...scenario.summary,
      socialSecurity: { ...scenario.summary.socialSecurity, claimingAge: p.socialSecurityClaimAge },
    },
  };
}

/** Coerces the profile into a consistent state. */
function sanitizeProfile(profile) {
  const currentAge = Math.min(100, Math.max(16, num(profile.currentAge, 42)));
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
    separationAge,
    annuityStartAge,
    socialSecurityClaimAge,
    mra: num(profile.mra, DEFAULT_MRA),
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
